import { expect, test, type Page } from '@playwright/test';

import { expectNoErrors, frameLight, openScene, waitForFrames } from './helpers';

/**
 * Затмения.
 *
 * Тень одного тела на другом — единственное в сцене, что нельзя проверить
 * числами изнутри: затенение считается в шейдере, наружу не выходит, и в
 * `window.sim` его нет. Поэтому здесь меряются пиксели — ровно то, что видит
 * человек, — а сравнение всегда идёт с контрольным кадром: тем же видом на
 * дату без затмения.
 */

/** Двенадцатое августа 2026 года, полное солнечное затмение. */
const SOLAR = '2026-08-12T17:50:00Z';
/** Третье марта 2026 года, полное лунное. */
const LUNAR = '2026-03-03T11:40:00Z';
/** Прохождение тени Ио по Юпитеру. */
const IO_TRANSIT = '2026-08-13T13:40:00Z';

/**
 * Направление от центра тела на точку, куда упирается ось тени.
 *
 * Ось — прямая от Солнца через заслоняющее тело; если она втыкается в шар
 * цели, там полная тень. Возвращает null, когда ось проходит мимо: это и есть
 * ответ «затмения нет».
 */
async function umbraDirection(
  page: Page,
  date: string,
  caster: string,
  target: string,
): Promise<{ x: number; y: number; z: number } | null> {
  return page.evaluate(
    ({ date, caster, target }) => {
      const sim = window.sim;
      sim.setDate(date);
      sim.clock.paused = true;

      const t = sim.system.find(target);
      const c = sim.system.find(caster);
      const sun = sim.sun.worldPosition;

      const cp = c.worldPosition;
      const tp = t.worldPosition;

      let dx = cp.x - sun.x;
      let dy = cp.y - sun.y;
      let dz = cp.z - sun.z;
      const length = Math.hypot(dx, dy, dz);
      dx /= length;
      dy /= length;
      dz /= length;

      const ox = cp.x - tp.x;
      const oy = cp.y - tp.y;
      const oz = cp.z - tp.z;

      const b = 2 * (ox * dx + oy * dy + oz * dz);
      const c2 = ox * ox + oy * oy + oz * oz - t.visualRadius * t.visualRadius;
      const discriminant = b * b - 4 * c2;
      if (discriminant < 0) return null;

      const along = (-b - Math.sqrt(discriminant)) / 2;
      const nx = cp.x + dx * along - tp.x;
      const ny = cp.y + dy * along - tp.y;
      const nz = cp.z + dz * along - tp.z;
      const n = Math.hypot(nx, ny, nz);

      return { x: nx / n, y: ny / n, z: nz / n };
    },
    { date, caster, target },
  );
}

/** Встать над телом в заданном направлении и дать сцене устояться. */
async function lookDown(
  page: Page,
  date: string,
  body: string,
  direction: { x: number; y: number; z: number },
  radii = 3,
): Promise<void> {
  await page.evaluate(
    ({ date, body, direction, radii }) => {
      const sim = window.sim;
      sim.setDate(date);
      sim.clock.paused = true;

      const target = sim.system.find(body);
      const p = target.worldPosition;
      const d = target.visualRadius * radii;
      sim.lookAt(
        [p.x + direction.x * d, p.y + direction.y * d, p.z + direction.z * d],
        [p.x, p.y, p.z],
      );
    },
    { date, body, direction, radii },
  );

  // Экспозиция подтягивается полторы секунды, и без этой паузы яркость кадра
  // мерилась бы на полпути к своему значению.
  await page.waitForTimeout(2500);
  await waitForFrames(page, 3);
}

test.describe('затмения', () => {
  test('тень Луны падает на Землю в день затмения и не падает сутками раньше', async ({
    page,
  }) => {
    const errors = await openScene(page);

    const umbra = await umbraDirection(page, SOLAR, 'moon', 'earth');
    expect(umbra, 'ось тени Луны должна упираться в Землю').not.toBeNull();

    await lookDown(page, SOLAR, 'earth', umbra!);
    const eclipsed = await frameLight(page);

    // Контроль — тот же вид сутками раньше. За сутки Солнце, Земля и её
    // вращение почти не меняются: уходит только Луна, а с ней и тень.
    await lookDown(page, '2026-08-11T17:50:00Z', 'earth', umbra!);
    const control = await frameLight(page);

    expect(control.median, 'контрольный кадр должен быть освещён').toBeGreaterThan(40);
    // Полутень накрывает тысячи километров: освещённость в области падает в разы.
    expect(eclipsed.median).toBeLessThan(control.median * 0.6);
    // А в полной тени Солнце закрыто целиком, и там просто черно.
    expect(eclipsed.min).toBeLessThan(3);

    expectNoErrors(errors);
  });

  test('вне даты затмения ось тени Луны проходит мимо Земли', async ({ page }) => {
    await openScene(page);

    expect(await umbraDirection(page, SOLAR, 'moon', 'earth')).not.toBeNull();
    expect(await umbraDirection(page, '2026-08-19T17:50:00Z', 'moon', 'earth')).toBeNull();
    expect(await umbraDirection(page, '2026-08-05T17:50:00Z', 'moon', 'earth')).toBeNull();
  });

  test('в полном затмении Луна не пропадает, а краснеет', async ({ page }) => {
    const errors = await openScene(page);

    // Ось земной тени проходит в 2 400 км от центра Луны — при её радиусе
    // 1 737 км это значит, что Луна целиком внутри тени: затмение полное.
    const toSun = await page.evaluate((date) => {
      const sim = window.sim;
      sim.setDate(date);
      sim.clock.paused = true;
      const moon = sim.system.find('moon').worldPosition;
      const sun = sim.sun.worldPosition;
      const x = sun.x - moon.x;
      const y = sun.y - moon.y;
      const z = sun.z - moon.z;
      const l = Math.hypot(x, y, z);
      return { x: x / l, y: y / l, z: z / l };
    }, LUNAR);

    await lookDown(page, LUNAR, 'moon', toSun, 3.5);
    const eclipsed = await frameLight(page, 0.25);

    // Через сутки Луна выходит из тени, и это тот же вид на полный диск.
    await lookDown(page, '2026-03-04T11:40:00Z', 'moon', toSun, 3.5);
    const full = await frameLight(page, 0.25);

    expect(full.median, 'вне затмения Луна освещена').toBeGreaterThan(40);
    expect(eclipsed.median).toBeLessThan(full.median * 0.5);
    // Свет в тень приходит сквозь земную атмосферу, и синего в нём не остаётся.
    expect(eclipsed.red).toBeGreaterThan(eclipsed.blue * 2);
    expect(eclipsed.red / eclipsed.blue).toBeGreaterThan(full.red / full.blue);

    expectNoErrors(errors);
  });

  test('тень Ио идёт по облакам Юпитера чёрным пятном', async ({ page }) => {
    const errors = await openScene(page);

    const umbra = await umbraDirection(page, IO_TRANSIT, 'io', 'jupiter');
    expect(umbra, 'тень Ио должна попадать на Юпитер').not.toBeNull();

    await lookDown(page, IO_TRANSIT, 'jupiter', umbra!, 3);
    // Клетка мелкая: пятно тени занимает около десяти пикселей, и клетка в
    // двадцать четыре усреднила бы его с облаками до неразличимости.
    const transit = await frameLight(page, 0.12, 6);

    // Юпитер вшестеро дальше от Солнца, чем Земля, и Солнце для него вшестеро
    // меньше: Ио закрывает его с запасом, полутени почти нет — пятно резкое
    // и чёрное посреди освещённых облаков.
    expect(transit.median, 'облака вокруг пятна освещены').toBeGreaterThan(60);
    expect(transit.min).toBeLessThan(transit.median * 0.3);

    expectNoErrors(errors);
  });
});
