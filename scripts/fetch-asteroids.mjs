// @ts-check
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Сборка каталога малых тел.
 *
 * Тянет из базы малых тел JPL элементы орбит нескольких тысяч астероидов и
 * упаковывает их по двенадцать байт на тело в готовый к импорту модуль.
 * Скрипт запускается вручную и редко: элементы крупных астероидов меняются
 * медленнее, чем выходит новая версия сцены, а результат лежит в репозитории -
 * сборка не должна зависеть от сети.
 *
 *   node scripts/fetch-asteroids.mjs
 *
 * Отбор идёт по населениям, и у каждого свой предел абсолютной величины.
 * Единый предел здесь не работает: астероид тем ярче в абсолютной величине,
 * чем он крупнее, а крупные тела сидят далеко - при общей границе H < 11.2
 * выборка из 8919 тел на восемьдесят процентов состоит из транснептуновых, а
 * околоземных в ней оказывается ровно два. Это список самых больших тел
 * системы, а не картина того, где вещество лежит.
 */

const API = 'https://ssd-api.jpl.nasa.gov/sbdb_query.api';

/**
 * Населения в том порядке, в каком они лягут в файл.
 *
 * Порядок не косметический: границы групп выписываются в сгенерированный
 * модуль, и по ним сцена и тесты отличают пояс от троянцев, не тратя на это
 * ни одного лишнего байта в записи.
 *
 * Пределы величин переведены в размер при среднем альбедо: 12.5 - это около
 * тринадцати километров поперёк, 17 - около полутора. Околоземные режутся
 * мельче не ради полноты, а потому что крупных среди них просто нет: на
 * H < 12.5 их два на всю группу.
 */
const POPULATIONS = [
  { key: 'belt', title: 'главный пояс', classes: 'IMB,MBA,OMB', limit: 12.5 },
  { key: 'trojans', title: 'троянцы Юпитера', classes: 'TJN', limit: 12.5 },
  { key: 'nearEarth', title: 'околоземные', classes: 'AMO,APO,ATE,IEO', limit: 17 },
];

/** Кванты упаковки - см. комментарий в src/data/asteroids.ts. */
const A_MAX = 6;
const H_OFFSET = 2;
const H_SCALE = 8;

const BYTES_PER_ASTEROID = 12;

/** Гауссова постоянная: средняя суточная долгота при a = 1 а.е., град/сут. */
const GAUSS_DEG_PER_DAY = 0.9856076686;

const OUTPUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../src/data/asteroids.generated.ts',
);

const groups = [];
for (const population of POPULATIONS) {
  const rows = await fetchPopulation(population);
  groups.push({ ...population, rows });
  console.log(`${population.title}: ${rows.length} тел (H < ${population.limit})`);
}

const all = groups.flatMap((group) => group.rows);
if (all.length === 0) throw new Error('База малых тел вернула пустую выборку');

/*
 * Единая эпоха. JPL отдаёт элементы почти всех тел на одну дату, но «почти» -
 * не то слово, на котором стоит строить каталог: запись с чужой эпохой встала
 * бы в сцене не туда, и заметить это было бы нечем. Поэтому эпоха берётся как
 * самая частая, а выбившиеся тела доводятся до неё средним движением.
 */
const epoch = mostCommon(all.map((body) => body.epoch));
let shifted = 0;
for (const body of all) {
  if (body.epoch === epoch) continue;
  const meanMotion = GAUSS_DEG_PER_DAY / Math.pow(body.a, 1.5);
  body.ma = normalizeDegrees(body.ma + meanMotion * (epoch - body.epoch));
  body.epoch = epoch;
  shifted += 1;
}
if (shifted > 0) console.log(`Приведено к общей эпохе: ${shifted} тел`);

const bytes = new Uint8Array(all.length * BYTES_PER_ASTEROID);
const view = new DataView(bytes.buffer);

all.forEach((body, index) => {
  const offset = index * BYTES_PER_ASTEROID;
  // Большая полуось: 16 бит на 0…6 а.е., шаг около 14 тысяч километров.
  // Дальше шести а.е. в этих населениях никого нет, а люки Кирквуда лежат на
  // 2.50 и 3.27 - шаг мельче их ширины в полторы сотни раз.
  view.setUint16(offset, clampUint16((body.a / A_MAX) * 65535), true);
  // Эксцентриситет: байта хватает. Шаг 0.004 не виден в кольце шириной
  // в астрономическую единицу, а нужен он только для формы орбиты.
  view.setUint8(offset + 2, clampByte((body.e / 1) * 255));
  // Наклонение: 0…180°, шаг 0.003°. Байта здесь мало - пояс расслоился бы
  // на видимые слои по 0.7°.
  view.setUint16(offset + 3, clampUint16((body.i / 180) * 65535), true);
  view.setUint16(offset + 5, angleToUint16(body.om), true);
  view.setUint16(offset + 7, angleToUint16(body.w), true);
  view.setUint16(offset + 9, angleToUint16(body.ma), true);
  view.setUint8(offset + 11, clampByte((body.H + H_OFFSET) * H_SCALE));
});

const bounds = [];
let start = 0;
for (const group of groups) {
  bounds.push({ key: group.key, title: group.title, start, count: group.rows.length });
  start += group.rows.length;
}

const largest = all
  .slice()
  .sort((a, b) => a.H - b.H)
  .slice(0, 5)
  .map((body) => body.name.trim())
  .join(', ');

const file = `/**
 * Каталог малых тел JPL, упакованный по ${BYTES_PER_ASTEROID} байт на тело.
 *
 * Файл сгенерирован scripts/fetch-asteroids.mjs, править руками нечего.
 *
 * Источник: ${API}
 * Отобрано: ${all.length} тел${bounds.map((b) => `\n *   ${b.title}: ${b.count}`).join('')}
 * Крупнейшие: ${largest}
 */

/** Число тел в каталоге. */
export const ASTEROID_COUNT = ${all.length};

/** Эпоха элементов, юлианский день. */
export const ASTEROID_EPOCH = ${epoch};

/**
 * Границы населений: записи лежат группами, в порядке пояс - троянцы -
 * околоземные.
 */
export const ASTEROID_GROUPS = {
${bounds.map((b) => `  /** ${b.title[0].toUpperCase()}${b.title.slice(1)}. */\n  ${b.key}: { start: ${b.start}, count: ${b.count} },`).join('\n')}
} as const;

/** Упакованные записи в base64; разбор - в src/data/asteroids.ts. */
export const ASTEROID_DATA =
  '${Buffer.from(bytes).toString('base64')}';
`;

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, file, 'utf8');

console.log(
  `Записано ${all.length} тел в ${OUTPUT} (${(bytes.length / 1024).toFixed(1)} КБ до base64)`,
);

/**
 * Забрать одно население.
 *
 * Полная точность запрашивается намеренно: по умолчанию API округляет большую
 * полуось до четырёх знаков, а на таком шаге дно люка Кирквуда размазывается
 * по соседним корзинам гистограммы.
 */
async function fetchPopulation({ classes, limit, title }) {
  const query = new URLSearchParams({
    fields: 'full_name,a,e,i,om,w,ma,H,epoch',
    'sb-class': classes,
    'sb-cdata': JSON.stringify({ AND: [`H|LT|${limit}`] }),
    'full-prec': 'true',
  });

  const response = await fetch(`${API}?${query}`);
  if (!response.ok) {
    throw new Error(`База малых тел недоступна: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  const index = Object.fromEntries(payload.fields.map((name, i) => [name, i]));

  const rows = [];
  for (const record of payload.data) {
    const body = {
      name: record[index.full_name],
      a: Number(record[index.a]),
      e: Number(record[index.e]),
      i: Number(record[index.i]),
      om: Number(record[index.om]),
      w: Number(record[index.w]),
      ma: Number(record[index.ma]),
      H: Number(record[index.H]),
      epoch: Number(record[index.epoch]),
    };

    // Запись без какого-нибудь элемента нарисовать нельзя, а молча поставить
    // ноль значит положить тело в центр Солнца.
    const complete = [body.a, body.e, body.i, body.om, body.w, body.ma, body.H, body.epoch];
    if (!complete.every(Number.isFinite)) continue;
    if (body.a <= 0 || body.a >= A_MAX || body.e >= 1) continue;

    rows.push(body);
  }

  if (rows.length === 0) throw new Error(`Население «${title}» вернулось пустым`);

  // Порядок по размеру: первыми в группе идут самые крупные тела, и глазами
  // проверять сгенерированное проще - в голове списка знакомые имена.
  rows.sort((a, b) => a.H - b.H);
  return rows;
}

function mostCommon(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best = values[0];
  for (const [value, count] of counts) {
    if (count > counts.get(best)) best = value;
  }
  return best;
}

function normalizeDegrees(angle) {
  return ((angle % 360) + 360) % 360;
}

function angleToUint16(degrees) {
  return Math.round((normalizeDegrees(degrees) / 360) * 65536) & 0xffff;
}

function clampUint16(value) {
  return Math.max(0, Math.min(65535, Math.round(value)));
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}
