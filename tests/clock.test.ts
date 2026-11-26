import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TIME_SCALE,
  EARLIEST_JD,
  FIRST_YEAR,
  LAST_YEAR,
  LATEST_JD,
  IN_STEP_TOLERANCE_MS,
  SimClock,
  TIME_SCALES,
  WallClockFollower,
  describeTimeScale,
} from '../src/core/clock';
import { SECONDS_PER_DAY, dateFromJulianDay } from '../src/core/units';

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
    // Стартовая ступень - из ладдера, и не крайняя: замедлить и ускорить есть куда.
    expect(index).toBeGreaterThan(0);
    expect(index).toBeLessThan(TIME_SCALES.length - 1);

    // Сутки Земли проходят за секунду, оборот Луны - за полминуты: сцена
    // выглядит живой, не дожидаясь, пока в ней что-нибудь нажмут.
    expect(1 / DEFAULT_TIME_SCALE).toBeCloseTo(1, 6);
    expect(27.32 / DEFAULT_TIME_SCALE).toBeLessThan(60);

    // Плата - вращение гигантов; для него в ладдере есть ступень медленнее,
    // на которой оборот Юпитера занимает больше восьми секунд.
    const jupiterRotationDays = 9.93 / 24;
    const readable = TIME_SCALES.filter(
      (scale) => jupiterRotationDays / scale > 8,
    );
    expect(readable.length).toBeGreaterThan(0);
  });

  it('минута в секунду замедляет вращение Юпитера до различимого', () => {
    // Юпитер оборачивается за 9.93 часа. При сутках в секунду это два с
    // половиной оборота в секунду - мельтешение; при минуте в секунду
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

describe('шаг по лестнице скоростей', () => {
  it('идёт вверх и вниз по соседним ступеням', () => {
    const clock = new SimClock(new Date(), TIME_SCALES[3]!);

    expect(clock.stepScale(1)).toBe(TIME_SCALES[4]);
    expect(clock.stepScale(-1)).toBe(TIME_SCALES[3]);
    expect(clock.stepScale(-1)).toBe(TIME_SCALES[2]);
  });

  it('упирается в края, а не заходит за них', () => {
    const slowest = new SimClock(new Date(), TIME_SCALES[0]!);
    expect(slowest.stepScale(-1)).toBe(TIME_SCALES[0]);

    const fastest = new SimClock(new Date(), TIME_SCALES.at(-1)!);
    expect(fastest.stepScale(1)).toBe(TIME_SCALES.at(-1));
  });

  it('проходит лестницу целиком в обе стороны', () => {
    const clock = new SimClock(new Date(), TIME_SCALES[0]!);

    for (let i = 1; i < TIME_SCALES.length; i += 1) {
      expect(clock.stepScale(1)).toBe(TIME_SCALES[i]);
    }
    for (let i = TIME_SCALES.length - 2; i >= 0; i -= 1) {
      expect(clock.stepScale(-1)).toBe(TIME_SCALES[i]);
    }
  });

  it('от значения вне лестницы шагает с ближайшей ступени', () => {
    // Такое значение может выставить отладочный доступ или будущий ползунок.
    // Отдельный счётчик ступени здесь бы уже разошёлся с действительностью.
    const clock = new SimClock(new Date(), TIME_SCALES[3]! * 1.2);

    expect(clock.stepScale(1)).toBe(TIME_SCALES[4]);
  });

  it('ближайшая ступень ищется в логарифме, а не по разности', () => {
    // Лестница охватывает семь порядков. По линейной разности значение чуть
    // выше реального времени притянулось бы к самой быстрой ступени, потому
    // что все медленные ступени различаются на доли единицы.
    const clock = new SimClock(new Date(), TIME_SCALES[0]! * 1.1);

    expect(clock.stepScale(1)).toBe(TIME_SCALES[1]);
  });
});

describe('диапазон дат (#167)', () => {
  it('часы не выходят за край ни при каком шаге', () => {
    for (const scale of TIME_SCALES) {
      for (const dt of [1 / 60, 1, 1e3, 1e9]) {
        const forward = new SimClock(new Date('2026-01-01T00:00:00Z'), scale);
        forward.advance(dt);
        expect(forward.jd, `вперёд ${scale} сут/с за ${dt} с`).toBeLessThanOrEqual(LATEST_JD);

        const back = new SimClock(new Date('2026-01-01T00:00:00Z'), -scale);
        back.advance(dt);
        expect(back.jd, `назад ${scale} сут/с за ${dt} с`).toBeGreaterThanOrEqual(EARLIEST_JD);
      }
    }
  });

  it('дата, поставленная за краем, зажимается', () => {
    const clock = new SimClock(new Date('2026-01-01T00:00:00Z'));
    clock.date = new Date('2800-01-07T12:00:00Z');
    expect(clock.jd).toBe(LATEST_JD);
    clock.jd = -1e9;
    expect(clock.jd).toBe(EARLIEST_JD);
    // В пределах диапазона - как есть.
    clock.date = new Date('1700-03-01T00:00:00Z');
    expect(clock.date.toISOString()).toBe('1700-03-01T00:00:00.000Z');
  });

  it('дойдя до края, время встаёт на паузу и говорит почему', () => {
    const clock = new SimClock(new Date('2600-12-01T00:00:00Z'), TIME_SCALES.at(-1)!);
    expect(clock.atEdge).toBe(false);
    clock.advance(1);
    expect(clock.jd).toBe(LATEST_JD);
    expect(clock.paused).toBe(true);
    expect(clock.atEdge).toBe(true);
    expect(clock.describeScale()).toContain('1600-2600');
  });

  it('пауза посреди диапазона - обычная пауза', () => {
    const clock = new SimClock(new Date('2026-01-01T00:00:00Z'));
    clock.paused = true;
    expect(clock.atEdge).toBe(false);
    expect(clock.describeScale()).not.toContain('1600');
  });

  it('края диапазона - те самые годы', () => {
    expect(dateFromJulianDay(EARLIEST_JD).getUTCFullYear()).toBe(FIRST_YEAR);
    expect(dateFromJulianDay(LATEST_JD).getUTCFullYear()).toBe(LAST_YEAR);
  });
});

describe('подтягивание к часам после фоновой вкладки (#201)', () => {
  const NOW = Date.UTC(2026, 10, 26, 12, 0, 0);
  const REAL_TIME = 1 / SECONDS_PER_DAY;
  const HIDDEN_MS = 40 * 60 * 1000;

  const clockAt = (ms: number, timeScale = REAL_TIME) => new SimClock(new Date(ms), timeScale);

  it('сцена «сейчас» в реальном времени - вровень с часами', () => {
    expect(clockAt(NOW).inStepWithWallClock(NOW)).toBe(true);
    // Небольшое отставание от медленных кадров не мешает.
    expect(clockAt(NOW - 30_000).inStepWithWallClock(NOW)).toBe(true);
  });

  it('другая дата, другая скорость или пауза - не вровень', () => {
    expect(clockAt(NOW - IN_STEP_TOLERANCE_MS - 1000).inStepWithWallClock(NOW)).toBe(false);
    expect(clockAt(Date.UTC(1969, 6, 20)).inStepWithWallClock(NOW)).toBe(false);
    expect(clockAt(NOW, TIME_SCALES[1]).inStepWithWallClock(NOW)).toBe(false);
    expect(clockAt(NOW, -REAL_TIME).inStepWithWallClock(NOW)).toBe(false);

    const paused = clockAt(NOW);
    paused.paused = true;
    expect(paused.inStepWithWallClock(NOW)).toBe(false);
  });

  it('часы, шедшие вровень, после возврата встают на «сейчас»', () => {
    const clock = clockAt(NOW);
    const follower = new WallClockFollower(clock);

    follower.hidden(NOW);
    // Пока вкладка скрыта, кадров нет: время сцены стоит.
    expect(follower.shown(NOW + HIDDEN_MS)).toBe(true);
    expect(clock.date.getTime()).toBe(NOW + HIDDEN_MS);
  });

  it('сцена на выбранной дате остаётся на ней', () => {
    const apollo = Date.UTC(1969, 6, 20, 20, 17);
    const clock = clockAt(apollo);
    const follower = new WallClockFollower(clock);

    follower.hidden(NOW);
    expect(follower.shown(NOW + HIDDEN_MS)).toBe(false);
    expect(clock.date.getTime()).toBe(apollo);
  });

  it('решение принимается в момент скрытия, а не возврата', () => {
    // К возврату отставание уже набежало: проверка «вровень» по нему
    // отказала бы любым часам.
    const clock = clockAt(NOW);
    const follower = new WallClockFollower(clock);
    follower.hidden(NOW);
    expect(clock.inStepWithWallClock(NOW + HIDDEN_MS)).toBe(false);
    expect(follower.shown(NOW + HIDDEN_MS)).toBe(true);
  });

  it('возврат без скрытия ничего не трогает, второй возврат тоже', () => {
    const clock = clockAt(NOW);
    const follower = new WallClockFollower(clock);
    expect(follower.shown(NOW + HIDDEN_MS)).toBe(false);

    follower.hidden(NOW);
    follower.shown(NOW + HIDDEN_MS);
    expect(follower.shown(NOW + 2 * HIDDEN_MS)).toBe(false);
    expect(clock.date.getTime()).toBe(NOW + HIDDEN_MS);
  });

  it('часы, поставленные в фоне на паузу, не подтягиваются', () => {
    const clock = clockAt(NOW);
    const follower = new WallClockFollower(clock);
    follower.hidden(NOW);
    clock.paused = true;
    expect(follower.shown(NOW + HIDDEN_MS)).toBe(false);
  });
});
