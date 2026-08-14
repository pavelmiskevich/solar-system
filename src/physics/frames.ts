import { Vector3 } from 'three';

import { OBLIQUITY_J2000 } from '../core/units';

/**
 * Переходы между системами координат.
 *
 * Их в сцене три, и путать их нельзя.
 *
 *   Экваториальная ICRF — в ней задают направления полюсов тел и положения
 *   звёзд: прямое восхождение и склонение.
 *
 *   Эклиптическая — в ней считаются орбиты: плоскость земной орбиты, ось z
 *   на северный полюс эклиптики.
 *
 *   Сцена three.js — та же эклиптическая, но с осью y вверх: (x, y, z)
 *   переходит в (x, z, −y). Перестановка сохраняет правую тройку, зеркалить
 *   ничего не надо.
 */

/** Эклиптические координаты → координаты сцены. */
export function eclipticToScene(x: number, y: number, z: number, out = new Vector3()): Vector3 {
  return out.set(x, z, -y);
}

/**
 * Экваториальные координаты ICRF → координаты сцены.
 *
 * Сначала поворот на наклон эклиптики, затем перестановка осей.
 */
export function equatorialToScene(x: number, y: number, z: number, out = new Vector3()): Vector3 {
  const cosE = Math.cos(OBLIQUITY_J2000);
  const sinE = Math.sin(OBLIQUITY_J2000);

  return eclipticToScene(x, y * cosE + z * sinE, -y * sinE + z * cosE, out);
}

/**
 * Прямое восхождение и склонение → единичный вектор в координатах сцены.
 *
 * @param rightAscension радианы
 * @param declination радианы
 */
export function sphericalEquatorialToScene(
  rightAscension: number,
  declination: number,
  out = new Vector3(),
): Vector3 {
  const cosDec = Math.cos(declination);
  return equatorialToScene(
    cosDec * Math.cos(rightAscension),
    cosDec * Math.sin(rightAscension),
    Math.sin(declination),
    out,
  );
}
