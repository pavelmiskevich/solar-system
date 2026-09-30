import { describe, expect, it } from 'vitest';

import { STAR_PHASE, appearance, lineAppearance } from '../src/scene/inscription';

describe('проявление надписи', () => {
  it('зажигает звёзды по порядку письма', () => {
    const t = STAR_PHASE / 2;
    expect(appearance(t, 0, 10)).toBe(1);
    expect(appearance(t, 9, 10)).toBe(0);
  });

  it('к концу первой фазы горят все звёзды, а линии только начинают', () => {
    for (let i = 0; i < 10; i++) expect(appearance(STAR_PHASE + 0.5, i, 10)).toBe(1);
    expect(lineAppearance(STAR_PHASE)).toBe(0);
    expect(lineAppearance(STAR_PHASE + 5)).toBe(1);
  });

  it('не делит на ноль у надписи из одной звезды', () => {
    expect(appearance(STAR_PHASE, 0, 1)).toBe(1);
  });
});
