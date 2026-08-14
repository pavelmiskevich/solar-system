import { Vector3 } from 'three';

/**
 * Подбор точки, с которой на тело стоит смотреть.
 *
 * Наивное «встать сбоку и посмотреть на планету» почти всегда промахивается:
 * произвольное направление с равной вероятностью оказывается ночной стороной,
 * и вместо планеты в кадре чёрный круг с Солнцем у самого края. Проверено на
 * Земле — угол до Солнца получился 19° при угловом радиусе планеты 18°.
 *
 * Поэтому точка выбирается не произвольно, а по фазовому углу: камера
 * отводится от направления на Солнце на заданный угол. Тогда терминатор
 * оказывается в кадре, и планета читается объёмной — освещённая часть, ночная
 * часть и граница между ними.
 */

/**
 * Фазовый угол по умолчанию.
 *
 * При нуле планета освещена в полную фазу и выглядит плоским блином: тени,
 * задающей форму, просто нет. При 90° половина диска в темноте. Шестьдесят
 * градусов — компромисс, при котором терминатор виден, но освещённого остаётся
 * заметно больше, чем тёмного.
 */
const DEFAULT_PHASE_ANGLE = (60 * Math.PI) / 180;

/** Расстояние до тела в его радиусах: диск занимает примерно треть кадра. */
const DEFAULT_DISTANCE_IN_RADII = 3.4;

const toSun = new Vector3();
const axis = new Vector3();
/** Нормаль к эклиптике: в координатах сцены плоскость системы горизонтальна. */
const eclipticNorth = new Vector3(0, 1, 0);

export interface FramingOptions {
  /** Фазовый угол в радианах. */
  phaseAngle?: number;
  /** Расстояние в радиусах тела. */
  distanceInRadii?: number;
  /**
   * Отклонение точки съёмки от плоскости эклиптики, радианы. Небольшой подъём
   * над плоскостью избавляет кадр от симметрии, которая выглядит искусственно.
   */
  elevation?: number;
}

/**
 * Мировая позиция камеры для осмотра тела.
 *
 * @param bodyWorldPosition положение тела, км
 * @param sunWorldPosition положение Солнца, км
 * @param bodyRadius видимый радиус тела, км
 */
export function framingPosition(
  bodyWorldPosition: Vector3,
  sunWorldPosition: Vector3,
  bodyRadius: number,
  options: FramingOptions = {},
  out = new Vector3(),
): Vector3 {
  const phaseAngle = options.phaseAngle ?? DEFAULT_PHASE_ANGLE;
  const distance = bodyRadius * (options.distanceInRadii ?? DEFAULT_DISTANCE_IN_RADII);
  const elevation = options.elevation ?? 0.32;

  toSun.subVectors(sunWorldPosition, bodyWorldPosition);
  if (toSun.lengthSq() < 1e-12) toSun.copy(eclipticNorth);
  toSun.normalize();

  /*
   * Ось поворота — нормаль к эклиптике: тогда камера отводится вбок, оставаясь
   * почти в плоскости системы. Поворот вокруг перпендикуляра к ней уводил бы
   * камеру вверх на весь фазовый угол, и планета оказывалась бы под наблюдателем
   * полюсом к нему: полосы Юпитера читались бы кругами, а кольца Сатурна
   * смотрели бы неосвещённой стороной.
   */
  axis.copy(eclipticNorth);
  // Тело точно над Солнцем — вырожденный случай, поворачивать вокруг нормали
  // нечего; берём любую ось поперёк.
  if (Math.abs(toSun.dot(axis)) > 0.999) axis.set(1, 0, 0);

  // Отводим направление на Солнце на фазовый угол — получаем направление,
  // в котором надо встать от тела.
  out.copy(toSun).applyAxisAngle(axis, phaseAngle);

  // Небольшой подъём над плоскостью эклиптики.
  out.applyAxisAngle(toSun, elevation).normalize();

  return out.multiplyScalar(distance).add(bodyWorldPosition);
}
