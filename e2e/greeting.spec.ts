import { expect, test } from '@playwright/test';

import { expectNoErrors, openScene, waitForFrames } from './helpers';

/**
 * Поздравление надписью на небе.
 *
 * Раскладка и выбор места проверены юнит-тестами. Здесь - то, что между
 * данными и экраном: ссылка поднимает поздравление, надпись действительно
 * нарисована, плашка закрывается, а адрес следует за ней.
 */

/** Сколько в кадре тёплых пикселей - золото надписи, а не беж Млечного Пути. */
async function warmPixels(page: import('@playwright/test').Page): Promise<number> {
  const shot = (await page.screenshot()).toString('base64');
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, image.width, image.height);
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i]! > 90 && data[i]! - data[i + 2]! > 50) count += 1;
    }
    return count;
  }, shot);
}

/**
 * Самый дальний от центра кадра край надписи, в долях полукадра.
 *
 * Каждая вершина линий и своих звёзд проецируется камерой: 1 - ровно край
 * кадра, больше - за ним. Вершина позади камеры - тоже за кадром, и тогда
 * ответ бесконечность: проекция такой точки легла бы на экран зеркально.
 */
async function inscriptionReach(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    const camera = window.sim.viewport.camera;
    const group = window.sim.inscription.group;
    camera.updateMatrixWorld(true);
    group.updateMatrixWorld(true);
    // Vector3 из самой сцены: three.js на странице не лежит в window.
    const point = camera.position.clone();
    let reach = 0;
    let count = 0;
    for (const child of group.children) {
      const position = child.geometry.getAttribute('position');
      for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i).applyMatrix4(child.matrixWorld);
        count += 1;
        if (point.clone().applyMatrix4(camera.matrixWorldInverse).z >= 0) return Infinity;
        point.project(camera);
        reach = Math.max(reach, Math.abs(point.x), Math.abs(point.y));
      }
    }
    return count > 0 ? reach : Infinity;
  });
}

test.describe('поздравление', () => {
  test('ссылка показывает плашку и надпись на небе', async ({ page }) => {
    const errors = await openScene(page, { url: '/?greeting=primer', keepHelp: true });
    await waitForFrames(page, 90);

    await expect(page.locator('#greeting-card')).toContainText('Так выглядит поздравление на небе');
    // Плашка появляется сама, и экранный диктор её зачитывает.
    await expect(page.locator('#greeting-card')).toHaveAttribute('role', 'status');
    expect(await page.evaluate(() => window.sim.inscription.isShown)).toBe(true);
    // Орбиты Венеры и Марса тоже тёплые: без них пиксели считают только надпись.
    await page.evaluate(() => {
      window.sim.orbits.group.visible = false;
      window.sim.satelliteOrbits.group.visible = false;
    });
    // Ждём не число кадров, а саму надпись: на медленном runner проявление
    // растягивается, и снимок на фиксированном кадре застал бы его на полпути.
    await expect.poll(() => warmPixels(page), { timeout: 20_000 }).toBeGreaterThan(150);
    await expect.poll(() => page.url()).toContain('greeting=primer');
    // Сцена открывается на сегодняшней дате и в реальном времени: при сутках
    // в секунду Земля за несколько секунд уплывала бы от камеры.
    expect(await page.evaluate(() => window.sim.clock.timeScale)).toBeCloseTo(1 / 86_400, 12);

    expectNoErrors(errors);
  });

  test('скорость времени из ссылки старше реального времени поздравления', async ({ page }) => {
    const errors = await openScene(page, { url: '/?greeting=primer&t=7', keepHelp: true });
    expect(await page.evaluate(() => window.sim.inscription.isShown)).toBe(true);
    expect(await page.evaluate(() => window.sim.clock.timeScale)).toBe(7);
    expectNoErrors(errors);
  });

  test('неизвестное поздравление открывает обычную сцену', async ({ page }) => {
    const errors = await openScene(page, { url: '/?greeting=no-such' });
    await waitForFrames(page, 10);

    await expect(page.locator('#greeting-card')).toHaveCount(0);
    expect(await page.evaluate(() => window.sim.inscription.isShown)).toBe(false);

    expectNoErrors(errors);
  });

  test('плашка закрывается кнопкой, надпись остаётся, параметр уходит', async ({ page }) => {
    const errors = await openScene(page, { url: '/?greeting=primer', keepHelp: true });
    await page.locator('#greeting-card .greeting-close').click();

    await expect(page.locator('#greeting-card')).toHaveCount(0);
    expect(await page.evaluate(() => window.sim.inscription.isShown)).toBe(true);
    await expect.poll(() => page.url()).not.toContain('greeting=');
    // Плашка стояла на месте подсказки только на время поздравления. Спрятанная
    // подсказка лишь прозрачна, а прозрачное Playwright считает видимым,
    // поэтому проверяется класс.
    await expect(page.locator('#hint')).not.toHaveClass(/hidden/);

    expectNoErrors(errors);
  });

  test('событие из списка убирает и надпись, и плашку', async ({ page }) => {
    const errors = await openScene(page, { url: '/?greeting=primer', keepHelp: true });
    await page.keyboard.press('KeyE');
    const row = page.locator('[data-event]').first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.click();

    await expect(page.locator('#greeting-card')).toHaveCount(0);
    expect(await page.evaluate(() => window.sim.inscription.isShown)).toBe(false);
    expectNoErrors(errors);
  });

  test('Escape закрывает плашку', async ({ page }) => {
    const errors = await openScene(page, { url: '/?greeting=primer', keepHelp: true });
    await page.keyboard.press('Escape');
    await expect(page.locator('#greeting-card')).toHaveCount(0);
    expectNoErrors(errors);
  });

  test('экскурсия с клавиатуры убирает и надпись, и плашку', async ({ page }) => {
    const errors = await openScene(page, { url: '/?greeting=primer', keepHelp: true });
    await page.keyboard.press('KeyT');
    await waitForFrames(page, 5);

    await expect(page.locator('#greeting-card')).toHaveCount(0);
    expect(await page.evaluate(() => window.sim.inscription.isShown)).toBe(false);
    expectNoErrors(errors);
  });

  test('перезагрузка после облёта сохраняет и камеру, и надпись', async ({ page }) => {
    const errors = await openScene(page, { url: '/?greeting=primer', keepHelp: true });
    await page.evaluate(() => window.sim.lookAt([2e8, 1e8, 1e8], [0, 0, 0]));
    await expect.poll(() => page.url()).toContain('x=200000000');

    const url = page.url();
    await openScene(page, { url: url.slice(url.indexOf('/?')), keepHelp: true });
    expect(await page.evaluate(() => window.sim.inscription.isShown)).toBe(true);
    const position = await page.evaluate(() => window.sim.flight.worldPosition.toArray());
    expect(position[0]).toBeCloseTo(2e8, -3);

    expectNoErrors(errors);
  });

  test('смена языка переписывает кнопку, но не слова поздравления', async ({ page }) => {
    const errors = await openScene(page, { url: '/?greeting=primer&lang=en', keepHelp: true });
    await expect(page.locator('#greeting-card .greeting-close')).toHaveAttribute('title', 'Close (Esc)');
    await expect(page.locator('#greeting-card')).toContainText('Так выглядит поздравление на небе');
    expectNoErrors(errors);
  });

  test('на телефоне надпись целиком в кадре', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await openScene(page, { url: '/?greeting=primer', keepHelp: true });
    // Камера встаёт на вид поздравления не мгновенно: ждём, пока надпись
    // окажется в кадре, а не проверяем первый попавшийся кадр.
    await expect.poll(() => inscriptionReach(page)).toBeLessThanOrEqual(1);
    expectNoErrors(errors);
  });

  test('на телефоне плашка помещается в экран', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await openScene(page, { url: '/?greeting=primer', keepHelp: true });
    const box = await page.locator('#greeting-card').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(16 - 1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390 - 16 + 1);
    // И не ужимается до половины: сдвинутая на середину, она занимала только
    // место справа от неё и складывала строку втрое.
    expect(box!.width).toBeGreaterThan(390 * 0.6);
    expectNoErrors(errors);
  });

  test.describe('на сенсорном экране', () => {
    test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

    test('крестик плашки - цель для пальца', async ({ page }) => {
      const errors = await openScene(page, { url: '/?greeting=primer', keepHelp: true });
      const box = await page.locator('#greeting-card .greeting-close').boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44 - 1);
      expect(box!.height).toBeGreaterThanOrEqual(44 - 1);
      await page.locator('#greeting-card .greeting-close').tap();
      await expect(page.locator('#greeting-card')).toHaveCount(0);
      expectNoErrors(errors);
    });
  });
});
