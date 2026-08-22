// @ts-check
import { gunzipSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ALWAYS_NAMED,
  FIGURES,
  MAX_SEGMENT_DEG,
  NAME_SEPARATION_DEG,
  NAMED_COUNT,
  RU_NAMES,
} from './sky-figures.mjs';

/**
 * Сборка звёздного каталога.
 *
 * Скачивает базу HYG (Hipparcos + Yale BSC + Gliese), отбирает звёзды ярче
 * предела невооружённого глаза и упаковывает их по шесть байт на звезду в
 * готовый к импорту модуль. Скрипт запускается вручную и редко: каталог
 * меняется раз в несколько лет, а результат лежит в репозитории — сборка не
 * должна зависеть от сети.
 *
 *   node scripts/fetch-stars.mjs
 *
 * Тем же запуском собираются имена ярких звёзд и фигуры созвездий
 * (src/data/sky.generated.ts). Отдельным скриптом их делать нельзя: линия
 * созвездия обязана упираться ровно в ту звезду, которая нарисована на небе,
 * а два скрипта с двумя загрузками рано или поздно разъедутся.
 */

const SOURCE =
  'https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v40.csv.gz';

/**
 * Предел невооружённого глаза в идеальную ночь. Слабее рисовать нечего:
 * фотометрия неба всё равно гасит такие звёзды почти в ноль.
 */
const MAGNITUDE_LIMIT = 6.5;

const OUTPUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/stars.generated.ts');
const SKY_OUTPUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/sky.generated.ts');

/** Кванты упаковки — см. комментарий в src/data/stars.ts. */
const MAG_OFFSET = 2;
const MAG_SCALE = 20;
const CI_OFFSET = 0.5;
const CI_SCALE = 60;

const response = await fetch(SOURCE);
if (!response.ok) throw new Error(`HYG недоступен: ${response.status} ${response.statusText}`);

const csv = gunzipSync(Buffer.from(await response.arrayBuffer())).toString('utf8');
const lines = csv.split('\n');
const header = parseCsvLine(lines[0]);
const column = Object.fromEntries(header.map((name, index) => [name, index]));

const stars = [];
for (let i = 1; i < lines.length; i += 1) {
  const line = lines[i];
  if (!line) continue;

  const fields = parseCsvLine(line);
  if (fields[column.id] === '0') continue; // Солнце в каталоге тоже есть.

  const mag = Number(fields[column.mag]);
  if (!Number.isFinite(mag) || mag > MAGNITUDE_LIMIT) continue;

  const ra = Number(fields[column.ra]);
  const dec = Number(fields[column.dec]);
  if (!Number.isFinite(ra) || !Number.isFinite(dec)) continue;

  const ci = Number(fields[column.ci]);
  stars.push({
    ra,
    dec,
    mag,
    ci: Number.isFinite(ci) ? ci : 0.65,
    // Приметы звезды: по ним собираются имена и фигуры созвездий. В упаковку
    // они не идут — там только то, что нужно, чтобы нарисовать точку.
    proper: fields[column.proper],
    bayer: fields[column.bayer],
    con: fields[column.con],
    rarad: Number(fields[column.rarad]),
    decrad: Number(fields[column.decrad]),
  });
}

// Порядок по яркости: так первые записи в файле — самые заметные звёзды неба,
// и глазами проверять сгенерированное проще.
stars.sort((a, b) => a.mag - b.mag);

const bytes = new Uint8Array(stars.length * 6);
const view = new DataView(bytes.buffer);

stars.forEach((star, index) => {
  const offset = index * 6;
  // Прямое восхождение в часах → 16 бит по кругу: шаг 1.3 секунды дуги.
  view.setUint16(offset, Math.round((star.ra / 24) * 65536) & 0xffff, true);
  // Склонение: 16 бит со знаком на ±90°, шаг 10 угловых секунд.
  view.setInt16(offset + 2, Math.round((star.dec / 90) * 32767), true);
  view.setUint8(offset + 4, clampByte((star.mag + MAG_OFFSET) * MAG_SCALE));
  view.setUint8(offset + 5, clampByte((star.ci + CI_OFFSET) * CI_SCALE));
});

const brightest = stars
  .slice(0, 5)
  .map((s) => `${s.mag.toFixed(2)}`)
  .join(', ');

const file = `/**
 * Звёздный каталог HYG, упакованный по шесть байт на звезду.
 *
 * Файл сгенерирован scripts/fetch-stars.mjs, править руками нечего.
 *
 * Источник: ${SOURCE}
 * Отобрано: ${stars.length} звёзд ярче ${MAGNITUDE_LIMIT}ᵐ
 * Ярчайшие: ${brightest}
 */

/** Число звёзд в каталоге. */
export const STAR_COUNT = ${stars.length};

/** Упакованные записи в base64; разбор — в src/data/stars.ts. */
export const STAR_DATA =
  '${Buffer.from(bytes).toString('base64')}';
`;

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, file, 'utf8');

console.log(`Записано ${stars.length} звёзд в ${OUTPUT} (${(bytes.length / 1024).toFixed(1)} КБ до base64)`);

/** Разбор строки CSV с кавычками — в именах звёзд встречаются запятые. */
function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }

  fields.push(current.trim());
  return fields;
}

function clampByte(value) {
  const rounded = Math.round(value);
  return rounded < 0 ? 0 : rounded > 255 ? 255 : rounded;
}

writeSky(stars);

/**
 * Имена ярких звёзд и фигуры созвездий — вторым файлом.
 *
 * Координаты берутся в радианах и без упаковки: подписей три десятка,
 * отрезков — сотня, экономить здесь нечего. А вершина, съехавшая на квант
 * упаковки, отличалась бы от нарисованной звезды на десяток секунд дуги.
 */
function writeSky(all) {
  const named = [];

  const forced = ALWAYS_NAMED.map((name) => {
    const star = all.find((s) => s.proper === name);
    if (!star) throw new Error(`Звезды «${name}» нет в каталоге`);
    return star;
  });

  // Список — это первые NAMED_COUNT звёзд каталога с собственным именем, и
  // «первые» здесь по яркости: каталог отсортирован. Звезда без перевода
  // список не пропускает, а роняет сборку: молча пропустить её значило бы
  // подменить «сорок ярчайших» на «сорок, для которых нашёлся перевод».
  for (const star of all) {
    if (named.length >= NAMED_COUNT) break;
    if (!star.proper) continue;

    // Двойные с именами у обоих компонентов дали бы две подписи в одной точке.
    if (named.some((other) => angleDeg(other, star) < NAME_SEPARATION_DEG)) continue;

    if (!RU_NAMES[star.proper]) {
      throw new Error(
        `Нет русского имени для ${star.proper} (${star.mag.toFixed(2)}ᵐ) — ` +
          `допишите его в scripts/sky-figures.mjs`,
      );
    }

    named.push(star);
  }
  for (const star of forced) if (!named.includes(star)) named.push(star);

  // Указатель по обозначению Байера: «Alp Ori». Компоненты кратных («Alp-1»)
  // сводятся к одной записи — самой яркой из них.
  const byBayer = new Map();
  for (const star of all) {
    if (!star.bayer || !star.con) continue;
    const key = `${star.bayer.split('-')[0]} ${star.con}`;
    const current = byBayer.get(key);
    if (!current || star.mag < current.mag) byBayer.set(key, star);
  }

  const figures = FIGURES.map((figure) => {
    const segments = figure.lines.map(([from, to]) => {
      const a = vertex(byBayer, figure, from);
      const b = vertex(byBayer, figure, to);

      const length = angleDeg(a, b);
      if (length > MAX_SEGMENT_DEG) {
        throw new Error(
          `${figure.name}: отрезок ${from}—${to} длиной ${length.toFixed(1)}° — похоже на опечатку`,
        );
      }

      return [a.rarad, a.decrad, b.rarad, b.decrad];
    });

    return { name: figure.name, segments };
  });

  const segmentCount = figures.reduce((sum, figure) => sum + figure.segments.length, 0);

  const names = named
    .map(
      (star) =>
        `  { name: '${RU_NAMES[star.proper]}', ra: ${star.rarad.toFixed(7)}, ` +
        `dec: ${star.decrad.toFixed(7)}, magnitude: ${star.mag} },`,
    )
    .join('\n');

  const figureText = figures
    .map((figure) => {
      const segments = figure.segments
        .map(
          (s) =>
            `      [${s[0].toFixed(7)}, ${s[1].toFixed(7)}, ` +
            `${s[2].toFixed(7)}, ${s[3].toFixed(7)}],`,
        )
        .join('\n');
      return `  {\n    name: '${figure.name}',\n    segments: [\n${segments}\n    ],\n  },`;
    })
    .join('\n');

  const file = `import type { ConstellationFigure, NamedStar } from './sky';

/**
 * Имена ярких звёзд и фигуры созвездий.
 *
 * Файл сгенерирован scripts/fetch-stars.mjs из каталога HYG, править руками
 * нечего. Список фигур и русские имена задаются в scripts/sky-figures.mjs.
 *
 * Координаты экваториальные, эпоха J2000, радианы.
 */

/** Ярчайшие звёзды неба — те, по именам которых на нём ориентируются. */
export const NAMED_STARS: readonly NamedStar[] = [
${names}
];

/** Фигуры созвездий: отрезок задан парой вершин — ra1, dec1, ra2, dec2. */
export const CONSTELLATIONS: readonly ConstellationFigure[] = [
${figureText}
];
`;

  writeFileSync(SKY_OUTPUT, file, 'utf8');
  console.log(
    `Записано ${named.length} имён и ${figures.length} созвездий ` +
      `(${segmentCount} отрезков) в ${SKY_OUTPUT}`,
  );
}

/** Вершина фигуры: «Alp» своего созвездия или «Bet@Tau» — чужого. */
function vertex(byBayer, figure, token) {
  const [letter, con] = token.includes('@') ? token.split('@') : [token, figure.con];
  const star = byBayer.get(`${letter} ${con}`);
  if (!star) throw new Error(`${figure.name}: в каталоге нет звезды ${letter} ${con}`);
  return star;
}

/** Угол между двумя звёздами на небе, градусы. */
function angleDeg(a, b) {
  const cos =
    Math.sin(a.decrad) * Math.sin(b.decrad) +
    Math.cos(a.decrad) * Math.cos(b.decrad) * Math.cos(a.rarad - b.rarad);
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
}
