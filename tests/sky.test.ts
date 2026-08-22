import { describe, expect, it } from 'vitest';

import { CONSTELLATIONS, NAMED_STARS, figureVertices } from '../src/data/sky';
import { starCatalog } from '../src/data/stars';

/**
 * Разметка неба обещает, что показывает настоящие звёзды, а не свои.
 *
 * Проверяется здесь именно это: каждая вершина фигуры и каждая подпись должны
 * попадать в звезду каталога. Разметка и каталог делаются одним скриптом из
 * одного источника — но ровно этого «должны» ни скрипт, ни типы не выражают,
 * а стоит вершине съехать, как линия пройдёт мимо звезды, и небо начнёт врать.
 */

/**
 * Допуск совпадения, радианы: одна угловая минута.
 *
 * Каталог упакован по шесть байт на звезду, и его координаты округлены до
 * секунды дуги с небольшим; разметка хранит их полностью. Минута — заведомо
 * больше этой разницы и заведомо меньше расстояния до соседней яркой звезды.
 */
const TOLERANCE = (1 / 60) * (Math.PI / 180);

/** Угол между двумя точками неба, радианы. */
function separation(ra1: number, dec1: number, ra2: number, dec2: number): number {
  const cos =
    Math.sin(dec1) * Math.sin(dec2) + Math.cos(dec1) * Math.cos(dec2) * Math.cos(ra1 - ra2);
  return Math.acos(Math.min(1, Math.max(-1, cos)));
}

/** Ближайшая звезда каталога к точке неба: расстояние в радианах и величина. */
function nearestStar(ra: number, dec: number): { separation: number; magnitude: number } {
  const catalog = starCatalog();
  let best = Infinity;
  let magnitude = Infinity;

  for (let i = 0; i < catalog.count; i += 1) {
    const angle = separation(ra, dec, catalog.rightAscension[i]!, catalog.declination[i]!);
    if (angle < best) {
      best = angle;
      magnitude = catalog.magnitude[i]!;
    }
  }

  return { separation: best, magnitude };
}

describe('разметка неба', () => {
  it('в каждой вершине созвездия стоит звезда каталога', () => {
    for (const figure of CONSTELLATIONS) {
      for (const [ra, dec] of figureVertices(figure)) {
        const found = nearestStar(ra, dec);
        expect(
          found.separation,
          `${figure.name}: вершине ${ra.toFixed(4)}, ${dec.toFixed(4)} не нашлось звезды`,
        ).toBeLessThan(TOLERANCE);
      }
    }
  });

  it('вершины фигур — заметные глазом звёзды, а не случайные точки', () => {
    for (const figure of CONSTELLATIONS) {
      for (const [ra, dec] of figureVertices(figure)) {
        // Слабее пятой величины в фигуру попасть нечему: рисунок созвездия
        // складывается из того, что видно без всякого напряжения.
        expect(nearestStar(ra, dec).magnitude, figure.name).toBeLessThan(5);
      }
    }
  });

  it('под каждой подписью — своя звезда, и все они ярче второй величины', () => {
    expect(NAMED_STARS.length).toBeGreaterThanOrEqual(30);

    for (const star of NAMED_STARS) {
      const found = nearestStar(star.ra, star.dec);
      expect(found.separation, star.name).toBeLessThan(TOLERANCE);
      expect(found.magnitude, star.name).toBeCloseTo(star.magnitude, 1);
      expect(star.magnitude, star.name).toBeLessThan(2);
    }
  });

  it('имена не повторяются и не садятся друг на друга', () => {
    const names = NAMED_STARS.map((star) => star.name);
    expect(new Set(names).size).toBe(names.length);

    // Две подписи в одной точке неба — это α Центавра, записанная в каталоге
    // двумя компонентами. Показывать надо одну.
    for (let i = 0; i < NAMED_STARS.length; i += 1) {
      for (let j = i + 1; j < NAMED_STARS.length; j += 1) {
        const a = NAMED_STARS[i]!;
        const b = NAMED_STARS[j]!;
        expect(
          separation(a.ra, a.dec, b.ra, b.dec),
          `${a.name} и ${b.name} стоят в одной точке`,
        ).toBeGreaterThan(0.004);
      }
    }
  });

  it('созвездия на месте, а линии в них не длиннее настоящих', () => {
    const names = CONSTELLATIONS.map((figure) => figure.name);
    expect(names).toContain('Орион');
    expect(names).toContain('Большая Медведица');
    expect(names).toContain('Кассиопея');

    for (const figure of CONSTELLATIONS) {
      expect(figure.segments.length, figure.name).toBeGreaterThan(1);

      for (const [ra1, dec1, ra2, dec2] of figure.segments) {
        const length = (separation(ra1, dec1, ra2, dec2) * 180) / Math.PI;
        expect(length, figure.name).toBeGreaterThan(0.5);
        expect(length, figure.name).toBeLessThan(35);
      }
    }
  });
});
