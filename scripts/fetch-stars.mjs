// @ts-check
import { gunzipSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
 */

const SOURCE =
  'https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v40.csv.gz';

/**
 * Предел невооружённого глаза в идеальную ночь. Слабее рисовать нечего:
 * фотометрия неба всё равно гасит такие звёзды почти в ноль.
 */
const MAGNITUDE_LIMIT = 6.5;

const OUTPUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/stars.generated.ts');

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
  stars.push({ ra, dec, mag, ci: Number.isFinite(ci) ? ci : 0.65 });
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
