import { describe, expect, it } from 'vitest';

import { AdaptiveQuality, QUALITY_LEVELS } from '../src/core/quality';

/** Прогнать заданное время с постоянным fps. */
function run(quality: AdaptiveQuality, seconds: number, fps: number): void {
  const step = 1 / 60;
  for (let t = 0; t < seconds; t += step) quality.update(step, fps);
}

describe('AdaptiveQuality', () => {
  it('начинает с полного качества', () => {
    const quality = new AdaptiveQuality();

    expect(quality.levelIndex).toBe(0);
    expect(quality.level.bloom).toBe(true);
    expect(quality.level.resolutionScale).toBe(1);
  });

  it('первые секунды не считаются: прогрев не повод понижать качество', () => {
    const quality = new AdaptiveQuality();

    run(quality, 2.5, 10);

    expect(quality.levelIndex).toBe(0);
  });

  it('стойкая просадка гасит сначала свечение, потом разрешение', () => {
    const quality = new AdaptiveQuality();

    run(quality, 4, 60); // прогрев
    run(quality, 3, 30);
    expect(quality.levelIndex).toBe(1);
    expect(quality.level.bloom).toBe(false);
    expect(quality.level.resolutionScale).toBe(1);

    run(quality, 3, 30);
    expect(quality.levelIndex).toBe(2);
    expect(quality.level.resolutionScale).toBeLessThan(1);
  });

  it('ниже последнего уровня не опускается', () => {
    const quality = new AdaptiveQuality();

    run(quality, 4, 60);
    run(quality, 60, 10);

    expect(quality.levelIndex).toBe(QUALITY_LEVELS.length - 1);
  });

  it('одиночная просадка ничего не переключает', () => {
    const quality = new AdaptiveQuality();

    run(quality, 4, 60);
    // Полсекунды тяжёлых кадров — обычное дело на подлёте к телу.
    run(quality, 0.5, 20);
    run(quality, 2, 60);

    expect(quality.levelIndex).toBe(0);
  });

  it('качество возвращается, но медленнее, чем падало', () => {
    const quality = new AdaptiveQuality();

    run(quality, 4, 60);
    run(quality, 3, 30);
    expect(quality.levelIndex).toBe(1);

    // Пяти секунд высокого fps ещё недостаточно — иначе качество замигает.
    run(quality, 5, 120);
    expect(quality.levelIndex).toBe(1);

    run(quality, 2, 120);
    expect(quality.levelIndex).toBe(0);
  });

  it('рабочий режим между порогами не копит ни то, ни другое', () => {
    const quality = new AdaptiveQuality();

    run(quality, 4, 60);
    run(quality, 30, 60);

    expect(quality.levelIndex).toBe(0);
  });
});
