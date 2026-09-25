import { expect, test } from '@playwright/test';

import {
  expectEqualPickers,
  expectNoErrors,
  openScene,
  pauseAt,
  waitForArrival,
  waitForFrames,
} from './helpers';

/**
 * Интерфейс: справка, список тел, карточка, время, размеры, подписи.
 *
 * Всё это существует только в браузере, юнит-тестами не проверяется вовсе, и
 * ломается тише всего: невидимая кнопка или клавиша, которая перестала
 * доходить до обработчика, выглядят как «ничего не произошло».
 */
test.describe('интерфейс', () => {
  test('справка показана при загрузке, закрывается и открывается снова', async ({ page }) => {
    await openScene(page, { keepHelp: true });

    const help = page.locator('#help');
    // Первое, что видит пришедший: как летать, как перелетать, как менять время.
    await expect(help).not.toHaveClass(/closed/);
    await expect(page.getByRole('heading', { name: 'Управление' })).toBeVisible();

    // В справке перечислены все разделы управления.
    for (const section of ['ПОЛЁТ', 'ПЕРЕЛЁТ', 'ОСМОТР', 'ВРЕМЯ', 'ВИД']) {
      await expect(page.locator('#help h2', { hasText: section })).toBeVisible();
    }

    await page.keyboard.press('Escape');
    await expect(help).toHaveClass(/closed/);

    await page.keyboard.press('KeyH');
    await expect(help).not.toHaveClass(/closed/);
    await page.keyboard.press('KeyH');
    await expect(help).toHaveClass(/closed/);

    // Кнопка стоит над списком тел и подписана словом: без неё о клавише H
    // узнать неоткуда.
    const toggle = page.locator('.help-toggle');
    await expect(toggle).toHaveText('Справка ?');
    await toggle.click();
    await expect(help).not.toHaveClass(/closed/);
    await expect(toggle).toHaveText('Справка ✕');

    // Порядок в колонке: поддержка сверху, под ней справка, под ней список тел.
    const order = await page.locator('#bodies > button').allTextContents();
    expect(order).toEqual(['Экскурсия ▶', 'Снимок ⤓', 'Поддержать ♥', 'Справка ✕', 'Тела ☰']);
  });

  test('карточка поддержки открывается, закрывается и ведёт на CloudTips', async ({ page }) => {
    await openScene(page);

    const support = page.locator('#support');
    const toggle = page.locator('.support-toggle');

    // На старте карточки нет: она открывается только по требованию.
    await expect(support).toHaveClass(/closed/);
    await expect(toggle).toHaveText('Поддержать ♥');

    await toggle.click();
    await expect(support).not.toHaveClass(/closed/);
    await expect(toggle).toHaveText('Поддержать ✕');
    await expect(page.getByRole('heading', { name: 'Поддержать автора' })).toBeVisible();

    // Ссылка ведёт куда заявлено и открывается без доступа к нашей вкладке:
    // без rel="noopener" открытая страница может подменить её содержимое.
    const pay = support.locator('.support-pay');
    await expect(pay).toHaveAttribute('href', 'https://pay.cloudtips.ru/p/86c3292c');
    await expect(pay).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(pay).toHaveAttribute('target', '_blank');

    // QR-код именно загрузился, а не просто присутствует в разметке: битая
    // картинка отрисовалась бы пустым местом и заметна была бы не сразу.
    const qrLoaded = await support
      .locator('.support-qr img')
      .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
    expect(qrLoaded).toBe(true);

    await page.keyboard.press('Escape');
    await expect(support).toHaveClass(/closed/);
  });

  test('справка и поддержка не открываются одновременно', async ({ page }) => {
    // Обе карточки занимают середину экрана: открытые разом легли бы одна
    // поверх другой.
    await openScene(page);

    const help = page.locator('#help');
    const support = page.locator('#support');

    await page.locator('.support-toggle').click();
    await expect(support).not.toHaveClass(/closed/);

    await page.locator('.help-toggle').click();
    await expect(help).not.toHaveClass(/closed/);
    await expect(support).toHaveClass(/closed/);

    await page.locator('.support-toggle').click();
    await expect(support).not.toHaveClass(/closed/);
    await expect(help).toHaveClass(/closed/);
  });

  test('список тел сворачивается и разворачивается', async ({ page }) => {
    await openScene(page);

    const panel = page.locator('#bodies');
    await expect(panel).toHaveClass(/closed/);

    await page.keyboard.press('KeyB');
    await expect(panel).not.toHaveClass(/closed/);

    // Двадцать пять тел: Солнце, восемь планет, Плутон, четырнадцать
    // спутников - Луна и по одному-четыре у Марса, Юпитера, Сатурна, Урана,
    // Нептуна и Плутона - и комета Галлея последней строкой.
    await expect(page.locator('.bodies-row')).toHaveCount(25);
    await expect(page.locator('.bodies-row .distance').first()).not.toHaveText('-');

    await page.keyboard.press('KeyB');
    await expect(panel).toHaveClass(/closed/);
  });

  /*
   * Ноутбучный экран: 1366x768, а за вычетом вкладок и адресной строки около
   * 657. Колонка кнопок на таком экране не влезает целиком, и всё лишнее
   * флекс вычитает из единственного, что умеет сжиматься, - из списка тел.
   * Однажды список сжался так до одной строки: спрятанная карточка тела
   * держала под ним 269 пикселей пустоты, а видимая, не умея сжиматься,
   * оставляла ему меньше строки.
   *
   * Пороги - сколько строк влезает под восемь кнопок колонки: на 657 это
   * четыре с лишним, и больше не выйдет, пока кнопок столько же.
   *
   * На 900 места хватает обоим, и карточка обязана влезть целиком, без
   * прокрутки: список уступает первым. Однажды он уступал не первым, а
   * наравне, и карточка теряла последние строки вместе с приметой тела.
   */
  const expected = [
    { height: 900, alone: 9, withCard: 3, cardWhole: true },
    { height: 768, alone: 7, withCard: 3, cardWhole: false },
    { height: 657, alone: 4, withCard: 2, cardWhole: false },
  ];
  for (const { height, alone, withCard, cardWhole } of expected) {
    test(`список тел на экране 1366x${height} показывает несколько строк`, async ({ page }) => {
      await page.setViewportSize({ width: 1366, height });
      const errors = await openScene(page);

      await page.keyboard.press('KeyB');
      const list = page.locator('.bodies-list');
      await expect(list).toBeVisible();

      const visibleRows = () =>
        list.evaluate((element) => {
          const row = element.querySelector('.bodies-row')!.getBoundingClientRect().height;
          return { px: element.clientHeight, rows: Math.floor(element.clientHeight / row) };
        });

      const before = await visibleRows();
      expect(before.rows, `тело не выбрано, видно ${before.px} px`).toBeGreaterThanOrEqual(alone);

      // Выбранное тело выводит под списком карточку, и список обязан остаться
      // списком: следующее тело выбирают из него же.
      await list.locator('.bodies-row').nth(1).click();
      const card = page.locator('.body-card');
      await expect(card.locator('.body-card-header b')).toHaveText('Меркурий');

      const after = await visibleRows();
      expect(after.rows, `тело выбрано, видно ${after.px} px`).toBeGreaterThanOrEqual(withCard);
      const box = (await card.boundingBox())!;
      expect(box.y + box.height, 'карточка должна быть в кадре').toBeLessThanOrEqual(height);
      if (cardWhole) {
        const { scroll, client } = await card.evaluate((element) => ({
          scroll: element.scrollHeight,
          client: element.clientHeight,
        }));
        expect(scroll, `карточка прокручивается: ${scroll} px в окне ${client}`).toBeLessThanOrEqual(
          client,
        );
      }

      expectNoErrors(errors);
    });
  }

  for (const height of [1080, 768, 657]) {
    test(`окна выбора на экране 1366x${height} одного размера`, async ({ page }) => {
      await page.setViewportSize({ width: 1366, height });
      const errors = await openScene(page);
      await expectEqualPickers(page);
      expectNoErrors(errors);
    });
  }

  test('карточка тела показывает справочные величины', async ({ page }) => {
    await openScene(page);

    const card = page.locator('.body-card');
    await expect(card).toHaveClass(/hidden/);

    await page.evaluate(() => window.sim.travelTo('saturn'));
    await waitForArrival(page, 'saturn');

    await expect(card).not.toHaveClass(/hidden/);
    await expect(card.locator('.body-card-header b')).toHaveText('Сатурн');

    const rows = await card.locator('.body-card-row').allTextContents();
    // Разряды разделены неразрывным пробелом - для сравнения приводим к обычному.
    const text = rows.join(' | ').replace(/ /g, ' ');

    // Радиус и масса - справочные, сутки короче земных, год - двадцать девять с
    // половиной лет. Это и есть Сатурн, а не «какая-то планета».
    expect(text).toContain('60 268 км');
    expect(text).toMatch(/5\.68·10²⁶ кг/);
    expect(text).toMatch(/10 ч \d+ мин/);
    expect(text).toContain('29.5 года');

    // Справочное: то, что не выводится из механики и берётся из таблицы.
    expect(text).toContain('−139 °C');
    expect(text).toContain('водород 96 %');
    expect(text).toMatch(/спутников\s*\d+/);
    await expect(card.locator('.body-card-note')).toContainText('плотность');

    // Раскрытие колец к Солнцу - величина живая, она меняется с датой, поэтому
    // проверяется вид, а не число. Без неё тусклые кольца у равноденствия
    // читаются как поломка: узнать, что света им досталось на порядок меньше
    // обычного, было бы неоткуда.
    await expect(
      card.locator('.body-card-row:not(.hidden)', { hasText: 'кольца к Солнцу' }).locator('.value'),
    ).toHaveText(/^\d+\.\d°$/);
  });

  test('в карточке спутника нет строки о его собственных спутниках', async ({ page }) => {
    await openScene(page);

    // У Луны своих спутников не бывает, и прочерк на этом месте читался бы как
    // «ноль» - утверждение, которого никто не делал. Строка убирается целиком.
    await page.evaluate(() => window.sim.travelTo('moon'));
    await waitForArrival(page, 'moon');

    const card = page.locator('.body-card');
    await expect(card.locator('.body-card-header b')).toHaveText('Луна');

    const shown = await card.locator('.body-card-row:not(.hidden)').allTextContents();
    expect(shown.join(' | ')).not.toContain('спутников');
    // По той же причине убрана и строка о кольцах: их у Луны нет.
    expect(shown.join(' | ')).not.toContain('кольца');
    // И строка о хвосте: она только у комет.
    expect(shown.join(' | ')).not.toContain('хвост');
    await expect(card.locator('.body-card-views')).toBeHidden();
    await expect(card.locator('.body-card-note')).toContainText('одной стороной');
  });

  test('карточка кометы вдали от Солнца объясняет, почему нет хвоста', async ({ page }) => {
    await openScene(page);
    // Сентябрь 2026 года: Галлея за афелием, в 35 а.е. от Солнца. Хвоста в
    // сцене нет, и это верно - но без слова в карточке голое тёмное ядро
    // читается как непрорисованная планета.
    await pauseAt(page, '2026-09-19T00:00:00Z');
    // Долететь не нужно: карточка показывает тело, к которому летим, а строки
    // кометы зависят от её расстояния до Солнца, не до камеры. Перелёт на
    // 35 а.е. в программном растеризаторе съел бы почти весь срок теста.
    await page.evaluate(() => window.sim.travelTo('halley'));

    const card = page.locator('.body-card');
    await expect(card.locator('.body-card-header b')).toHaveText('Комета Галлея');

    const value = (label: string) =>
      card.locator('.body-card-row:not(.hidden)', { hasText: label }).locator('.value');
    await expect(value('хвост')).toHaveText(/^нет: дальше 3 а\.е\./);
    // Кома и перигелийная жара здесь были бы неправдой: испаряться нечему.
    await expect(value('атмосфера')).toHaveText(/^нет/);
    await expect(value('температура')).toHaveText(/^−22\d °C$/);

    // Карточка зовёт туда, где хвост есть, и зовёт делом, а не словом.
    const views = card.locator('.body-card-views');
    await expect(views).toBeVisible();
    await expect(views.locator('button')).toHaveText([
      'Комета Галлея в перигелии',
      'Комета Галлея: приход 1910 года',
    ]);

    await views.locator('[data-view="halley-1986"]').click();
    await expect(page.locator('[data-scenario="halley-1986"]')).toHaveClass(/active/);
    const year = await page.evaluate(() => window.sim.clock.date.getUTCFullYear());
    expect(year).toBe(1986);
  });

  test('карточка кометы в перигелии показывает хвост и кому', async ({ page }) => {
    await openScene(page);
    await pauseAt(page, '1986-02-08T00:00:00Z');
    await page.evaluate(() => window.sim.travelTo('halley'));

    const card = page.locator('.body-card');
    await expect(card.locator('.body-card-header b')).toHaveText('Комета Галлея');

    const value = (label: string) =>
      card.locator('.body-card-row:not(.hidden)', { hasText: label }).locator('.value');
    await expect(value('хвост')).toHaveText(/^есть/);
    await expect(value('атмосфера')).toContainText('кома');
    await expect(value('температура')).toHaveText(/^\+\d+ °C$/);
    // Хвост и так на экране - звать за ним некуда.
    await expect(card.locator('.body-card-views')).toBeHidden();
  });

  test('щелчок по расстоянию меняет единицы во всех местах сразу', async ({ page }) => {
    await openScene(page);
    await page.evaluate(() => window.sim.travelTo('saturn'));
    await waitForArrival(page, 'saturn');
    await page.keyboard.press('KeyB');

    const hudDistance = page.locator('#hud b.unit-toggle').first();
    const cardDistance = page.locator('.body-card-row', { hasText: 'от Солнца' }).locator('.value');
    const listDistance = page.locator('#bodies .bodies-row .distance').first();

    // Состояние по умолчанию - единица по величине: до Сатурна это а.е.
    await expect(hudDistance).toContainText('а.е.');

    // Километры. Проверяются все три места сразу: смысл переключателя в том,
    // что интерфейс перестаёт мерить одно и то же разными мерами.
    await hudDistance.click();
    await expect(hudDistance).toContainText('км');
    await expect(cardDistance).toContainText('км');
    await expect(listDistance).toContainText('км');

    await hudDistance.click();
    await expect(hudDistance).toContainText('а.е.');
    await expect(cardDistance).toContainText('а.е.');

    // Световые минуты - ради них задача и заведена: «восемь световых минут до
    // Солнца» говорит о масштабе больше, чем сто сорок девять миллионов км.
    await hudDistance.click();
    await expect(hudDistance).toContainText('св.');
    await expect(cardDistance).toContainText('св.');
    await expect(listDistance).toContainText('св.');

    // Круг замыкается на исходном состоянии.
    await hudDistance.click();
    await expect(hudDistance).toContainText('а.е.');
  });

  test('масштаб времени переключается клавишами и виден в HUD', async ({ page }) => {
    await openScene(page);

    const hud = page.locator('#hud');
    // Стартовая ступень - сутки в секунду: система сразу движется.
    await expect(hud).toContainText('1 сут/с');

    await page.keyboard.press('Comma');
    await expect(hud).toContainText('6 ч/с');

    await page.keyboard.press('Comma');
    await expect(hud).toContainText('1 ч/с');

    await page.keyboard.press('Period');
    await page.keyboard.press('Period');
    await page.keyboard.press('Period');
    await expect(hud).toContainText('7 сут/с');

    await page.keyboard.press('KeyP');
    await expect(hud).toContainText('пауза');
  });

  test('ползунок скорости времени меняет масштаб и показывает его в HUD', async ({ page }) => {
    await openScene(page);

    // Открываем справку, чтобы ползунок стал доступен для взаимодействия.
    await page.keyboard.press('KeyH');

    const slider = page.locator('#time-slider-container input[type="range"]');
    await expect(slider).toBeVisible();

    // Сдвигаем ползунок в крайнее правое положение. TIME_SCALES имеет 14 значений (0..13)
    await slider.fill('13');

    const hud = page.locator('#hud');
    await expect(hud).toContainText('20 лет/с');
  });

  test('подписи тел выключаются клавишей', async ({ page }) => {
    await openScene(page);
    await pauseAt(page, '2026-08-14T12:00:00Z');

    const label = page.locator('.label', { hasText: 'Солнце' });
    await expect(label).toBeVisible();

    await page.keyboard.press('KeyL');
    await expect(label).toBeHidden();

    await page.keyboard.press('KeyL');
    await expect(label).toBeVisible();
  });

  test('множитель размеров растит тела и Солнце, сохраняя вид', async ({ page }) => {
    await openScene(page);
    await page.evaluate(() => window.sim.travelTo('earth'));
    await waitForArrival(page, 'earth');

    const before = await page.evaluate(() => ({
      size: window.sim.system.getSizeExaggeration(),
      earth: window.sim.system.find('earth').visualRadius,
      sun: window.sim.sun.visualRadius,
      radii:
        window.sim.flight.worldPosition.distanceTo(window.sim.system.find('earth').worldPosition) /
        window.sim.system.find('earth').visualRadius,
    }));

    await page.keyboard.press('KeyM');
    await waitForFrames(page, 3);

    const after = await page.evaluate(() => ({
      size: window.sim.system.getSizeExaggeration(),
      earth: window.sim.system.find('earth').visualRadius,
      sun: window.sim.sun.visualRadius,
      radii:
        window.sim.flight.worldPosition.distanceTo(window.sim.system.find('earth').worldPosition) /
        window.sim.system.find('earth').visualRadius,
    }));

    expect(before.size).toBe(1);
    expect(after.size).toBe(10);
    expect(after.earth / before.earth).toBeCloseTo(10, 5);
    // Солнце растёт вместе с планетами, иначе Юпитер станет крупнее звезды.
    expect(after.sun / before.sun).toBeCloseTo(10, 5);
    // Камера отодвинута во столько же раз: вид в кадре не изменился.
    expect(after.radii).toBeCloseTo(before.radii, 1);

    await expect(page.locator('#hud')).toContainText('×10');
  });

  test('HUD показывает систему отсчёта и ближайшее тело', async ({ page }) => {
    await openScene(page);

    const hud = page.locator('#hud');
    await expect(hud).toContainText('отсчёт');
    await expect(hud).toContainText('Солнце');

    await page.evaluate(() => window.sim.travelTo('mars'));
    await waitForArrival(page, 'mars');

    await expect(hud).toContainText('Марс');
  });

  test('кнопка снимка отдаёт файл с картинкой по размеру экрана', async ({ page }) => {
    await openScene(page);

    const viewportSize = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')!;
      return { width: canvas.width, height: canvas.height };
    });

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Снимок ⤓' }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^solar-system-.*\.png$/);

    const path = await download.path();
    expect(path).toBeTruthy();

    const fs = await import('node:fs');
    const buffer = fs.readFileSync(path!);
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

    // Проверка сигнатуры PNG
    expect(view.getUint32(0, false)).toBe(0x89504e47);

    const width = view.getUint32(16, false);
    const height = view.getUint32(20, false);

    expect(width).toBe(viewportSize.width);
    expect(height).toBe(viewportSize.height);

    // Размер картинки о её содержимом не говорит ничего. Буфер WebGL живёт
    // до вывода кадра и очищается сразу после: снимок, снятый мимо кадрового
    // цикла, выходит правильных 900×600 и при этом прозрачным. Измерено - 13 КБ
    // пустоты против 307 КБ настоящего кадра, и обе картинки одного размера.
    const lit = await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = 'data:image/png;base64,' + base64;
      await image.decode();

      const sheet = document.createElement('canvas');
      sheet.width = image.width;
      sheet.height = image.height;
      const context = sheet.getContext('2d')!;
      context.drawImage(image, 0, 0);

      const { data } = context.getImageData(0, 0, sheet.width, sheet.height);
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3]! > 0 && data[i]! + data[i + 1]! + data[i + 2]! > 0) count += 1;
      }
      return count;
    }, buffer.toString('base64'));

    expect(lit, 'снимок пуст: на нём нет ни одной светящейся точки').toBeGreaterThan(100);
  });

  test('клавиша K делает снимок так же, как кнопка', async ({ page }) => {
    await openScene(page);

    const download = page.waitForEvent('download');
    await page.keyboard.press('KeyK');

    expect((await download).suggestedFilename()).toMatch(/^solar-system-.+[.]png$/);
  });
});
