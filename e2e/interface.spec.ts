import { expect, test } from '@playwright/test';

import { openScene, pauseAt, waitForArrival, waitForFrames } from './helpers';

/**
 * Интерфейс: справка, список тел, карточка, время, размеры, подписи.
 *
 * Всё это существует только в браузере, юнит-тестами не проверяется вовсе, и
 * ломается тише всего: невидимая кнопка или клавиша, которая перестала
 * доходить до обработчика, выглядят как «ничего не произошло».
 */
test.describe('интерфейс', () => {
  test('справка показана при загрузке, закрывается и открывается снова', async ({ page }) => {
    await openScene(page, { keepHelp: true });

    const help = page.locator('#help');
    // Первое, что видит пришедший: как летать, как перелетать, как менять время.
    await expect(help).not.toHaveClass(/closed/);
    await expect(page.getByRole('heading', { name: 'Управление' })).toBeVisible();

    // В справке перечислены все разделы управления.
    for (const section of ['ПОЛЁТ', 'ПЕРЕЛЁТ', 'ВРЕМЯ', 'ВИД']) {
      await expect(page.locator('#help h2', { hasText: section })).toBeVisible();
    }

    await page.keyboard.press('Escape');
    await expect(help).toHaveClass(/closed/);

    await page.keyboard.press('KeyH');
    await expect(help).not.toHaveClass(/closed/);
    await page.keyboard.press('KeyH');
    await expect(help).toHaveClass(/closed/);

    // Кнопка стоит над списком тел и подписана словом: без неё о клавише H
    // узнать неоткуда.
    const toggle = page.locator('.help-toggle');
    await expect(toggle).toHaveText('Справка ?');
    await toggle.click();
    await expect(help).not.toHaveClass(/closed/);
    await expect(toggle).toHaveText('Справка ✕');

    // Порядок в колонке: справка сверху, список тел под ней.
    const order = await page.locator('#bodies > button').allTextContents();
    expect(order).toEqual(['Справка ✕', 'Тела ☰']);
  });

  test('список тел сворачивается и разворачивается', async ({ page }) => {
    await openScene(page);

    const panel = page.locator('#bodies');
    await expect(panel).toHaveClass(/closed/);

    await page.keyboard.press('KeyB');
    await expect(panel).not.toHaveClass(/closed/);

    // Шестнадцать тел: Солнце, восемь планет, Плутон, Луна и пять спутников.
    await expect(page.locator('.bodies-row')).toHaveCount(16);
    await expect(page.locator('.bodies-row .distance').first()).not.toHaveText('—');

    await page.keyboard.press('KeyB');
    await expect(panel).toHaveClass(/closed/);
  });

  test('карточка тела показывает справочные величины', async ({ page }) => {
    await openScene(page);

    const card = page.locator('.body-card');
    await expect(card).toHaveClass(/hidden/);

    await page.evaluate(() => window.sim.travelTo('saturn'));
    await waitForArrival(page, 'saturn');

    await expect(card).not.toHaveClass(/hidden/);
    await expect(card.locator('.body-card-header b')).toHaveText('Сатурн');

    const rows = await card.locator('.body-card-row').allTextContents();
    // Разряды разделены неразрывным пробелом — для сравнения приводим к обычному.
    const text = rows.join(' | ').replace(/ /g, ' ');

    // Радиус и масса — справочные, сутки короче земных, год — двадцать девять с
    // половиной лет. Это и есть Сатурн, а не «какая-то планета».
    expect(text).toContain('60 268 км');
    expect(text).toMatch(/5\.68·10²⁶ кг/);
    expect(text).toMatch(/10 ч \d+ мин/);
    expect(text).toContain('29.5 года');
  });

  test('масштаб времени переключается клавишами и виден в HUD', async ({ page }) => {
    await openScene(page);

    const hud = page.locator('#hud');
    // Стартовая ступень — сутки в секунду: система сразу движется.
    await expect(hud).toContainText('1 сут/с');

    await page.keyboard.press('Comma');
    await expect(hud).toContainText('6 ч/с');

    await page.keyboard.press('Comma');
    await expect(hud).toContainText('1 ч/с');

    await page.keyboard.press('Period');
    await page.keyboard.press('Period');
    await page.keyboard.press('Period');
    await expect(hud).toContainText('7 сут/с');

    await page.keyboard.press('KeyP');
    await expect(hud).toContainText('пауза');
  });

  test('подписи тел выключаются клавишей', async ({ page }) => {
    await openScene(page);
    await pauseAt(page, '2026-08-14T12:00:00Z');

    const label = page.locator('.label', { hasText: 'Солнце' });
    await expect(label).toBeVisible();

    await page.keyboard.press('KeyL');
    await expect(label).toBeHidden();

    await page.keyboard.press('KeyL');
    await expect(label).toBeVisible();
  });

  test('множитель размеров растит тела и Солнце, сохраняя вид', async ({ page }) => {
    await openScene(page);
    await page.evaluate(() => window.sim.travelTo('earth'));
    await waitForArrival(page, 'earth');

    const before = await page.evaluate(() => ({
      size: window.sim.system.getSizeExaggeration(),
      earth: window.sim.system.find('earth').visualRadius,
      sun: window.sim.sun.visualRadius,
      radii:
        window.sim.flight.worldPosition.distanceTo(window.sim.system.find('earth').worldPosition) /
        window.sim.system.find('earth').visualRadius,
    }));

    await page.keyboard.press('KeyM');
    await waitForFrames(page, 3);

    const after = await page.evaluate(() => ({
      size: window.sim.system.getSizeExaggeration(),
      earth: window.sim.system.find('earth').visualRadius,
      sun: window.sim.sun.visualRadius,
      radii:
        window.sim.flight.worldPosition.distanceTo(window.sim.system.find('earth').worldPosition) /
        window.sim.system.find('earth').visualRadius,
    }));

    expect(before.size).toBe(1);
    expect(after.size).toBe(10);
    expect(after.earth / before.earth).toBeCloseTo(10, 5);
    // Солнце растёт вместе с планетами, иначе Юпитер станет крупнее звезды.
    expect(after.sun / before.sun).toBeCloseTo(10, 5);
    // Камера отодвинута во столько же раз: вид в кадре не изменился.
    expect(after.radii).toBeCloseTo(before.radii, 1);

    await expect(page.locator('#hud')).toContainText('×10');
  });

  test('HUD показывает систему отсчёта и ближайшее тело', async ({ page }) => {
    await openScene(page);

    const hud = page.locator('#hud');
    await expect(hud).toContainText('отсчёт');
    await expect(hud).toContainText('Солнце');

    await page.evaluate(() => window.sim.travelTo('mars'));
    await waitForArrival(page, 'mars');

    await expect(hud).toContainText('Марс');
  });
});
