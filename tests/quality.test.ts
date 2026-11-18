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
    expect(quality.level.msaa).toBe(true);
    expect(quality.level.bloom).toBe(true);
    expect(quality.level.resolutionScale).toBe(1);
  });

  it('может начать не с верхней ступени, и тогда возвращается к ней тем же порядком', () => {
    const quality = new AdaptiveQuality(1);
    expect(quality.levelIndex).toBe(1);
    expect(quality.level.msaa).toBe(false);
    expect(quality.level.bloom).toBe(true);

    run(quality, 4, 60);
    run(quality, 7, 120);
    expect(quality.levelIndex).toBe(0);

    expect(new AdaptiveQuality(-3).levelIndex).toBe(0);
    expect(new AdaptiveQuality(99).levelIndex).toBe(QUALITY_LEVELS.length - 1);
  });

  it('первые секунды не считаются: прогрев не повод понижать качество', () => {
    const quality = new AdaptiveQuality();

    run(quality, 2.5, 10);

    expect(quality.levelIndex).toBe(0);
  });

  it('стойкая просадка гасит сначала сглаживание, потом свечение, потом разрешение', () => {
    const quality = new AdaptiveQuality();

    run(quality, 4, 60); // прогрев
    run(quality, 3, 30);
    expect(quality.levelIndex).toBe(1);
    expect(quality.level.msaa).toBe(false);
    expect(quality.level.bloom).toBe(true);
    expect(quality.level.resolutionScale).toBe(1);

    run(quality, 3, 30);
    expect(quality.levelIndex).toBe(2);
    expect(quality.level.bloom).toBe(false);
    expect(quality.level.resolutionScale).toBe(1);

    run(quality, 3, 30);
    expect(quality.levelIndex).toBe(3);
    expect(quality.level.resolutionScale).toBeLessThan(1);
  });

  it('снятое однажды не возвращается на более низкой ступени', () => {
    // Ступени вложены: каждая следующая отнимает ещё что-то и ничего не
    // возвращает. Иначе падение качества местами улучшало бы картинку.
    for (let i = 1; i < QUALITY_LEVELS.length; i++) {
      const [above, below] = [QUALITY_LEVELS[i - 1]!, QUALITY_LEVELS[i]!];
      expect(below.msaa && !above.msaa, `ступень ${i}: сглаживание`).toBe(false);
      expect(below.bloom && !above.bloom, `ступень ${i}: свечение`).toBe(false);
      expect(below.resolutionScale, `ступень ${i}: разрешение`).toBeLessThanOrEqual(
        above.resolutionScale,
      );
    }
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
    // Полсекунды тяжёлых кадров - обычное дело на подлёте к телу.
    run(quality, 0.5, 20);
    run(quality, 2, 60);

    expect(quality.levelIndex).toBe(0);
  });

  it('качество возвращается, но медленнее, чем падало', () => {
    const quality = new AdaptiveQuality();

    run(quality, 4, 60);
    run(quality, 3, 30);
    expect(quality.levelIndex).toBe(1);

    // Пяти секунд высокого fps ещё недостаточно - иначе качество замигает.
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
