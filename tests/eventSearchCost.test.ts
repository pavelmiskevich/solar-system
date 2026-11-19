import { describe, expect, it, vi } from 'vitest';

import { findEvents, heliocentric, solarEclipses } from '../src/physics/events';
import { moonPositionAt } from '../src/physics/moon';

vi.mock('../src/physics/moon', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/physics/moon')>();
  return { ...original, moonPositionAt: vi.fn(original.moonPositionAt) };
});

const JD_2026 = 2461041.5;

describe('цена поиска событий', () => {
  it('ряд Луны считается не больше одного раза на момент', () => {
    // Ряд Луны - самое дорогое в поиске. Раньше он считался заново на каждое
    // положение Земли или Луны, по нескольку раз на один и тот же момент.
    const calls = vi.mocked(moonPositionAt);
    calls.mockClear();

    findEvents(JD_2026, JD_2026 + 365.25);

    const moments = calls.mock.calls.map(([jd]) => jd);
    const distinct = new Set(moments).size;
    expect(moments.length, `${moments.length} расчётов на ${distinct} моментов`).toBeLessThan(
      distinct * 1.2,
    );
  });

  it('с кешем находится ровно то же, что без него', () => {
    // Без кеша - поиск по одному роду: кеш заводит только findEvents.
    const cached = findEvents(JD_2026, JD_2026 + 365.25).filter((e) => e.kind === 'solar-eclipse');
    const plain = solarEclipses(JD_2026, JD_2026 + 365.25);

    expect(cached).toEqual(plain);
    expect(plain.length).toBeGreaterThan(0);
  });

  it('вне поиска кеша нет, и положение Земли - на спрошенный момент', () => {
    findEvents(JD_2026, JD_2026 + 30);
    const calls = vi.mocked(moonPositionAt);
    calls.mockClear();

    const earth = heliocentric('earth', JD_2026 + 10);
    const moon = heliocentric('moon', JD_2026 + 10);
    expect(calls).toHaveBeenCalledTimes(2);
    // Земля и Луна различаются на расстояние до Луны, а не совпадают.
    const apart = Math.hypot(moon.x - earth.x, moon.y - earth.y, moon.z - earth.z);
    expect(apart).toBeGreaterThan(350_000);
    expect(apart).toBeLessThan(410_000);
  });
});
