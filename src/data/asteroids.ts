import { DEG } from '../core/units';
import { solveKepler } from '../physics/kepler';
import { decodeBase64 } from './base64';
import {
  ASTEROID_COUNT,
  ASTEROID_DATA,
  ASTEROID_EPOCH,
  ASTEROID_GROUPS,
} from './asteroids.generated';

/**
 * Разбор каталога малых тел.
 *
 * Каталог хранится упакованным: двенадцать байт на тело вместо семи чисел с
 * плавающей точкой. Причина та же, что у звёзд, - пять тысяч тел иначе
 * превращаются в триста килобайт исходника, который попадает в diff при
 * каждом обновлении данных и который невозможно читать.
 *
 * Точность упаковки выбрана по смыслу каждого элемента, а не «с запасом».
 * Большая полуось: шаг 9·10⁻⁵ а.е., в полтораста раз мельче люка Кирквуда, -
 * провалы на резонансах обязаны остаться видны в гистограмме. Наклонение:
 * шаг 0.003°, иначе пояс расслоился бы на видимые глазом слои. Эксцентриситет
 * и величина довольствуются байтом: первый правит форму орбиты, которую никто
 * не измеряет, вторая - яркость точки в полпикселя.
 */

/** Кванты упаковки. Обязаны совпадать со scripts/fetch-asteroids.mjs. */
const A_MAX = 6;
const H_OFFSET = 2;
const H_SCALE = 8;

const BYTES_PER_ASTEROID = 12;

/** Гауссова постоянная: средняя суточная долгота при a = 1 а.е., град/сут. */
const GAUSS_DEG_PER_DAY = 0.9856076686;

export interface AsteroidCatalog {
  count: number;
  /** Эпоха элементов, юлианский день. */
  epoch: number;
  /** Большая полуось, а.е. */
  semiMajorAxis: Float32Array;
  /** Эксцентриситет. */
  eccentricity: Float32Array;
  /** Наклонение к эклиптике, радианы. */
  inclination: Float32Array;
  /** Долгота восходящего узла Ω, радианы. */
  node: Float32Array;
  /** Аргумент перицентра ω, радианы. */
  argPeriapsis: Float32Array;
  /** Средняя аномалия на эпоху, радианы. */
  meanAnomaly: Float32Array;
  /** Среднее суточное движение, радианы в сутки. */
  meanMotion: Float32Array;
  /** Абсолютная звёздная величина H. */
  magnitude: Float32Array;

  /**
   * Гауссовы векторы орбиты: P смотрит в перицентр, Q перпендикулярен ему в
   * плоскости орбиты. Через них положение считается без единого синуса:
   * r = P·a(cos E − e) + Q·a√(1−e²)·sin E.
   *
   * У астероида нет вековых членов, поэтому плоскость орбиты неподвижна, а
   * значит и эти векторы постоянны. Считаются один раз при разборе - за кадр
   * на пять тысяч тел остаётся одно решение уравнения Кеплера и шесть
   * умножений на тело.
   */
  px: Float32Array;
  py: Float32Array;
  pz: Float32Array;
  qx: Float32Array;
  qy: Float32Array;
  qz: Float32Array;
}

/** Гелиоцентрические эклиптические координаты в а.е. */
export interface AsteroidPosition {
  x: number;
  y: number;
  z: number;
}

let cached: AsteroidCatalog | null = null;

/** Каталог разбирается один раз за сеанс: он неизменен. */
export function asteroidCatalog(): AsteroidCatalog {
  if (!cached) cached = decode(ASTEROID_DATA, ASTEROID_COUNT, ASTEROID_EPOCH);
  return cached;
}

export function decode(base64: string, count: number, epoch: number): AsteroidCatalog {
  const bytes = decodeBase64(base64);
  if (bytes.length < count * BYTES_PER_ASTEROID) {
    throw new Error(`Каталог короче заявленного: ${bytes.length} байт на ${count} тел`);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const semiMajorAxis = new Float32Array(count);
  const eccentricity = new Float32Array(count);
  const inclination = new Float32Array(count);
  const node = new Float32Array(count);
  const argPeriapsis = new Float32Array(count);
  const meanAnomaly = new Float32Array(count);
  const meanMotion = new Float32Array(count);
  const magnitude = new Float32Array(count);
  const px = new Float32Array(count);
  const py = new Float32Array(count);
  const pz = new Float32Array(count);
  const qx = new Float32Array(count);
  const qy = new Float32Array(count);
  const qz = new Float32Array(count);

  const gauss = GAUSS_DEG_PER_DAY * DEG;

  for (let i = 0; i < count; i += 1) {
    const offset = i * BYTES_PER_ASTEROID;

    const a = (view.getUint16(offset, true) / 65535) * A_MAX;
    const e = view.getUint8(offset + 2) / 255;
    const inc = (view.getUint16(offset + 3, true) / 65535) * Math.PI;
    // Углы хранятся долей полного круга - как прямое восхождение у звёзд.
    const om = (view.getUint16(offset + 5, true) / 65536) * Math.PI * 2;
    const w = (view.getUint16(offset + 7, true) / 65536) * Math.PI * 2;
    const ma = (view.getUint16(offset + 9, true) / 65536) * Math.PI * 2;

    semiMajorAxis[i] = a;
    eccentricity[i] = e;
    inclination[i] = inc;
    node[i] = om;
    argPeriapsis[i] = w;
    meanAnomaly[i] = ma;
    // Третий закон Кеплера. Массой самого астероида пренебрегаем: даже Церера
    // весит меньше четырёх десятитысячных земной.
    meanMotion[i] = gauss * Math.pow(a, -1.5);
    magnitude[i] = view.getUint8(offset + 11) / H_SCALE - H_OFFSET;

    const cosW = Math.cos(w);
    const sinW = Math.sin(w);
    const cosOm = Math.cos(om);
    const sinOm = Math.sin(om);
    const cosInc = Math.cos(inc);
    const sinInc = Math.sin(inc);

    px[i] = cosW * cosOm - sinW * sinOm * cosInc;
    py[i] = cosW * sinOm + sinW * cosOm * cosInc;
    pz[i] = sinW * sinInc;

    qx[i] = -sinW * cosOm - cosW * sinOm * cosInc;
    qy[i] = -sinW * sinOm + cosW * cosOm * cosInc;
    qz[i] = cosW * sinInc;
  }

  return {
    count,
    epoch,
    semiMajorAxis,
    eccentricity,
    inclination,
    node,
    argPeriapsis,
    meanAnomaly,
    meanMotion,
    magnitude,
    px,
    py,
    pz,
    qx,
    qy,
    qz,
  };
}

/**
 * Положение тела под номером index на момент jd, а.е.
 *
 * Отдельно от цикла отрисовки: тому нужен весь рой разом и без выделения
 * объектов, а здесь - одно тело и читаемость. Считают обе дороги одно и то же,
 * и проверка это стережёт.
 */
export function positionOf(
  catalog: AsteroidCatalog,
  index: number,
  jd: number,
): AsteroidPosition {
  const a = catalog.semiMajorAxis[index]!;
  const e = catalog.eccentricity[index]!;
  const M = catalog.meanAnomaly[index]! + catalog.meanMotion[index]! * (jd - catalog.epoch);
  const E = solveKepler(M, e);

  const inPlaneX = a * (Math.cos(E) - e);
  const inPlaneY = a * Math.sqrt(1 - e * e) * Math.sin(E);

  return {
    x: catalog.px[index]! * inPlaneX + catalog.qx[index]! * inPlaneY,
    y: catalog.py[index]! * inPlaneX + catalog.qy[index]! * inPlaneY,
    z: catalog.pz[index]! * inPlaneX + catalog.qz[index]! * inPlaneY,
  };
}

export { ASTEROID_GROUPS };
