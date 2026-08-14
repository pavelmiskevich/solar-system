import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TIME_SCALE,
  SimClock,
  TIME_SCALES,
  describeTimeScale,
} from '../src/core/clock';
import { SECONDS_PER_DAY } from '../src/core/units';

describe('describeTimeScale', () => {
  it('реальное время называется реальным временем', () => {
    expect(describeTimeScale(1 / SECONDS_PER_DAY)).toBe('реальное время');
  });

  it('секунды, минуты и часы не выражаются в долях суток', () => {
    expect(describeTimeScale(10 / SECONDS_PER_DAY)).toBe('10 с/с');
    expect(describeTimeScale(60 / SECONDS_PER_DAY)).toBe('1 мин/с');
    expect(describeTimeScale((20 * 60) / SECONDS_PER_DAY)).toBe('20 мин/с');
    expect(describeTimeScale(1 / 24)).toBe('1 ч/с');
    expect(describeTimeScale(1 / 4)).toBe('6 ч/с');
  });

  it('крупные шаги переходят в сутки, месяцы и годы', () => {
    expect(describeTimeScale(1)).toBe('1 сут/с');
    expect(describeTimeScale(7)).toBe('7 сут/с');
    // Месяц в сутках понятнее, чем в месяцах: «30 сут/с» читается сразу.
    expect(describeTimeScale(30.44)).toBe('30 сут/с');
    expect(describeTimeScale(91.3)).toBe('3 мес/с');
    expect(describeTimeScale(365.25)).toBe('1 год/с');
    expect(describeTimeScale(365.25 * 5)).toBe('5 лет/с');
    expect(describeTimeScale(365.25 * 20)).toBe('20 лет/с');
  });

  it('остановленное время не выдаёт себя за реальное', () => {
    expect(describeTimeScale(0)).toBe('остановлено');
  });
});

describe('TIME_SCALES', () => {
  it('шкала строго возрастает', () => {
    for (let i = 1; i < TIME_SCALES.length; i += 1) {
      expect(TIME_SCALES[i]!).toBeGreaterThan(TIME_SCALES[i - 1]!);
    }
  });

  it('внизу шкала частая: шаг не больше шести раз', () => {
    // Между «разглядеть вращение» и «разглядеть орбиту» лежит пять порядков,
    // и прыгать через них большими ступенями нельзя.
    for (let i = 1; i < TIME_SCALES.length; i += 1) {
      expect(TIME_SCALES[i]! / TIME_SCALES[i - 1]!).toBeLessThanOrEqual(10.01);
    }
  });

  it('есть и реальное время, и сутки в секунду', () => {
    expect(TIME_SCALES).toContain(1 / SECONDS_PER_DAY);
    expect(TIME_SCALES.indexOf(1)).toBeGreaterThan(0);
  });

  it('на стартовом масштабе система движется сразу', () => {
    const index = TIME_SCALES.indexOf(DEFAULT_TIME_SCALE);
    // Стартовая ступень — из ладдера, и не крайняя: замедлить и ускорить есть куда.
    expect(index).toBeGreaterThan(0);
    expect(index).toBeLessThan(TIME_SCALES.length - 1);

    // Сутки Земли проходят за секунду, оборот Луны — за полминуты: сцена
    // выглядит живой, не дожидаясь, пока в ней что-нибудь нажмут.
    expect(1 / DEFAULT_TIME_SCALE).toBeCloseTo(1, 6);
    expect(27.32 / DEFAULT_TIME_SCALE).toBeLessThan(60);

    // Плата — вращение гигантов; для него в ладдере есть ступень медленнее,
    // на которой оборот Юпитера занимает больше восьми секунд.
    const jupiterRotationDays = 9.93 / 24;
    const readable = TIME_SCALES.filter(
      (scale) => jupiterRotationDays / scale > 8,
    );
    expect(readable.length).toBeGreaterThan(0);
  });

  it('минута в секунду замедляет вращение Юпитера до различимого', () => {
    // Юпитер оборачивается за 9.93 часа. При сутках в секунду это два с
    // половиной оборота в секунду — мельтешение; при минуте в секунду
    // оборот занимает почти десять минут реального времени.
    const jupiterRotationHours = 9.93;
    const minutePerSecond = 60 / SECONDS_PER_DAY;
    const realSecondsPerRotation = (jupiterRotationHours / 24) / minutePerSecond;

    expect(realSecondsPerRotation).toBeGreaterThan(400);
  });
});

describe('SimClock', () => {
  it('пауза останавливает время, но не сбрасывает его', () => {
    const clock = new SimClock(new Date('2026-08-13T12:00:00Z'), 1);
    const start = clock.jd;

    clock.paused = true;
    clock.advance(10);

    expect(clock.jd).toBe(start);
    expect(clock.describeScale()).toBe('пауза');
  });

  it('за секунду при масштабе «сутки в секунду» проходят сутки', () => {
    const clock = new SimClock(new Date('2026-08-13T12:00:00Z'), 1);
    const start = clock.jd;

    clock.advance(1);

    expect(clock.jd - start).toBeCloseTo(1, 9);
  });
});
