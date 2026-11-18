import { describe, expect, it } from 'vitest';

import { isSoftwareRenderer, msaaSamples } from '../src/core/renderer';

describe('программный рендерер', () => {
  it('узнаётся по имени у Chrome, Firefox и Windows', () => {
    const software = [
      'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
      'llvmpipe (LLVM 15.0.7, 256 bits)',
      'Microsoft Basic Render Driver',
      'Google SwiftShader',
    ];
    for (const name of software) expect(isSoftwareRenderer(name), name).toBe(true);
  });

  it('видеокарта программной не считается', () => {
    const hardware = [
      'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'Apple M2',
      'Mali-G78',
      'Adreno (TM) 650',
      'WebKit WebGL',
    ];
    for (const name of hardware) expect(isSoftwareRenderer(name), name).toBe(false);
  });
});

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
