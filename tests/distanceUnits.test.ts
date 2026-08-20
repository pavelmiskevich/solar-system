import { beforeEach, describe, expect, it } from 'vitest';

import { AU } from '../src/core/units';
import {
  cycleDistanceUnit,
  distanceUnit,
  formatDistance,
  formatDistanceIn,
  onDistanceUnitChange,
  setDistanceUnit,
} from '../src/ui/distanceUnits';

/** Расстояния, на которых видна разница между единицами. */
const MOON = 384_400;
const SUN = AU;
const NEPTUNE = 30 * AU;

describe('formatDistanceIn', () => {
  it('«по величине» подбирает единицу под расстояние', () => {
    // Прежнее поведение интерфейса: метры у поверхности, километры внутри
    // системы, астрономические единицы между планет.
    expect(formatDistanceIn(0.42, 'auto')).toBe('420 м');
    expect(formatDistanceIn(MOON, 'auto')).toContain('км');
    expect(formatDistanceIn(SUN, 'auto')).toContain('а.е.');
  });

  it('километры остаются километрами на любом расстоянии', () => {
    expect(formatDistanceIn(MOON, 'km')).toContain('км');
    expect(formatDistanceIn(NEPTUNE, 'km')).toContain('км');
    expect(formatDistanceIn(NEPTUNE, 'km')).not.toContain('а.е.');
  });

  it('астрономическая единица показывается степенью там, где она слишком велика', () => {
    expect(formatDistanceIn(SUN, 'au')).toBe('1.000 а.е.');
    expect(formatDistanceIn(NEPTUNE, 'au')).toBe('30.00 а.е.');
    // До Луны это 0.0026 — ещё читается.
    expect(formatDistanceIn(MOON, 'au')).toBe('0.003 а.е.');
    // А до низкой орбиты — 0.0000027, и здесь число уступает степени.
    expect(formatDistanceIn(400, 'au')).toMatch(/·10⁻⁶ а\.е\./);
  });

  it('световые минуты переходят в секунды там, где минута слишком велика', () => {
    // Восемь световых минут до Солнца — ради этой фразы задача и заведена.
    expect(formatDistanceIn(SUN, 'light')).toBe('8.32 св. мин');
    expect(formatDistanceIn(NEPTUNE, 'light')).toMatch(/св\. мин/);
    // До Луны 1.28 световой секунды; в минутах это 0.02 — число ни о чём.
    expect(formatDistanceIn(MOON, 'light')).toBe('1.28 св. с');
  });
});

describe('переключение единиц', () => {
  beforeEach(() => setDistanceUnit('auto'));

  it('обходит все единицы по кругу и возвращается к началу', () => {
    expect(distanceUnit()).toBe('auto');
    expect(cycleDistanceUnit()).toBe('km');
    expect(cycleDistanceUnit()).toBe('au');
    expect(cycleDistanceUnit()).toBe('light');
    expect(cycleDistanceUnit()).toBe('auto');
  });

  it('форматирование идёт по текущей единице', () => {
    expect(formatDistance(SUN)).toContain('а.е.');
    setDistanceUnit('light');
    expect(formatDistance(SUN)).toBe('8.32 св. мин');
  });

  it('о смене узнают подписчики — иначе новые единицы доходят не всюду', () => {
    let calls = 0;
    onDistanceUnitChange(() => (calls += 1));

    setDistanceUnit('km');
    expect(calls).toBe(1);

    // Повторный выбор той же единицы никого не будит: перерисовывать нечего.
    setDistanceUnit('km');
    expect(calls).toBe(1);
  });
});
