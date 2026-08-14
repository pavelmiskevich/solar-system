import type { PerspectiveCamera, Vector3 } from 'three';

import { angularRadiusPixels, projectToScreen, type ScreenPoint } from './projection';

/**
 * Выбор тела под курсором.
 *
 * Лучом по геометрии это не решается: почти всегда планета мельче пикселя, и
 * попасть по ней курсором физически невозможно — именно поэтому она и рисуется
 * точкой с нижней границей размера. Поэтому выбор идёт по экрану: берётся
 * ближайшее к курсору тело, у которого экранное расстояние укладывается либо в
 * его собственный диск, либо в допуск наведения.
 */

/** Допуск наведения, пиксели. Примерно радиус, в который человек попадает. */
const TOLERANCE = 26;

export interface PickCandidate {
  readonly id: string;
  /** Позиция в координатах сцены — камера в начале координат, км. */
  readonly renderPosition: Vector3;
  /** Видимый радиус, км. */
  readonly radius: number;
  /** Тело, которого не видно, выбрать нельзя. */
  isDrawn(): boolean;
}

export interface PickResult<T extends PickCandidate> {
  candidate: T;
  /** Экранное расстояние от курсора до центра тела, пиксели. */
  distancePx: number;
}

const point: ScreenPoint = { x: 0, y: 0, depth: 0 };

/**
 * Тело под точкой экрана или null.
 *
 * @param x, y координаты в CSS-пикселях от левого верхнего угла
 * @param tolerancePx радиус наведения для тел мельче него
 */
export function pickBody<T extends PickCandidate>(
  x: number,
  y: number,
  candidates: readonly T[],
  camera: PerspectiveCamera,
  widthPx: number,
  heightPx: number,
  tolerancePx = TOLERANCE,
): PickResult<T> | null {
  /*
   * Кандидаты делятся на два вида, и правила выбора у них разные.
   *
   * Диск — тело, чьё изображение накрывает точку клика. Из таких выбирается
   * ближайшее к камере: за диском планеты может стоять другая, и попасть можно
   * только в переднюю.
   *
   * Точка — тело мельче допуска наведения. Из таких выбирается самое крупное
   * по угловому размеру, а не ближайшее к курсору: с орбиты Земли Юпитер и его
   * спутники стоят в одном пикселе, и клик по этому пикселю означает Юпитер, а
   * не Ганимед, случайно оказавшийся на полпикселя ближе к курсору.
   */
  let disc: PickResult<T> | null = null;
  let discDepth = Infinity;

  let dot: PickResult<T> | null = null;
  let dotDepth = Infinity;
  let dotRadius = -1;

  for (const candidate of candidates) {
    if (!candidate.isDrawn()) continue;
    if (!projectToScreen(candidate.renderPosition, camera, widthPx, heightPx, point)) continue;

    const distancePx = Math.hypot(point.x - x, point.y - y);
    const radiusPx = angularRadiusPixels(candidate.radius, point.depth, camera.fov, heightPx);

    if (distancePx <= radiusPx) {
      if (point.depth < discDepth) {
        discDepth = point.depth;
        disc = { candidate, distancePx };
      }
      continue;
    }

    if (distancePx > tolerancePx) continue;

    if (radiusPx > dotRadius + 1e-6 || (Math.abs(radiusPx - dotRadius) <= 1e-6 && distancePx < (dot?.distancePx ?? Infinity))) {
      dotRadius = radiusPx;
      dotDepth = point.depth;
      dot = { candidate, distancePx };
    }
  }

  // Точка перед диском видна и потому выбираема: так выбирается Ио на фоне
  // Юпитера. Точка за диском закрыта им, и выбирается диск.
  if (dot && (!disc || dotDepth < discDepth)) return dot;
  return disc ?? dot;
}
