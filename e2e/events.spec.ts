import { expect, test, type Page } from '@playwright/test';

import {
  EVENT_ROWS_TIMEOUT_MS,
  expectNoErrors,
  frameLight,
  openScene,
  waitForArrival,
} from './helpers';

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

/** Что страница поручала фоновым потокам. */
interface WorkerLog {
  /** Адреса скриптов созданных потоков. */
  created: string[];
  requests: number;
  replies: number;
}

/**
 * Вести журнал фоновых потоков страницы с самой загрузки: конструктор
 * `Worker` подменяется обёрткой, которая считает созданные потоки, запросы к
 * ним и ответы от них.
 */
async function logWorkers(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log: WorkerLog = { created: [], requests: 0, replies: 0 };
    (window as unknown as { workerLog: WorkerLog }).workerLog = log;

    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (this: Worker, ...args: unknown[]) {
      log.requests += 1;
      return (post as (...a: unknown[]) => void).apply(this, args);
    };
    window.Worker = new Proxy(Worker, {
      construct(target, args: ConstructorParameters<typeof Worker>) {
        const worker = new target(...args);
        log.created.push(String(args[0]));
        worker.addEventListener('message', () => (log.replies += 1));
        return worker;
      },
    });
  });
}

async function workerLog(page: Page): Promise<WorkerLog> {
  return page.evaluate(() => (window as unknown as { workerLog: WorkerLog }).workerLog);
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
    await expect(rows.first()).toBeVisible({ timeout: EVENT_ROWS_TIMEOUT_MS });

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

  // Поток поиска может не заработать. Ответа из него тогда не будет никогда,
  // и без запасного пути список навсегда остался бы на «ищу».
  const brokenWorkers = [
    { name: 'скрипт потока не загрузился', response: { status: 500, body: '' } },
    {
      name: 'расчёт в потоке упал',
      response: {
        status: 200,
        contentType: 'text/javascript',
        body: "self.addEventListener('message', () => { throw new Error('поиск упал'); });",
      },
    },
  ];
  for (const broken of brokenWorkers) {
    test(`список заполняется, даже если ${broken.name}`, async ({ page }) => {
      await page.route('**/eventsWorker*', (route) => route.fulfill(broken.response));
      await openScene(page);

      await page.keyboard.press('KeyE');
      await expect(page.locator(panel).first()).toBeVisible({ timeout: EVENT_ROWS_TIMEOUT_MS });
      expect(await page.locator(panel).count()).toBeGreaterThan(20);
    });
  }

  test('поиск событий идёт в фоновом потоке', async ({ page }) => {
    // Пять лет поиска идут сотни миллисекунд и на настольной машине, и
    // раньше всё это время стоял кадр: первое открытие списка выглядело как
    // зависание. Теперь поиск в фоновом потоке.
    //
    // Долгие задачи главного потока здесь не мерятся: на программном
    // рендерере сцена и с закрытым списком даёт задачи по 250-330 мс, а
    // поиск в главном потоке давал 345. Предел между ними ничего бы не
    // различал. Проверяется само свойство: запрос ушёл в поток, ответ
    // пришёл оттуда, и по нему собран список.
    await logWorkers(page);
    await openScene(page);

    await page.keyboard.press('KeyE');
    await expect(page.locator(panel).first()).toBeVisible({ timeout: EVENT_ROWS_TIMEOUT_MS });

    const log = await workerLog(page);
    expect(log.created.some((url) => url.includes('eventsWorker'))).toBe(true);
    expect(log.requests).toBeGreaterThan(0);
    expect(log.replies).toBe(log.requests);
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
    await expect(page.locator(panel).first()).toBeVisible({ timeout: EVENT_ROWS_TIMEOUT_MS });

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
    await expect(page.locator(panel).first()).toBeVisible({ timeout: EVENT_ROWS_TIMEOUT_MS });
  });

  test('в списке есть затмения, противостояния и сближения, и все впереди', async ({ page }) => {
    await openScene(page);
    await page.keyboard.press('KeyE');
    await expect(page.locator(panel).first()).toBeVisible({ timeout: EVENT_ROWS_TIMEOUT_MS });

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
    await expect(page.locator(panel).first()).toBeVisible({ timeout: EVENT_ROWS_TIMEOUT_MS });

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
