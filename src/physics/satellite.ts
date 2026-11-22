import { Vector3 } from 'three';

import { DEG, JD_J2000, OBLIQUITY_J2000 } from '../core/units';
import { solveKepler } from './kepler';

/**
 * Орбиты спутников планет.
 *
 * Отличие от планетных орбит одно, но существенное: элементы спутника заданы
 * не в эклиптике, а в плоскости Лапласа - той, вокруг которой прецессирует его
 * орбита. У близких спутников она практически совпадает с экватором планеты,
 * потому что сплюснутость планеты правит движением сильнее, чем притяжение
 * Солнца. Поэтому спутники Юпитера ходят в плоскости его экватора, а не
 * эклиптики, и наклон их орбит к эклиптике равен наклону оси планеты.
 *
 * Именно из-за этого затмения галилеевых спутников видны сериями: их орбиты
 * почти в одной плоскости, а Юпитер наклонён к своей орбите всего на три
 * градуса.
 *
 * Элементы - средние, из таблиц JPL «Planetary Satellite Mean Elements»
 * на эпоху J2000. Они не учитывают взаимных возмущений, которые у галилеевых
 * спутников достигают сотен километров: для картины орбит этого достаточно,
 * для предсказания затмений - нет.
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
 * Поворот из плоскости орбиты в экваториальную систему планеты.
 *
 * Вынесен отдельно, потому что у линии орбиты он один на все её точки:
 * шесть косинусов и синусов не зависят от того, где по орбите сейчас тело.
 * Общий поворот заодно означает, что линия проходит через спутник не по
 * счастливому совпадению, а потому что это одни и те же формулы.
 */
interface OrbitRotation {
  cosPeri: number;
  sinPeri: number;
  cosNode: number;
  sinNode: number;
  cosI: number;
  sinI: number;
}

function orbitRotation(elements: SatelliteElements): OrbitRotation {
  const peri = elements.peri * DEG;
  const node = elements.node * DEG;
  const inclination = elements.i * DEG;

  return {
    cosPeri: Math.cos(peri),
    sinPeri: Math.sin(peri),
    cosNode: Math.cos(node),
    sinNode: Math.sin(node),
    cosI: Math.cos(inclination),
    sinI: Math.sin(inclination),
  };
}

/** Точка плоскости орбиты (перицентр по оси x) в экваториальной системе планеты. */
function place(rotation: OrbitRotation, x: number, y: number, out: Vector3): Vector3 {
  const { cosPeri, sinPeri, cosNode, sinNode, cosI, sinI } = rotation;

  return out.set(
    x * (cosNode * cosPeri - sinNode * sinPeri * cosI) -
      y * (cosNode * sinPeri + sinNode * cosPeri * cosI),
    x * (sinNode * cosPeri + cosNode * sinPeri * cosI) -
      y * (sinNode * sinPeri - cosNode * cosPeri * cosI),
    x * (sinPeri * sinI) + y * (cosPeri * sinI),
  );
}

/**
 * Положение спутника относительно планеты в её экваториальной системе, км.
 *
 * Ось z - северный полюс планеты, ось x - восходящий узел её экватора на
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

  return place(orbitRotation(elements), x, y, out);
}

/**
 * Точки орбиты спутника в экваториальной системе планеты, км.
 *
 * Обход идёт по эксцентрической аномалии, а не по времени: у эллипса это
 * даёт равномерную по длине дуги линию вместо сгущения точек в апоцентре -
 * то же соображение, что и у планетных орбит в `sampleOrbit`.
 *
 * Времени здесь нет вовсе, и это не упущение. Элементы спутника средние, без
 * вековых членов, поэтому эллипс в системе планеты неподвижен: по нему
 * движется только тело, а сама линия строится один раз и навсегда.
 */
export function sampleSatelliteOrbit(
  elements: SatelliteElements,
  segments = 256,
): Vector3[] {
  const rotation = orbitRotation(elements);
  const semiMinor = elements.a * Math.sqrt(1 - elements.e * elements.e);
  const points: Vector3[] = [];

  for (let s = 0; s <= segments; s += 1) {
    const E = (s / segments) * Math.PI * 2;

    points.push(
      place(
        rotation,
        elements.a * (Math.cos(E) - elements.e),
        semiMinor * Math.sin(E),
        new Vector3(),
      ),
    );
  }

  return points;
}

/**
 * Нормаль к плоскости орбиты спутника в экваториальной системе планеты.
 *
 * Направлена по моменту импульса: та сторона, с которой обращение видно
 * против часовой стрелки. Те же оси, что у `satellitePosition`: x - узел
 * экватора планеты, z - её северный полюс.
 */
export function orbitNormalInHost(elements: SatelliteElements, out = new Vector3()): Vector3 {
  const node = elements.node * DEG;
  const inclination = elements.i * DEG;
  return out.set(
    Math.sin(inclination) * Math.sin(node),
    -Math.sin(inclination) * Math.cos(node),
    Math.cos(inclination),
  );
}

/**
 * Полюс вращения синхронного спутника, перпендикулярный его орбите, в виде
 * прямого восхождения и склонения ICRF.
 *
 * Обычно полюс спутника берётся равным полюсу планеты: близкий спутник
 * обращается в её экваторе, и разница - доли градуса. Тритону это не годится:
 * он ходит вспять, и его орбита наклонена к экватору Нептуна на 157°. С
 * полюсом Нептуна его ось отстояла бы от нормали к орбите на 23°, а у
 * синхронного спутника они совпадают.
 *
 * Северным полюсом, как принято в МАС, берётся тот, что смотрит к северу от
 * эклиптики. Если обращение вокруг него идёт по часовой стрелке, вращение
 * обратное, и об этом говорит `retrograde`.
 */
export function poleAlongOrbit(
  host: { poleRa: number; poleDec: number },
  elements: SatelliteElements,
): { poleRa: number; poleDec: number; retrograde: boolean } {
  const alpha = host.poleRa * DEG;
  const delta = host.poleDec * DEG;
  const pole = new Vector3(
    Math.cos(delta) * Math.cos(alpha),
    Math.cos(delta) * Math.sin(alpha),
    Math.sin(delta),
  );
  const node = new Vector3(-Math.sin(alpha), Math.cos(alpha), 0);
  const third = new Vector3().crossVectors(pole, node);

  const local = orbitNormalInHost(elements);
  const normal = new Vector3()
    .addScaledVector(node, local.x)
    .addScaledVector(third, local.y)
    .addScaledVector(pole, local.z)
    .normalize();

  // Северный полюс эклиптики в экваториальных координатах ICRF.
  const eclipticNorth = new Vector3(0, -Math.sin(OBLIQUITY_J2000), Math.cos(OBLIQUITY_J2000));
  const retrograde = normal.dot(eclipticNorth) < 0;
  if (retrograde) normal.negate();

  return {
    poleRa: (((Math.atan2(normal.y, normal.x) / DEG) % 360) + 360) % 360,
    poleDec: Math.asin(Math.max(-1, Math.min(1, normal.z))) / DEG,
    retrograde,
  };
}
