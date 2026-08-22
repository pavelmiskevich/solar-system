import { expect, test, type Page } from '@playwright/test';
import { Vector3 } from 'three';

import { galacticBasis } from '../src/physics/frames';
import { expectNoErrors, frameLight, openScene, waitForFrames } from './helpers';

/**
 * Млечный Путь.
 *
 * Полоса рисуется в шейдере и наружу ничем не выходит: ни объекта, ни числа,
 * по которому можно спросить «а есть ли она». Поэтому проверяется яркость
 * кадра — там, где полоса должна быть, и там, где её быть не должно.
 */

const basis = galacticBasis();

/** Посмотреть в заданную сторону неба и дать экспозиции устояться. */
async function lookTowards(page: Page, direction: Vector3): Promise<void> {
  await page.evaluate(
    (at) => {
      const sim = window.sim;
      sim.setDate('2026-08-14T12:00:00Z');
      sim.clock.paused = true;
      // Точка обзора вдали от планет: их диски испортили бы замер яркости.
      const from: [number, number, number] = [3e8, 1e8, 2e8];
      sim.lookAt(from, [from[0] + at[0] * 1e12, from[1] + at[1] * 1e12, from[2] + at[2] * 1e12]);
    },
    [direction.x, direction.y, direction.z],
  );

  await page.waitForTimeout(2500);
  await waitForFrames(page, 3);
}

test.describe('Млечный Путь', () => {
  test('в стороне центра Галактики небо светится, у полюса — нет', async ({ page }) => {
    const errors = await openScene(page);

    await lookTowards(page, basis.centre.clone());
    const centre = await frameLight(page, 0.3);

    await lookTowards(page, basis.pole.clone());
    const pole = await frameLight(page, 0.3);

    // У полюса Галактики небо пустое: там только звёзды каталога, и медиана
    // по клеткам держится у нуля.
    expect(pole.median).toBeLessThan(4);
    // В Стрельце мы смотрим сквозь весь диск и в балдж — там ярче всего.
    expect(centre.median).toBeGreaterThan(pole.median + 8);
    expect(centre.median).toBeGreaterThan(12);

    expectNoErrors(errors);
  });

  test('полоса тянется через всё небо: в антицентре она есть, но слабее', async ({ page }) => {
    await openScene(page);

    // Область замера узкая: у антицентра полоса вчетверо тоньше, чем у
    // центра, и широкая область меряла бы в основном пустое небо вокруг неё.
    const NARROW = 0.12;

    await lookTowards(page, basis.centre.clone());
    const centre = await frameLight(page, NARROW);

    await lookTowards(page, basis.centre.clone().negate());
    const anticentre = await frameLight(page, NARROW);

    await lookTowards(page, basis.pole.clone());
    const pole = await frameLight(page, NARROW);

    // В Возничем полоса видна — мы смотрим вдоль диска, только наружу.
    expect(anticentre.median).toBeGreaterThan(pole.median + 3);
    // Но заметно слабее, чем в сторону центра: там за спиной весь диск.
    expect(anticentre.median).toBeLessThan(centre.median * 0.75);
  });

  test('полоса лежит по галактическим координатам, а не по эклиптике', async ({ page }) => {
    await openScene(page);

    // Направление, отстоящее от плоскости Галактики на сорок пять градусов:
    // полосы там быть не должно, как бы ни лежала эклиптика.
    const oblique = basis.centre
      .clone()
      .multiplyScalar(Math.SQRT1_2)
      .addScaledVector(basis.pole, Math.SQRT1_2)
      .normalize();

    await lookTowards(page, basis.centre.clone());
    const centre = await frameLight(page, 0.3);

    await lookTowards(page, oblique);
    const away = await frameLight(page, 0.3);

    // Без этой проверки условие ниже выполнялось бы и на пустом небе.
    expect(centre.median, 'в стороне центра полоса обязана светиться').toBeGreaterThan(12);
    expect(away.median).toBeLessThan(centre.median * 0.4);
  });
});
