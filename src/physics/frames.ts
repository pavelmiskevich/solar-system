import { Vector3 } from 'three';

import { DEG, OBLIQUITY_J2000 } from '../core/units';

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

/**
 * Полюс и центр Галактики в экваториальных координатах, эпоха J2000.
 *
 * Два направления задают всю галактическую систему: полюс — куда смотрит её
 * ось, центр — откуда отсчитывается долгота. Именно в этой системе лежит
 * Млечный Путь, и без неё его полосу пришлось бы класть на небо на глаз.
 */
const GALACTIC_POLE = { ra: 192.85948 * DEG, dec: 27.12825 * DEG };
const GALACTIC_CENTRE = { ra: 266.4051 * DEG, dec: -28.93617 * DEG };

/**
 * Оси галактической системы в координатах сцены.
 *
 * Тройка правая: centre — на центр Галактики (долгота 0°), pole — на северный
 * полюс Галактики (широта +90°), east дополняет их так, чтобы долгота росла
 * в принятую сторону — от центра через Лебедя.
 *
 * Направление на центр берётся не как есть, а исправленное: измеренные полюс
 * и центр перпендикулярны друг другу не идеально, и без ортогонализации
 * широта у центра вышла бы не нулём.
 */
export interface GalacticBasis {
  readonly centre: Vector3;
  readonly east: Vector3;
  readonly pole: Vector3;
}

export function galacticBasis(): GalacticBasis {
  const pole = sphericalEquatorialToScene(GALACTIC_POLE.ra, GALACTIC_POLE.dec).normalize();
  const centre = sphericalEquatorialToScene(GALACTIC_CENTRE.ra, GALACTIC_CENTRE.dec);

  centre.addScaledVector(pole, -centre.dot(pole)).normalize();
  const east = new Vector3().crossVectors(pole, centre).normalize();

  return { centre, east, pole };
}

/**
 * Галактические координаты направления: долгота и широта в радианах.
 *
 * @param direction единичный вектор в координатах сцены
 */
export function galacticCoordinates(
  direction: Vector3,
  basis: GalacticBasis,
): { longitude: number; latitude: number } {
  const latitude = Math.asin(Math.max(-1, Math.min(1, direction.dot(basis.pole))));
  const longitude = Math.atan2(direction.dot(basis.east), direction.dot(basis.centre));
  return { longitude, latitude };
}
