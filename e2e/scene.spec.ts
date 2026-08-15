import { expect, test } from '@playwright/test';

import { expectNoErrors, openScene, pauseAt, waitForFrames } from './helpers';

/**
 * Сцена запускается и рисует.
 *
 * Проверяется то, что нельзя проверить юнит-тестом: страница действительно
 * получила WebGL2, шейдеры скомпилировались, каталог разобрался, цикл кадров
 * идёт. Ошибка компиляции шейдера не роняет модуль — она просто оставляет
 * чёрный экран, поэтому чистая консоль здесь такая же часть проверки, как и
 * содержимое сцены.
 */
test.describe('запуск сцены', () => {
  test('страница поднимается без ошибок и рисует кадры', async ({ page }) => {
    const errors = await openScene(page);

    // Кадры действительно идут: ждём десяток подряд. Если сцена встала,
    // ожидание не завершится и тест упадёт по таймауту — это и есть проверка.
    //
    // Считать кадры за фиксированную секунду нельзя, и это выяснилось на
    // первом же прогоне в CI: на runner без видеокарты за секунду набирается
    // ровно столько кадров, сколько успевает программный растеризатор, и порог
    // начинает проверять быстродействие машины, а не работоспособность сцены.
    await waitForFrames(page, 10);

    await expect(page.locator('#viewport canvas')).toBeVisible();
    // Счётчик кадров в HUD не должен стоять на нуле.
    await expect(page.locator('#hud')).toContainText(/[1-9]\d* fps/);

    expectNoErrors(errors);
  });

  test('время идёт и останавливается по паузе', async ({ page }) => {
    await openScene(page);

    const advanced = await page.evaluate(async () => {
      const before = window.sim.clock.jd;
      await new Promise((resolve) => setTimeout(resolve, 700));
      return window.sim.clock.jd - before;
    });
    // Стартовый масштаб — сутки в секунду, значит за 0.7 с проходит больше
    // половины модельных суток. Ноль означал бы, что цикл встал.
    expect(advanced).toBeGreaterThan(0);

    const frozen = await page.evaluate(async () => {
      window.sim.clock.paused = true;
      const before = window.sim.clock.jd;
      await new Promise((resolve) => setTimeout(resolve, 500));
      return window.sim.clock.jd - before;
    });
    expect(frozen).toBe(0);
  });

  test('в сцене все тела: планеты, Луна и спутники гигантов', async ({ page }) => {
    await openScene(page);

    const ids = await page.evaluate(() =>
      window.sim.system.bodies.map((b: any) => b.definition.id),
    );

    expect(ids).toEqual(
      expect.arrayContaining([
        'mercury',
        'venus',
        'earth',
        'moon',
        'mars',
        'jupiter',
        'io',
        'europa',
        'ganymede',
        'callisto',
        'saturn',
        'titan',
        'uranus',
        'neptune',
        'pluto',
      ]),
    );
  });

  test('каталог звёзд разобран и лежит на небесной сфере', async ({ page }) => {
    await openScene(page);

    const sky = await page.evaluate(() => {
      const points = window.sim.viewport.scene.children.find((c: any) => c.type === 'Points');
      const position = points.geometry.getAttribute('position');
      const radii: number[] = [];
      for (let i = 0; i < position.count; i += 500) {
        radii.push(
          Math.hypot(position.getX(i), position.getY(i), position.getZ(i)),
        );
      }
      return { count: position.count, radii };
    });

    expect(sky.count).toBe(8920);
    // Все звёзды на одной сфере: параллакса при перелётах быть не должно.
    const first = sky.radii[0]!;
    for (const radius of sky.radii) expect(radius / first).toBeCloseTo(1, 5);
  });

  test('положения планет держатся эфемерид JPL', async ({ page }) => {
    await openScene(page);
    await pauseAt(page, '2026-08-14T12:00:00Z');
    await waitForFrames(page, 2);

    const au = await page.evaluate(() => {
      const AU = 149597870.7;
      const of = (id: string) => window.sim.system.find(id).worldPosition.length() / AU;
      return {
        mercury: of('mercury'),
        earth: of('earth'),
        jupiter: of('jupiter'),
        neptune: of('neptune'),
      };
    });

    // Расстояния от Солнца на эту дату — в пределах эксцентриситета орбит.
    expect(au.mercury).toBeGreaterThan(0.3);
    expect(au.mercury).toBeLessThan(0.47);
    expect(au.earth).toBeGreaterThan(0.98);
    expect(au.earth).toBeLessThan(1.02);
    expect(au.jupiter).toBeGreaterThan(4.95);
    expect(au.jupiter).toBeLessThan(5.46);
    expect(au.neptune).toBeGreaterThan(29.8);
    expect(au.neptune).toBeLessThan(30.4);
  });
});
