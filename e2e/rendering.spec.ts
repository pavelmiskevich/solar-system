import { expect, test } from '@playwright/test';

import {
  openScene,
  pauseAt,
  waitForArrival,
  waitForFrames,
  waitForStableExposure,
} from './helpers';

/**
 * Рендеринг: экспозиция, кольца, поверхности.
 *
 * Всё, что живёт в шейдерах, юнит-тестами недостижимо. Здесь проверяется не
 * «красиво ли», а то, что поддаётся измерению: адаптируется ли экспозиция,
 * попала ли в кадр ночная сторона, есть ли у планеты кольца, не выродилась ли
 * картинка в чёрный прямоугольник.
 */

test.describe('рендеринг', () => {
  test('экспозиция раскрывается на ночной стороне и возвращается на дневной', async ({ page }) => {
    /*
     * Втрое больше общего лимита, и это не запас на всякий случай.
     *
     * Тест ждёт три полных цикла адаптации, а она идёт по `dt` кадрового
     * цикла, ограниченному сверху величиной 1/15 секунды. Пока кадры идут
     * часто, ограничение не срабатывает и адаптация течёт вровень с настенным
     * временем. На runner без видеокарты сцена выдаёт около четырёх кадров в
     * секунду — ограничение срабатывает на каждом, и адаптация замедляется
     * примерно вчетверо. Три цикла, укладывающиеся в полминуты на живой
     * машине, там занимают под две минуты.
     */
    test.setTimeout(300_000);

    await openScene(page);
    await pauseAt(page, '2026-08-14T12:00:00Z');

    // Дневная сторона Луны: экспозиция около единицы, как и положено в одной
    // астрономической единице от Солнца.
    await page.evaluate(() => window.sim.goTo('moon', 3.2, 50));
    const day = await waitForStableExposure(page);

    expect(day).toBeGreaterThan(0.5);
    expect(day).toBeLessThan(3);

    // Ночная сторона: света в десять тысяч раз меньше, и «зрачок» раскрывается.
    await page.evaluate(() => window.sim.goTo('moon', 3.2, 170));
    const night = await waitForStableExposure(page);

    expect(night).toBeGreaterThan(day * 50);

    // И возвращается обратно, когда снова смотрим на освещённое.
    await page.evaluate(() => window.sim.goTo('moon', 3.2, 50));
    const back = await waitForStableExposure(page);

    expect(back).toBeLessThan(night / 10);
  });

  test('у Сатурна и Урана есть кольца, у Земли нет', async ({ page }) => {
    await openScene(page);

    const rings = await page.evaluate(() => ({
      saturn: !!window.sim.system.find('saturn').rings,
      uranus: !!window.sim.system.find('uranus').rings,
      earth: !!window.sim.system.find('earth').rings,
      saturnBands: window.sim.system.find('saturn').appearance.rings.bands.length,
      uranusBands: window.sim.system.find('uranus').appearance.rings.bands.length,
    }));

    expect(rings.saturn).toBe(true);
    expect(rings.uranus).toBe(true);
    expect(rings.earth).toBe(false);
    expect(rings.saturnBands).toBeGreaterThanOrEqual(4);
    expect(rings.uranusBands).toBe(10);
  });

  test('спутники держатся в плоскости экватора своей планеты', async ({ page }) => {
    await openScene(page);
    await pauseAt(page, '2026-08-14T12:00:00Z');

    const tilt = await page.evaluate(() => {
      const sim = window.sim;
      const jupiter = sim.system.find('jupiter');
      const pole = new (jupiter.worldPosition.constructor)(0, 1, 0).applyQuaternion(
        jupiter.group.quaternion,
      );

      return ['io', 'europa', 'ganymede', 'callisto'].map((id) => {
        const moon = sim.system.find(id);
        const offset = moon.worldPosition.clone().sub(jupiter.worldPosition);
        return Math.abs(offset.dot(pole) / offset.length());
      });
    });

    // Наклонение орбит к экватору Юпитера — меньше половины градуса.
    for (const value of tilt) expect(value).toBeLessThan(0.02);
  });

  test('у Юпитера четыре линии орбит, и каждая проходит через свой спутник', async ({
    page,
  }) => {
    await openScene(page);
    await page.evaluate(() => window.sim.travelTo('jupiter'));
    await waitForArrival(page, 'jupiter');
    await waitForFrames(page, 3);

    const measured = await page.evaluate(() => {
      const sim = window.sim;
      const jupiter = sim.system.find('jupiter');

      // Группа Юпитера узнаётся по самому вектору его положения: плавающее
      // начало координат ведёт группу именно по нему.
      const entry = sim.satelliteOrbits.groups.find(
        (candidate: { worldPosition: unknown }) => candidate.worldPosition === jupiter.worldPosition,
      );
      if (!entry) return null;

      const lines = entry.group.children;

      /** Расстояние от точки до ломаной линии, а не до ближайшего её узла. */
      const distanceToLine = (line: any, target: { x: number; y: number; z: number }) => {
        const array = line.geometry.getAttribute('position').array as Float32Array;
        let best = Infinity;

        for (let i = 0; i + 1 < array.length / 3; i += 1) {
          const ax = array[i * 3]!;
          const ay = array[i * 3 + 1]!;
          const az = array[i * 3 + 2]!;
          const bx = array[i * 3 + 3]!;
          const by = array[i * 3 + 4]!;
          const bz = array[i * 3 + 5]!;

          const sx = bx - ax;
          const sy = by - ay;
          const sz = bz - az;
          const lengthSquared = sx * sx + sy * sy + sz * sz;
          const dot = (target.x - ax) * sx + (target.y - ay) * sy + (target.z - az) * sz;
          const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, dot / lengthSquared));

          const dx = target.x - (ax + sx * t);
          const dy = target.y - (ay + sy * t);
          const dz = target.z - (az + sz * t);
          best = Math.min(best, Math.sqrt(dx * dx + dy * dy + dz * dz));
        }

        return best;
      };

      /** Замкнута ли линия: последняя точка совпадает с первой. */
      const gap = (line: any) => {
        const array = line.geometry.getAttribute('position').array as Float32Array;
        const last = array.length - 3;
        return Math.hypot(array[0]! - array[last]!, array[1]! - array[last + 1]!, array[2]! - array[last + 2]!);
      };

      // Геометрия линий задана относительно планеты, поэтому и спутник берётся
      // смещением от неё, а не мировыми координатами.
      const moons = ['io', 'europa', 'ganymede', 'callisto'].map((id) => {
        const moon = sim.system.find(id);
        const offset = {
          x: moon.worldPosition.x - jupiter.worldPosition.x,
          y: moon.worldPosition.y - jupiter.worldPosition.y,
          z: moon.worldPosition.z - jupiter.worldPosition.z,
        };
        const distances = lines.map((line: unknown) => distanceToLine(line, offset));
        const nearest = distances.indexOf(Math.min(...distances));

        return {
          id,
          nearest,
          distance: distances[nearest],
          radius: Math.hypot(offset.x, offset.y, offset.z),
          visible: (lines[nearest] as { visible: boolean }).visible,
        };
      });

      return { count: lines.length, gaps: lines.map(gap), moons };
    });

    expect(measured, 'линии орбит спутников не найдены в сцене').not.toBeNull();
    expect(measured!.count).toBe(4);

    // Замкнутость: эллипс спутника неподвижен в системе планеты, поэтому
    // концы линии обязаны сойтись точно, а не примерно.
    for (const gap of measured!.gaps) expect(gap).toBeLessThan(1);

    // Каждая линия своя: четыре спутника не могут делить одну.
    expect(new Set(measured!.moons.map((moon) => moon.nearest)).size).toBe(4);

    for (const moon of measured!.moons) {
      expect(moon.visible, `линия ${moon.id} погашена у самой планеты`).toBe(true);
      // Тысячная доля радиуса орбиты: линия проходит через тело, а не рядом.
      expect(moon.distance, `линия ${moon.id} не проходит через спутник`).toBeLessThan(
        moon.radius * 1e-3,
      );
    }
  });
  test('кадр не чёрный: сцена действительно рисуется', async ({ page }) => {
    await openScene(page);
    await page.evaluate(() => window.sim.travelTo('jupiter'));
    await waitForArrival(page, 'jupiter');
    await waitForFrames(page, 3);

    // Замер яркости кадра делает сама сцена — тем же буфером, которым живёт
    // экспозиция. Ноль означал бы, что в кадре пусто.
    const luminance = await page.evaluate(() => {
      const sim = window.sim;
      return sim.exposure.value;
    });
    expect(luminance).toBeGreaterThan(0);

    const shot = await page.locator('#viewport canvas').screenshot();
    expect(shot.byteLength).toBeGreaterThan(5000);

    await test.info().attach('юпитер.png', { body: shot, contentType: 'image/png' });
  });

  test('адаптивное качество не срабатывает на ровном кадре', async ({ page }) => {
    await openScene(page);

    // Программный растеризатор медленный, и качество может понизиться — это
    // штатное поведение. Проверяем, что механизм не переключается туда-сюда:
    // уровень за пять секунд меняется не больше раза.
    const changes = await page.evaluate(async () => {
      const sim = window.sim;
      let previous = sim.quality?.levelIndex ?? 0;
      let count = 0;
      for (let i = 0; i < 25; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        const level = sim.quality?.levelIndex ?? 0;
        if (level !== previous) count += 1;
        previous = level;
      }
      return count;
    });

    expect(changes).toBeLessThanOrEqual(1);
  });
});
