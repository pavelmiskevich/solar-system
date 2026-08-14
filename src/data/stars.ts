import { STAR_COUNT, STAR_DATA } from './stars.generated';

/**
 * Разбор звёздного каталога.
 *
 * Каталог хранится упакованным: шесть байт на звезду вместо трёх чисел с
 * плавающей точкой. Причина не в экономии диска, а в том, что иначе восемь
 * тысяч звёзд превращаются в четверть мегабайта исходника, который попадает
 * в diff при каждом обновлении данных и который невозможно читать.
 *
 * Точность упаковки выбрана по пикселю, а не «с запасом»: шаг по прямому
 * восхождению 1.3 секунды дуги, по склонению — 10 секунд. Пиксель кадра при
 * поле зрения 55° занимает около двухсот секунд дуги, то есть ошибка укладки
 * в двадцать раз меньше пикселя и не видна ни при каком увеличении, которое
 * тут возможно.
 */

/** Кванты упаковки. Обязаны совпадать со scripts/fetch-stars.mjs. */
const MAG_OFFSET = 2;
const MAG_SCALE = 20;
const CI_OFFSET = 0.5;
const CI_SCALE = 60;

const BYTES_PER_STAR = 6;

export interface StarCatalog {
  count: number;
  /** Прямое восхождение, радианы. */
  rightAscension: Float32Array;
  /** Склонение, радианы. */
  declination: Float32Array;
  /** Видимая звёздная величина. */
  magnitude: Float32Array;
  /** Показатель цвета B−V. */
  colorIndex: Float32Array;
}

let cached: StarCatalog | null = null;

/** Каталог разбирается один раз за сеанс: он неизменен. */
export function starCatalog(): StarCatalog {
  if (!cached) cached = decode(STAR_DATA, STAR_COUNT);
  return cached;
}

export function decode(base64: string, count: number): StarCatalog {
  const bytes = decodeBase64(base64);
  if (bytes.length < count * BYTES_PER_STAR) {
    throw new Error(`Каталог короче заявленного: ${bytes.length} байт на ${count} звёзд`);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const rightAscension = new Float32Array(count);
  const declination = new Float32Array(count);
  const magnitude = new Float32Array(count);
  const colorIndex = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const offset = i * BYTES_PER_STAR;
    // Прямое восхождение хранится долей полного круга.
    rightAscension[i] = (view.getUint16(offset, true) / 65536) * Math.PI * 2;
    declination[i] = ((view.getInt16(offset + 2, true) / 32767) * Math.PI) / 2;
    magnitude[i] = view.getUint8(offset + 4) / MAG_SCALE - MAG_OFFSET;
    colorIndex[i] = view.getUint8(offset + 5) / CI_SCALE - CI_OFFSET;
  }

  return { count, rightAscension, declination, magnitude, colorIndex };
}

/** Алфавит base64 — разбор своими руками избавляет от разницы сред. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Base64 → байты.
 *
 * Своя реализация вместо atob или Buffer: первого нет в Node, второго нет в
 * браузере, а ветвление по среде пришлось бы объяснять в каждом тесте.
 * Разбор занимает миллисекунду на пятьдесят килобайт и делается один раз.
 */
function decodeBase64(base64: string): Uint8Array {
  const clean = base64.replace(/=+$/, '');
  const bytes = new Uint8Array((clean.length * 3) >> 2);

  let accumulator = 0;
  let bits = 0;
  let out = 0;

  for (let i = 0; i < clean.length; i += 1) {
    const value = ALPHABET.indexOf(clean[i]!);
    if (value < 0) throw new Error(`Недопустимый символ base64: ${clean[i]}`);

    accumulator = (accumulator << 6) | value;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      bytes[out++] = (accumulator >> bits) & 0xff;
    }
  }

  return bytes;
}
