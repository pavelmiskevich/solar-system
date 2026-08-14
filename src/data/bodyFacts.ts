import { DEG } from '../core/units';
import { axialTilt } from '../physics/rotation';
import type { BodyDefinition } from './bodies';

/**
 * Справочные величины тела — то, что стоит в карточке.
 *
 * Часть из них лежит в таблице тел напрямую (радиус, масса), часть выводится
 * из тех же данных, которыми считается движение: период обращения — из большой
 * полуоси по третьему закону Кеплера, период вращения — из скорости вращения
 * МАС, наклон оси — из направления полюса. Отдельной таблицы «фактов» нет
 * намеренно: она разошлась бы с механикой при первой же правке.
 */
export interface BodyFacts {
  /** Экваториальный радиус, км. */
  radiusKm: number;
  massKg: number;
  /** Наклон оси вращения к плоскости эклиптики, градусы. */
  axialTiltDeg: number;
  /** Большая полуось орбиты, а.е. У Солнца и спутников отсутствует. */
  semiMajorAxisAu: number | null;
  /** Период обращения вокруг родителя, сутки. У Солнца отсутствует. */
  orbitalPeriodDays: number | null;
  /**
   * Период вращения вокруг оси, сутки. Отрицательный у Венеры и Урана —
   * они вращаются в обратную сторону, и это не опечатка в данных.
   */
  rotationPeriodDays: number;
}

/**
 * Сидерический месяц, сутки. Луна — единственное тело, чей период не выводится
 * из большой полуоси: её положение считается рядом Брауна, а не кеплеровыми
 * элементами, и полуоси в таблице просто нет.
 */
const SIDEREAL_MONTH = 27.321661;

export function bodyFacts(definition: BodyDefinition): BodyFacts {
  const { orbit, rotation } = definition;

  // Третий закон Кеплера в солнечных единицах: T² = a³, годы и а.е.
  // Спутники: период берётся из их собственных элементов. Луна — исключение:
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
    axialTiltDeg: axialTilt(rotation, orbit),
    semiMajorAxisAu: orbit?.a ?? null,
    orbitalPeriodDays,
    // Скорость вращения задана в градусах за сутки; знак сохраняется.
    rotationPeriodDays: 360 / rotation.rotationRate,
  };
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

/** Угол наклона в радианах — для тех, кому нужен не текст, а число. */
export function axialTiltRadians(facts: BodyFacts): number {
  return facts.axialTiltDeg * DEG;
}
