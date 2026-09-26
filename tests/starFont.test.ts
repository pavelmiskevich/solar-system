import { describe, expect, it } from 'vitest';

import { GLYPH_GAP, SPACE_ADVANCE, SUPPORTED, glyphFor } from '../src/data/starFont';

describe('звёздный шрифт', () => {
  it('знает каждый заявленный знак, кроме пробела', () => {
    for (const char of SUPPORTED.replace(' ', '')) {
      expect(glyphFor(char), char).toBeDefined();
    }
  });

  it('держит вершины в клетке буквы', () => {
    for (const char of SUPPORTED.replace(' ', '')) {
      const glyph = glyphFor(char)!;
      for (const [x, y] of glyph.points) {
        expect(x, char).toBeGreaterThanOrEqual(-0.1);
        expect(x, char).toBeLessThanOrEqual(glyph.width + 0.1);
        expect(y, char).toBeGreaterThanOrEqual(-0.25);
        expect(y, char).toBeLessThanOrEqual(1.25);
      }
    }
  });

  it('не рисует чертёж: не больше десяти вершин на букву', () => {
    for (const char of SUPPORTED.replace(' ', '')) {
      expect(glyphFor(char)!.points.length, char).toBeLessThanOrEqual(10);
    }
  });

  it('ссылается рёбрами только на свои вершины и без петель', () => {
    for (const char of SUPPORTED.replace(' ', '')) {
      const glyph = glyphFor(char)!;
      for (const [a, b] of glyph.edges) {
        expect(a, char).not.toBe(b);
        expect(glyph.points[a], char).toBeDefined();
        expect(glyph.points[b], char).toBeDefined();
      }
    }
  });

  it('делит начертание у одинаковых русских и латинских букв', () => {
    for (const [ru, en] of [['А', 'A'], ['В', 'B'], ['Е', 'E'], ['К', 'K'], ['М', 'M'],
      ['Н', 'H'], ['О', 'O'], ['Р', 'P'], ['С', 'C'], ['Т', 'T'], ['Х', 'X']] as const) {
      expect(glyphFor(en)).toBe(glyphFor(ru));
    }
  });

  it('не знает строчных: приводит их к заглавным не шрифт, а данные', () => {
    expect(glyphFor('а')).toBeUndefined();
  });

  it('ставит между буквами зазор, а пробел шире зазора', () => {
    expect(GLYPH_GAP).toBeGreaterThan(0);
    expect(SPACE_ADVANCE).toBeGreaterThan(GLYPH_GAP);
  });
});
