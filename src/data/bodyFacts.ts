import { Vector3 } from 'three';

import { DEG } from '../core/units';
import { axialTilt, equatorialBasis, tiltFrom } from '../physics/rotation';
import { orbitNormalInHost } from '../physics/satellite';
import { bodyById, type BodyDefinition } from './bodies';

/**
 * Справочные величины тела - то, что стоит в карточке.
 *
 * Часть из них лежит в таблице тел напрямую (радиус, масса), часть выводится
 * из тех же данных, которыми считается движение: период обращения - из большой
 * полуоси по третьему закону Кеплера, период вращения - из скорости вращения
 * МАС, наклон оси - из направления полюса. Отдельной таблицы «фактов» нет
 * намеренно: она разошлась бы с механикой при первой же правке.
 */
export interface BodyFacts {
  /** Экваториальный радиус, км. */
  radiusKm: number;
  massKg: number;
  /**
   * Наклон оси вращения к плоскости своей орбиты, градусы: у планеты - орбиты
   * вокруг Солнца, у спутника - вокруг планеты. У Солнца и Луны, у которых
   * кеплеровых элементов нет, - к эклиптике.
   */
  axialTiltDeg: number;
  /** Большая полуось орбиты, а.е. У Солнца и спутников отсутствует. */
  semiMajorAxisAu: number | null;
  /** Период обращения вокруг родителя, сутки. У Солнца отсутствует. */
  orbitalPeriodDays: number | null;
  /**
   * Период вращения вокруг оси, сутки. Отрицательный у Венеры и Урана -
   * они вращаются в обратную сторону, и это не опечатка в данных.
   */
  rotationPeriodDays: number;
}

/**
 * Сидерический месяц, сутки. Луна - единственное тело, чей период не выводится
 * из большой полуоси: её положение считается рядом Брауна, а не кеплеровыми
 * элементами, и полуоси в таблице просто нет.
 */
const SIDEREAL_MONTH = 27.321661;

export function bodyFacts(definition: BodyDefinition): BodyFacts {
  const { orbit, rotation } = definition;

  // Третий закон Кеплера в солнечных единицах: T² = a³, годы и а.е.
  // Спутники: период берётся из их собственных элементов. Луна - исключение:
  // кеплеровых элементов у неё нет, поэтому стоит сидерический месяц.
  const orbitalPeriodDays = definition.satellite
    ? definition.satellite.period
    : orbit
      ? Math.pow(orbit.a, 1.5) * 365.25
      : definition.parent
        ? SIDEREAL_MONTH
        : null;

  return {
    radiusKm: definition.radius,
    massKg: definition.mass,
    axialTiltDeg: tiltOf(definition),
    semiMajorAxisAu: orbit?.a ?? null,
    orbitalPeriodDays,
    // Скорость вращения задана в градусах за сутки; знак сохраняется.
    rotationPeriodDays: 360 / rotation.rotationRate,
  };
}

/**
 * Наклон оси для карточки.
 *
 * У спутника - от нормали к его собственной орбите вокруг планеты. Раньше
 * своей орбиты у спутника в расчёт не попадало, и в карточке стоял наклон
 * полюса планеты к эклиптике: 28° у спутников Сатурна, 152° у Тритона. Нормаль
 * строится в том же экваториальном базисе планеты, которым сцена ставит
 * спутник на место, поэтому число описывает ровно то, что нарисовано.
 */
function tiltOf(definition: BodyDefinition): number {
  const { rotation, orbit, satellite, parent } = definition;
  const host = satellite && parent ? bodyById(parent) : undefined;
  if (!satellite || !host) return axialTilt(rotation, orbit);

  const basis = equatorialBasis(host.rotation);
  const local = orbitNormalInHost(satellite);
  const normal = new Vector3()
    .addScaledVector(basis.node, local.x)
    .addScaledVector(basis.third, local.y)
    .addScaledVector(basis.pole, local.z)
    .normalize();
  return tiltFrom(rotation, normal);
}

/** Сколько раз тело больше Земли по радиусу и по массе. */
export function relativeToEarth(
  facts: BodyFacts,
  earth: BodyFacts,
): { radius: number; mass: number } {
  return {
    radius: facts.radiusKm / earth.radiusKm,
    mass: facts.massKg / earth.massKg,
  };
}

/** Угол наклона в радианах - для тех, кому нужен не текст, а число. */
export function axialTiltRadians(facts: BodyFacts): number {
  return facts.axialTiltDeg * DEG;
}
