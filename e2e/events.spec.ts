import { expect, test } from '@playwright/test';

import { expectNoErrors, frameLight, openScene, waitForArrival } from './helpers';

/**
 * Ближайшие события.
 *
 * Юнит-тесты уже сверили даты со справочниками; здесь проверяется другое -
 * доходит ли найденное до экрана и приводит ли кнопка «перейти» туда, где
 * событие действительно видно. Последнее нельзя проверить числами: тень живёт
 * в шейдере, и остаётся смотреть на пиксели.
 */

const panel = '[data-event]';
/** Сама панель: свёрнутая, она оставляет строки в разметке, и судить надо по ней. */
const aside = '[data-panel="events"]';

test.describe('ближайшие события', () => {
  test('список открывается клавишей E и кнопкой', async ({ page }) => {
    const errors = await openScene(page);

    const rows = page.locator(panel);
    await expect(rows).toHaveCount(0);
    await expect(page.locator(aside)).toHaveClass(/closed/);

    await page.keyboard.press('KeyE');
    // Список считается при первом открытии: пять лет поиска занимают доли
    // секунды, и до появления строк проходит заметное время.
    await expect(rows.first()).toBeVisible({ timeout: 20_000 });

    const count = await rows.count();
    // За пять лет событий этих родов набирается несколько десятков. Точное
    // число зависит от сегодняшней даты, и сверять его бессмысленно, а вот
    // порядок величины говорит, что поиск отработал, а не выдал пустоту.
    expect(count).toBeGreaterThan(20);
    expect(count).toBeLessThan(200);

    await page.keyboard.press('KeyE');
    await expect(page.locator(aside)).toHaveClass(/closed/);

    expectNoErrors(errors);
  });

  test('в списке есть затмения, противостояния и сближения, и все в будущем', async ({ page }) => {
    await openScene(page);
    await page.keyboard.press('KeyE');
    await expect(page.locator(panel).first()).toBeVisible({ timeout: 20_000 });

    const kinds = await page.locator(panel).evaluateAll((nodes) =>
      nodes.map((n) => (n as HTMLElement).dataset.event ?? ''),
    );

    expect(kinds.some((k) => k.startsWith('solar-eclipse'))).toBe(true);
    expect(kinds.some((k) => k.startsWith('lunar-eclipse'))).toBe(true);
    expect(kinds.some((k) => k.startsWith('opposition'))).toBe(true);
    expect(kinds.some((k) => k.startsWith('conjunction'))).toBe(true);

    // Ключ строки кончается датой: список отсортирован по времени и начинается
    // не раньше сегодняшнего дня. Ради этого он и называется «ближайшие».
    const dates = kinds.map((k) => /\d{4}-\d{2}-\d{2}T\d{2}$/.exec(k)?.[0] ?? '');

    expect(dates.every(Boolean)).toBe(true);
    expect(dates).toEqual([...dates].sort());
    expect(Number(dates[0]!.slice(0, 4))).toBeGreaterThanOrEqual(new Date().getUTCFullYear());
  });

  test('переход к полному затмению приводит туда, где видна тень', async ({ page }) => {
    const errors = await openScene(page);
    await page.keyboard.press('KeyE');
    await expect(page.locator(panel).first()).toBeVisible({ timeout: 20_000 });

    // Полное солнечное затмение: у него тень доходит до поверхности целиком, и
    // на кадре обязано быть чёрное пятно. У кольцеобразного его не бывает
    // вовсе, поэтому строка выбирается по названию, а не первая попавшаяся.
    const total = page
      .locator('[data-event^="solar-eclipse"]')
      .filter({ has: page.locator('.name', { hasText: 'Полное' }) })
      .first();

    await expect(total).toBeVisible();
    const caption = (await total.locator('.views-hint').textContent()) ?? '';
    await total.click();

    // Панель закрывается сама: событие выбрано, смотреть надо на небо.
    await expect(page.locator(aside)).toHaveClass(/closed/);
    await waitForArrival(page, 'earth');

    // Дата сцены встала на момент события - тот самый, что стоял в строке.
    const shown = await page.locator('#hud').innerText();
    const listed = caption.slice(0, caption.indexOf(' г.,'));
    expect(shown).toContain(listed);

    // Экспозиция подтягивается полторы секунды, и без этой паузы яркость
    // мерилась бы на полпути к своему значению.
    await page.waitForTimeout(2500);
    const light = await frameLight(page);

    // Земля в кадре освещена, а в середине - тень: камера подведена со стороны
    // Луны, и ось её тени указывает ровно туда, куда смотрит объектив.
    expect(light.median).toBeGreaterThan(20);
    expect(light.min).toBeLessThan(3);

    expectNoErrors(errors);
  });
});
