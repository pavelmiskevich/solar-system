import { expect, type Page } from '@playwright/test';

/**
 * Общая часть сквозных тестов.
 *
 * Сцена живёт в requestAnimationFrame, и почти всё в ней — процесс, а не
 * состояние: перелёт длится секунды, экспозиция подтягивается полторы секунды,
 * подписи проявляются. Поэтому тесты почти нигде не проверяют мгновенный
 * снимок, а ждут выполнения условия — как ждал бы человек, глядя на экран.
 */

/**
 * Отладочный доступ к сцене — он есть только в режиме разработки.
 *
 * Тип нарочно нестрогий: описывать здесь половину модулей проекта значило бы
 * держать вторую копию их интерфейсов и править её при каждом изменении.
 */
declare global {
  interface Window {
    sim: Record<string, any>;
  }
}

export interface OpenOptions {
  /**
   * Адрес вместо корня страницы.
   *
   * Нужен там, где проверяется восстановление вида по ссылке: открыть
   * адрес со состоянием — это и есть проверяемое действие.
   */
  url?: string;
  /**
   * Оставить справку открытой. Она показывается при загрузке и накрывает
   * экран, поэтому всем тестам, кроме проверки самой справки, она мешает.
   */
  keepHelp?: boolean;
}

/** Открыть сцену и дождаться первого кадра. */
export async function openScene(page: Page, options: OpenOptions = {}): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));

  await page.goto(options.url ?? '/');

  // Отладочный доступ появляется последним в main.ts — значит, модуль
  // выполнился целиком и первый кадр отрисован.
  await page.waitForFunction(() => typeof window.sim === 'object' && window.sim !== null, null, {
    timeout: 60_000,
  });
  await waitForFrames(page, 3);

  if (!options.keepHelp) {
    await page.keyboard.press('Escape');
    await page.locator('#help.closed').waitFor();
  }

  return errors;
}

/** Дождаться, пока сцена отрисует несколько кадров подряд. */
export async function waitForFrames(page: Page, count = 2): Promise<void> {
  await page.evaluate(async (frames) => {
    for (let i = 0; i < frames; i += 1) {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    }
  }, count);
}

/** Остановить время: без паузы тела уезжают между проверками. */
export async function pauseAt(page: Page, iso: string): Promise<void> {
  await page.evaluate((date) => {
    window.sim.clock.paused = true;
    window.sim.setDate(date);
  }, iso);
  await waitForFrames(page, 2);
}

/** Расстояние от камеры до центра тела в его видимых радиусах. */
export async function distanceInRadii(page: Page, id: string): Promise<number> {
  return page.evaluate((bodyId) => {
    const sim = window.sim;
    const body =
      bodyId === 'sun'
        ? { worldPosition: sim.sun.worldPosition, visualRadius: sim.sun.visualRadius }
        : sim.system.find(bodyId);
    if (!body) return Number.NaN;
    return sim.flight.worldPosition.distanceTo(body.worldPosition) / body.visualRadius;
  }, id);
}

/**
 * Дождаться, пока экспозиция перестанет меняться.
 *
 * Ждать её фиксированной паузой нельзя. Адаптация идёт по `dt` кадрового цикла,
 * а тот ограничен сверху (иначе после переключения вкладки сцена скакнула бы
 * на полчаса вперёд). Пока кадры идут часто, шаг по времени совпадает с
 * настенным; но когда воркеры Playwright делят одну видеокарту и частота
 * падает, ограничение срабатывает, и адаптация отстаёт от секундомера в разы.
 * Отсюда и брались падения «на ровном месте» в полном прогоне при зелёном
 * одиночном запуске.
 *
 * Поэтому ждём не время, а результат: значение считается установившимся, когда
 * несколько замеров подряд отличаются меньше чем на процент.
 */
export async function waitForStableExposure(page: Page, timeout = 40_000): Promise<number> {
  return page.evaluate(
    async (limit) => {
      /**
       * Замеры разносим во времени. Сравнивать соседние кадры бессмысленно:
       * при постоянной времени 1.5 с и шестидесяти кадрах в секунду шаг за
       * кадр составляет около процента, то есть попадает в любой разумный
       * порог «не меняется» — и разгар адаптации не отличить от покоя.
       * За четверть секунды шаг составляет уже полтора десятка процентов,
       * и разница видна безошибочно.
       */
      const SAMPLE_MS = 250;
      const STABLE_SAMPLES = 6;
      const TOLERANCE = 0.005;

      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      const read = () => window.sim.exposure.value as number;

      const window_: number[] = [];
      const deadline = Date.now() + limit;

      while (Date.now() < deadline) {
        await sleep(SAMPLE_MS);
        window_.push(read());
        if (window_.length > STABLE_SAMPLES) window_.shift();

        if (window_.length === STABLE_SAMPLES) {
          const lo = Math.min(...window_);
          const hi = Math.max(...window_);
          if (hi - lo <= lo * TOLERANCE) return hi;
        }
      }

      // Не устоялось за отведённое время — отдаём последнее значение, чтобы
      // тест упал на осмысленной проверке, а не на таймауте помощника.
      return read();
    },
    timeout,
  );
}

/** Дождаться конца перелёта. */
export async function waitForArrival(page: Page, id: string): Promise<void> {
  await page.waitForFunction(
    (bodyId) => window.sim.travel.isActive === false && window.sim.frame.targetId === bodyId,
    id,
    { timeout: 60_000 },
  );
}

/** Экранные координаты центра тела — по той же проекции, что и подписи. */
export async function screenPositionOf(
  page: Page,
  id: string,
): Promise<{ x: number; y: number } | null> {
  return page.evaluate((bodyId) => {
    const sim = window.sim;
    const body = sim.system.find(bodyId);
    if (!body) return null;

    const element = sim.viewport.renderer.domElement;
    const projected = body.group.position.clone().project(sim.viewport.camera);
    if (projected.z > 1) return null;

    return {
      x: (projected.x * 0.5 + 0.5) * element.clientWidth,
      y: (0.5 - projected.y * 0.5) * element.clientHeight,
    };
  }, id);
}

/**
 * Точка кадра, где заведомо нет ни одного тела.
 *
 * Нужна проверкам наведения: «пустой угол» пустой не всегда — какая-нибудь
 * далёкая планета стоит там точкой в два пикселя, и допуск наведения её
 * захватывает. Точка выбирается по сетке как самая дальняя от всех тел сразу,
 * поэтому не зависит ни от даты, ни от того, куда смотрит камера.
 *
 * Интерфейс — такая же помеха, как далёкая планета. Кнопки стоят по углам,
 * и у них свой указатель: точка под кнопкой не пустая, даже если тел рядом
 * нет. Поэтому кандидаты, под которыми оказалась разметка, отбрасываются
 * сразу — иначе добавление кнопки роняет проверки наведения, к которым она
 * не имеет отношения.
 */
export async function emptyScreenPoint(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(() => {
    const sim = window.sim;
    const element = sim.viewport.renderer.domElement;
    const width = element.clientWidth;
    const height = element.clientHeight;

    const bodies: { x: number; y: number }[] = [];
    for (const entry of sim.labels.entries) {
      const projected = entry.source.renderPosition.clone().project(sim.viewport.camera);
      if (projected.z > 1) continue;
      bodies.push({
        x: (projected.x * 0.5 + 0.5) * width,
        y: (0.5 - projected.y * 0.5) * height,
      });
    }

    /** Есть ли под точкой что-то из интерфейса. */
    const covered = (x: number, y: number): boolean => {
      const top = document.elementFromPoint(x, y);
      if (top === null) return false;

      // Пустыми считаются только холст сцены и слой подписей: у подписи
      // свой указатель, у кнопок свой, и то и другое ломает замер.
      return !(top === element || top.id === 'overlay' || top.id === 'panel');
    };

    let best = { x: width * 0.5, y: height * 0.5 };
    let bestDistance = -1;
    for (let gx = 1; gx < 12; gx += 1) {
      for (let gy = 1; gy < 12; gy += 1) {
        const x = (width * gx) / 12;
        const y = (height * gy) / 12;
        if (covered(x, y)) continue;

        let nearest = Infinity;
        for (const body of bodies) {
          nearest = Math.min(nearest, Math.hypot(body.x - x, body.y - y));
        }
        if (nearest > bestDistance) {
          bestDistance = nearest;
          best = { x, y };
        }
      }
    }
    return best;
  });
}

/** Проверка, что консоль чистая: в сцене ошибка шейдера равносильна пустому кадру. */
export function expectNoErrors(errors: string[]): void {
  expect(errors, `в консоли ошибки:\n${errors.join('\n')}`).toEqual([]);
}

/**
 * Чем перекрыта подпись тела — или `null`, если по ней можно щёлкнуть.
 *
 * Подписи живут в том же слое, что колонка кнопок у правого края, и колонка
 * лежит выше. Стоит добавить в неё кнопку, как всё, что ниже, съезжает на
 * подпись, оказавшуюся в том углу, — щелчок по ней достаётся кнопке. Тест,
 * который просто щёлкает по подписи, узнаёт об этом девяностасекундным
 * таймаутом и жалобой на перехват; эта проверка говорит то же самое сразу и
 * словами.
 */
export async function coverOfLabel(page: Page, name: string): Promise<string | null> {
  return page.evaluate((bodyName) => {
    const label = Array.from(document.querySelectorAll('.label')).find(
      (el) => (el.querySelector('b')?.textContent ?? '').trim() === bodyName,
    );
    if (!label) return `подписи «${bodyName}» нет в кадре`;

    const box = label.getBoundingClientRect();
    const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    if (top !== null && (top === label || label.contains(top))) return null;

    const covering = top?.closest('.bodies-toggle, .bodies-list, .body-card, .label') ?? top;
    return `${covering?.tagName.toLowerCase() ?? 'ничто'}.${covering?.className ?? ''} «${(
      covering?.textContent ?? ''
    ).trim()}»`;
  }, name);
}

/** Яркость кадра по клеткам и средний цвет — чем меряется тень в сцене. */
export interface FrameLight {
  /** Самая тёмная клетка. */
  min: number;
  /** Медиана по клеткам: устойчива к одиночному пятну и к звёздам в углах. */
  median: number;
  /** Средний цвет области, 0…255 по каналам. */
  red: number;
  green: number;
  blue: number;
}

/**
 * Померить свет в середине кадра.
 *
 * Тень — единственное, что видно в затмении, и проверять её по внутренним
 * величинам нельзя: затенение живёт в шейдере, наружу не выходит и в
 * `window.sim` его нет. Остаются пиксели — то же, что видит человек.
 *
 * Меряется клетками, а не пикселями: облака, материки и океан дают разброс в
 * разы на соседних пикселях, а тень — это плавное потемнение области в
 * тысячи километров. Клетка усредняет первое и сохраняет второе.
 *
 * @param radiusFraction полуразмер области в долях высоты кадра
 */
export async function frameLight(
  page: Page,
  radiusFraction = 0.2,
  block = 24,
): Promise<FrameLight> {
  const shot = (await page.screenshot()).toString('base64');

  return page.evaluate(
    async ([base64, radiusFraction, block]) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64 as string}`;
      await image.decode();

      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const { data } = context.getImageData(0, 0, image.width, image.height);

      const cx = image.width / 2;
      const cy = image.height / 2;
      const radius = image.height * (radiusFraction as number);
      const step = block as number;

      const blocks: number[] = [];
      let red = 0;
      let green = 0;
      let blue = 0;
      let samples = 0;

      for (let by = cy - radius; by < cy + radius - step; by += step) {
        for (let bx = cx - radius; bx < cx + radius - step; bx += step) {
          let sum = 0;
          let count = 0;
          for (let y = by; y < by + step; y += 2) {
            for (let x = bx; x < bx + step; x += 2) {
              const i = ((y | 0) * image.width + (x | 0)) * 4;
              red += data[i]!;
              green += data[i + 1]!;
              blue += data[i + 2]!;
              sum += (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
              count += 1;
              samples += 1;
            }
          }
          blocks.push(sum / count);
        }
      }

      blocks.sort((a, b) => a - b);
      return {
        min: blocks[0]!,
        median: blocks[Math.floor(blocks.length / 2)]!,
        red: red / samples,
        green: green / samples,
        blue: blue / samples,
      };
    },
    [shot, radiusFraction, block] as const,
  );
}
