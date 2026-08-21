import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';

import { MOON, MOONS } from '../src/data/bodies';
import { JD_J2000 } from '../src/core/units';
import { SIDEREAL_MONTH, moonPositionAt, sampleMoonOrbit } from '../src/physics/moon';
import { sampleSatelliteOrbit, satellitePosition } from '../src/physics/satellite';

const SEGMENTS = 180;

/**
 * Расстояние от точки до ломаной, а не до ближайшего её узла.
 *
 * Разница принципиальна: узлы стоят через несколько тысяч километров, и
 * проверка «тело рядом с узлом» прошла бы для любой линии похожего размера.
 * Проверять надо то, что видно на экране, — попадает ли тело на саму линию.
 */
interface Point {
  x: number;
  y: number;
  z: number;
}

function distanceToPolyline(point: Point, polyline: readonly Point[]): number {
  let best = Infinity;
  const target = new Vector3(point.x, point.y, point.z);
  const from = new Vector3();
  const segment = new Vector3();
  const toPoint = new Vector3();
  const nearest = new Vector3();

  for (let i = 0; i + 1 < polyline.length; i += 1) {
    from.set(polyline[i]!.x, polyline[i]!.y, polyline[i]!.z);
    segment.set(polyline[i + 1]!.x, polyline[i + 1]!.y, polyline[i + 1]!.z).sub(from);
    toPoint.copy(target).sub(from);

    const lengthSquared = segment.lengthSq();
    const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, toPoint.dot(segment) / lengthSquared));

    nearest.copy(from).addScaledVector(segment, t);
    best = Math.min(best, nearest.distanceTo(target));
  }

  return best;
}

describe('линия орбиты спутника', () => {
  it('замкнута: последняя точка совпадает с первой', () => {
    for (const definition of MOONS) {
      const points = sampleSatelliteOrbit(definition.satellite!, SEGMENTS);

      expect(points).toHaveLength(SEGMENTS + 1);
      expect(points[0]!.distanceTo(points[SEGMENTS]!)).toBeLessThan(1);
    }
  });

  it('лежит в одной плоскости — той, вокруг которой ходит спутник', () => {
    for (const definition of MOONS) {
      const points = sampleSatelliteOrbit(definition.satellite!, SEGMENTS);
      const normal = new Vector3().crossVectors(points[0]!, points[SEGMENTS / 4]!).normalize();

      for (const point of points) {
        // Отклонение от плоскости — доли километра на сотнях тысяч.
        expect(Math.abs(normal.dot(point))).toBeLessThan(definition.satellite!.a * 1e-9);
      }
    }
  });

  it('проходит через спутник в любой момент времени', () => {
    for (const definition of MOONS) {
      const elements = definition.satellite!;
      const points = sampleSatelliteOrbit(elements, SEGMENTS);

      for (const fraction of [0, 0.13, 0.5, 0.77, 1.9]) {
        const body = satellitePosition(elements, JD_J2000 + fraction * elements.period);

        // Хорда в сто восемьдесят сегментов отходит от эллипса на a·1.5e-4.
        expect(distanceToPolyline(body, points)).toBeLessThan(elements.a * 2e-4);
      }
    }
  });
});

describe('линия орбиты Луны', () => {
  it('проходит через Луну в любой момент своего оборота', () => {
    for (const jd of [JD_J2000, JD_J2000 + 4000.5, JD_J2000 + 9731.25]) {
      const points = sampleMoonOrbit(jd, SEGMENTS);

      // Не только в начале выборки: доли оборота между узлами ломаной —
      // как раз то место, где грубая линия разошлась бы с телом.
      for (const fraction of [0, 0.137, 0.5, 0.923]) {
        const moon = moonPositionAt(jd + fraction * SIDEREAL_MONTH);

        expect(distanceToPolyline(moon, points)).toBeLessThan(MOON.radius);
      }
    }
  });

  it('не замыкается, но стык мельче шага самой линии', () => {
    for (const jd of [JD_J2000, JD_J2000 + 1000, JD_J2000 + 9731.25]) {
      const points = sampleMoonOrbit(jd, SEGMENTS);
      const gap = distanceToPolyline(points[SEGMENTS]!, [points[0]!, points[0]!]);
      const step = distanceToPolyline(points[1]!, [points[0]!, points[0]!]);

      // Ряд ELP2000 считает возмущённое движение, и оборот не приводит Луну
      // ровно в исходную точку. Замыкать линию силой значило бы рисовать не
      // ту орбиту, которая считается; вместо этого проверяется, что стык не
      // виден: он меньше расстояния между соседними точками ломаной, то есть
      // тоньше её собственной зернистости. Измерено — от одной до семи тысяч
      // километров против шага в двенадцать тысяч.
      expect(gap).toBeGreaterThan(0);
      expect(gap).toBeLessThan(step);
    }
  });
});
