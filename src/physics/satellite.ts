import { Vector3 } from 'three';

import { DEG, JD_J2000 } from '../core/units';
import { solveKepler } from './kepler';

/**
 * Орбиты спутников планет.
 *
 * Отличие от планетных орбит одно, но существенное: элементы спутника заданы
 * не в эклиптике, а в плоскости Лапласа — той, вокруг которой прецессирует его
 * орбита. У близких спутников она практически совпадает с экватором планеты,
 * потому что сплюснутость планеты правит движением сильнее, чем притяжение
 * Солнца. Поэтому спутники Юпитера ходят в плоскости его экватора, а не
 * эклиптики, и наклон их орбит к эклиптике равен наклону оси планеты.
 *
 * Именно из-за этого затмения галилеевых спутников видны сериями: их орбиты
 * почти в одной плоскости, а Юпитер наклонён к своей орбите всего на три
 * градуса.
 *
 * Элементы — средние, из таблиц JPL «Planetary Satellite Mean Elements»
 * на эпоху J2000. Они не учитывают взаимных возмущений, которые у галилеевых
 * спутников достигают сотен километров: для картины орбит этого достаточно,
 * для предсказания затмений — нет.
 */
export interface SatelliteElements {
  /** Большая полуось, км. */
  a: number;
  e: number;
  /** Наклонение к плоскости Лапласа, град. */
  i: number;
  /** Долгота восходящего узла в плоскости Лапласа, град. */
  node: number;
  /** Аргумент перицентра, град. */
  peri: number;
  /** Средняя аномалия на эпоху J2000, град. */
  meanAnomaly: number;
  /** Период обращения, сутки. */
  period: number;
}

/**
 * Положение спутника относительно планеты в её экваториальной системе, км.
 *
 * Ось z — северный полюс планеты, ось x — восходящий узел её экватора на
 * экваторе ICRF: те же опорные направления, от которых МАС отсчитывает
 * нулевой меридиан.
 */
export function satellitePosition(
  elements: SatelliteElements,
  jd: number,
  out = new Vector3(),
): Vector3 {
  const days = jd - JD_J2000;
  const meanAnomaly = (elements.meanAnomaly + (360 / elements.period) * days) * DEG;

  const E = solveKepler(meanAnomaly, elements.e);

  // Положение в плоскости орбиты: перицентр по оси x.
  const x = elements.a * (Math.cos(E) - elements.e);
  const y = elements.a * Math.sqrt(1 - elements.e * elements.e) * Math.sin(E);

  const peri = elements.peri * DEG;
  const node = elements.node * DEG;
  const inclination = elements.i * DEG;

  const cosPeri = Math.cos(peri);
  const sinPeri = Math.sin(peri);
  const cosNode = Math.cos(node);
  const sinNode = Math.sin(node);
  const cosI = Math.cos(inclination);
  const sinI = Math.sin(inclination);

  return out.set(
    x * (cosNode * cosPeri - sinNode * sinPeri * cosI) -
      y * (cosNode * sinPeri + sinNode * cosPeri * cosI),
    x * (sinNode * cosPeri + cosNode * sinPeri * cosI) -
      y * (sinNode * sinPeri - cosNode * cosPeri * cosI),
    x * (sinPeri * sinI) + y * (cosPeri * sinI),
  );
}
