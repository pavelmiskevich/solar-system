// @ts-check
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

/**
 * Снимки сцены для README.
 *
 * Кадры делает тот же headless-Chromium, что и сквозные тесты, и тем же
 * отладочным доступом `window.sim` ставит камеру, дату и масштаб. Смысл в
 * повторяемости: картинки в описании проекта должны обновляться командой, а не
 * пересниматься вручную, иначе они устаревают молча.
 *
 * Требуется поднятый dev-сервер (`window.sim` есть только в режиме разработки):
 *
 *   npm run dev -- --host 127.0.0.1 --port 5174
 *   node scripts/shots.mjs
 */

const URL = 'http://127.0.0.1:5174';
const OUTPUT = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/shots');

/** Локальный адрес мимо системного прокси — иначе браузер получает 502 на свой же порт. */
process.env.NO_PROXY = ['localhost', '127.0.0.1', process.env.NO_PROXY].filter(Boolean).join(',');
process.env.no_proxy = process.env.NO_PROXY;

/** Дата съёмки. Фиксированная: иначе тела каждый раз стоят по-разному. */
const DATE = '2026-08-14T12:00:00Z';

/**
 * Кадры. `goTo(id, радиусы, фазовый угол)` ставит камеру так, чтобы тело было
 * освещено: угол 0° — Солнце за спиной, 180° — прямо в объектив.
 */
const SHOTS = [
  {
    file: 'saturn.png',
    what: 'Сатурн: кольца, тень планеты на кольцах и тень колец на планете',
    // Кольца освещены по сезону Сатурна: в 2025-м они прошли плоскостью через
    // Солнце и почти не видны, к началу 2030-х раскрываются на максимум.
    date: '2032-01-01T00:00:00Z',
    place: (sim) => sim.goTo('saturn', 4.2, 40),
  },
  {
    file: 'jupiter.png',
    what: 'Юпитер: полосы, Красное пятно и галилеевы спутники',
    place: (sim) => sim.goTo('jupiter', 4.6, 45),
  },
  {
    file: 'earth.png',
    what: 'Земля: океаны, облака, полярные шапки',
    place: (sim) => sim.goTo('earth', 3.0, 55),
  },
  {
    file: 'moon.png',
    what: 'Луна: кратеры и моря вдоль терминатора',
    place: (sim) => sim.goTo('moon', 3.0, 75),
  },
  {
    file: 'system.png',
    what: 'Внутренняя система с орбитами — вид сверху',
    place: (sim) => sim.lookAt([1.5e8, 2.2e8, 2.6e8], [0, 0, 0]),
  },
  {
    file: 'interface.png',
    what: 'Интерфейс: список тел и карточка тела',
    // Именно перелёт, а не расстановка камеры: карточка тела появляется по
    // прибытии, вместе с привязкой к системе отсчёта планеты.
    place: (sim) => sim.travelTo('mars'),
    awaitTravel: true,
    // B открывает список тел.
    press: ['KeyB'],
  },
];

/** Экспозиция подтягивается полторы секунды, и после перестановки камеры ей нужно время. */
const SETTLE_MS = 5000;

const browser = await chromium.launch({
  args: [
    // Видеокарты в headless нет; программный растеризатор по умолчанию
    // считается «небезопасным» и WebGL2 без этого не выдаётся.
    '--enable-unsafe-swiftshader',
    '--no-proxy-server',
    '--use-gl=angle',
    '--use-angle=swiftshader',
  ],
});

const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

try {
  await page.goto(URL);
  await page.waitForFunction(() => typeof window.sim === 'object' && window.sim !== null, null, {
    timeout: 60_000,
  });

  // Справка открыта при загрузке и накрывает кадр — закрываем.
  await page.keyboard.press('Escape');
  await page.locator('#help.closed').waitFor();

  await page.evaluate((date) => {
    window.sim.clock.paused = true;
    window.sim.setDate(date);
  }, DATE);

  mkdirSync(OUTPUT, { recursive: true });

  for (const shot of SHOTS) {
    await page.evaluate((date) => window.sim.setDate(date), shot.date ?? DATE);
    await page.evaluate(`(${shot.place.toString()})(window.sim)`);
    if (shot.awaitTravel) {
      // Перелёт идёт секунды и во время него камера ещё в пути.
      await page.evaluate(() => {
        window.sim.clock.paused = false;
      });
      await page.waitForFunction(() => window.sim.travel.isActive === false, null, {
        timeout: 60_000,
      });
      await page.evaluate(() => {
        window.sim.clock.paused = true;
      });
    }
    for (const key of shot.press ?? []) await page.keyboard.press(key);
    await page.waitForTimeout(SETTLE_MS);

    await page.screenshot({ path: resolve(OUTPUT, shot.file) });
    console.log(`${shot.file} — ${shot.what}`);
  }
} finally {
  await browser.close();
}
