import { expect, test, type Page } from '@playwright/test';

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

/**
 * Предел для самой долгой задачи главного потока, мс. Поиск в главном потоке
 * занимал от полусекунды до секунд; строки списка и обычный кадр - десятки
 * миллисекунд.
 */
const LONG_TASK_LIMIT_MS = 250;

/** Начать запись долгих задач главного потока. */
async function startLongTaskLog(page: Page): Promise<void> {
  await page.evaluate(() => {
    const log: number[] = [];
    (window as unknown as { longTasks: number[] }).longTasks = log;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) log.push(entry.duration);
    }).observe({ type: 'longtask' });
  });
}

/** Самая долгая задача с начала записи, мс. */
async function longestTask(page: Page): Promise<number> {
  return page.evaluate(() =>
    Math.round(Math.max(0, ...(window as unknown as { longTasks: number[] }).longTasks)),
  );
}

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

  test('поиск событий не останавливает сцену', async ({ page }) => {
    // Пять лет поиска идут сотни миллисекунд и на настольной машине, и
    // раньше всё это время стоял кадр: первое открытие списка выглядело как
    // зависание. Теперь поиск в фоновом потоке, и главный поток занят только
    // строками. Мерится самая долгая задача главного потока: кадр
    // программного рендерера длинный сам по себе, но рисует его не главный
    // поток.
    await openScene(page);
    await startLongTaskLog(page);

    await page.keyboard.press('KeyE');
    await expect(page.locator(panel).first()).toBeVisible({ timeout: 20_000 });

    const longest = await longestTask(page);
    expect(longest, `самая долгая задача главного потока ${longest} мс`).toBeLessThan(
      LONG_TASK_LIMIT_MS,
    );
  });

  test('открытый список на высокой скорости времени пересчитывается не чаще раза в три секунды', async ({
    page,
  }) => {
    // На 20 годах в секунду пятилетнее окно поиска проходится за четверть
    // секунды, и открытый список устаревает непрерывно. Раньше он
    // пересчитывался на каждом выходе за окно, прямо в кадре, - и сцена
    // стояла почти всё время.
    //
    // Долгие задачи здесь не мерятся: на этой скорости сцена на программном
    // рендерере даёт задачи по 300 мс и с закрытым списком. Мерится сам
    // список - сколько раз он собран заново.
    await openScene(page);
    await page.keyboard.press('KeyE');
    await expect(page.locator(panel).first()).toBeVisible({ timeout: 20_000 });

    await page.evaluate(() => {
      const list = document.querySelector(`[data-panel="events"] .panel-list`)!;
      const log = { rebuilds: 0 };
      (window as unknown as { eventRebuilds: typeof log }).eventRebuilds = log;
      new MutationObserver(() => (log.rebuilds += 1)).observe(list, { childList: true });
      window.sim.clock.timeScale = 20 * 365.25; // сутки модели за секунду
    });
    await page.waitForTimeout(9_000);
    const rebuilds = await page.evaluate(() => {
      window.sim.clock.timeScale = 1;
      return (window as unknown as { eventRebuilds: { rebuilds: number } }).eventRebuilds.rebuilds;
    });

    // За девять секунд - три пересчёта, и ещё один на то, что первый мог
    // начаться сразу.
    expect(rebuilds).toBeGreaterThan(0);
    expect(rebuilds).toBeLessThanOrEqual(4);
    // И список при этом живой: в нём строки, а не вечное «ищу».
    await expect(page.locator(panel).first()).toBeVisible({ timeout: 20_000 });
  });

  test('в списке есть затмения, противостояния и сближения, и все впереди', async ({ page }) => {
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
    // не раньше нынешнего часа. Ради этого он и называется «ближайшие».
    // Исключение одно: событие, максимум которого прошёл не больше трёх часов
    // назад, ещё идёт и стоит в списке первым. Ещё час - на то, что ключ
    // обрезан до часа.
    const dates = kinds.map((k) => /\d{4}-\d{2}-\d{2}T\d{2}$/.exec(k)?.[0] ?? '');

    expect(dates.every(Boolean)).toBe(true);
    expect(dates).toEqual([...dates].sort());
    const first = Date.parse(`${dates[0]}:00:00Z`);
    expect(first).toBeGreaterThanOrEqual(Date.now() - 4 * 3_600_000);
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
