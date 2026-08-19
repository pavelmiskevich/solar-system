import { describe, expect, it } from 'vitest';

import { AdaptiveExposure } from '../src/lighting/exposure';
import { percentileInPlace } from '../src/lighting/sceneLuminance';
import { AU } from '../src/core/units';

/** Прогнать адаптацию до установившегося значения. */
function settle(
  exposure: AdaptiveExposure,
  distanceAu: number,
  frameLuminance: number | null,
  seconds = 30,
): number {
  const step = 1 / 60;
  let value = exposure.value;
  for (let t = 0; t < seconds; t += step) {
    value = exposure.update(step, distanceAu * AU, frameLuminance);
  }
  return value;
}

describe('AdaptiveExposure', () => {
  it('без измерения кадра работает по расстоянию до Солнца', () => {
    const exposure = new AdaptiveExposure();

    expect(settle(exposure, 1, null)).toBeCloseTo(1, 2);

    const outer = new AdaptiveExposure();
    // Показатель компенсации 1.8: у Нептуна экспозиция в сотни раз выше.
    expect(settle(outer, 30, null)).toBeGreaterThan(300);
  });

  it('чем дальше от Солнца, тем выше экспозиция', () => {
    const near = settle(new AdaptiveExposure(), 0.4, null);
    const earth = settle(new AdaptiveExposure(), 1, null);
    const far = settle(new AdaptiveExposure(), 30, null);

    expect(near).toBeLessThan(earth);
    expect(earth).toBeLessThan(far);
  });

  it('освещённый кадр ничего не меняет: поправка остаётся единицей', () => {
    // Диск планеты даёт около половины единицы яркости — середина диапазона.
    const withFrame = settle(new AdaptiveExposure(), 1, 0.5);
    const withoutFrame = settle(new AdaptiveExposure(), 1, null);

    expect(withFrame).toBeCloseTo(withoutFrame, 2);
  });

  it('тёмный кадр раскрывает экспозицию — так виден пепельный свет', () => {
    // Ночная сторона Луны: яркость на четыре порядка ниже дневной.
    const night = settle(new AdaptiveExposure(), 1, 2.5e-5, 60);
    const day = settle(new AdaptiveExposure(), 1, 0.5);

    expect(night).toBeGreaterThan(day * 100);
  });

  it('раскрытие ограничено: ночь не превращается в день', () => {
    // Абсолютно тёмный, но не пустой кадр не должен уводить экспозицию в ноль
    // знаменателя. Предел — три порядка от базовой.
    const value = settle(new AdaptiveExposure(), 1, 1e-6, 120);

    expect(value).toBeLessThanOrEqual(1500);
    expect(Number.isFinite(value)).toBe(true);
  });

  it('пересвеченный кадр экспозицию прижимает', () => {
    const blown = settle(new AdaptiveExposure(), 1, 20);
    const normal = settle(new AdaptiveExposure(), 1, 0.5);

    expect(blown).toBeLessThan(normal);
    // Но не глубже нижней границы поправки.
    expect(blown).toBeGreaterThan(normal / 10);
  });

  it('пустой кадр не считается тёмным', () => {
    // Одни звёзды в кадре: их яркость экспозицию компенсирует, и мерить нечего.
    const empty = settle(new AdaptiveExposure(), 1, 1e-9);
    const noFrame = settle(new AdaptiveExposure(), 1, null);

    expect(empty).toBeCloseTo(noFrame, 2);
  });

  it('reset снимает накопленную поправку', () => {
    const exposure = new AdaptiveExposure();
    settle(exposure, 1, 1e-5, 60);
    expect(exposure.value).toBeGreaterThan(10);

    exposure.reset(AU);
    expect(exposure.value).toBeCloseTo(1, 2);
  });

  it('установившаяся экспозиция не зависит от частоты кадров', () => {
    // Ради этого поправка и решается напрямую, а не накапливается шагами.
    // При накоплении замеры шли десять раз в секунду, а значение догоняло их
    // с постоянной полторы секунды, и итог зависел от того, сколько замеров
    // уместилось в переход: на 144 кадрах и на загруженной машине одна и та
    // же сцена приходила к разной экспозиции.
    const settleAt = (step: number, luminance: number): number => {
      const exposure = new AdaptiveExposure();
      let value = exposure.value;
      for (let t = 0; t < 30; t += step) value = exposure.update(step, AU, luminance);
      return value;
    };

    for (const luminance of [4, 0.5, 2.5e-5]) {
      const fast = settleAt(1 / 144, luminance);
      const normal = settleAt(1 / 60, luminance);
      const slow = settleAt(1 / 15, luminance);

      expect(normal / fast).toBeCloseTo(1, 3);
      expect(slow / fast).toBeCloseTo(1, 3);
    }
  });

  it('пересвеченный дневной кадр не проваливает экспозицию втрое', () => {
    // Тот самый случай, на котором ловился плавающий сквозной тест: дневная
    // сторона Луны в одной астрономической единице от Солнца. Экспозиция
    // обязана остаться около единицы, а не осесть на трети.
    const day = settle(new AdaptiveExposure(), 1, 1.2);

    expect(day).toBeGreaterThan(0.5);
    expect(day).toBeLessThan(3);
  });

  it('адаптация не мгновенная: за один кадр экспозиция меняется чуть-чуть', () => {
    const exposure = new AdaptiveExposure();
    exposure.reset(AU);
    const before = exposure.value;

    exposure.update(1 / 60, AU, 1e-5);

    // Сглаживание логарифмическое: за кадр экспозиция проходит около одного
    // процента расстояния в ступенях, то есть меняется на единицы процентов.
    expect(exposure.value / before).toBeLessThan(1.15);
    expect(exposure.value).toBeGreaterThan(before);
  });
});

describe('percentile', () => {
  it('возвращает значение нужного порядка', () => {
    const values = new Float32Array([5, 1, 4, 2, 3]);

    expect(percentileInPlace(values, 0)).toBe(1);
    expect(percentileInPlace(values, 0.5)).toBe(3);
    expect(percentileInPlace(values, 1)).toBe(5);
  });

  it('высокий процентиль игнорирует одиночный выброс не полностью', () => {
    const values = new Float32Array(100);
    values.fill(0.1);
    values[99] = 100;

    expect(percentileInPlace(values, 0.9)).toBeCloseTo(0.1, 6);
    expect(percentileInPlace(values, 1)).toBe(100);
  });

  it('пустой набор не ломает расчёт', () => {
    expect(percentileInPlace(new Float32Array(0), 0.5)).toBe(0);
  });
});
