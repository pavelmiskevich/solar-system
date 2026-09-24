import { describe, expect, it } from 'vitest';

import { ZERO_CELSIUS_K, equilibriumTemperatureK } from '../src/physics/temperature';

/** Альбедо ядра кометы Галлея - то же, что стоит в bodies.ts. */
const HALLEY_ALBEDO = 0.04;

describe('equilibriumTemperatureK', () => {
  it('у Галлеи за афелием - около минус двухсот двадцати шести', () => {
    // Сентябрь 2026 года: комета в 35.17 а.е., дальше Нептуна.
    const celsius = equilibriumTemperatureK(35.17, HALLEY_ALBEDO) - ZERO_CELSIUS_K;
    expect(celsius).toBeGreaterThan(-228);
    expect(celsius).toBeLessThan(-225);
  });

  it('у Галлеи в перигелии - выше точки кипения воды на Земле', () => {
    // 0.586 а.е. - настоящий перигелий. Испарение тут ещё не учтено, и это
    // верхняя оценка для тёмной корки, а не для открытого льда.
    const celsius = equilibriumTemperatureK(0.586, HALLEY_ALBEDO) - ZERO_CELSIUS_K;
    expect(celsius).toBeGreaterThan(80);
    expect(celsius).toBeLessThan(95);
  });

  it('сходится с тем, что намерила «Вега-1» у ядра', () => {
    // Март 1986 года, 0.79 а.е. от Солнца: инфракрасный прибор ИКС дал
    // триста-четыреста кельвинов.
    const kelvin = equilibriumTemperatureK(0.79, HALLEY_ALBEDO);
    expect(kelvin).toBeGreaterThan(300);
    expect(kelvin).toBeLessThan(400);
  });

  it('падает как корень из расстояния', () => {
    // Свет слабеет как 1/r², излучение растёт как T⁴: вчетверо дальше -
    // вдвое холоднее.
    const near = equilibriumTemperatureK(1, HALLEY_ALBEDO);
    const far = equilibriumTemperatureK(4, HALLEY_ALBEDO);
    expect(far).toBeCloseTo(near / 2, 10);
  });

  it('тёмное тело теплее светлого', () => {
    expect(equilibriumTemperatureK(1, 0.04)).toBeGreaterThan(equilibriumTemperatureK(1, 0.5));
  });
});
