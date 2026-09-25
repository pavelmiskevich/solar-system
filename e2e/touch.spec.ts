import { expect, test, type Page } from '@playwright/test';

import {
  emptyScreenPoint,
  expectEqualPickers,
  expectNoErrors,
  openScene,
  pauseAt,
  screenPositionOf,
  waitForArrival,
  waitForFrames,
} from './helpers';

interface Point {
  x: number;
  y: number;
}

/**
 * Подать жест настоящими касаниями.
 *
 * Через CDP, а не через `page.touchscreen`: тот умеет одно касание, а щипок -
 * это два пальца сразу, и подменить его ничем нельзя. Пальцев может быть
 * сколько угодно; каждый идёт из своей точки в свою.
 */
async function gesture(page: Page, from: Point[], to: Point[]): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: string, points: Point[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });

  await send('touchStart', from);
  const STEPS = 10;
  for (let i = 1; i <= STEPS; i += 1) {
    await send(
      'touchMove',
      from.map((point, index) => ({
        x: point.x + ((to[index]!.x - point.x) * i) / STEPS,
        y: point.y + ((to[index]!.y - point.y) * i) / STEPS,
      })),
    );
  }
  await send('touchEnd', []);
  await cdp.detach();
}

/**
 * Чем занята точка кадра - или `null`, если палец попадёт в сцену.
 *
 * Сценой считается холст вместе с подписями тел над ним: жест, начатый на
 * подписи, сцену тоже поворачивает. Кнопки, списки и карточка тела - не сцена,
 * и палец, поставленный на них, жеста не начнёт.
 *
 * Проверка нужна затем же, зачем `coverOfLabel`: колонка кнопок у правого края
 * живёт своей жизнью, и стоит ей подрасти, как точка, выбранная здесь «в
 * пустом месте», оказывается под ссылкой на исходники. Без проверки это видно
 * только по таймауту ожидания, который ничего не объясняет.
 */
async function coverOfPoint(page: Page, point: Point): Promise<string | null> {
  return page.evaluate((p) => {
    const element = document.elementFromPoint(p.x, p.y);
    if (element === null) return 'под точкой ничего нет';
    if (element instanceof HTMLCanvasElement || element.closest('.label') !== null) return null;
    return `${element.tagName.toLowerCase()}.${element.className} «${(
      element.textContent ?? ''
    ).trim()}»`;
  }, point);
}

/** Убедиться, что все пальцы жеста попадают в сцену, а не в разметку. */
async function expectOnScene(page: Page, points: Point[]): Promise<void> {
  for (const point of points) {
    expect(
      await coverOfPoint(page, point),
      `точка ${point.x},${point.y} перекрыта разметкой`,
    ).toBeNull();
  }
}

/** Расстояние до тела, вокруг которого ходит камера, км. */
async function orbitRadius(page: Page): Promise<number> {
  return page.evaluate(() => window.sim.orbit.radius as number);
}

/**
 * Управление пальцами.
 *
 * На телефоне нет ни клавиатуры, ни захвата мыши - то есть нет ровно того, на
 * чём держалось управление сценой. Остаются три жеста: касание ведёт к телу,
 * протаскивание осматривает, щипок приближает. Они здесь и проверяются - в
 * эмуляции сенсорного экрана и на его размере.
 */
test.describe('сенсорное управление', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 760 } });

  test('касание по телу начинает перелёт к нему', async ({ page }) => {
    const errors = await openScene(page);
    // Дата выбрана по кадру телефона: он вчетверо уже настольного, и тела,
    // стоящие на мониторе по краям, в него не попадают вовсе. В середине
    // февраля 2027 года Марс виден точкой посреди кадра, а ближайшая к нему
    // подпись - в полусотне пикселей, то есть промахнуться пальцем некуда.
    await pauseAt(page, '2027-02-14T12:00:00Z');

    const point = await screenPositionOf(page, 'mars');
    expect(point, 'Марс должен быть в кадре').not.toBeNull();

    await page.touchscreen.tap(point!.x, point!.y);
    await waitForFrames(page, 2);

    expect(await page.evaluate(() => window.sim.travel.targetId)).toBe('mars');

    expectNoErrors(errors);
  });

  test('щипок меняет расстояние до тела', async ({ page }) => {
    const errors = await openScene(page);

    await page.evaluate(() => window.sim.travelTo('mars'));
    await waitForArrival(page, 'mars');
    // Приближать можно только то, вокруг чего камера ходит: щипок - замена
    // колеса, и работает он там же, где колесо.
    expect(await page.evaluate(() => window.sim.orbit.isActive)).toBe(true);

    const before = await orbitRadius(page);

    // Пальцы ставятся левее колонки кнопок и выше карточки тела: и то и другое
    // на телефоне занимает заметную часть кадра, а жест начинается со сцены.
    const together: Point[] = [
      { x: 120, y: 300 },
      { x: 180, y: 300 },
    ];
    const apart: Point[] = [
      { x: 40, y: 300 },
      { x: 260, y: 300 },
    ];
    await expectOnScene(page, [...together, ...apart]);

    // Развели пальцы - приблизились.
    await gesture(page, together, apart);

    await page.waitForFunction((was) => (window.sim.orbit.radius as number) < was * 0.9, before, {
      timeout: 20_000,
    });

    // И обратно: сведение пальцев отдаляет.
    const closer = await orbitRadius(page);
    await gesture(page, apart, together);

    await page.waitForFunction((was) => (window.sim.orbit.radius as number) > was * 1.1, closer, {
      timeout: 20_000,
    });

    // Приближали и отдаляли, а режим не отпущен: жест не должен уводить в
    // свободный полёт.
    expect(await page.evaluate(() => window.sim.orbit.isActive)).toBe(true);

    expectNoErrors(errors);
  });

  test('протаскивание поворачивает тело, не меняя расстояния', async ({ page }) => {
    const errors = await openScene(page);

    await page.evaluate(() => window.sim.travelTo('mars'));
    await waitForArrival(page, 'mars');

    const before = await orbitRadius(page);
    const facing = await page.evaluate(() => window.sim.orbit.azimuthAngle as number);

    const from: Point = { x: 280, y: 300 };
    await expectOnScene(page, [from]);
    await gesture(page, [from], [{ x: 100, y: 300 }]);

    await page.waitForFunction(
      (was) => Math.abs((window.sim.orbit.azimuthAngle as number) - was) > 0.3,
      facing,
      { timeout: 20_000 },
    );

    // Ракурс поменялся, расстояние осталось - это и есть осмотр.
    const after = await orbitRadius(page);
    expect(Math.abs(after - before) / before).toBeLessThan(0.05);

    expectNoErrors(errors);
  });

  test('протаскивание по небу осматривается и в свободном полёте', async ({ page }) => {
    // Свободный полёт - то, в чём сцена открывается, и до первого перелёта
    // другого управления на телефоне нет вовсе.
    const errors = await openScene(page);
    await pauseAt(page, '2026-08-14T12:00:00Z');
    expect(await page.evaluate(() => window.sim.orbit.isActive)).toBe(false);

    const empty = await emptyScreenPoint(page);
    const before = await page.evaluate(() => {
      const q = window.sim.flight.quaternion;
      return { x: q.x, y: q.y, z: q.z, w: q.w };
    });

    // Тянуть надо в ту сторону, где есть место: пустое место находится у края
    // кадра, и жест от края к краю выродился бы в десяток пикселей.
    const DRAG_PX = 160;
    const to = { x: empty.x < 195 ? empty.x + DRAG_PX : empty.x - DRAG_PX, y: empty.y };
    await gesture(page, [empty], [to]);

    await page.waitForFunction(
      (was) => {
        const q = window.sim.flight.quaternion;
        const dot = q.x * was.x + q.y * was.y + q.z * was.z + q.w * was.w;
        // Кватернион и его противоположность - один и тот же поворот, поэтому
        // сравнивается модуль произведения, а не само произведение.
        return Math.abs(dot) < 0.999;
      },
      before,
      { timeout: 20_000 },
    );

    // Мышь при этом не захвачена: захватывать на телефоне нечего, а
    // захваченным полёт перестал бы слушаться пальца.
    expect(await page.evaluate(() => window.sim.flight.isLocked)).toBe(false);
    expect(await page.evaluate(() => document.pointerLockElement === null)).toBe(true);

    expectNoErrors(errors);
  });

  test('крестик справки нажимается пальцем', async ({ page }) => {
    // Справка показана при первом заходе и накрывает кадр целиком, так что
    // закрыть её - первое, что человек делает с телефона. Клавиши `Esc` у него
    // нет, и остаётся крестик.
    const errors = await openScene(page, { keepHelp: true });

    const close = page.locator('#help .overlay-close');
    await expect(close).toBeVisible();
    const box = (await close.boundingBox())!;
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

    // Проверяется не «видно», а «достанет ли палец»: колонка кнопок лежит выше
    // карточки, и на узком экране правый верхний угол карточки приходится ровно
    // на эти кнопки. Крестик, который видно и нельзя нажать, читается как
    // поломка, а узнавать об этом по таймауту ожидания незачем.
    const cover = await page.evaluate((point) => {
      const target = document.querySelector('#help .overlay-close');
      const top = document.elementFromPoint(point.x, point.y);
      if (top === target || target?.contains(top)) return null;
      return `${top?.tagName.toLowerCase()}.${top?.className ?? ''} «${(
        top?.textContent ?? ''
      ).trim()}»`;
    }, centre);
    expect(cover, 'крестик справки перекрыт').toBeNull();

    await page.touchscreen.tap(centre.x, centre.y);
    await expect(page.locator('#help')).toHaveClass(/closed/);

    expectNoErrors(errors);
  });

  test('окна выбора на телефоне одного размера', async ({ page }) => {
    const errors = await openScene(page);
    await expectEqualPickers(page);
    expectNoErrors(errors);
  });

  test('интерфейс умещается по ширине телефонного экрана', async ({ page }) => {
    const errors = await openScene(page);

    await page.getByRole('button', { name: /Тела/ }).click();
    const list = page.locator('.bodies-list');
    await expect(list).toBeVisible();

    const box = await list.boundingBox();
    expect(box, 'список тел должен быть в кадре').not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);

    // Показания и подсказка не должны налезать друг на друга: на узком экране
    // подсказка идёт почти от края до края, и плашке внизу места не остаётся.
    const hud = await page.locator('#hud').boundingBox();
    const hint = await page.locator('#hint').boundingBox();
    expect(hud, 'плашка показаний должна быть в кадре').not.toBeNull();
    expect(hint, 'подсказка должна быть в кадре').not.toBeNull();
    expect(hud!.y + hud!.height).toBeLessThanOrEqual(hint!.y);

    expectNoErrors(errors);
  });
});
