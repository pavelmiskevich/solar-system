import { expect, test } from '@playwright/test';

import { distanceInRadii, openScene, waitForArrival, waitForFrames } from './helpers';

/**
 * Состояние сцены: дата и ссылка.
 *
 * Дата — полноправная координата вида, а ссылка — способ этот вид передать.
 * Обе задачи проверяются одним и тем же способом: задали состояние снаружи,
 * спросили у сцены, где она оказалась.
 */

/** Раскрытие колец Сатурна: угол между направлением на Солнце и их плоскостью. */
async function ringOpeningAngle(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    const sim = window.sim;
    const saturn = sim.system.find('saturn');
    const pole = new (saturn.worldPosition.constructor)(0, 1, 0).applyQuaternion(
      saturn.group.quaternion,
    );
    const toSun = sim.sun.worldPosition.clone().sub(saturn.worldPosition).normalize();

    return (Math.asin(Math.abs(pole.dot(toSun))) * 180) / Math.PI;
  });
}

test.describe('дата сцены', () => {
  test('введённая дата разворачивает кольца Сатурна, «сейчас» возвращает к текущему моменту', async ({
    page,
  }) => {
    await openScene(page, { keepHelp: true });

    // Пауза: время идёт по суткам в секунду, и без неё введённый момент уехал
    // бы прежде, чем его успели проверить.
    await page.keyboard.press('KeyP');

    await page.locator('.date-input').fill('2032-06-01T12:00');
    await waitForFrames(page, 2);

    // В августе 2026 года кольца видны с ребра — раскрытие семь градусов;
    // к лету 2032 года Сатурн разворачивает их к Солнцу почти на двадцать семь.
    expect(await ringOpeningAngle(page)).toBeGreaterThan(25);

    const before = await page.evaluate(() => Date.now());
    await page.getByRole('button', { name: 'сейчас' }).click();
    const after = await page.evaluate(() => Date.now());

    const sceneTime = await page.evaluate(() => window.sim.clock.date.getTime());

    // «Сейчас» ставит тот момент, когда его нажали, — значит он обязан лечь
    // между двумя замерами системных часов, до нажатия и сразу после.
    //
    // Сравнивать с текущим временем нельзя: часы сцены стоят на паузе, и
    // разница росла бы вместе с дорогой от нажатия до замера. На слабой
    // машине эта дорога занимает больше секунды, и такая проверка мерила бы
    // не кнопку, а скорость машины — на чём она и попалась в CI.
    //
    // Пара миллисекунд запаса: момент хранится юлианской датой, и обратный
    // перевод в миллисекунды round-trip не обязан быть точным до единицы.
    expect(sceneTime).toBeGreaterThanOrEqual(before - 2);
    expect(sceneTime).toBeLessThanOrEqual(after + 2);

    await waitForFrames(page, 2);
    expect(await ringOpeningAngle(page)).toBeLessThan(25);
  });
});

test.describe('ссылка на вид', () => {
  test('открытие адреса возвращает камеру к тому же телу и на ту же дату', async ({
    page,
    context,
  }) => {
    await openScene(page);

    await page.evaluate(() => window.sim.travelTo('saturn'));
    await waitForArrival(page, 'saturn');

    // Пауза попадает в адрес и останавливает время в обеих вкладках: иначе
    // сравнивать даты пришлось бы с поправкой на дорогу.
    await page.keyboard.press('KeyP');
    await page.waitForFunction(() => window.location.search.includes('b=saturn'), null, {
      timeout: 15_000,
    });
    await page.waitForFunction(() => window.location.search.includes('p=1'), null, {
      timeout: 15_000,
    });

    const shared = page.url();
    const date = new URL(shared).searchParams.get('d');
    expect(date, 'дата не попала в адрес').not.toBeNull();

    const opened = await context.newPage();
    await openScene(opened, { url: shared });

    // Вид восстанавливается сразу: перелёт был бы дорогой к кадру вместо кадра.
    expect(await opened.evaluate(() => window.sim.travel.isActive)).toBe(false);
    expect(await distanceInRadii(opened, 'saturn')).toBeCloseTo(3.4, 1);

    const openedDate = await opened.evaluate(() => window.sim.clock.date.toISOString());
    expect(openedDate.slice(0, 19)).toBe(date!.slice(0, 19));

    // Тело в ссылке — то же, что было выбрано: карточка и список идут за ним.
    expect(await opened.evaluate(() => window.sim.frame.targetId)).toBe('saturn');

    await opened.close();
  });
});
