#!/usr/bin/env node
/**
 * Раскладывает файлы сквозных тестов по долям CI по замеренному времени.
 *
 * Собственное деление Playwright (`--shard`) считает проверки, а не минуты:
 * доля с медленными файлами шла вдвое дольше доли с быстрыми и упиралась в
 * предел задания, когда остальные давно стояли (#133). Здесь каждый файл
 * весит столько, сколько он шёл на CI, - замеры лежат в e2e/durations.json, -
 * и файлы раскладываются жадно: от самого тяжёлого к лёгкому, каждый в ту
 * долю, где пока меньше всего.
 *
 * Список файлов берётся не из каталога, а у самого Playwright (`--list`):
 * разложено ровно то, что он запустил бы целиком, с его testDir и testMatch.
 * Файл, которого нет в замерах, не теряется - он получает оценку по числу
 * своих проверок и средней проверке и ложится в долю, как все. Раскладка
 * проверяет себя перед выдачей: каждый файл ровно в одной доле, ни одна доля
 * не пуста, и выданный фильтр совпадает ровно с одним файлом. Пустую долю
 * выдавать нельзя: `playwright test` без фильтров запустит весь набор.
 *
 * Запуск:
 *
 *     node scripts/e2e-shard.mjs 1 4    # файлы первой доли из четырёх
 *
 * Пути печатаются в stdout по одному на строку - для подстановки в командную
 * строку Playwright, раскладка целиком с оценками - в stderr, для журнала.
 * Замеры обновляет scripts/e2e-durations.mjs.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DURATIONS_FILE = 'e2e/durations.json';

/** Средняя проверка, когда замеров нет вовсе, - порядок величины на CI. */
const FALLBACK_SECONDS_PER_TEST = 30;

/**
 * Список файлов, которые Playwright запустил бы, и число проверок в каждом.
 * Тесты не запускаются и сервер не поднимается: `--list` только собирает.
 *
 * @returns {{ rootDir: string, files: { file: string, tests: number }[] }}
 */
export function listSpecFiles() {
  const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
  const env = { ...process.env };
  // Иначе JSON-репортёр пишет в файл, а не в stdout.
  delete env.PLAYWRIGHT_JSON_OUTPUT_NAME;
  delete env.PLAYWRIGHT_JSON_OUTPUT_FILE;
  delete env.PLAYWRIGHT_JSON_OUTPUT_DIR;
  const out = execFileSync(process.execPath, [cli, 'test', '--list', '--reporter=json'], {
    encoding: 'utf8',
    env,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const report = JSON.parse(out);
  if (report.errors?.length) {
    throw new Error(`Playwright не собрал список проверок: ${JSON.stringify(report.errors)}`);
  }
  const countTests = (suite) =>
    (suite.specs ?? []).reduce((n, spec) => n + spec.tests.length, 0) +
    (suite.suites ?? []).reduce((n, child) => n + countTests(child), 0);
  const files = new Map();
  for (const suite of report.suites) {
    files.set(suite.file, (files.get(suite.file) ?? 0) + countTests(suite));
  }
  return {
    rootDir: report.config.rootDir,
    files: [...files].map(([file, tests]) => ({ file, tests })),
  };
}

/**
 * Жадная раскладка: от тяжёлого файла к лёгкому, каждый в самую лёгкую долю.
 * При равенстве порядок решают имя файла и номер доли, так что все доли,
 * считая каждая у себя, получают одну и ту же раскладку.
 *
 * @param {{ file: string, tests: number }[]} files
 * @param {Record<string, number>} durations секунды на файл
 * @param {number} total число долей
 * @returns {{ files: string[], seconds: number }[]}
 */
export function planShards(files, durations, total) {
  let knownSeconds = 0;
  let knownTests = 0;
  for (const { file, tests } of files) {
    const seconds = durations[file];
    if (seconds !== undefined) {
      knownSeconds += seconds;
      knownTests += tests;
    }
  }
  const perTest = knownTests > 0 ? knownSeconds / knownTests : FALLBACK_SECONDS_PER_TEST;
  const weighted = files
    .map(({ file, tests }) => ({ file, seconds: durations[file] ?? tests * perTest }))
    .sort((a, b) => b.seconds - a.seconds || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));

  const shards = Array.from({ length: total }, () => ({ files: [], seconds: 0 }));
  for (const { file, seconds } of weighted) {
    let lightest = shards[0];
    for (const shard of shards) if (shard.seconds < lightest.seconds) lightest = shard;
    lightest.files.push(file);
    lightest.seconds += seconds;
  }
  for (const shard of shards) shard.files.sort();
  return shards;
}

/**
 * Проверка раскладки: каждый файл ровно в одной доле, пустых долей нет.
 * Бросает исключение с перечнем нарушений.
 *
 * @param {{ files: string[] }[]} shards
 * @param {string[]} files
 */
export function checkPlan(shards, files) {
  const problems = [];
  const seen = new Map();
  shards.forEach((shard, i) => {
    if (shard.files.length === 0) problems.push(`доля ${i + 1} пуста`);
    for (const file of shard.files) {
      if (seen.has(file)) problems.push(`${file} сразу в долях ${seen.get(file)} и ${i + 1}`);
      else seen.set(file, i + 1);
    }
  });
  for (const file of files) if (!seen.has(file)) problems.push(`${file} не попал ни в одну долю`);
  for (const file of seen.keys()) if (!files.includes(file)) problems.push(`${file} нет в наборе`);
  if (problems.length) throw new Error(`Раскладка по долям неверна:\n  ${problems.join('\n  ')}`);
}

/**
 * Фильтры для командной строки Playwright. Фильтр там - регулярное
 * выражение по части полного пути, без учёта регистра, и `e2e/scene.spec.ts`
 * совпал бы и с `e2e/scene.spec.tsx`, и с `e2e/old/e2e/scene.spec.ts`. Поэтому
 * каждый фильтр сверяется со всеми файлами набора: совпасть он обязан ровно
 * с одним - своим.
 *
 * @param {string[]} shardFiles файлы доли, относительно rootDir
 * @param {string[]} allFiles все файлы набора, относительно rootDir
 * @param {string} rootDir каталог тестов
 * @param {string} cwd откуда запускается Playwright
 */
export function fileFilters(shardFiles, allFiles, rootDir, cwd) {
  const absolute = (file) => path.resolve(rootDir, file).split(path.sep).join('/');
  const all = allFiles.map(absolute);
  return shardFiles.map((file) => {
    const filter = path.relative(cwd, path.resolve(rootDir, file)).split(path.sep).join('/');
    if (/\s/.test(filter)) throw new Error(`Пробел в имени файла не переживёт командную строку: ${filter}`);
    const re = new RegExp(filter, 'i');
    const matches = all.filter((p) => re.test(p));
    if (matches.length !== 1 || matches[0] !== absolute(file)) {
      throw new Error(`Фильтр ${filter} совпадает не только со своим файлом: ${matches.join(', ')}`);
    }
    return filter;
  });
}

function main() {
  const [index, total] = process.argv.slice(2).map(Number);
  if (!Number.isInteger(index) || !Number.isInteger(total) || index < 1 || index > total) {
    throw new Error('Запуск: node scripts/e2e-shard.mjs <номер доли> <число долей>');
  }
  const durations = JSON.parse(readFileSync(DURATIONS_FILE, 'utf8'));
  const { rootDir, files } = listSpecFiles();
  const names = files.map((f) => f.file);
  const shards = planShards(files, durations, total);
  checkPlan(shards, names);

  const minutes = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  shards.forEach((shard, i) => {
    const mark = i + 1 === index ? '>' : ' ';
    console.error(`${mark} доля ${i + 1}/${total}, около ${minutes(shard.seconds)}: ${shard.files.join(' ')}`);
  });
  for (const name of names) {
    if (durations[name] === undefined) console.error(`  ${name} нет в ${DURATIONS_FILE}, вес оценён по числу проверок`);
  }

  const shard = shards[index - 1];
  console.log(fileFilters(shard.files, names, rootDir, process.cwd()).join('\n'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
