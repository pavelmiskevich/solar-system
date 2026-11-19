import { describe, expect, it } from 'vitest';

import { AdaptiveQuality, QUALITY_LEVELS, upgradeFps } from '../src/core/quality';

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

  it('может работать без верхних ступеней: начинает ниже и выше не поднимается', () => {
    const quality = new AdaptiveQuality(1);
    expect(quality.levelIndex).toBe(1);
    expect(quality.level.msaa).toBe(false);
    expect(quality.level.bloom).toBe(true);

    run(quality, 4, 60);
    run(quality, 60, 120);
    expect(quality.levelIndex).toBe(1);

    // Упав ниже, возвращается до своей верхней ступени, но не дальше.
    run(quality, 3, 30);
    expect(quality.levelIndex).toBe(2);
    run(quality, 60, 120);
    expect(quality.levelIndex).toBe(1);

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

  describe('на экране 60 Гц, где кадров больше шестидесяти не бывает', () => {
    it('после просадки качество возвращается к полному', () => {
      const quality = new AdaptiveQuality();

      run(quality, 4, 60);
      run(quality, 3, 30);
      expect(quality.levelIndex).toBe(1);
      run(quality, 3, 30);
      expect(quality.levelIndex).toBe(2);

      run(quality, 180, 60);
      expect(quality.levelIndex).toBe(0);
    });

    it('на 50 кадрах не возвращается и не мигает', () => {
      const quality = new AdaptiveQuality();
      run(quality, 4, 60);
      run(quality, 3, 30);
      expect(quality.levelIndex).toBe(1);

      let changes = 0;
      const step = 1 / 60;
      for (let t = 0; t < 600; t += step) if (quality.update(step, 50)) changes += 1;

      expect(changes).toBe(0);
      expect(quality.levelIndex).toBe(1);
    });

    it('ступень, которая не тянет, пробуется всё реже', () => {
      // Видеокарта держит 60 кадров без сглаживания и 30 со сглаживанием.
      // Каждая проба вернуть его стоит двух секунд просадки, и повторять её
      // каждые восемь секунд значило бы мигать бесконечно.
      const quality = new AdaptiveQuality();
      const step = 1 / 60;
      run(quality, 4, 60);
      const probes: number[] = [];
      for (let t = 0; t < 1800; t += step) {
        const fps = quality.levelIndex === 0 ? 30 : 60;
        if (quality.update(step, fps) && quality.levelIndex === 0) probes.push(t);
      }

      // За полчаса - не больше пяти проб, и каждая ждёт дольше предыдущей.
      expect(probes.length).toBeGreaterThan(1);
      expect(probes.length).toBeLessThanOrEqual(5);
      for (let i = 2; i < probes.length; i++) {
        expect(probes[i]! - probes[i - 1]!).toBeGreaterThan(probes[i - 1]! - probes[i - 2]!);
      }
    });

    it('удержавшийся возврат снова пробуется без долгого ожидания', () => {
      const quality = new AdaptiveQuality();
      run(quality, 4, 60);

      // Две неудачные пробы: следующей пришлось бы ждать полторы минуты.
      for (let probe = 0; probe < 2; probe++) {
        run(quality, 3, 30);
        expect(quality.levelIndex).toBe(1);
        // Ждём пробу, но не дольше десяти минут: без проб тест должен упасть,
        // а не зависнуть.
        for (let t = 0; t < 600 && quality.levelIndex === 1; t += 1 / 60) {
          quality.update(1 / 60, 60);
        }
        expect(quality.levelIndex, `проба ${probe + 1}`).toBe(0);
      }
      run(quality, 3, 30);
      expect(quality.levelIndex).toBe(1);

      // Нагрузка ушла: качество вернулось и продержалось дольше пробы.
      run(quality, 120, 60);
      expect(quality.levelIndex).toBe(0);

      // Новая просадка, и возврат снова через обычные секунды.
      run(quality, 3, 30);
      expect(quality.levelIndex).toBe(1);
      run(quality, 7, 60);
      expect(quality.levelIndex).toBe(0);
    });
  });

  it('на экране 120 Гц 70 кадров - не запас, качество не возвращается', () => {
    const quality = new AdaptiveQuality();
    run(quality, 4, 120);
    run(quality, 3, 30);
    expect(quality.levelIndex).toBe(1);

    run(quality, 120, 70);
    expect(quality.levelIndex).toBe(1);
  });

  it('потолок развёртки не берётся из прогрева', () => {
    // Сглаженная частота в первые секунды ещё не устоялась и ничего не значит.
    const quality = new AdaptiveQuality();
    run(quality, 2.5, 120);
    run(quality, 1.5, 60);
    run(quality, 3, 30);
    expect(quality.levelIndex).toBe(1);

    run(quality, 180, 60);
    expect(quality.levelIndex).toBe(0);
  });

  it('порог возврата идёт от потолка, но не ниже 55 и не выше 75 кадров', () => {
    expect(upgradeFps(60)).toBeCloseTo(57);
    expect(upgradeFps(75)).toBeCloseTo(71.25);
    expect(upgradeFps(144)).toBe(75);
    expect(upgradeFps(20)).toBe(55);
  });
});
