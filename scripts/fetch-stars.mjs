// @ts-check
import { gunzipSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildCatalog, MAGNITUDE_LIMIT } from './star-catalog.mjs';

/**
 * Сборка звёздного каталога.
 *
 * Скачивает базу HYG (Hipparcos + Yale BSC + Gliese), отбирает звёзды ярче
 * предела невооружённого глаза и упаковывает их по шесть байт на звезду в
 * готовый к импорту модуль. Скрипт запускается вручную и редко: каталог
 * меняется раз в несколько лет, а результат лежит в репозитории - сборка не
 * должна зависеть от сети.
 *
 *   node scripts/fetch-stars.mjs
 *
 * Тем же запуском собираются имена ярких звёзд и фигуры созвездий
 * (src/data/sky.generated.ts). Отдельным скриптом их делать нельзя: линия
 * созвездия обязана упираться ровно в ту звезду, которая нарисована на небе,
 * а два скрипта с двумя загрузками рано или поздно разъедутся.
 *
 * Разбор и сборка текстов - в scripts/star-catalog.mjs. Здесь только
 * загрузка и запись, и запись идёт после того, как собраны оба файла: любая
 * ошибка разбора оставляет src/data/ нетронутым.
 */

const SOURCE =
  'https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v40.csv.gz';

const OUTPUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/stars.generated.ts');
const SKY_OUTPUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/sky.generated.ts');

const response = await fetch(SOURCE);
if (!response.ok) throw new Error(`HYG недоступен: ${response.status} ${response.statusText}`);

const csv = gunzipSync(Buffer.from(await response.arrayBuffer())).toString('utf8');
const catalog = buildCatalog(csv, { source: SOURCE });

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, catalog.starsFile, 'utf8');
writeFileSync(SKY_OUTPUT, catalog.skyFile, 'utf8');

console.log(
  `Записано ${catalog.starCount} звёзд ярче ${MAGNITUDE_LIMIT}ᵐ в ${OUTPUT} ` +
    `(${(catalog.packedBytes / 1024).toFixed(1)} КБ до base64)`,
);
console.log(
  `Записано ${catalog.namedCount} имён и ${catalog.figureCount} созвездий ` +
    `(${catalog.segmentCount} отрезков) в ${SKY_OUTPUT}`,
);
