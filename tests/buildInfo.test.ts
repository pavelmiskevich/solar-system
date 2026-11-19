import { describe, expect, it } from 'vitest';

import { buildVersion, versionLine } from '../src/core/buildInfo';
import { version } from '../package.json';

describe('строка версии', () => {
  it('версия и короткий хеш через точку', () => {
    expect(versionLine('0.17.4', 'cbd88f7')).toBe('v0.17.4 · cbd88f7');
  });

  it('без хеша - одна версия, без висящего разделителя', () => {
    expect(versionLine('0.17.4', '')).toBe('v0.17.4');
  });

  it('версия сборки берётся из package.json', () => {
    // vitest подставляет то же, что vite при разработке: вместо хеша dev.
    expect(buildVersion()).toBe(`v${version} · dev`);
  });
});
