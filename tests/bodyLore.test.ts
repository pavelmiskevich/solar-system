import { describe, expect, it } from 'vitest';

import { ALL_BODIES } from '../src/data/bodies';
import { bodiesWithoutLore, bodyLore } from '../src/data/bodyLore';
import { formatTemperature } from '../src/ui/bodyCard';

describe('bodyLore', () => {
  it('сведения есть у каждого тела сцены', () => {
    // Тело появляется в сцене из bodies.ts, а сюда его дописать забывают —
    // и карточка молча теряет половину строк.
    expect(bodiesWithoutLore()).toEqual([]);
  });

  it('у каждого тела заполнены все поля карточки', () => {
    for (const body of ALL_BODIES) {
      const lore = bodyLore(body.id)!;

      expect(Number.isFinite(lore.temperatureC), body.id).toBe(true);
      expect(lore.atmosphere.length, body.id).toBeGreaterThan(0);
      expect(lore.note.length, body.id).toBeGreaterThan(0);
      // Примета — предложение, а не ярлык: с большой буквы и с точкой.
      expect(lore.note[0], body.id).toBe(lore.note[0]!.toUpperCase());
      expect(lore.note.endsWith('.'), body.id).toBe(true);
    }
  });

  it('число спутников есть у планет и отсутствует там, где вопроса нет', () => {
    expect(bodyLore('earth')!.moons).toBe(1);
    expect(bodyLore('mars')!.moons).toBe(2);
    expect(bodyLore('mercury')!.moons).toBe(0);
    expect(bodyLore('pluto')!.moons).toBe(5);

    // У Солнца спутники — сами планеты, у спутников своих спутников не бывает.
    expect(bodyLore('sun')!.moons).toBeNull();
    expect(bodyLore('moon')!.moons).toBeNull();
    expect(bodyLore('titan')!.moons).toBeNull();
  });

  it('температуры не спорят со здравым смыслом', () => {
    // Венера горячее Меркурия, хотя дальше от Солнца: парниковый эффект.
    expect(bodyLore('venus')!.temperatureC).toBeGreaterThan(bodyLore('mercury')!.temperatureC);
    // Дальше от Солнца — холоднее, у планет это выдерживается подряд.
    const order = ['earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
    for (let i = 1; i < order.length; i += 1) {
      expect(
        bodyLore(order[i]!)!.temperatureC,
        `${order[i]} холоднее ${order[i - 1]}`,
      ).toBeLessThan(bodyLore(order[i - 1]!)!.temperatureC);
    }
  });
});

describe('formatTemperature', () => {
  it('знак ставится всегда, в том числе плюс', () => {
    // Без плюса «15 °C» рядом с «−63 °C» читается как потерянный минус.
    expect(formatTemperature(15)).toBe('+15 °C');
    expect(formatTemperature(-63)).toBe('−63 °C');
    expect(formatTemperature(0)).toBe('+0 °C');
  });

  it('дробные градусы округляются', () => {
    expect(formatTemperature(-108.4)).toBe('−108 °C');
    expect(formatTemperature(463.6)).toBe('+464 °C');
  });
});
