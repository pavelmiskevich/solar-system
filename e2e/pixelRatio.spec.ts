import { expect, test, type Page } from '@playwright/test';

import { openScene, waitForFrames } from './helpers';

/**
 * Открыть сцену и заморозить адаптивное качество на полном разрешении: на
 * программном рендерере оно срезает разрешение само, и плотность буфера
 * менялась бы посреди проверки.
 */
async function openAtFullResolution(page: Page): Promise<void> {
  await openScene(page);
  await page.evaluate(() => {
    window.sim.quality.update = () => false;
    window.sim.viewport.setResolutionScale(1);
  });
}

/** Что знает сцена о плотности пикселей: буфер, bloom и точки звёзд. */
async function sizes(page: Page) {
  return page.evaluate(() => {
    const sim = window.sim;
    return {
      ratio: sim.viewport.renderer.getPixelRatio() as number,
      composer: sim.viewport.composer.renderTarget1.width as number,
      bloom: sim.viewport.bloom.renderTargetsHorizontal[0].width as number,
      stars: sim.starfield.points.material.uniforms.uPixelRatio.value as number,
      asteroids: sim.asteroids.points.material.uniforms.uPixelRatio.value as number,
    };
  });
}

for (const scale of [1, 2]) {
  test.describe(`плотность пикселей ${scale}`, () => {
    test.use({ deviceScaleFactor: scale, viewport: { width: 1200, height: 800 } });

    test('bloom считается от буфера композитора, а не от размера в точках CSS', async ({
      page,
    }) => {
      // Первый уровень bloom - половина буфера: так его строит сам
      // UnrealBloomPass. Прежде лишний вызов задавал половину размера в
      // точках CSS, и на плотности 2 свечение считалось вчетверо грубее.
      await openAtFullResolution(page);
      const now = await sizes(page);

      expect(now.composer).toBe(1200 * scale);
      expect(now.bloom).toBe(now.composer / 2);
    });
  });
}

test.describe('смена плотности пикселей', () => {
  test.use({ deviceScaleFactor: 2, viewport: { width: 1200, height: 800 } });

  /*
   * Окно переехало на экран с плотностью 1, размер окна тот же. Headless
   * Chromium такой переезд изобразить не умеет: плотность через CDP меняется,
   * но ни resize, ни запрос по плотности при этом не срабатывают. Поэтому
   * плотность подменяется в самой странице, а событие посылается руками - по
   * одному на каждый путь, которым смена доходит до сцены в браузере.
   */
  async function moveToDensityOne(page: Page, signal: 'resize' | 'density'): Promise<void> {
    await page.evaluate((how) => {
      Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
      if (how === 'resize') window.dispatchEvent(new Event('resize'));
      else (window.sim.viewport as unknown as { onDensityChange: () => void }).onDensityChange();
    }, signal);
    await waitForFrames(page, 2);
  }

  for (const signal of ['resize', 'density'] as const) {
    test(`звёзды и астероиды следуют за плотностью буфера (${signal})`, async ({ page }) => {
      await openAtFullResolution(page);
      const before = await sizes(page);
      expect(before.ratio).toBe(2);
      expect(before.stars).toBe(2);
      expect(before.asteroids).toBe(2);

      await moveToDensityOne(page, signal);

      const after = await sizes(page);
      expect(after.ratio).toBe(1);
      expect(after.composer).toBe(1200);
      expect(after.bloom).toBe(600);
      expect(after.stars).toBe(1);
      expect(after.asteroids).toBe(1);
    });
  }

  test('срез разрешения качеством уменьшает и точки: на экране они того же размера', async ({
    page,
  }) => {
    await openAtFullResolution(page);
    await page.evaluate(() => window.sim.viewport.setResolutionScale(0.75));

    const now = await sizes(page);
    expect(now.ratio).toBeCloseTo(1.5);
    expect(now.stars).toBeCloseTo(1.5);
    expect(now.asteroids).toBeCloseTo(1.5);
  });
});
