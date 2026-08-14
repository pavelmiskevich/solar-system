import { expect, test } from '@playwright/test';

import {
  distanceInRadii,
  expectNoErrors,
  openScene,
  pauseAt,
  screenPositionOf,
  waitForArrival,
  waitForFrames,
} from './helpers';

/**
 * Перелёты и система отсчёта.
 *
 * Это главный сценарий работы со сценой: выбрал тело — оказался рядом с ним и
 * можешь его рассматривать. Юнит-тесты проверяют математику перелёта, здесь
 * проверяется, что она подключена к кнопкам, к клику по небу и к камере.
 */
test.describe('перелёты', () => {
  test('перелёт из списка тел доводит камеру до трёх радиусов', async ({ page }) => {
    const errors = await openScene(page);

    await page.getByRole('button', { name: /Тела/ }).click();
    await expect(page.locator('.bodies-row')).toHaveCount(16);

    // Точное совпадение имени: «Юпитер» встречается ещё и в подписи спутников.
    await page.locator('.bodies-row .name').filter({ hasText: /^Юпитер$/ }).click();
    expect(await page.evaluate(() => window.sim.travel.isActive)).toBe(true);

    await waitForArrival(page, 'jupiter');
    expect(await distanceInRadii(page, 'jupiter')).toBeCloseTo(3.4, 1);

    expectNoErrors(errors);
  });

  test('клик по телу в кадре начинает перелёт к нему', async ({ page }) => {
    await openScene(page);
    await pauseAt(page, '2026-08-14T12:00:00Z');

    // Юпитер на стартовом кадре виден точкой — по ней и целимся.
    const point = await screenPositionOf(page, 'jupiter');
    expect(point, 'Юпитер должен быть в кадре при старте').not.toBeNull();

    await page.mouse.click(point!.x, point!.y);
    await waitForFrames(page, 2);

    expect(await page.evaluate(() => window.sim.travel.targetId)).toBe('jupiter');
  });

  test('клик по подписи тела работает так же, как клик по телу', async ({ page }) => {
    await openScene(page);
    await pauseAt(page, '2026-08-14T12:00:00Z');

    const label = page.locator('.label', { hasText: 'Меркурий' });
    await expect(label).toBeVisible();
    await label.click();

    expect(await page.evaluate(() => window.sim.travel.targetId)).toBe('mercury');
  });

  test('клавиша движения прерывает перелёт', async ({ page }) => {
    await openScene(page);

    await page.evaluate(() => window.sim.travelTo('neptune'));
    expect(await page.evaluate(() => window.sim.travel.isActive)).toBe(true);

    await page.keyboard.press('KeyW');
    await waitForFrames(page, 2);

    expect(await page.evaluate(() => window.sim.travel.isActive)).toBe(false);
    // Прервали — значит, до Нептуна не долетели.
    expect(await distanceInRadii(page, 'neptune')).toBeGreaterThan(100);
  });

  test('после прибытия камера идёт вместе с телом по орбите', async ({ page }) => {
    await openScene(page);
    await page.evaluate(() => window.sim.travelTo('earth'));
    await waitForArrival(page, 'earth');

    const before = await distanceInRadii(page, 'earth');

    // Разгоняем время: без привязки к системе отсчёта Земля на скорости
    // тридцать километров в секунду уходит из кадра за считанные секунды.
    await page.evaluate(async () => {
      window.sim.clock.timeScale = 1;
      window.sim.clock.paused = false;
      await new Promise((resolve) => setTimeout(resolve, 3000));
      window.sim.clock.paused = true;
    });
    await waitForFrames(page, 2);

    const after = await distanceInRadii(page, 'earth');

    expect(after).toBeCloseTo(before, 1);
    expect(await page.evaluate(() => window.sim.frame.targetId)).toBe('earth');
  });

  test('перелёт к спутнику Юпитера доводит до самого спутника, а не до планеты', async ({
    page,
  }) => {
    await openScene(page);

    await page.evaluate(() => window.sim.travelTo('europa'));
    await waitForArrival(page, 'europa');

    expect(await distanceInRadii(page, 'europa')).toBeCloseTo(3.4, 1);
    // До Юпитера при этом сотни его радиусов: спутник далеко от планеты.
    expect(await distanceInRadii(page, 'jupiter')).toBeGreaterThan(5);
  });

  test('перелёт к Солнцу не проваливается внутрь звезды', async ({ page }) => {
    await openScene(page);

    await page.evaluate(() => window.sim.travelTo('sun'));
    await waitForArrival(page, 'sun');

    const radii = await distanceInRadii(page, 'sun');
    expect(radii).toBeGreaterThan(2);
    expect(radii).toBeLessThan(6);
  });
});
