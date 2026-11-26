import { expect, test, type Page } from '@playwright/test';

import { distanceInRadii, expectNoErrors, openScene, waitForArrival, waitForFrames } from './helpers';

/**
 * Состояние сцены: дата и ссылка.
 *
 * Дата - полноправная координата вида, а ссылка - способ этот вид передать.
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

    // В августе 2026 года кольца видны с ребра - раскрытие семь градусов;
    // к лету 2032 года Сатурн разворачивает их к Солнцу почти на двадцать семь.
    expect(await ringOpeningAngle(page)).toBeGreaterThan(25);

    const before = await page.evaluate(() => Date.now());
    await page.getByRole('button', { name: 'сейчас' }).click();
    const after = await page.evaluate(() => Date.now());

    const sceneTime = await page.evaluate(() => window.sim.clock.date.getTime());

    // «Сейчас» ставит тот момент, когда его нажали, - значит он обязан лечь
    // между двумя замерами системных часов, до нажатия и сразу после.
    //
    // Сравнивать с текущим временем нельзя: часы сцены стоят на паузе, и
    // разница росла бы вместе с дорогой от нажатия до замера. На слабой
    // машине эта дорога занимает больше секунды, и такая проверка мерила бы
    // не кнопку, а скорость машины - на чём она и попалась в CI.
    //
    // Пара миллисекунд запаса: момент хранится юлианской датой, и обратный
    // перевод в миллисекунды round-trip не обязан быть точным до единицы.
    expect(sceneTime).toBeGreaterThanOrEqual(before - 2);
    expect(sceneTime).toBeLessThanOrEqual(after + 2);

    await waitForFrames(page, 2);
    expect(await ringOpeningAngle(page)).toBeLessThan(25);
  });
});

test.describe('часы сцены', () => {
  // Часовой пояс браузера намеренно не всемирный: на раннере CI время и так
  // всемирное, и показания местным временем прошли бы проверку незамеченными.
  test.use({ timezoneId: 'Asia/Tokyo' });

  test('HUD показывает ту же дату, что стоит в поле, - всемирную', async ({ page }) => {
    await openScene(page, { keepHelp: true });
    await page.keyboard.press('KeyP');

    await page.locator('.date-input').fill('2032-06-01T12:00');
    await waitForFrames(page, 2);

    const hud = (await page.locator('#hud').textContent()) ?? '';

    // В Токио этот момент - девять вечера. Часовой пояс зрителя не должен
    // разводить два показания времени на одном экране.
    expect(hud, 'HUD показывает время не всемирное').toContain('12:00');
    expect(hud).toContain('2032');
    expect(hud).not.toContain('21:00');
  });
});

/**
 * Реальное время после фоновой вкладки (#201).
 *
 * Настоящую фоновую вкладку headless-браузер не даёт: кадры в нём идут и так.
 * Поэтому фон изображается так, как его видит страница: document.hidden и
 * событие visibilitychange, а кадры придерживаются, пока вкладка «скрыта», -
 * именно остановка кадров и роняла время сцены.
 */
test.describe('реальное время после фоновой вкладки', () => {
  const HIDDEN_MS = 10_000;

  async function hideTabFor(page: Page, ms: number): Promise<void> {
    await page.evaluate(() => {
      const w = window as unknown as { heldFrames: FrameRequestCallback[]; realRaf: typeof requestAnimationFrame };
      w.heldFrames = [];
      w.realRaf = window.requestAnimationFrame;
      window.requestAnimationFrame = (callback) => {
        w.heldFrames.push(callback);
        return 0;
      };
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await page.waitForTimeout(ms);

    await page.evaluate(() => {
      const w = window as unknown as { heldFrames: FrameRequestCallback[]; realRaf: typeof requestAnimationFrame };
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      window.requestAnimationFrame = w.realRaf;
      document.dispatchEvent(new Event('visibilitychange'));
      for (const callback of w.heldFrames.splice(0)) window.requestAnimationFrame(callback);
    });
    await waitForFrames(page, 3);
  }

  test('сцена «сейчас» догоняет часы', async ({ page }) => {
    const errors = await openScene(page);
    await page.evaluate(() => {
      const clock = window.sim.clock;
      clock.timeScale = 1 / 86_400;
      clock.paused = false;
      clock.date = new Date();
    });

    await hideTabFor(page, HIDDEN_MS);

    // Без подтягивания сцена отстала бы на все десять секунд фона. Допуск -
    // на кадры после возврата: на runner без видеокарты кадр длится дольше
    // своего ограниченного шага, и реальное время понемногу отстаёт.
    const lagMs = await page.evaluate(() => Date.now() - window.sim.clock.date.getTime());
    expect(Math.abs(lagMs), `отставание от часов, мс: ${lagMs}`).toBeLessThan(3_000);
    expectNoErrors(errors);
  });

  test('сцена на выбранной дате на ней и остаётся', async ({ page }) => {
    const errors = await openScene(page);
    const apollo = Date.UTC(1969, 6, 20, 20, 17);
    await page.evaluate((ms) => {
      const clock = window.sim.clock;
      clock.timeScale = 1 / 86_400;
      clock.paused = false;
      clock.date = new Date(ms);
    }, apollo);

    await hideTabFor(page, 3_000);

    const shiftMs = await page.evaluate((ms) => window.sim.clock.date.getTime() - ms, apollo);
    expect(Math.abs(shiftMs), `сдвиг от выбранной даты, мс: ${shiftMs}`).toBeLessThan(60_000);
    expectNoErrors(errors);
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

    // Первая вкладка больше не нужна, а рисовать Сатурн она продолжала бы.
    // Две сцены у Сатурна на программном рендерере делят одни и те же ядра,
    // и вторая открывалась так долго, что тест упирался в свой предел.
    await page.close();

    const opened = await context.newPage();
    await openScene(opened, { url: shared });

    // Вид восстанавливается сразу: перелёт был бы дорогой к кадру вместо кадра.
    expect(await opened.evaluate(() => window.sim.travel.isActive)).toBe(false);
    expect(await distanceInRadii(opened, 'saturn')).toBeCloseTo(3.4, 1);

    const openedDate = await opened.evaluate(() => window.sim.clock.date.toISOString());
    expect(openedDate.slice(0, 19)).toBe(date!.slice(0, 19));

    // Тело в ссылке - то же, что было выбрано: карточка и список идут за ним.
    expect(await opened.evaluate(() => window.sim.frame.targetId)).toBe('saturn');

    await opened.close();
  });
});

/*
 * Край диапазона дат (#167).
 *
 * Адрес хранит только 1600-2600 годы, а поле, стрелки и течение времени
 * уводили дальше: дата, которую удалось поставить, терялась при перезагрузке,
 * и человек получал прежний кадр с другим расположением планет.
 */
test.describe('край диапазона дат', () => {
  test('«+год» на краю дату не меняет', async ({ page }) => {
    await openScene(page, { keepHelp: true });
    await page.keyboard.press('KeyP');

    const field = page.locator('.date-input');
    await field.fill('2600-12-31T12:00');
    await waitForFrames(page, 2);
    await page.getByRole('button', { name: '+год' }).click();
    await waitForFrames(page, 2);

    await expect(field).toHaveValue(/^2600-12-31T12:00/);
    expect(await page.evaluate(() => window.sim.clock.date.getUTCFullYear())).toBe(2600);
  });

  test('дата за краем, набранная в поле, зажимается и переживает перезагрузку', async ({ page }) => {
    await openScene(page, { keepHelp: true });
    await page.keyboard.press('KeyP');

    await page.locator('.date-input').fill('2800-01-07T12:00');
    await waitForFrames(page, 2);
    expect(await page.evaluate(() => window.sim.clock.date.getUTCFullYear())).toBe(2600);

    // Адрес переписывается раз в полсекунды.
    await page.waitForFunction(() => window.location.search.includes('d=2600-'), null, {
      timeout: 15_000,
    });
    await page.reload();
    await page.waitForFunction(() => typeof window.sim === 'object' && window.sim !== null, null, {
      timeout: 60_000,
    });
    expect(await page.evaluate(() => window.sim.clock.date.toISOString())).toBe(
      '2600-12-31T12:00:00.000Z',
    );
  });

  test('на высшей скорости время встаёт на краю, и HUD говорит почему', async ({ page }) => {
    await openScene(page);
    await page.evaluate(() => {
      window.sim.clock.date = new Date('2600-06-01T00:00:00Z');
      window.sim.clock.timeScale = 365.25 * 20;
      window.sim.clock.paused = false;
    });

    await expect(page.locator('#hud')).toContainText('даты только 1600-2600', { timeout: 15_000 });
    expect(await page.evaluate(() => window.sim.clock.paused)).toBe(true);
    expect(await page.evaluate(() => window.sim.clock.date.toISOString())).toBe(
      '2600-12-31T12:00:00.000Z',
    );
  });
});
