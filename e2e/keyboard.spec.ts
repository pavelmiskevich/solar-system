import { expect, test } from '@playwright/test';

import { expectNoErrors, openScene, waitForArrival } from './helpers';

/**
 * Чья клавиша: сцены, поля в фокусе или браузера.
 *
 * Юнит-тест проверяет само правило (src/core/keyRouting.ts). Здесь - что оба
 * обработчика им пользуются: сцена и полёт слушают окно каждый сам, и
 * разойдись они, клавиша досталась бы одному из них.
 */

const paused = (page: import('@playwright/test').Page) =>
  page.evaluate(() => window.sim.clock.paused as boolean);

test.describe('клавиши при фокусе в поле', () => {
  test('после щелчка по ползунку Esc закрывает справку, а P ставит паузу', async ({ page }) => {
    const errors = await openScene(page, { keepHelp: true });
    const help = page.locator('#help');
    await expect(help).not.toHaveClass(/closed/);

    const slider = page.locator('#time-slider-container input[type="range"]');
    await slider.click();
    await expect(slider).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(help).toHaveClass(/closed/);
    // Esc заодно выводит из поля: иначе следующая клавиша опять ушла бы ему.
    await expect(slider).not.toBeFocused();

    expect(await paused(page)).toBe(false);
    await page.keyboard.press('KeyP');
    expect(await paused(page)).toBe(true);
    expectNoErrors(errors);
  });

  test('H закрывает справку прямо из ползунка, стрелки по-прежнему двигают его', async ({
    page,
  }) => {
    await openScene(page, { keepHelp: true });
    const help = page.locator('#help');
    const slider = page.locator('#time-slider-container input[type="range"]');
    await slider.click();

    const before = await slider.inputValue();
    await page.keyboard.press('ArrowLeft');
    await expect(slider).not.toHaveValue(before);
    // Стрелка досталась ползунку, а не экскурсии и не сцене: справка открыта.
    await expect(help).not.toHaveClass(/closed/);

    await page.keyboard.press('KeyH');
    await expect(help).toHaveClass(/closed/);
  });

  test('после щелчка по полю даты Esc закрывает справку, а P ставит паузу', async ({ page }) => {
    await openScene(page, { keepHelp: true });
    const help = page.locator('#help');
    const date = page.locator('#date-panel-container input');
    await date.click();
    await expect(date).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(help).toHaveClass(/closed/);
    await page.keyboard.press('KeyP');
    expect(await paused(page)).toBe(true);
  });

  test('набор в поле даты не уводит камеру', async ({ page }) => {
    await openScene(page, { keepHelp: true });
    const date = page.locator('#date-panel-container input');
    await date.click();

    // W, A, S, D, C и пробел - рули полёта. В поле даты они буквы набора, и
    // полёт их не получает: держи он их, камера поехала бы.
    for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyC', 'Digit1']) {
      await page.keyboard.down(key);
      const held = await page.evaluate(() => [...(window.sim.flight.keys as Set<string>)]);
      expect(held, key).toEqual([]);
      await page.keyboard.up(key);
    }
    await expect(page.locator('#help')).not.toHaveClass(/closed/);
  });
});

test.describe('сочетания с модификаторами', () => {
  test('Ctrl и Cmd с буквой не трогают паузу, подписи и список тел', async ({ page }) => {
    const errors = await openScene(page);
    const state = () =>
      page.evaluate(() => ({
        paused: window.sim.clock.paused as boolean,
        labels: window.sim.labels.isEnabled() as boolean,
        bodies: window.sim.bodyList.isOpen as boolean,
      }));
    const before = await state();

    for (const combo of ['Control+KeyP', 'Control+KeyL', 'Control+KeyB', 'Meta+KeyP', 'Alt+KeyL']) {
      await page.keyboard.press(combo);
    }
    expect(await state()).toEqual(before);

    // Без модификатора те же клавиши работают как прежде.
    await page.keyboard.press('KeyP');
    expect((await state()).paused).toBe(!before.paused);
    expectNoErrors(errors);
  });

  test('Ctrl+C и Cmd+C не выводят из осмотра тела', async ({ page }) => {
    await openScene(page);
    await page.evaluate(() => window.sim.travelTo('jupiter'));
    await waitForArrival(page, 'jupiter');
    await expect.poll(() => page.evaluate(() => window.sim.orbit.isActive as boolean)).toBe(true);

    // Левый Ctrl сам был клавишей «вниз», и одно его нажатие обрывало осмотр
    // ещё до буквы.
    for (const combo of ['Control+KeyC', 'Meta+KeyC', 'Control+KeyF']) {
      await page.keyboard.press(combo);
      expect(await page.evaluate(() => window.sim.orbit.isActive as boolean), combo).toBe(true);
    }

    // Просто C - руль «вниз»: он, как и прежде, осмотр обрывает.
    await page.keyboard.press('KeyC');
    expect(await page.evaluate(() => window.sim.orbit.isActive as boolean)).toBe(false);
  });

  test('удержание P меняет паузу один раз', async ({ page }) => {
    await openScene(page);
    const before = await paused(page);

    // Повторный down без up Playwright шлёт с repeat: true - ровно как
    // автоповтор удержанной клавиши. Нажатий чётное число: прежний дребезг
    // вернул бы паузу как была, и проверка бы это заметила.
    for (let i = 0; i < 4; i++) await page.keyboard.down('KeyP');
    await page.keyboard.up('KeyP');

    expect(await paused(page)).toBe(!before);
  });
});
