import { Vector3, type PerspectiveCamera } from 'three';

import { DEG } from '../core/units';

/**
 * Проекция сцены на экран.
 *
 * Общий код подписей и попадания курсора: и то и другое отвечает на один
 * вопрос — где тело оказалось на экране и какого оно там размера. Разойтись
 * этим двум ответам нельзя, иначе клик будет промахиваться мимо подписи.
 */

export interface ScreenPoint {
  x: number;
  y: number;
  /** Расстояние до камеры вдоль оси взгляда, км. Отрицательное — тело за спиной. */
  depth: number;
}

const projected = new Vector3();

/**
 * Экранные координаты точки сцены в CSS-пикселях, начало — левый верхний угол.
 * Возвращает false, если точка за камерой: у таких точек проекция зеркалит
 * координаты, и подпись уехала бы в противоположный угол кадра.
 */
export function projectToScreen(
  renderPosition: Vector3,
  camera: PerspectiveCamera,
  widthPx: number,
  heightPx: number,
  out: ScreenPoint,
): boolean {
  // Глубина считается до проекции: знак w в однородных координатах теряется.
  const view = camera.matrixWorldInverse.elements;
  const depth = -(
    view[2]! * renderPosition.x +
    view[6]! * renderPosition.y +
    view[10]! * renderPosition.z +
    view[14]!
  );

  out.depth = depth;
  if (depth <= 0) return false;

  projected.copy(renderPosition).project(camera);
  out.x = (projected.x * 0.5 + 0.5) * widthPx;
  out.y = (0.5 - projected.y * 0.5) * heightPx;
  return true;
}

/** Угловой радиус тела на экране в пикселях. */
export function angularRadiusPixels(
  radiusKm: number,
  distanceKm: number,
  fovDeg: number,
  heightPx: number,
): number {
  if (distanceKm <= 0) return Infinity;
  const radiansPerPixel = (fovDeg * DEG) / heightPx;
  return radiusKm / distanceKm / radiansPerPixel;
}
