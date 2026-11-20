import { expect, test, type Page } from '@playwright/test';

import { expectNoErrors, openScene, waitForArrival, waitForFrames } from './helpers';

/**
 * Чья клавиша: сцены, поля в фокусе или браузера.
 *
 * Юнит-тест проверяет само правило (src/core/keyRouting.ts). Здесь - что оба
 * обработчика им пользуются: сцена и полёт слушают окно каждый сам, и
 * разойдись они, клавиша досталась бы одному из них.
 */

const paused = (page: import('@playwright/test').Page) =>
  page.evaluate(() => window.sim.clock.paused as boolean);

test.describe('клавиши при фокусе в поле', () => {
  test('после щелчка по ползунку Esc закрывает справку, а P ставит паузу', async ({ page }) => {
    const errors = await openScene(page, { keepHelp: true });
    const help = page.locator('#help');
    await expect(help).not.toHaveClass(/closed/);

    const slider = page.locator('#time-slider-container input[type="range"]');
    await slider.click();
    await expect(slider).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(help).toHaveClass(/closed/);
    // Esc заодно выводит из поля: иначе следующая клавиша опять ушла бы ему.
    await expect(slider).not.toBeFocused();

    expect(await paused(page)).toBe(false);
    await page.keyboard.press('KeyP');
    expect(await paused(page)).toBe(true);
    expectNoErrors(errors);
  });

  test('H закрывает справку прямо из ползунка, стрелки по-прежнему двигают его', async ({
    page,
  }) => {
    await openScene(page, { keepHelp: true });
    const help = page.locator('#help');
    const slider = page.locator('#time-slider-container input[type="range"]');
    await slider.click();

    const before = await slider.inputValue();
    await page.keyboard.press('ArrowLeft');
    await expect(slider).not.toHaveValue(before);
    // Стрелка досталась ползунку, а не экскурсии и не сцене: справка открыта.
    await expect(help).not.toHaveClass(/closed/);

    await page.keyboard.press('KeyH');
    await expect(help).toHaveClass(/closed/);
  });

  test('после щелчка по полю даты Esc закрывает справку, а P ставит паузу', async ({ page }) => {
    await openScene(page, { keepHelp: true });
    const help = page.locator('#help');
    const date = page.locator('#date-panel-container input');
    await date.click();
    await expect(date).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(help).toHaveClass(/closed/);
    await page.keyboard.press('KeyP');
    expect(await paused(page)).toBe(true);
  });

  test('набор в поле даты не уводит камеру', async ({ page }) => {
    await openScene(page, { keepHelp: true });
    const date = page.locator('#date-panel-container input');
    await date.click();

    // W, A, S, D, C и пробел - рули полёта. В поле даты они буквы набора, и
    // полёт их не получает: держи он их, камера поехала бы.
    for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyC', 'Digit1']) {
      await page.keyboard.down(key);
      const held = await page.evaluate(() => [...(window.sim.flight.keys as Set<string>)]);
      expect(held, key).toEqual([]);
      await page.keyboard.up(key);
    }
    await expect(page.locator('#help')).not.toHaveClass(/closed/);
  });
});

test.describe('сочетания с модификаторами', () => {
  test('Ctrl и Cmd с буквой не трогают паузу, подписи и список тел', async ({ page }) => {
    const errors = await openScene(page);
    const state = () =>
      page.evaluate(() => ({
        paused: window.sim.clock.paused as boolean,
        labels: window.sim.labels.isEnabled() as boolean,
        bodies: window.sim.bodyList.isOpen as boolean,
      }));
    const before = await state();

    for (const combo of ['Control+KeyP', 'Control+KeyL', 'Control+KeyB', 'Meta+KeyP', 'Alt+KeyL']) {
      await page.keyboard.press(combo);
    }
    expect(await state()).toEqual(before);

    // Без модификатора те же клавиши работают как прежде.
    await page.keyboard.press('KeyP');
    expect((await state()).paused).toBe(!before.paused);
    expectNoErrors(errors);
  });

  test('Ctrl+C и Cmd+C не выводят из осмотра тела', async ({ page }) => {
    await openScene(page);
    await page.evaluate(() => window.sim.travelTo('jupiter'));
    await waitForArrival(page, 'jupiter');
    await expect.poll(() => page.evaluate(() => window.sim.orbit.isActive as boolean)).toBe(true);

    // Левый Ctrl сам был клавишей «вниз», и одно его нажатие обрывало осмотр
    // ещё до буквы.
    for (const combo of ['Control+KeyC', 'Meta+KeyC', 'Control+KeyF']) {
      await page.keyboard.press(combo);
      expect(await page.evaluate(() => window.sim.orbit.isActive as boolean), combo).toBe(true);
    }

    // Просто C - руль «вниз»: он, как и прежде, осмотр обрывает.
    await page.keyboard.press('KeyC');
    expect(await page.evaluate(() => window.sim.orbit.isActive as boolean)).toBe(false);
  });

  test('удержание P меняет паузу один раз', async ({ page }) => {
    await openScene(page);
    const before = await paused(page);

    // Повторный down без up Playwright шлёт с repeat: true - ровно как
    // автоповтор удержанной клавиши. Нажатий чётное число: прежний дребезг
    // вернул бы паузу как была, и проверка бы это заметила.
    for (let i = 0; i < 4; i++) await page.keyboard.down('KeyP');
    await page.keyboard.up('KeyP');

    expect(await paused(page)).toBe(!before);
  });
});

/*
 * Интерфейс с клавиатуры (#159).
 *
 * Справка обещает управление с клавиатуры, а дойти до кнопок было нельзя:
 * свёрнутые списки и закрытые карточки гаснут прозрачностью и остаются в
 * разметке, и Tab проходил по их невидимым кнопкам. Пробел на кнопке в фокусе
 * её не нажимал, а поднимал камеру.
 */

/** Остановка Tab: что в фокусе и видно ли это. */
interface Stop {
  name: string;
  visible: boolean;
}

/** Где фокус сейчас. `null` - фокуса на странице нет. */
async function focusedStop(page: Page): Promise<Stop | null> {
  return page.evaluate(() => {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement) || element === document.body) return null;
    const box = element.getBoundingClientRect();
    const onScreen =
      box.width > 0 &&
      box.height > 0 &&
      box.bottom > 0 &&
      box.right > 0 &&
      box.top < innerHeight &&
      box.left < innerWidth;
    return {
      name: `${element.tagName.toLowerCase()}.${element.className} «${(element.textContent ?? '')
        .trim()
        .slice(0, 30)}»`,
      // Прозрачность и visibility учитываются по всей цепочке предков:
      // свёрнутый список гаснет прозрачностью своей обёртки.
      visible:
        onScreen && element.checkVisibility({ opacityProperty: true, visibilityProperty: true }),
    };
  });
}

/** Сколько на странице видимых элементов, на которые встаёт фокус. */
async function visibleFocusables(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      [...document.querySelectorAll<HTMLElement>('button, a[href], input, select, [tabindex]')].filter(
        (element) =>
          element.tabIndex >= 0 &&
          !element.closest('[inert]') &&
          element.getBoundingClientRect().height > 0 &&
          element.checkVisibility({ opacityProperty: true, visibilityProperty: true }),
      ).length,
  );
}

test.describe('проход с клавиатуры', () => {
  test('Tab проходит только по видимому, пока списки свёрнуты', async ({ page }) => {
    const errors = await openScene(page);
    // Сцена стоит: подписи тел - тоже кнопки, и пусть они не уезжают за край
    // посреди обхода.
    await page.evaluate(() => (window.sim.clock.paused = true));

    const stops: Stop[] = [];
    // Обход до первого повтора: страница кончилась, и фокус пошёл по кругу.
    for (let i = 0; i < 120; i += 1) {
      await page.keyboard.press('Tab');
      const stop = await focusedStop(page);
      if (stop === null) break;
      if (stops.length > 0 && stop.name === stops[0]!.name) break;
      stops.push(stop);
    }

    // Обход вообще был: пустой прошёл бы любые проверки ниже.
    expect(stops.length).toBeGreaterThan(5);
    const hidden = stops.filter((stop) => !stop.visible).map((stop) => stop.name);
    expect(hidden, 'фокус вставал на невидимое').toEqual([]);
    expect(stops.length).toBeLessThanOrEqual(await visibleFocusables(page));

    expectNoErrors(errors);
  });

  test('пробел на кнопке «Тела» открывает список и не двигает камеру', async ({ page }) => {
    const errors = await openScene(page);

    const toggle = page.locator('#bodies > .bodies-toggle', { hasText: 'Тела' });
    await toggle.focus();
    const before = await page.evaluate(() => window.sim.flight.worldPosition.toArray() as number[]);

    // Удержание, как у человека, который нажимает кнопку: раньше за эти
    // 0,6 секунды камера поднималась на миллионы километров.
    await page.keyboard.down('Space');
    await page.waitForTimeout(600);
    await page.keyboard.up('Space');
    await waitForFrames(page, 3);

    await expect(page.locator('#bodies')).not.toHaveClass(/closed/);
    const after = await page.evaluate(() => window.sim.flight.worldPosition.toArray() as number[]);
    const moved = Math.hypot(...after.map((value, i) => value - before[i]!));
    expect(moved, `камера сдвинулась на ${Math.round(moved)} км`).toBeLessThan(1);

    expectNoErrors(errors);
  });

  test('Enter на кнопке «Тела» тоже открывает список', async ({ page }) => {
    const errors = await openScene(page);
    await page.locator('#bodies > .bodies-toggle', { hasText: 'Тела' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#bodies')).not.toHaveClass(/closed/);
    expectNoErrors(errors);
  });

  test('без фокуса на кнопке пробел по-прежнему поднимает камеру', async ({ page }) => {
    const errors = await openScene(page);
    const before = await page.evaluate(() => window.sim.flight.worldPosition.toArray() as number[]);

    await page.keyboard.down('Space');
    await page.waitForTimeout(600);
    await page.keyboard.up('Space');
    await waitForFrames(page, 3);

    const after = await page.evaluate(() => window.sim.flight.worldPosition.toArray() as number[]);
    const moved = Math.hypot(...after.map((value, i) => value - before[i]!));
    expect(moved, 'пробел должен поднимать камеру').toBeGreaterThan(1000);
    expectNoErrors(errors);
  });
});

/*
 * Состояние кнопок и карточки-диалоги (#159).
 *
 * Раскрыта панель или нет, раньше было слышно только по смене подписи, а
 * фокусом при открытии справки и поддержки никто не управлял.
 */
test.describe('кнопки и карточки для диктора', () => {
  /** Кнопки-переключатели: клавиша сцены и то, что раскрывается. */
  const toggles = [
    { name: 'Тела', key: 'KeyB', panel: 'bodies-list' },
    { name: 'Виды', key: 'KeyV', panel: 'views-list' },
    { name: 'События', key: 'KeyE', panel: 'events-list' },
    { name: 'Справка', key: 'KeyH', panel: 'help' },
  ];

  test('aria-expanded у каждой кнопки совпадает с состоянием панели', async ({ page }) => {
    const errors = await openScene(page);

    for (const { name, key, panel } of toggles) {
      const button = page.locator(`button[aria-controls="${panel}"]`);
      await expect(button, `${name}: кнопка связана с панелью`).toHaveCount(1);
      await expect(page.locator(`#${panel}`), `${name}: панель на месте`).toHaveCount(1);
      await expect(button).toHaveAttribute('aria-expanded', 'false');
      await page.keyboard.press(key);
      await expect(button, `${name} открыты`).toHaveAttribute('aria-expanded', 'true');
      await page.keyboard.press(key);
      await expect(button, `${name} закрыты`).toHaveAttribute('aria-expanded', 'false');
    }

    // Поддержке своей клавиши нет: только кнопка.
    const support = page.locator('button[aria-controls="support"]');
    await expect(support).toHaveAttribute('aria-expanded', 'false');
    await support.click();
    await expect(support).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#support [role="dialog"][aria-modal="true"]')).toHaveCount(1);

    expectNoErrors(errors);
  });

  test('справка, открытая кнопкой: фокус внутри, Tab по кругу, после Esc - на кнопке', async ({
    page,
  }) => {
    const errors = await openScene(page);
    const button = page.locator('button[aria-controls="help"]');

    await button.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#help')).not.toHaveClass(/closed/);

    const insideHelp = () =>
      page.evaluate(() => document.getElementById('help')!.contains(document.activeElement));
    expect(await insideHelp(), 'фокус в карточке справки').toBe(true);
    // Диктор читает заголовок карточки.
    await expect(page.locator('#help [role="dialog"]')).toHaveAttribute(
      'aria-labelledby',
      'help-title',
    );

    // Кнопок в справке немного: за тридцать нажатий Tab круг пройден не раз,
    // и фокус ни разу не ушёл из карточки.
    for (let i = 0; i < 30; i += 1) {
      await page.keyboard.press('Tab');
      expect(await insideHelp(), `Tab №${i + 1} увёл фокус из справки`).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(page.locator('#help')).toHaveClass(/closed/);
    await expect(button).toBeFocused();

    expectNoErrors(errors);
  });

  test('справка, открытая клавишей H: после Esc фокуса нет, и пробел поднимает камеру', async ({
    page,
  }) => {
    // Возвращать фокус на кнопку здесь нельзя: пробел, которым сразу после
    // Esc поднимаются над плоскостью, нажимал бы её и открывал справку снова.
    const errors = await openScene(page);

    await page.keyboard.press('KeyH');
    await expect(page.locator('#help')).not.toHaveClass(/closed/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#help')).toHaveClass(/closed/);
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);

    const before = await page.evaluate(() => window.sim.flight.worldPosition.toArray() as number[]);
    await page.keyboard.down('Space');
    await page.waitForTimeout(600);
    await page.keyboard.up('Space');
    await waitForFrames(page, 3);
    const after = await page.evaluate(() => window.sim.flight.worldPosition.toArray() as number[]);
    expect(Math.hypot(...after.map((value, i) => value - before[i]!))).toBeGreaterThan(1000);
    await expect(page.locator('#help')).toHaveClass(/closed/);

    expectNoErrors(errors);
  });

  test('справка на старте: фокус в ней, после Esc фокуса нет', async ({ page }) => {
    const errors = await openScene(page, { keepHelp: true });
    expect(
      await page.evaluate(() => document.getElementById('help')!.contains(document.activeElement)),
    ).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('#help')).toHaveClass(/closed/);
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
    expectNoErrors(errors);
  });
});
