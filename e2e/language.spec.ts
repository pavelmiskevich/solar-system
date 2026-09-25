import { expect, test, type Page } from '@playwright/test';

import { expectNoErrors, openScene, waitForArrival } from './helpers';

/**
 * Язык интерфейса: переключатель, ссылка и выбор по браузеру.
 *
 * Браузер в остальных проверках русский (см. playwright.config.ts), и
 * английский интерфейс здесь всякий раз задаётся явно: ссылкой, кнопкой или
 * своим языком браузера.
 */

const CYRILLIC = /[А-Яа-яЁё]/;

/**
 * Что из видимого текста осталось по-русски.
 *
 * Смотрит во все части интерфейса сразу: пропущенная при переводе строка -
 * это чаще всего подпись, которую написали один раз при создании панели и
 * забыли переписать на смене языка, и заметна она только так.
 */
async function russianLeftovers(page: Page): Promise<string[]> {
  return page.evaluate((pattern) => {
    const cyrillic = new RegExp(pattern);
    const nodes = document.querySelectorAll(
      '#hud, #hint, #bodies, #help, #support, #overlay .label',
    );
    const found: string[] = [];
    for (const node of nodes) {
      const texts = [node.textContent ?? ''];
      for (const titled of node.querySelectorAll('[title], [aria-label], [alt]')) {
        texts.push(
          titled.getAttribute('title') ?? '',
          titled.getAttribute('aria-label') ?? '',
          titled.getAttribute('alt') ?? '',
        );
      }
      for (const text of texts) {
        for (const line of text.split('\n')) if (cyrillic.test(line)) found.push(line.trim());
      }
    }
    return found;
  }, CYRILLIC.source);
}

test.describe('язык интерфейса', () => {
  test('переключение меняет справку, список тел и HUD без перезагрузки', async ({ page }) => {
    const errors = await openScene(page, { keepHelp: true });

    // Браузер русский - и интерфейс русский.
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    await expect(page.getByRole('heading', { name: 'Управление' })).toBeVisible();
    await expect(page.locator('#hud')).toContainText('до Солнца');
    await expect(page.locator('.bodies-row .name').nth(1)).toHaveText('Меркурий');
    const switcher = page.locator('.language-switch');
    await expect(switcher.locator('[data-language="ru"]')).toHaveAttribute('aria-pressed', 'true');

    // Метка на окне: перезагрузка страницы её бы стёрла.
    await page.evaluate(() => ((window as unknown as { marker: number }).marker = 42));

    // Переключатель стоит над затемнением справки, и открытая справка ему не
    // мешает - как и остальным кнопкам колонки.
    await switcher.locator('[data-language="en"]').click();

    await expect(page.getByRole('heading', { name: 'Controls' })).toBeVisible();
    for (const section of ['FLIGHT', 'TRAVEL', 'INSPECT', 'TIME', 'VIEW']) {
      await expect(page.locator('#help h2', { hasText: section })).toBeVisible();
    }
    // Ввод даты и ползунок пережили пересборку справки и стоят в «Time».
    await expect(page.locator('#help section', { hasText: 'Time' }).locator('.date-input')).toHaveCount(1);
    await expect(page.locator('#help .time-slider-wrapper input')).toHaveCount(1);

    await expect(page.locator('#hud')).toContainText('to Sun');
    await expect(page.locator('#hud')).toContainText('nearest');
    await expect(page.locator('#hud')).toContainText('1 day/s');
    await expect(page.locator('.help-toggle')).toHaveText('Help ✕');

    await page.keyboard.press('Escape');
    await page.keyboard.press('KeyB');
    const rows = page.locator('.bodies-row');
    await expect(rows.nth(1).locator('.name')).toHaveText('Mercury');
    await expect(rows.filter({ hasText: 'Phobos' }).locator('.kind')).toHaveText('moon of Mars');
    await expect(rows.last().locator('.name')).toHaveText("Halley's Comet");

    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page).toHaveTitle('Solar System');
    await expect(switcher.locator('[data-language="en"]')).toHaveAttribute('aria-pressed', 'true');

    // Без перезагрузки: метка на месте.
    expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(42);

    // Язык попал в адрес: ссылка покажет получателю то же, что видно здесь.
    await page.waitForFunction(() => window.location.search.includes('lang=en'), null, {
      timeout: 10_000,
    });

    expect(await russianLeftovers(page)).toEqual([]);
    expectNoErrors(errors);
  });

  test('карточка тела и события после переключения - по-английски', async ({ page }) => {
    await openScene(page);
    await page.locator('.language-switch [data-language="en"]').click();

    await page.evaluate(() => window.sim.travelTo('saturn'));
    await waitForArrival(page, 'saturn');

    const card = page.locator('.body-card');
    await expect(card.locator('.body-card-header b')).toHaveText('Saturn');
    await expect(card.locator('.body-card-header i')).toHaveText('planet');
    const text = (await card.textContent()) ?? '';
    expect(text).toContain('60,268 km');
    expect(text).toContain('hydrogen 96%');
    expect(text).toMatch(/29\.5 years/);
    expect(text).not.toMatch(CYRILLIC);

    // Карточка, открытая на одном языке, переписывается на другой сразу, а
    // не со следующим телом.
    await page.locator('.language-switch [data-language="ru"]').click();
    await expect(card.locator('.body-card-header b')).toHaveText('Сатурн');
    await expect(card).toContainText('водород 96 %');
    await page.locator('.language-switch [data-language="en"]').click();
    await expect(card.locator('.body-card-header b')).toHaveText('Saturn');

    // События считаются по эфемеридам - строки у них собираются из слов
    // словаря, и русских среди них быть не должно.
    await page.keyboard.press('KeyE');
    const events = page.locator('.views:not(.closed) .views-row');
    await expect(events.first()).toBeVisible();
    for (const row of await events.allTextContents()) expect(row).not.toMatch(CYRILLIC);

    expect(await russianLeftovers(page)).toEqual([]);
  });

  test('ссылка с языком открывает сцену на нём, даже в русском браузере', async ({ page }) => {
    const errors = await openScene(page, { url: '/?lang=en', keepHelp: true });

    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: 'Controls' })).toBeVisible();
    await expect(page.locator('#hud')).toContainText('to Sun');
    expect(await russianLeftovers(page)).toEqual([]);
    expectNoErrors(errors);
  });

  test('испорченный язык в ссылке не ломает остальную ссылку', async ({ page }) => {
    const errors = await openScene(page, { url: '/?lang=klingon&b=jupiter&r=5' });

    // Язык выбран как обычно - по браузеру, - а вид из ссылки на месте.
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    await expect(page.locator('#hud')).toContainText('до Солнца');
    expect(await page.evaluate(() => window.sim.frame.targetId)).toBe('jupiter');
    expectNoErrors(errors);
  });
});

test.describe('язык интерфейса в английском браузере', () => {
  test.use({ locale: 'en-US' });

  test('первый вход - по-английски, а выбор запоминается', async ({ page }) => {
    const errors = await openScene(page, { keepHelp: true });

    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: 'Controls' })).toBeVisible();
    await expect(page.locator('#hint')).toContainText('H for help');
    expect(await russianLeftovers(page)).toEqual([]);

    // Выбор кнопкой старше браузера: открыв сайт снова без языка в ссылке,
    // человек видит тот язык, который выбрал, а не тот, что у браузера.
    await page.locator('.language-switch [data-language="ru"]').click();
    await expect(page.getByRole('heading', { name: 'Управление' })).toBeVisible();

    await openScene(page, { url: '/', keepHelp: true });
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    await expect(page.getByRole('heading', { name: 'Управление' })).toBeVisible();

    // А ссылка старше сохранённого выбора.
    await openScene(page, { url: '/?lang=en', keepHelp: true });
    await expect(page.getByRole('heading', { name: 'Controls' })).toBeVisible();
    expectNoErrors(errors);
  });
});
