#!/usr/bin/env node
/**
 * Обновляет e2e/durations.json - замеры, по которым scripts/e2e-shard.mjs
 * раскладывает сквозные тесты по долям CI.
 *
 * Замеры берутся только с CI: на своей машине набор идёт впятеро быстрее и в
 * других пропорциях - там считает видеокарта, а на runner программный
 * растеризатор, и тяжёлый для него файл не обязан быть тяжёлым для неё.
 * Каждая доля выкладывает JSON-отчёт Playwright выкладкой `e2e-results-N`;
 * скрипт скачивает их с указанных прогонов, складывает время проверок по
 * файлам (с повторами - они тоже тратят минуты доли) и берёт медиану по
 * прогонам: один прогон на медленном runner не должен перекраивать раскладку.
 *
 * Файлы, которых в прогонах нет, сохраняют прежний замер; файлы, которых
 * больше нет в наборе, из замеров уходят.
 *
 * Запуск (нужен `gh` с выполненным `gh auth login`):
 *
 *     npm run e2e:durations -- 36976135321 36974053623 36824952638
 *
 * Номера прогонов - из `gh run list --workflow ci.yml`. Обновлять стоит,
 * когда доли на CI разошлись больше чем на пару минут.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DURATIONS_FILE, listSpecFiles } from './e2e-shard.mjs';

/** Секунды по файлам из одного JSON-отчёта Playwright. */
function secondsByFile(report) {
  const totals = new Map();
  const walk = (suite, file) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) {
        for (const result of test.results) {
          totals.set(file, (totals.get(file) ?? 0) + result.duration / 1000);
        }
      }
    }
    for (const child of suite.suites ?? []) walk(child, file);
  };
  for (const suite of report.suites) walk(suite, suite.file);
  return totals;
}

function jsonFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return jsonFiles(full);
    return name.endsWith('.json') ? [full] : [];
  });
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const runs = process.argv.slice(2);
if (runs.length === 0 || runs.some((r) => !/^\d+$/.test(r))) {
  console.error('Запуск: npm run e2e:durations -- <номер прогона CI> [<номер прогона CI> ...]');
  process.exit(1);
}

const tmp = mkdtempSync(path.join(tmpdir(), 'e2e-durations-'));
/** Файл -> секунды в каждом прогоне, где он шёл. */
const measured = new Map();
try {
  for (const run of runs) {
    const dir = path.join(tmp, run);
    execFileSync('gh', ['run', 'download', run, '--pattern', 'e2e-results-*', '--dir', dir], {
      stdio: 'inherit',
    });
    const perRun = new Map();
    for (const file of jsonFiles(dir)) {
      for (const [spec, seconds] of secondsByFile(JSON.parse(readFileSync(file, 'utf8')))) {
        perRun.set(spec, (perRun.get(spec) ?? 0) + seconds);
      }
    }
    if (perRun.size === 0) console.error(`В прогоне ${run} нет отчётов e2e-results-*`);
    for (const [spec, seconds] of perRun) {
      if (!measured.has(spec)) measured.set(spec, []);
      measured.get(spec).push(seconds);
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const previous = JSON.parse(readFileSync(DURATIONS_FILE, 'utf8'));
const current = listSpecFiles().files.map((f) => f.file).sort();
const next = {};
for (const file of current) {
  const values = measured.get(file);
  const seconds = values ? Math.round(median(values)) : previous[file];
  if (seconds !== undefined) next[file] = seconds;
  const was = previous[file] === undefined ? 'нет' : `${previous[file]} с`;
  const now = seconds === undefined ? 'нет замера' : `${seconds} с`;
  console.log(`${file.padEnd(28)} ${was.padStart(8)} -> ${now}${values ? '' : ' (прежний)'}`);
}
writeFileSync(DURATIONS_FILE, `${JSON.stringify(next, null, 2)}\n`);
console.log(`Записано в ${DURATIONS_FILE}`);
