import { describe, expect, it } from 'vitest';

import {
  BODY_CLEARANCE,
  SNAP_TOLERANCE,
  SUN_CLEARANCE,
  TARGET_WIDTH,
  angleBetween,
  choosePlacement,
  heightFor,
  layoutInscription,
  placeShape,
  shapeOf,
  snapToStars,
  type BrightStar,
  type SkyPoint,
} from '../src/core/inscription';

const DEG = Math.PI / 180;
const at = (raDeg: number, decDeg: number): SkyPoint => ({ ra: raDeg * DEG, dec: decDeg * DEG });

describe('надпись на небе', () => {
  it('раскладывает строку по центру, пробел раздвигает слова', () => {
    const one = shapeOf('АБ');
    const two = shapeOf('А Б');
    expect(two.width).toBeGreaterThan(one.width);
    const xs = one.points.map(([x]) => x);
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(0, 6);
  });

  it('приводит строчные к заглавным и отказывается от незнакомых знаков', () => {
    expect(shapeOf('маша').points).toEqual(shapeOf('МАША').points);
    expect(() => shapeOf('A@B')).toThrow(/@/);
  });

  it('подбирает высоту буквы под ширину в 60° и держит её в пределах', () => {
    const word = shapeOf('МАША');
    expect(word.width * heightFor(word)).toBeCloseTo(TARGET_WIDTH, 6);
    expect(heightFor(shapeOf('I'))).toBeCloseTo(20 * DEG, 6);
    expect(heightFor(shapeOf('ПОЗДРАВЛЯЕМ ВСЕХ'))).toBeCloseTo(8 * DEG, 6);
  });

  it('ставит верх надписи к северному полюсу эклиптики', () => {
    const shape = shapeOf('Т');
    const points = placeShape(shape, { centre: at(90, 23.44), height: 10 * DEG });
    // У Т верхняя перекладина выше ножки: её вершины ближе к полюсу эклиптики.
    const pole = at(270, 66.56);
    const top = points.filter((_, i) => shape.points[i]![1] > 0.4);
    const foot = points.filter((_, i) => shape.points[i]![1] < -0.4);
    for (const t of top) for (const f of foot) {
      expect(angleBetween(t, pole)).toBeLessThan(angleBetween(f, pole));
    }
  });

  it('пишет слева направо, если смотреть изнутри сферы', () => {
    // Изнутри восток слева. Центр на эклиптике: «вправо» - к западу, то есть
    // к меньшему прямому восхождению.
    const shape = shapeOf('--');
    const points = placeShape(shape, { centre: at(180, 0), height: 10 * DEG });
    const left = points[0]!;
    const right = points[points.length - 1]!;
    expect(left.ra).toBeGreaterThan(right.ra);
  });

  it('притягивает вершину к близкой яркой звезде и не трогает далёкую', () => {
    const height = 10 * DEG;
    const near: BrightStar = { ...at(10, 0.2), magnitude: 2 };
    const far: BrightStar = { ...at(20, 5), magnitude: 1 };
    const [a, b] = snapToStars([at(10, 0), at(20, 0)], height, [near, far]);
    expect(a).toEqual({ ra: near.ra, dec: near.dec, real: true });
    expect(b).toEqual({ ra: 20 * DEG, dec: 0, real: false });
    // Граница притяжения - доля высоты буквы.
    expect(0.2 * DEG).toBeLessThan(SNAP_TOLERANCE * height);
    expect(5 * DEG).toBeGreaterThan(SNAP_TOLERANCE * height);
  });

  it('не отдаёт одну звезду двум вершинам', () => {
    const star: BrightStar = { ...at(10, 0), magnitude: 1 };
    const [a, b] = snapToStars([at(10, 0.1), at(10, -0.1)], 10 * DEG, [star]);
    expect([a!.real, b!.real].filter(Boolean)).toHaveLength(1);
  });

  it('уводит надпись от Солнца и от планет', () => {
    const stars = syntheticSky();
    const sun = at(0, 0);
    const venus = at(200, -10);
    const shape = shapeOf('МАША');
    const placement = choosePlacement(shape, stars, { sun, others: [venus] });
    expect(angleBetween(placement.centre, sun)).toBeGreaterThanOrEqual(SUN_CLEARANCE);
    for (const point of placeShape(shape, placement)) {
      expect(angleBetween(point, sun)).toBeGreaterThanOrEqual(BODY_CLEARANCE);
      expect(angleBetween(point, venus)).toBeGreaterThanOrEqual(BODY_CLEARANCE);
    }
  });

  it('выбирает одно и то же место при одних и тех же условиях', () => {
    const stars = syntheticSky();
    const avoid = { sun: at(30, 10), others: [] };
    const shape = shapeOf('ПРИВЕТ');
    expect(choosePlacement(shape, stars, avoid)).toEqual(choosePlacement(shape, stars, avoid));
  });

  it('предпочитает место, где вершины встают на звёзды', () => {
    // Звёзды положены ровно в вершины буквы у (120°, 20°): лучшего места нет.
    const shape = shapeOf('Л');
    const target = { centre: at(120, 20), height: heightFor(shape) };
    const stars = placeShape(shape, target).map((p) => ({ ...p, magnitude: 2 }));
    const layout = layoutInscription('Л', stars, { sun: at(300, -20), others: [] });
    expect(layout.vertices.every((v) => v.real)).toBe(true);
  });

  it('ставит надпись в заданное место, если оно указано', () => {
    const layout = layoutInscription('МИР', [], { sun: at(0, 0), others: [] }, at(150, 30));
    expect(angleBetween(layout.placement.centre, at(150, 30))).toBeLessThan(1e-9);
  });

  it('укладывается в срок на настоящем числе ярких звёзд', () => {
    const stars = syntheticSky();
    const started = performance.now();
    layoutInscription('С ДНЁМ', stars, { sun: at(0, 0), others: [at(90, 20), at(250, -15)] });
    const elapsed = performance.now() - started;
    // Цель - 200 мс локально. Предел в тесте шире: CI медленнее в разы, а
    // срок vitest по умолчанию уже подводил проверки парадов (#105).
    expect(elapsed).toBeLessThan(1_000);
  });
});

/** Около трёхсот звёзд, разбросанных детерминированно: столько ярче 3.5ᵐ на настоящем небе. */
function syntheticSky(): BrightStar[] {
  const stars: BrightStar[] = [];
  let seed = 7;
  const next = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 300; i++) {
    stars.push({ ra: next() * 2 * Math.PI, dec: Math.asin(next() * 2 - 1), magnitude: next() * 3.5 });
  }
  return stars;
}
