import { describe, expect, it } from 'vitest';

import { APPEARANCE } from '../src/data/appearance';
import { packBands } from '../src/scene/rings';

const saturn = APPEARANCE.saturn!.rings!;
const uranus = APPEARANCE.uranus!.rings!;

describe('системы колец', () => {
  it('полосы лежат внутри заявленных границ системы', () => {
    for (const system of [saturn, uranus]) {
      for (const band of system.bands) {
        expect(band.inner).toBeGreaterThanOrEqual(system.inner - 1);
        expect(band.outer).toBeLessThanOrEqual(system.outer + 1);
        expect(band.outer).toBeGreaterThan(band.inner);
      }
    }
  });

  it('кольца Сатурна начинаются выше предела Роша и не задевают планету', () => {
    // Внутренний край кольца C — 74 700 км, экваториальный радиус 60 268 км.
    expect(saturn.inner).toBeGreaterThan(60268);
  });

  it('щель Энке задана отрицательной плотностью внутри кольца A', () => {
    const encke = saturn.bands.find((b) => b.density < 0)!;
    const ringA = saturn.bands.find((b) => b.inner === 122170)!;

    expect(encke).toBeDefined();
    expect(encke.inner).toBeGreaterThan(ringA.inner);
    expect(encke.outer).toBeLessThan(ringA.outer);
    // Щель уже полукилометра плотности не пробьёт: она должна вычитать
    // почти всё вещество кольца A на своём месте.
    expect(ringA.density + encke.density).toBeLessThan(0.2);
  });

  it('деление Кассини разделяет кольца B и A и не пустое', () => {
    const cassini = saturn.bands.find((b) => b.inner === 117580)!;

    expect(cassini.density).toBeGreaterThan(0);
    expect(cassini.density).toBeLessThan(0.2);
    expect(cassini.outer).toBe(122170);
  });

  it('кольца Урана узкие: ширина от единиц до сотни километров', () => {
    const widths = uranus.bands.map((b) => b.outer - b.inner);

    expect(Math.min(...widths)).toBeLessThan(5);
    expect(Math.max(...widths)).toBeLessThan(100);
    // Эпсилон — самое широкое.
    expect(Math.max(...widths)).toBe(uranus.bands.at(-1)!.outer - uranus.bands.at(-1)!.inner);
  });

  it('кольца Урана темнее сатурновых', () => {
    // Альбедо вещества входит в цвет: у Урана оно почти угольное.
    const brightness = (color: number) =>
      ((color >> 16) & 255) + ((color >> 8) & 255) + (color & 255);

    expect(brightness(uranus.color)).toBeLessThan(brightness(saturn.color) * 0.6);
  });

  it('упаковка полос сохраняет порядок и значения', () => {
    const packed = packBands(saturn.bands);

    expect(packed).toHaveLength(saturn.bands.length);
    expect(packed[0]!.x).toBe(saturn.bands[0]!.inner);
    expect(packed[0]!.y).toBe(saturn.bands[0]!.outer);
    expect(packed[0]!.z).toBe(saturn.bands[0]!.density);
    expect(packed[0]!.w).toBe(saturn.bands[0]!.edge);
  });
});
