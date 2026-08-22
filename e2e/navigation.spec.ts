import { expect, test, type Page } from '@playwright/test';

import {
  coverOfLabel,
  distanceInRadii,
  expectNoErrors,
  openScene,
  pauseAt,
  screenPositionOf,
  waitForArrival,
  waitForFrames,
} from './helpers';

/**
 * Перелёты и система отсчёта.
 *
 * Это главный сценарий работы со сценой: выбрал тело — оказался рядом с ним и
 * можешь его рассматривать. Юнит-тесты проверяют математику перелёта, здесь
 * проверяется, что она подключена к кнопкам, к клику по небу и к камере.
 */
test.describe('перелёты', () => {
  test('перелёт из списка тел доводит камеру до трёх радиусов', async ({ page }) => {
    const errors = await openScene(page);

    await page.getByRole('button', { name: /Тела/ }).click();
    await expect(page.locator('.bodies-row')).toHaveCount(16);

    // Точное совпадение имени: «Юпитер» встречается ещё и в подписи спутников.
    await page.locator('.bodies-row .name').filter({ hasText: /^Юпитер$/ }).click();
    expect(await page.evaluate(() => window.sim.travel.isActive)).toBe(true);

    await waitForArrival(page, 'jupiter');
    expect(await distanceInRadii(page, 'jupiter')).toBeCloseTo(3.4, 1);

    expectNoErrors(errors);
  });

  test('клик по телу в кадре начинает перелёт к нему', async ({ page }) => {
    await openScene(page);
    await pauseAt(page, '2026-08-14T12:00:00Z');

    // Юпитер на стартовом кадре виден точкой — по ней и целимся.
    const point = await screenPositionOf(page, 'jupiter');
    expect(point, 'Юпитер должен быть в кадре при старте').not.toBeNull();

    await page.mouse.click(point!.x, point!.y);
    await waitForFrames(page, 2);

    expect(await page.evaluate(() => window.sim.travel.targetId)).toBe('jupiter');
  });

  test('клик по подписи тела работает так же, как клик по телу', async ({ page }) => {
    await openScene(page);
    // Дата выбрана по положению Меркурия: подписи лежат в одном слое с
    // колонкой кнопок у правого края, и колонка лежит выше. В середине
    // августа 2026 года подпись Меркурия приходится ровно на неё, и щелчок
    // достаётся кнопке «GitHub», а не подписи.
    await pauseAt(page, '2026-11-14T12:00:00Z');

    const label = page.locator('.label', { hasText: 'Меркурий' });
    await expect(label).toBeVisible();
    expect(await coverOfLabel(page, 'Меркурий'), 'подпись Меркурия перекрыта').toBeNull();
    await label.click();

    expect(await page.evaluate(() => window.sim.travel.targetId)).toBe('mercury');
  });

  test('клавиша движения прерывает перелёт', async ({ page }) => {
    await openScene(page);

    await page.evaluate(() => window.sim.travelTo('neptune'));
    expect(await page.evaluate(() => window.sim.travel.isActive)).toBe(true);

    await page.keyboard.press('KeyW');
    await waitForFrames(page, 2);

    expect(await page.evaluate(() => window.sim.travel.isActive)).toBe(false);
    // Прервали — значит, до Нептуна не долетели.
    expect(await distanceInRadii(page, 'neptune')).toBeGreaterThan(100);
  });

  test('после прибытия камера идёт вместе с телом по орбите', async ({ page }) => {
    await openScene(page);
    await page.evaluate(() => window.sim.travelTo('earth'));
    await waitForArrival(page, 'earth');

    const before = await distanceInRadii(page, 'earth');

    // Разгоняем время: без привязки к системе отсчёта Земля на скорости
    // тридцать километров в секунду уходит из кадра за считанные секунды.
    await page.evaluate(async () => {
      window.sim.clock.timeScale = 1;
      window.sim.clock.paused = false;
      await new Promise((resolve) => setTimeout(resolve, 3000));
      window.sim.clock.paused = true;
    });
    await waitForFrames(page, 2);

    const after = await distanceInRadii(page, 'earth');

    expect(after).toBeCloseTo(before, 1);
    expect(await page.evaluate(() => window.sim.frame.targetId)).toBe('earth');
  });

  test('перелёт к спутнику Юпитера доводит до самого спутника, а не до планеты', async ({
    page,
  }) => {
    await openScene(page);

    await page.evaluate(() => window.sim.travelTo('europa'));
    await waitForArrival(page, 'europa');

    expect(await distanceInRadii(page, 'europa')).toBeCloseTo(3.4, 1);
    // До Юпитера при этом сотни его радиусов: спутник далеко от планеты.
    expect(await distanceInRadii(page, 'jupiter')).toBeGreaterThan(5);
  });

  test('перелёт к Солнцу не проваливается внутрь звезды', async ({ page }) => {
    await openScene(page);

    await page.evaluate(() => window.sim.travelTo('sun'));
    await waitForArrival(page, 'sun');

    const radii = await distanceInRadii(page, 'sun');
    expect(radii).toBeGreaterThan(2);
    expect(radii).toBeLessThan(6);
  });

  test('после прилёта тело поворачивается протаскиванием мыши', async ({ page }) => {
    // Критерий из задачи: ракурс меняется, направление на тело и расстояние —
    // нет. Проверяется настоящим протаскиванием, а не вызовом метода: так
    // заодно проверена и привязка ввода.
    await openScene(page);
    await pauseAt(page, '2032-01-01T00:00:00Z');

    await page.evaluate(() => window.sim.travelTo('saturn'));
    await waitForArrival(page, 'saturn');
    await waitForFrames(page, 3);

    expect(await page.evaluate(() => window.sim.orbit.isActive)).toBe(true);

    const before = await page.evaluate(() => {
      const body = window.sim.system.find('saturn');
      const offset = window.sim.flight.worldPosition.clone().sub(body.worldPosition);
      return { distance: offset.length(), direction: offset.normalize().toArray() };
    });

    const box = (await page.locator('#viewport canvas').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    // Треть экрана, несколькими шагами — одним прыжком браузер сочтёт это
    // телепортом курсора, а не протаскиванием.
    for (let i = 1; i <= 6; i += 1) {
      await page.mouse.move(box.x + box.width / 2 + (box.width / 3) * (i / 6), box.y + box.height / 2);
    }
    await page.mouse.up();
    await page.waitForTimeout(1500);

    const after = await page.evaluate(() => {
      const body = window.sim.system.find('saturn');
      const offset = window.sim.flight.worldPosition.clone().sub(body.worldPosition);
      const forward = window.sim.flight.worldPosition
        .clone()
        .sub(window.sim.flight.worldPosition)
        .set(0, 0, -1)
        .applyQuaternion(window.sim.flight.quaternion);
      const toBody = body.worldPosition.clone().sub(window.sim.flight.worldPosition).normalize();
      return {
        distance: offset.length(),
        direction: offset.normalize().toArray(),
        aim: forward.dot(toBody),
      };
    });

    // Расстояние сохранилось.
    expect(after.distance / before.distance).toBeCloseTo(1, 2);

    // Ракурс изменился заметно: треть экрана — это десятки градусов.
    const dot =
      before.direction[0] * after.direction[0] +
      before.direction[1] * after.direction[1] +
      before.direction[2] * after.direction[2];
    expect(Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI)).toBeGreaterThan(20);

    // Тело осталось в центре кадра.
    expect(after.aim).toBeGreaterThan(0.999);
  });

  test('движение клавишами выключает орбитальный режим', async ({ page }) => {
    await openScene(page);
    await pauseAt(page, '2032-01-01T00:00:00Z');

    await page.evaluate(() => window.sim.travelTo('mars'));
    await waitForArrival(page, 'mars');
    expect(await page.evaluate(() => window.sim.orbit.isActive)).toBe(true);

    // Тронул рули — режим отпускает камеру, иначе она сопротивлялась бы
    // движению, возвращаясь каждый кадр на свою окружность.
    await page.keyboard.press('KeyW');
    expect(await page.evaluate(() => window.sim.orbit.isActive)).toBe(false);
  });
});


/** Положение камеры в мировых координатах, км. */
async function cameraPosition(page: Page): Promise<[number, number, number]> {
  return page.evaluate(() => {
    const p = window.sim.flight.worldPosition;
    return [p.x, p.y, p.z] as [number, number, number];
  });
}

/** Насколько тело отошло от центра кадра — в долях его ширины и высоты. */
async function missFromCentre(page: Page, id: string): Promise<number> {
  const point = await screenPositionOf(page, id);
  if (point === null) return Infinity;

  const size = await page.evaluate(() => {
    const element = window.sim.viewport.renderer.domElement;
    return { width: element.clientWidth, height: element.clientHeight };
  });

  return Math.max(
    Math.abs(point.x - size.width / 2) / size.width,
    Math.abs(point.y - size.height / 2) / size.height,
  );
}

/**
 * Пролететь, удерживая клавишу, пока камера не отойдёт от старта на minPath.
 *
 * Ждать не секунды, а пройденный путь — потому что путь и секунды здесь не
 * связаны. Шаг времени в кадровом цикле ограничен сверху, и на машине, где
 * кадры идут редко (в headless небо считает программный растеризатор),
 * за те же десять секунд настенных часов камера пролетает в разы меньше.
 * Проверка, отмерявшая полёт секундомером, проходила на живой видеокарте и
 * падала в CI — не потому, что захват сломался, а потому, что лететь ещё
 * не начали.
 *
 * @param sample вызывается на каждом замере — им проверка следит за полётом
 */
async function flyUntilPath(
  page: Page,
  key: string,
  minPath: number,
  sample?: () => Promise<void>,
): Promise<number> {
  const start = await cameraPosition(page);
  const travelled = async (): Promise<number> => {
    const now = await cameraPosition(page);
    return Math.hypot(now[0] - start[0], now[1] - start[1], now[2] - start[2]);
  };

  await page.keyboard.down(key);
  try {
    const deadline = Date.now() + 60_000;
    let path = 0;

    while (Date.now() < deadline) {
      await page.waitForTimeout(400);
      if (sample) await sample();

      path = await travelled();
      if (path >= minPath) return path;
    }

    throw new Error(`камера прошла ${path.toFixed(0)} км из ${minPath.toFixed(0)} за минуту`);
  } finally {
    await page.keyboard.up(key);
  }
}

/** Видимый радиус тела, км. */
async function visualRadius(page: Page, id: string): Promise<number> {
  return page.evaluate((bodyId) => window.sim.system.find(bodyId).visualRadius, id);
}

/**
 * Захват цели.
 *
 * Обещание: пока захват включён, тело не уходит из кадра, что бы ни делали
 * рули. Сквозная проверка нужна не ради математики — она есть в юнит-тестах, —
 * а ради того, что захват вообще включается тем, чем обещано, и что кадровый
 * цикл его действительно спрашивает.
 */
test.describe('захват цели', () => {
  test('захваченное тело держится в центре кадра во время полёта', async ({ page }) => {
    const errors = await openScene(page);
    await pauseAt(page, '2032-01-01T00:00:00Z');

    // Встаём поодаль от Марса: с трёх радиусов полёт вперёд утыкается в
    // планету, и проверять нечего.
    await page.evaluate(() => window.sim.goTo('mars', 30));
    await waitForFrames(page, 3);

    // Наводим курсор на Марс и захватываем его — тем же выбором, каким
    // отработал бы щелчок.
    const mars = await screenPositionOf(page, 'mars');
    expect(mars).not.toBeNull();
    await page.mouse.move(mars!.x, mars!.y);
    await page.keyboard.press('KeyF');

    expect(await page.evaluate(() => window.sim.aim.targetId)).toBe('mars');
    await expect(page.locator('#hud')).toContainText('Марс');

    // Летим боком: так направление на тело разворачивается быстрее всего, а
    // взгляду приходится поспевать за ним каждый кадр. Захват держит камеру
    // носом на Марс, поэтому боковое движение обводит её вокруг планеты:
    // расстояние почти не меняется, и мерить остаётся сам путь.
    const radius = await visualRadius(page, 'mars');
    const misses: number[] = [];

    await flyUntilPath(page, 'KeyD', radius * 12, async () => {
      misses.push(await missFromCentre(page, 'mars'));
    });

    // Центральная треть кадра — это шестая часть в каждую сторону от центра.
    expect(misses.length).toBeGreaterThan(2);
    expect(Math.max(...misses)).toBeLessThan(1 / 6);

    expectNoErrors(errors);
  });

  test('повторное нажатие снимает захват, и тело уходит из кадра', async ({ page }) => {
    const errors = await openScene(page);
    await pauseAt(page, '2032-01-01T00:00:00Z');

    await page.evaluate(() => window.sim.goTo('mars', 30));
    await waitForFrames(page, 3);

    const mars = await screenPositionOf(page, 'mars');
    await page.mouse.move(mars!.x, mars!.y);
    await page.keyboard.press('KeyF');
    expect(await page.evaluate(() => window.sim.aim.targetId)).toBe('mars');

    await page.keyboard.press('KeyF');
    expect(await page.evaluate(() => window.sim.aim.targetId)).toBeNull();

    // Без захвата тело уходит из кадра на том же самом пути: с тридцати
    // радиусов двенадцать в сторону — это двадцать градусов мимо, а половина
    // кадра по ширине здесь меньше.
    const radius = await visualRadius(page, 'mars');
    await flyUntilPath(page, 'KeyD', radius * 12);

    expect(await missFromCentre(page, 'mars')).toBeGreaterThan(1 / 6);

    expectNoErrors(errors);
  });

  test('выбор другой цели снимает захват', async ({ page }) => {
    const errors = await openScene(page);
    await pauseAt(page, '2032-01-01T00:00:00Z');

    await page.evaluate(() => window.sim.goTo('mars', 30));
    await waitForFrames(page, 3);

    const mars = await screenPositionOf(page, 'mars');
    await page.mouse.move(mars!.x, mars!.y);
    await page.keyboard.press('KeyF');
    expect(await page.evaluate(() => window.sim.aim.targetId)).toBe('mars');

    await page.evaluate(() => window.sim.travelTo('venus'));
    expect(await page.evaluate(() => window.sim.aim.targetId)).toBeNull();

    expectNoErrors(errors);
  });
});
