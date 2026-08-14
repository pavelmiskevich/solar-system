import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';

import { framingPosition } from '../src/camera/framing';

/** Юпитер и Солнце в плоскости эклиптики — как почти всё в этой системе. */
const SUN = new Vector3(0, 0, 0);
const JUPITER = new Vector3(778.5e6, 0, 0);
const RADIUS = 71492;

/** Угол между вектором и плоскостью эклиптики, градусы. */
function elevationDeg(from: Vector3, to: Vector3): number {
  const offset = new Vector3().subVectors(from, to).normalize();
  return (Math.asin(Math.abs(offset.y)) * 180) / Math.PI;
}

/** Угол Солнце — тело — камера, градусы. Это и есть фазовый угол. */
function phaseDeg(camera: Vector3, body: Vector3, sun: Vector3): number {
  const toCamera = new Vector3().subVectors(camera, body).normalize();
  const toSun = new Vector3().subVectors(sun, body).normalize();
  return (Math.acos(toCamera.dot(toSun)) * 180) / Math.PI;
}

describe('framingPosition', () => {
  it('ставит камеру на заданном расстоянии в радиусах тела', () => {
    const camera = framingPosition(JUPITER, SUN, RADIUS, { distanceInRadii: 4 });

    expect(camera.distanceTo(JUPITER) / RADIUS).toBeCloseTo(4, 6);
  });

  it('выдерживает фазовый угол: тело освещено ровно так, как просили', () => {
    for (const degrees of [30, 60, 90, 140]) {
      const camera = framingPosition(JUPITER, SUN, RADIUS, {
        phaseAngle: (degrees * Math.PI) / 180,
      });

      expect(phaseDeg(camera, JUPITER, SUN)).toBeCloseTo(degrees, 4);
    }
  });

  /*
   * Главное свойство: камера отводится вбок, а не вверх. Поворот вокруг
   * перпендикуляра к нормали эклиптики поднимал бы камеру на весь фазовый угол,
   * и планета показывала бы полюс — полосы Юпитера кругами, кольца Сатурна
   * неосвещённой стороной. Наклон над плоскостью нужен, но небольшой.
   */
  it('держится вблизи плоскости эклиптики при любом фазовом угле', () => {
    for (const degrees of [30, 60, 90, 140]) {
      const camera = framingPosition(JUPITER, SUN, RADIUS, {
        phaseAngle: (degrees * Math.PI) / 180,
      });

      expect(elevationDeg(camera, JUPITER)).toBeLessThan(25);
    }
  });

  it('подъём над плоскостью задаётся явно и не равен нулю по умолчанию', () => {
    const flat = framingPosition(JUPITER, SUN, RADIUS, { elevation: 0 });
    const raised = framingPosition(JUPITER, SUN, RADIUS, {});

    expect(elevationDeg(flat, JUPITER)).toBeCloseTo(0, 6);
    expect(elevationDeg(raised, JUPITER)).toBeGreaterThan(5);
  });

  it('не вырождается, когда тело стоит над полюсом Солнца', () => {
    // Вектор на Солнце совпадает с нормалью эклиптики: поворачивать вокруг неё
    // нечего, и наивная реализация вернула бы NaN.
    const overhead = new Vector3(0, 778.5e6, 0);
    const camera = framingPosition(overhead, SUN, RADIUS, { distanceInRadii: 4 });

    expect(Number.isFinite(camera.x)).toBe(true);
    expect(camera.distanceTo(overhead) / RADIUS).toBeCloseTo(4, 6);
    expect(phaseDeg(camera, overhead, SUN)).toBeCloseTo(60, 4);
  });
});
