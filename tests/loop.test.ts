import { describe, expect, it } from 'vitest';

import { measuredFrameSeconds, smoothFrameTime } from '../src/core/loop';
import { AdaptiveQuality } from '../src/core/quality';

/**
 * Цикл кадров вместе с адаптивным качеством: так их связывает main.ts. Кадры
 * задаются настоящей длительностью, возвращается настенное время до первой
 * смены ступени или null, если её не было.
 */
function simulate(frames: number[]): { quality: AdaptiveQuality; changedAt: number | null } {
  const quality = new AdaptiveQuality();
  let average = 16.7;
  let wall = 0;
  let changedAt: number | null = null;
  for (const raw of frames) {
    wall += raw;
    const measured = measuredFrameSeconds(raw);
    average = smoothFrameTime(average, measured);
    if (quality.update(measured, 1000 / average) && changedAt === null) changedAt = wall;
  }
  return { quality, changedAt };
}

const repeat = (seconds: number, count: number) => Array<number>(count).fill(seconds);

describe('замер скорости кадров', () => {
  it('кадр после долгой паузы считается не длиннее потолка', () => {
    // Вкладка была скрыта минуту: первый кадр после неё длится минуту.
    expect(measuredFrameSeconds(60)).toBe(0.5);
    expect(measuredFrameSeconds(0.2)).toBe(0.2);
    expect(measuredFrameSeconds(-1)).toBe(0);
  });

  it('видит кадры медленнее пятнадцати в секунду', () => {
    let average = 16.7;
    for (let i = 0; i < 200; i++) average = smoothFrameTime(average, measuredFrameSeconds(0.2));
    expect(1000 / average).toBeLessThan(6);
  });

  it('при кадре в секунду качество снимает ступень за секунды, а не за минуту', () => {
    // Секунда ровных кадров, потом по кадру в секунду. Прогрев (3 с) и
    // просадка (2 с) копятся по полсекунды за кадр - потолок замера.
    const { changedAt } = simulate([...repeat(1 / 60, 60), ...repeat(1, 60)]);

    expect(changedAt).not.toBeNull();
    expect(changedAt!).toBeLessThan(15);
  });

  it('возврат на вкладку не понижает качество', () => {
    const { changedAt, quality } = simulate([
      ...repeat(1 / 60, 600),
      60,
      ...repeat(1 / 60, 600),
    ]);

    expect(changedAt).toBeNull();
    expect(quality.levelIndex).toBe(0);
  });

  it('одиночная заминка в секунду не понижает качество', () => {
    // Компиляция шейдера на подлёте к телу: один кадр на секунду.
    const { changedAt } = simulate([...repeat(1 / 60, 600), 1, ...repeat(1 / 60, 600)]);

    expect(changedAt).toBeNull();
  });
});
