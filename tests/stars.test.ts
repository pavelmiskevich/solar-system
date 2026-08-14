import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';

import { starCatalog } from '../src/data/stars';
import { STAR_COUNT } from '../src/data/stars.generated';
import { sphericalEquatorialToScene } from '../src/physics/frames';
import { DEG, RAD } from '../src/core/units';

/** Найти звезду по справочным координатам: каталог не хранит имён. */
function findStar(raHours: number, decDeg: number) {
  const catalog = starCatalog();
  const targetRa = (raHours / 24) * Math.PI * 2;
  const targetDec = decDeg * DEG;

  let best = -1;
  let bestDistance = Infinity;

  for (let i = 0; i < catalog.count; i += 1) {
    const dRa = (catalog.rightAscension[i]! - targetRa) * Math.cos(targetDec);
    const dDec = catalog.declination[i]! - targetDec;
    const distance = Math.hypot(dRa, dDec);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }

  return {
    index: best,
    separationArcsec: bestDistance * RAD * 3600,
    magnitude: catalog.magnitude[best]!,
    colorIndex: catalog.colorIndex[best]!,
  };
}

describe('каталог звёзд', () => {
  it('разбирается целиком и совпадает по числу записей', () => {
    const catalog = starCatalog();

    expect(catalog.count).toBe(STAR_COUNT);
    expect(catalog.count).toBeGreaterThan(8000);
    expect(catalog.rightAscension).toHaveLength(catalog.count);
  });

  it('содержит ярчайшие звёзды неба с правильными величинами', () => {
    // Сириус: 6ʰ45ᵐ, −16.7°, −1.44ᵐ, белый.
    const sirius = findStar(6.7525, -16.716);
    expect(sirius.separationArcsec).toBeLessThan(30);
    expect(sirius.magnitude).toBeCloseTo(-1.44, 1);
    expect(sirius.colorIndex).toBeCloseTo(0.0, 1);

    // Бетельгейзе: 5ʰ55ᵐ, +7.4°, красная — показатель цвета около 1.5.
    const betelgeuse = findStar(5.9195, 7.407);
    expect(betelgeuse.separationArcsec).toBeLessThan(30);
    expect(betelgeuse.colorIndex).toBeGreaterThan(1.3);

    // Вега: 18ʰ37ᵐ, +38.8°, нулевая величина по определению шкалы.
    const vega = findStar(18.6156, 38.784);
    expect(vega.separationArcsec).toBeLessThan(30);
    expect(vega.magnitude).toBeCloseTo(0.03, 1);
  });

  it('величины лежат в пределах отбора', () => {
    const catalog = starCatalog();
    let min = Infinity;
    let max = -Infinity;

    for (let i = 0; i < catalog.count; i += 1) {
      min = Math.min(min, catalog.magnitude[i]!);
      max = Math.max(max, catalog.magnitude[i]!);
    }

    expect(min).toBeLessThan(-1.4); // Сириус
    expect(max).toBeLessThanOrEqual(6.55);
  });

  it('каталог отсортирован по яркости', () => {
    const catalog = starCatalog();
    for (let i = 1; i < catalog.count; i += 1) {
      expect(catalog.magnitude[i]!).toBeGreaterThanOrEqual(catalog.magnitude[i - 1]! - 0.06);
    }
  });
});

describe('перевод координат неба', () => {
  it('северный полюс мира отстоит от оси сцены на наклон эклиптики', () => {
    // Полюс мира: склонение +90°. Ось y сцены — полюс эклиптики.
    const pole = sphericalEquatorialToScene(0, Math.PI / 2);

    expect(pole.length()).toBeCloseTo(1, 9);
    expect(Math.acos(pole.y) * RAD).toBeCloseTo(23.44, 1);
  });

  it('точка весеннего равноденствия совпадает у обеих систем', () => {
    // Нулевые прямое восхождение и склонение — общая ось x двух систем.
    const equinox = sphericalEquatorialToScene(0, 0);

    expect(equinox.x).toBeCloseTo(1, 6);
    expect(equinox.y).toBeCloseTo(0, 6);
    expect(equinox.z).toBeCloseTo(0, 6);
  });

  it('северный полюс эклиптики лежит в созвездии Дракона', () => {
    // 18ʰ00ᵐ, +66.56° — справочное положение полюса эклиптики.
    const direction = sphericalEquatorialToScene((18 / 24) * Math.PI * 2, 66.56 * DEG);

    expect(direction.y).toBeCloseTo(1, 3);
  });

  it('звёзды каталога ложатся на единичную сферу', () => {
    const catalog = starCatalog();
    const point = new Vector3();

    for (let i = 0; i < catalog.count; i += 500) {
      sphericalEquatorialToScene(catalog.rightAscension[i]!, catalog.declination[i]!, point);
      expect(point.length()).toBeCloseTo(1, 6);
    }
  });
});
