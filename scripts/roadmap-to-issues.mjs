#!/usr/bin/env node
/**
 * Переносит план работ из ROADMAP.md в задачи GitHub.
 *
 * Разбор идёт по заголовкам вида `### N. Название — Размер`; телом задачи
 * становится всё до следующего заголовка. Метки берутся из раздела, в котором
 * пункт стоит, и из оценки трудоёмкости.
 *
 * Скрипт идемпотентен: перед созданием он читает уже существующие задачи и
 * пропускает совпадающие по заголовку. Повторный запуск после правки плана
 * заведёт только новые пункты и ничего не продублирует.
 *
 * Запуск (нужен `gh` с выполненным `gh auth login`):
 *
 *     node scripts/roadmap-to-issues.mjs --dry-run   # показать, что будет создано
 *     node scripts/roadmap-to-issues.mjs             # создать
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const DRY_RUN = process.argv.includes('--dry-run');
const ROADMAP = 'ROADMAP.md';

/** Раздел плана → метка задачи. */
const SECTION_LABELS = new Map([
  ['Навигация и камера', 'навигация'],
  ['Сценарии и события', 'сценарии'],
  ['Красота', 'красота'],
  ['Информация', 'информация'],
  ['Техническое', 'техническое'],
  ['Известные дефекты', 'дефект'],
  ['Замечания на ревью', 'техническое'],
]);

/**
 * Пункты, которые заводятся сразу закрытыми: работа сделана, но след в списке
 * задач нужен — иначе непонятно, куда делись номера.
 */
const ALREADY_DONE = new Map([
  [24, 'README написан, снимки для него делает scripts/shots.mjs.'],
  [25, 'Проверено на живом экране при 900×600: дубля нет, артефакт съёмки.'],
]);

/** Разделы, которые не содержат задач и разбору не подлежат. */
const SKIP_SECTIONS = new Set(['Уже сделано']);

function parseRoadmap(markdown) {
  const lines = markdown.split(/\r?\n/);
  const items = [];

  let section = '';
  let current = null;

  const flush = () => {
    if (!current) return;
    // Хвостовые пустые строки и горизонтальные линейки в тело не нужны.
    while (current.body.length && /^(\s*|---)$/.test(current.body.at(-1))) current.body.pop();
    items.push({ ...current, body: current.body.join('\n') });
    current = null;
  };

  for (const line of lines) {
    const sectionMatch = /^## (.+)$/.exec(line);
    if (sectionMatch) {
      flush();
      section = sectionMatch[1].trim();
      continue;
    }

    // Заголовок делится по последнему тире, а не по первому: в названии тире
    // тоже встречается («Смотреть на» — захват цели), а оценка всегда одно
    // слово без пробелов.
    const itemMatch = /^### (\d+)\.\s+(.+)\s+—\s+(\S+)$/.exec(line);
    if (itemMatch && !SKIP_SECTIONS.has(section)) {
      flush();
      current = {
        number: Number(itemMatch[1]),
        title: itemMatch[2].trim(),
        size: itemMatch[3].trim(),
        section,
        body: [],
      };
      continue;
    }

    if (current) current.body.push(line);
  }

  flush();
  return items;
}

/** Метка трудоёмкости; у сделанных пунктов размера нет. */
function sizeLabel(size) {
  const match = /^(S|M|L)(–(S|M|L))?$/.exec(size.replace(/\s/g, ''));
  return match ? `размер: ${size}` : null;
}

function labelsFor(item) {
  const labels = [];
  const section = SECTION_LABELS.get(item.section);
  if (section) labels.push(section);
  const size = sizeLabel(item.size);
  if (size) labels.push(size);
  return labels;
}

function bodyFor(item) {
  const head = `Пункт плана №${item.number}${item.size ? ` · оценка ${item.size}` : ''}`;
  const done = ALREADY_DONE.get(item.number);
  const tail = done ? `\n\n---\n\n**Сделано.** ${done}` : '';
  return `${head}\n\n${item.body}${tail}\n`;
}

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
}

function existingTitles() {
  const raw = gh(['issue', 'list', '--state', 'all', '--limit', '500', '--json', 'title']);
  return new Set(JSON.parse(raw).map((issue) => issue.title));
}

const items = parseRoadmap(readFileSync(ROADMAP, 'utf8'));
if (items.length === 0) {
  console.error(`В ${ROADMAP} не нашлось ни одного пункта — разбор сломан, ничего не делаю.`);
  process.exit(1);
}

console.log(`Пунктов в плане: ${items.length}`);

const existing = DRY_RUN ? new Set() : existingTitles();
let created = 0;
let skipped = 0;

for (const item of items) {
  const labels = labelsFor(item);

  if (existing.has(item.title)) {
    console.log(`= ${item.number}. ${item.title} — уже есть, пропускаю`);
    skipped += 1;
    continue;
  }

  if (DRY_RUN) {
    console.log(`+ ${item.number}. ${item.title}  [${labels.join(', ')}]`);
    created += 1;
    continue;
  }

  const url = gh([
    'issue',
    'create',
    '--title',
    item.title,
    '--body',
    bodyFor(item),
    ...labels.flatMap((label) => ['--label', label]),
  ]).trim();

  // Сделанные пункты сразу закрываются: в списке они нужны как след, а не как
  // работа.
  if (ALREADY_DONE.has(item.number)) {
    gh(['issue', 'close', url, '--reason', 'completed']);
    console.log(`+ ${item.number}. ${item.title} → ${url} (закрыт)`);
  } else {
    console.log(`+ ${item.number}. ${item.title} → ${url}`);
  }

  created += 1;
}

console.log(`\nСоздано: ${created}, пропущено: ${skipped}`);
if (DRY_RUN) console.log('Это был холостой прогон, ничего не создано.');
