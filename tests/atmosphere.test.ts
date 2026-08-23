import { describe, expect, it } from 'vitest';

import { APPEARANCE } from '../src/data/appearance';
import { Atmosphere } from '../src/scene/atmosphere';

/**
 * Слой рассеяния.
 *
 * Проверять сам расчёт нечем — он живёт в шейдере, — но у него есть данные, и
 * в них легко ошибиться незаметно. Коэффициенты рассеяния настоящие, и цвет
 * неба следует прямо из них: перепутанные местами каналы дали бы жёлтое небо
 * и синий закат, и никакая проверка кадра этого не поймает, если считать её
 * по яркости.
 */

const earth = APPEARANCE.earth!;

describe('атмосфера Земли', () => {
  it('рассеивает синий сильнее красного — отсюда и цвет неба', () => {
    const scattering = earth.scattering!;
    const [red, green, blue] = scattering.rayleigh;

    expect(blue).toBeGreaterThan(green);
    expect(green).toBeGreaterThan(red);
    // Рэлеевское рассеяние идёт как 1/λ⁴: между красным и синим это примерно
    // впятеро, и именно из этого числа получается и голубое небо, и красный
    // закат. Вдвое было бы блёкло, вдесятеро — ядовито.
    expect(blue / red).toBeGreaterThan(4);
    expect(blue / red).toBeLessThan(7);
  });

  it('аэрозоль рассеивает без цвета и лежит ниже воздуха', () => {
    const scattering = earth.scattering!;

    // У аэрозоля один коэффициент на все каналы: капли и пыль много крупнее
    // длины волны, и цвет им безразличен. Оттого дымка у горизонта белая.
    expect(scattering.mie).toBeGreaterThan(0);
    // Пыль и капли держатся у земли, воздух уходит выше.
    expect(scattering.mieHeight).toBeLessThan(scattering.scaleHeight);
  });

  it('высоты и толщина слоя — измеренные, а не подогнанные', () => {
    const scattering = earth.scattering!;

    // Высота однородной атмосферы Земли — восемь километров.
    expect(scattering.scaleHeight).toBeCloseTo(8, 0);
    // Сто километров: выше линии Кармана рассеивать уже нечему.
    expect(scattering.thickness).toBe(100);
  });

  it('оболочка выше поверхности ровно на толщину слоя', () => {
    const atmosphere = new Atmosphere({ radius: 6378, scattering: earth.scattering! });

    expect(atmosphere.surfaceRadius).toBe(6378);
    expect(atmosphere.radius).toBe(6478);
    // Слой тонкий: сотня километров против шести с половиной тысяч радиуса.
    // Если бы он оказался заметно толще, кайма на снимке была бы шире, чем
    // бывает на самом деле, — а её толщина и есть то, что проверяют глазом.
    expect(atmosphere.radius / atmosphere.surfaceRadius).toBeCloseTo(1.0157, 4);
  });

  it('есть только там, где атмосфера плотная', () => {
    // Земля — да; Луна и Меркурий — нет; Марсу и газовым гигантам хватает
    // прежнего лимбового свечения, слой рассеяния для них не считается.
    expect(APPEARANCE.earth!.scattering).toBeDefined();
    expect(APPEARANCE.moon!.scattering).toBeUndefined();
    expect(APPEARANCE.mercury!.scattering).toBeUndefined();
  });
});
