import type { Vector3 } from 'three';

/**
 * Свет, отражённый одним телом на другое.
 *
 * Ночная сторона Луны не чёрная: её освещает Земля. Это тот же солнечный свет,
 * отражённый дважды, и он на четыре порядка слабее прямого — ровно настолько,
 * чтобы читался диск, но не читались детали. Обратный эффект, лунный свет на
 * Земле, ещё в тридцать раз слабее, и именно поэтому ночная сторона Земли
 * остаётся чёрной, а не «слегка серой».
 *
 * Считаем долю от местной солнечной облучённости — так результат не зависит
 * от того, где находится пара тел, и не требует переводить единицы.
 */

/**
 * Доля прямой солнечной облучённости, приходящая от отражателя.
 *
 * @param albedo альбедо отражателя
 * @param sourceRadiusKm радиус отражателя
 * @param distanceKm расстояние между телами
 * @param illuminatedFraction доля освещённого диска отражателя, видимая с тела
 *
 * Проверка: Земля для Луны даёт 0.306 · (6378/384400)² = 8.4·10⁻⁵. Наблюдаемая
 * величина полной Земли с Луны — около −16.5ᵐ против −26.7ᵐ у Солнца, то есть
 * 8.3·10⁻⁵. Совпадение до второго знака.
 */
export function reflectedIrradianceFraction(
  albedo: number,
  sourceRadiusKm: number,
  distanceKm: number,
  illuminatedFraction: number,
): number {
  if (distanceKm <= 0) return 0;
  const ratio = sourceRadiusKm / distanceKm;
  return albedo * ratio * ratio * Math.max(illuminatedFraction, 0);
}

/**
 * Доля освещённого диска отражателя, видимая с тела.
 *
 * Ноль — отражатель повёрнут к телу ночной стороной, единица — полная фаза.
 * Это та самая величина, из-за которой пепельный свет ярче всего при молодой
 * Луне: тогда Земля с Луны видна почти полной.
 */
export function illuminatedFraction(
  sourcePosition: Vector3,
  targetPosition: Vector3,
  sunPosition: Vector3,
): number {
  const sx = sunPosition.x - sourcePosition.x;
  const sy = sunPosition.y - sourcePosition.y;
  const sz = sunPosition.z - sourcePosition.z;
  const sunLength = Math.hypot(sx, sy, sz);

  const tx = targetPosition.x - sourcePosition.x;
  const ty = targetPosition.y - sourcePosition.y;
  const tz = targetPosition.z - sourcePosition.z;
  const targetLength = Math.hypot(tx, ty, tz);

  if (sunLength < 1e-9 || targetLength < 1e-9) return 0;

  const cosPhase = (sx * tx + sy * ty + sz * tz) / (sunLength * targetLength);
  return (1 + cosPhase) / 2;
}
