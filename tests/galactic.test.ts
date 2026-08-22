import { describe, expect, it } from 'vitest';

import { NAMED_STARS } from '../src/data/sky';
import { galacticBasis, galacticCoordinates, sphericalEquatorialToScene } from '../src/physics/frames';

/**
 * Галактическая система координат.
 *
 * В ней лежит Млечный Путь, и ошибиться в ней легко: полюс и центр Галактики
 * измерены в экваториальных координатах и перпендикулярны друг другу не
 * идеально, а знак долготы зависит от того, в какую сторону взято векторное
 * произведение. И то и другое незаметно на глаз: полоса просто окажется не
 * там, где ей быть, а сверить её не с чем — небо и так рябое.
 */

const DEGREES = 180 / Math.PI;
const basis = galacticBasis();

/** Галактические координаты точки неба, заданной прямым восхождением и склонением. */
function galacticOf(ra: number, dec: number): { longitude: number; latitude: number } {
  const coordinates = galacticCoordinates(sphericalEquatorialToScene(ra, dec), basis);
  return {
    longitude: ((coordinates.longitude * DEGREES + 360) % 360),
    latitude: coordinates.latitude * DEGREES,
  };
}

describe('галактические координаты', () => {
  it('оси перпендикулярны и единичны', () => {
    expect(basis.centre.length()).toBeCloseTo(1, 12);
    expect(basis.east.length()).toBeCloseTo(1, 12);
    expect(basis.pole.length()).toBeCloseTo(1, 12);

    expect(basis.centre.dot(basis.pole)).toBeCloseTo(0, 12);
    expect(basis.east.dot(basis.pole)).toBeCloseTo(0, 12);
    expect(basis.centre.dot(basis.east)).toBeCloseTo(0, 12);
  });

  it('центр Галактики — это долгота и широта ноль', () => {
    // 17ʰ45ᵐ, −29°: Стрелец, самая яркая часть Млечного Пути. Координаты
    // округлены до минуты, отсюда и допуск в пятую долю градуса — это цена
    // округления, а не ошибка перехода.
    const centre = galacticOf((17 + 45 / 60) * (Math.PI / 12), -28.94 * (Math.PI / 180));

    expect(Math.abs(centre.latitude)).toBeLessThan(0.2);
    expect(Math.min(centre.longitude, 360 - centre.longitude)).toBeLessThan(0.5);
  });

  it('полюс Галактики — широта девяносто', () => {
    const pole = galacticCoordinates(basis.pole.clone(), basis);
    expect(pole.latitude * DEGREES).toBeCloseTo(90, 6);

    const south = galacticCoordinates(basis.pole.clone().negate(), basis);
    expect(south.latitude * DEGREES).toBeCloseTo(-90, 6);
  });

  it('долгота растёт в принятую сторону: Денеб на 84°, а не на 276°', () => {
    // Знак долготы — это направление векторного произведения, и перепутать
    // его нечем: полоса выйдет зеркальной, а на глаз это не видно.
    const deneb = NAMED_STARS.find((star) => star.name === 'Денеб')!;
    const found = galacticOf(deneb.ra, deneb.dec);

    expect(found.longitude).toBeCloseTo(84.3, 0);
    expect(found.latitude).toBeCloseTo(2.0, 0);
  });

  it('антицентр Галактики — долгота сто восемьдесят', () => {
    // 5ʰ45ᵐ, +28.9°: Возничий, самая тусклая часть полосы.
    const anticentre = galacticOf((5 + 45 / 60) * (Math.PI / 12), 28.94 * (Math.PI / 180));

    expect(anticentre.longitude).toBeCloseTo(180, 0);
    expect(Math.abs(anticentre.latitude)).toBeLessThan(0.6);
  });

  it('ярчайшие звёзды Млечного Пути лежат близко к его плоскости', () => {
    // Денеб, Альтаир и Шаула — все в полосе; Вега и Арктур заведомо вне её.
    const inBand = ['Денеб', 'Шаула', 'Альнилам'];

    for (const name of inBand) {
      const star = NAMED_STARS.find((s) => s.name === name)!;
      expect(Math.abs(galacticOf(star.ra, star.dec).latitude), name).toBeLessThan(20);
    }

    const arcturus = NAMED_STARS.find((s) => s.name === 'Арктур')!;
    expect(Math.abs(galacticOf(arcturus.ra, arcturus.dec).latitude)).toBeGreaterThan(60);
  });
});
