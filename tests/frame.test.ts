import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';

import { ReferenceFrame, type FrameTarget } from '../src/camera/frame';

function target(x: number, radius = 25559): FrameTarget & { worldPosition: Vector3 } {
  return { id: 'uranus', worldPosition: new Vector3(x, 0, 0), radius };
}

describe('ReferenceFrame', () => {
  it('без привязки камеру не трогает', () => {
    const frame = new ReferenceFrame();
    const camera = new Vector3(1, 2, 3);

    expect(frame.apply(camera)).toBe(false);
    expect(camera.toArray()).toEqual([1, 2, 3]);
  });

  it('камера сохраняет положение относительно тела', () => {
    const frame = new ReferenceFrame();
    const body = target(1e9);
    const camera = new Vector3(1e9 + 87000, 0, 0);

    frame.lockTo(body);

    // Тело прошло по орбите шестьсот тысяч километров — столько Уран проходит
    // за секунду реального времени при масштабе «сутки в секунду».
    body.worldPosition.set(1e9 + 590000, 12000, 0);
    frame.apply(camera);

    expect(camera.distanceTo(body.worldPosition)).toBeCloseTo(87000, 6);
  });

  it('привязка отпускается, если улететь далеко', () => {
    const frame = new ReferenceFrame();
    const body = target(1e9, 25559);
    const camera = new Vector3(1e9 + 87000, 0, 0);

    frame.lockTo(body);
    expect(frame.apply(camera)).toBe(true);

    // Тысяча радиусов — граница, за которой держаться за планету бессмысленно.
    camera.set(1e9 + 25559 * 1001, 0, 0);
    expect(frame.apply(camera)).toBe(false);
    expect(frame.targetId).toBeNull();
  });

  it('повторная привязка не тащит камеру за прошлым телом', () => {
    const frame = new ReferenceFrame();
    const first = target(1e9);
    const camera = new Vector3(1e9 + 87000, 0, 0);

    frame.lockTo(first);
    first.worldPosition.x += 590000;

    // Перепривязка к тому же телу на новом месте не должна давать скачка.
    frame.lockTo(first);
    frame.apply(camera);

    expect(camera.x).toBeCloseTo(1e9 + 87000, 6);
  });

  it('после release тело больше не тянет камеру', () => {
    const frame = new ReferenceFrame();
    const body = target(1e9);
    const camera = new Vector3(1e9 + 87000, 0, 0);

    frame.lockTo(body);
    frame.release();
    body.worldPosition.x += 1e6;

    expect(frame.apply(camera)).toBe(false);
    expect(camera.x).toBeCloseTo(1e9 + 87000, 6);
  });
});
