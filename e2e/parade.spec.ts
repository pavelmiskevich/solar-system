import { expect, test } from '@playwright/test';

import { expectNoErrors, openScene, waitForFrames } from './helpers';

/**
 * Парад планет в списке событий.
 *
 * Юнит-тесты проверяют дату и дугу, а здесь - то, что видно человеку: строка
 * есть в списке, щелчок по ней останавливает время на нужном моменте и
 * разворачивает камеру так, что названные планеты действительно в кадре.
 *
 * Последнее юнит-тестом недостижимо. Между углами вида и картинкой лежит вся
 * сцена: плавающее начало координат, разбор состояния и постановка камеры.
 * Ошибка в любом из трёх оставит даты верными, а кадр - пустым.
 */

test.describe('парад планет', () => {
  test('строка есть в списке и названа числом планет', async ({ page }) => {
    const errors = await openScene(page);
    await page.keyboard.press('KeyE');

    const parade = page.locator('[data-event^="planet-parade"]').first();
    await expect(parade).toBeVisible({ timeout: 20_000 });

    // В названии - сколько планет, в пояснении - дуга и сторона неба.
    await expect(parade).toContainText('Парад планет');
    await expect(parade.locator('.views-hint')).toContainText(/в дуге \d+°/);
    await expect(parade.locator('.views-hint')).toContainText(/(утреннего|вечернего) неба|обе стороны/);

    expectNoErrors(errors);
  });

  test('щелчок останавливает время на моменте парада', async ({ page }) => {
    await openScene(page);
    await page.keyboard.press('KeyE');

    const parade = page.locator('[data-event^="planet-parade"]').first();
    await expect(parade).toBeVisible({ timeout: 20_000 });

    const caption = (await parade.locator('.views-hint').textContent()) ?? '';
    await parade.click();
    await waitForFrames(page, 5);

    // Парад - положение, а не процесс: при сутках в секунду он разошёлся бы
    // на глазах, и человек увидел бы уже не то, что обещано в строке.
    await expect(page.locator('#hud')).toContainText('пауза');

    // Дата сцены - та самая, что стояла в строке.
    const listed = caption.slice(0, caption.indexOf(' г.,'));
    await expect(page.locator('#hud')).toContainText(listed);
  });

  test('все названные планеты оказываются в кадре', async ({ page }) => {
    await openScene(page);
    await page.keyboard.press('KeyE');

    const parade = page.locator('[data-event^="planet-parade"]').first();
    await expect(parade).toBeVisible({ timeout: 20_000 });

    const caption = (await parade.locator('.views-hint').textContent()) ?? '';
    await parade.click();
    await waitForFrames(page, 5);

    const measured = await page.evaluate(() => {
      const sim = window.sim;
      const camera = sim.viewport.camera;

      // Направление взгляда и направления на тела берутся в координатах
      // отрисовки, где камера стоит в начале: мировые координаты здесь не
      // годятся вовсе - плавающее начало сдвигает сцену каждый кадр.
      const forward = new (sim.flight.worldPosition.constructor)(0, 0, -1).applyQuaternion(
        camera.quaternion,
      );

      const ids = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'];
      const angles: Record<string, number> = {};

      for (const id of ids) {
        const body = sim.system.find(id);
        const direction = body.renderPosition
          ? body.renderPosition.clone().normalize()
          : body.group.position.clone().normalize();
        angles[id] = (Math.acos(Math.min(1, forward.dot(direction))) * 180) / Math.PI;
      }

      return {
        angles,
        earthBehind: forward.dot(sim.system.find('earth').group.position.clone().normalize()) < 0,
        fov: camera.fov,
      };
    });

    // Участники парада названы в той же строке списка, по которой щёлкнули.
    const named = (
      [
        ['Меркурий', 'mercury'],
        ['Венера', 'venus'],
        ['Марс', 'mars'],
        ['Юпитер', 'jupiter'],
        ['Сатурн', 'saturn'],
      ] as const
    )
      .filter(([russian]) => caption.includes(russian))
      .map(([, id]) => id);

    expect(named.length).toBeGreaterThanOrEqual(3);

    for (const id of named) {
      // Половина поля зрения по вертикали: тело за этим углом в кадр не попало
      // бы даже краем.
      expect(measured.angles[id], id).toBeLessThan(measured.fov / 2);
    }

    // Смотрим с Земли наружу, а не на Землю: иначе парад остался бы за спиной.
    expect(measured.earthBehind).toBe(true);
  });
});
