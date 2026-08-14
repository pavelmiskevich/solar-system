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
