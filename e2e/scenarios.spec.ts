import { expect, test } from '@playwright/test';

import { SCENARIOS } from '../src/data/scenarios';

import { distanceInRadii, expectNoErrors, openScene, waitForFrames } from './helpers';

/**
 * Готовые виды.
 *
 * Проверяется то, что обещано списком: щелчок по строке приводит камеру к
 * названному телу и не роняет ошибок. Красоту кадра проверить нечем — она
 * смотрится глазами, и снимки каждого вида лежат в описании работы.
 */

/** Что должно оказаться под камерой после каждого вида. */
const EXPECTED: Record<string, string> = {
  'earth-moon': 'earth',
  'jupiter-moons': 'jupiter',
  'saturn-rings-edge': 'saturn',
  'solar-eclipse': 'earth',
  'lunar-eclipse': 'moon',
  'io-shadow': 'jupiter',
  earthshine: 'moon',
  'inner-system': 'sun',
  'uranus-tilt': 'uranus',
};

test.describe('готовые виды', () => {
  test('список открывается кнопкой и клавишей V', async ({ page }) => {
    await openScene(page);

    const panel = page.locator('.views');
    await expect(panel).toHaveClass(/closed/);
    await expect(page.locator('.views-row')).toHaveCount(SCENARIOS.length);

    await page.getByRole('button', { name: /Виды/ }).click();
    await expect(panel).not.toHaveClass(/closed/);

    await page.keyboard.press('KeyV');
    await expect(panel).toHaveClass(/closed/);

    await page.keyboard.press('KeyV');
    await expect(panel).not.toHaveClass(/closed/);

    // Свёрнутая панель не должна ловить мышь: иначе она перехватывала бы
    // клики по небу в своём углу, а её самой не видно.
    await page.keyboard.press('KeyV');
    expect(
      await page.locator('.views-list').evaluate((node) => getComputedStyle(node).pointerEvents),
    ).toBe('none');
  });

  for (const [id, body] of Object.entries(EXPECTED)) {
    test(`вид «${id}» доводит камеру до тела ${body}`, async ({ page }) => {
      const errors = await openScene(page);

      await page.getByRole('button', { name: /Виды/ }).click();
      await page.locator(`[data-scenario="${id}"]`).click();

      // Перелёт занимает секунды; ждём, пока управление вернётся полёту.
      await page.waitForFunction(() => window.sim.travel.isActive === false, null, {
        timeout: 30_000,
      });
      await waitForFrames(page, 3);

      expect(await page.evaluate(() => window.sim.frame.targetId)).toBe(body);

      // Камера встала на расстоянии, которое задал вид, а не на том, куда
      // её ставит обычный перелёт: у каждого вида своё, и 3.4 радиуса среди
      // них нет ни одного.
      const radii = await distanceInRadii(page, body);
      const planned = SCENARIOS.find((scenario) => scenario.id === id)!.state.view.radii;

      expect(radii, `вид ${id} привёл камеру не туда`).toBeCloseTo(planned, 0);

      expectNoErrors(errors);
    });
  }
});
