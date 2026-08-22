import { expect, test } from '@playwright/test';
import { Vector3 } from 'three';

import { CONSTELLATIONS, figureVertices } from '../src/data/sky';
import { sphericalEquatorialToScene } from '../src/physics/frames';
import { expectNoErrors, openScene, pauseAt, waitForFrames } from './helpers';

/**
 * Разметка неба.
 *
 * Данные проверены юнит-тестами: вершины фигур стоят на настоящих звёздах
 * каталога. Здесь проверяется другое — что нарисовано именно это. Между
 * данными и кадром лежат перевод в координаты сцены, сфера неба и подписи,
 * и любое из трёх звеньев способно увести фигуру мимо звёзд молча.
 */

/** Куда смотреть, чтобы созвездие оказалось в кадре: середина его фигуры. */
function directionOf(name: string): [number, number, number] {
  const figure = CONSTELLATIONS.find((item) => item.name === name);
  if (!figure) throw new Error(`нет созвездия «${name}»`);

  const centre = new Vector3();
  const vertex = new Vector3();
  for (const [ra, dec] of figureVertices(figure)) {
    centre.add(sphericalEquatorialToScene(ra, dec, vertex));
  }
  centre.normalize().multiplyScalar(1e12);

  return [centre.x, centre.y, centre.z];
}

/** Показанные подписи неба: скрытые прячутся не классом, а видимостью. */
const VISIBLE_LABEL = '.sky-label:not([style*="visibility: hidden"])';

test.describe('разметка неба', () => {
  test('N показывает линии и подписи, повторное нажатие убирает', async ({ page }) => {
    const errors = await openScene(page);
    await pauseAt(page, '2026-08-14T12:00:00Z');

    // По умолчанию небо показано небом: ни линий, ни имён.
    expect(await page.evaluate(() => window.sim.constellations.isEnabled())).toBe(false);
    await expect(page.locator(VISIBLE_LABEL)).toHaveCount(0);

    await page.evaluate((at) => window.sim.lookAt([2e8, 1e8, 1e8], at), directionOf('Орион'));
    await page.keyboard.press('KeyN');
    await waitForFrames(page, 30);

    expect(await page.evaluate(() => window.sim.constellations.isEnabled())).toBe(true);
    await expect(page.getByText('ОРИОН', { exact: false })).toBeVisible();
    await expect(page.getByText('Бетельгейзе', { exact: true })).toBeVisible();

    await page.keyboard.press('KeyN');
    await waitForFrames(page, 30);

    expect(await page.evaluate(() => window.sim.constellations.isEnabled())).toBe(false);
    await expect(page.locator(VISIBLE_LABEL)).toHaveCount(0);

    expectNoErrors(errors);
  });

  test('Орион, Большая Медведица и Кассиопея нарисованы на своих местах', async ({ page }) => {
    const errors = await openScene(page);
    await pauseAt(page, '2026-08-14T12:00:00Z');
    await page.keyboard.press('KeyN');

    for (const name of ['Орион', 'Большая Медведица', 'Кассиопея']) {
      await page.evaluate((at) => window.sim.lookAt([2e8, 1e8, 1e8], at), directionOf(name));
      await waitForFrames(page, 30);

      await expect(page.getByText(name.toUpperCase(), { exact: false })).toBeVisible();
    }

    expectNoErrors(errors);
  });

  test('каждая вершина линии стоит на звезде каталога', async ({ page }) => {
    const errors = await openScene(page);
    await page.keyboard.press('KeyN');
    await waitForFrames(page, 2);

    // Сравниваются не данные, а то, что ушло в видеокарту: вершины линий и
    // точки звёзд — оба буфера читаются из сцены как есть.
    const worst = await page.evaluate(() => {
      const sim = window.sim;
      const lines = sim.constellations.lines.geometry.getAttribute('position').array as Float32Array;
      const stars = sim.starfield.points.geometry.getAttribute('position').array as Float32Array;

      let worstMiss = 0;
      let radius = 0;

      for (let v = 0; v < lines.length; v += 3) {
        const x = lines[v]!;
        const y = lines[v + 1]!;
        const z = lines[v + 2]!;
        radius = Math.hypot(x, y, z);

        let nearest = Infinity;
        for (let s = 0; s < stars.length; s += 3) {
          const d = Math.hypot(x - stars[s]!, y - stars[s + 1]!, z - stars[s + 2]!);
          if (d < nearest) nearest = d;
        }

        worstMiss = Math.max(worstMiss, nearest / radius);
      }

      return worstMiss;
    });

    // Промах в долях радиуса сферы — это и есть угол в радианах. Минута дуги
    // заведомо больше округления упакованного каталога и заведомо меньше
    // расстояния до соседней звезды.
    expect(worst).toBeLessThan((1 / 60) * (Math.PI / 180));

    expectNoErrors(errors);
  });
});
