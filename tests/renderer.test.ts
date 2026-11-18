import { describe, expect, it } from 'vitest';

import { msaaSamples } from '../src/core/renderer';

describe('сглаживание в буфере композитора', () => {
  it('при обычной плотности пикселей берётся', () => {
    // 0.75 - плотность 1 после того, как качество срезало разрешение: пиксель
    // стал крупнее, и лесенка заметнее, а не меньше.
    for (const ratio of [0.75, 1, 1.25]) expect(msaaSamples(ratio), `${ratio}`).toBe(4);
  });

  it('при плотности от полутора не берётся: лесенки и так не видно, а память дорога', () => {
    for (const ratio of [1.5, 2]) expect(msaaSamples(ratio), `${ratio}`).toBe(0);
  });
});
