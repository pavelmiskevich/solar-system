import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';

import {
  isHiddenBehindDisc,
  keepWithoutOverlap,
  type LabelBox,
  type LabelDisc,
} from '../src/ui/labels';
import {
  angularRadiusPixels,
  projectToScreen,
  type ScreenPoint,
} from '../src/ui/projection';

const WIDTH = 1600;
const HEIGHT = 900;

function makeCamera(): PerspectiveCamera {
  const camera = new PerspectiveCamera(55, WIDTH / HEIGHT, 1e-3, 1e13);
  // Камера в начале координат и смотрит вдоль −z: ровно так её ставит
  // плавающее начало координат в главном цикле.
  camera.position.set(0, 0, 0);
  camera.updateMatrixWorld(true);
  return camera;
}

function point(): ScreenPoint {
  return { x: 0, y: 0, depth: 0 };
}

describe('projectToScreen', () => {
  it('тело прямо по курсу проецируется в центр кадра', () => {
    const out = point();
    const ok = projectToScreen(new Vector3(0, 0, -1e8), makeCamera(), WIDTH, HEIGHT, out);

    expect(ok).toBe(true);
    expect(out.x).toBeCloseTo(WIDTH / 2, 6);
    expect(out.y).toBeCloseTo(HEIGHT / 2, 6);
    expect(out.depth).toBeCloseTo(1e8, 0);
  });

  it('тело за спиной отбраковывается, а не зеркалится в кадр', () => {
    const out = point();
    const ok = projectToScreen(new Vector3(0, 0, 1e8), makeCamera(), WIDTH, HEIGHT, out);

    expect(ok).toBe(false);
    expect(out.depth).toBeLessThan(0);
  });

  it('смещение вправо и вверх даёт правую верхнюю половину кадра', () => {
    const out = point();
    projectToScreen(new Vector3(1e7, 1e7, -1e8), makeCamera(), WIDTH, HEIGHT, out);

    expect(out.x).toBeGreaterThan(WIDTH / 2);
    // Экранная ось y направлена вниз: «выше» значит меньше.
    expect(out.y).toBeLessThan(HEIGHT / 2);
  });

  it('точка на краю поля зрения попадает на границу кадра', () => {
    const camera = makeCamera();
    const out = point();
    const halfFov = ((camera.fov / 2) * Math.PI) / 180;
    const depth = 1e8;

    projectToScreen(new Vector3(0, Math.tan(halfFov) * depth, -depth), camera, WIDTH, HEIGHT, out);

    expect(out.y).toBeCloseTo(0, 6);
  });
});

describe('angularRadiusPixels', () => {
  it('радиус, равный одному пикселю поля зрения, даёт единицу', () => {
    const fov = 55;
    const radiansPerPixel = ((fov * Math.PI) / 180) / HEIGHT;
    const distance = 1e6;

    const pixels = angularRadiusPixels(radiansPerPixel * distance, distance, fov, HEIGHT);

    expect(pixels).toBeCloseTo(1, 9);
  });

  it('вдвое дальше — вдвое мельче', () => {
    const near = angularRadiusPixels(6378, 1e6, 55, HEIGHT);
    const far = angularRadiusPixels(6378, 2e6, 55, HEIGHT);

    expect(near / far).toBeCloseTo(2, 9);
  });

  it('Земля с расстояния в тысячу радиусов занимает меньше пикселя по радиусу', () => {
    // Проверка порядка величин: именно из-за неё далёкие тела рисуются точкой.
    expect(angularRadiusPixels(6378, 6378 * 1000, 55, HEIGHT)).toBeLessThan(1);
  });
});

describe('keepWithoutOverlap', () => {
  const box = (x: number, y: number, priority: number): LabelBox => ({
    x,
    y,
    halfWidth: 40,
    halfHeight: 12,
    priority,
  });

  it('разнесённые подписи остаются все', () => {
    expect(keepWithoutOverlap([box(0, 0, 1), box(200, 0, 2), box(0, 100, 3)])).toEqual([
      true,
      true,
      true,
    ]);
  });

  it('при наложении выживает подпись с большим приоритетом', () => {
    expect(keepWithoutOverlap([box(0, 0, 1), box(20, 5, 5)])).toEqual([false, true]);
  });

  it('исход не зависит от порядка тел в таблице', () => {
    const forward = keepWithoutOverlap([box(0, 0, 1), box(20, 5, 5)]);
    const backward = keepWithoutOverlap([box(20, 5, 5), box(0, 0, 1)]);

    expect(forward).toEqual([false, true]);
    expect(backward).toEqual([true, false]);
  });

  it('вытесненная подпись не освобождает место следующей за ней', () => {
    // Три подписи в одной точке: остаётся ровно одна, а не две.
    const kept = keepWithoutOverlap([box(0, 0, 3), box(5, 0, 2), box(10, 0, 1)]);

    expect(kept.filter(Boolean)).toHaveLength(1);
    expect(kept[0]).toBe(true);
  });

  it('касание ровно по границе прямоугольников наложением не считается', () => {
    expect(keepWithoutOverlap([box(0, 0, 1), box(80, 0, 2)])).toEqual([true, true]);
  });

  it('пустой список не ломает разбор', () => {
    expect(keepWithoutOverlap([])).toEqual([]);
  });
});

describe('подпись закрытого тела', () => {
  const disc = (x: number, y: number, radiusPx: number, depth: number): LabelDisc => ({
    x,
    y,
    radiusPx,
    depth,
  });

  it('спутник за диском планеты закрыт ею', () => {
    // Ганимед в 1.37 млн км за Юпитером в 0.33 млн, и проецируется на его диск.
    const jupiter = disc(800, 450, 185, 328_863);
    const ganymede = disc(845, 300, 1.2, 1_371_366);

    expect(isHiddenBehindDisc([jupiter, ganymede], 1)).toBe(true);
  });

  it('спутник перед диском планеты не закрыт', () => {
    const jupiter = disc(800, 450, 185, 328_863);
    const io = disc(845, 300, 1.4, 200_000);

    expect(isHiddenBehindDisc([jupiter, io], 1)).toBe(false);
  });

  it('спутник рядом с диском, но вне его, не закрыт', () => {
    const jupiter = disc(800, 450, 185, 328_863);
    const outside = disc(800, 450 - 200, 1.2, 1_371_366);

    expect(isHiddenBehindDisc([jupiter, outside], 1)).toBe(false);
  });

  it('далёкая точка не закрывает собой ничего', () => {
    // Совпадение на экране двух точек — не перекрытие: у точки нет диска.
    const near = disc(500, 500, 0.8, 1_000);
    const far = disc(500, 500, 0.5, 9_000_000);

    expect(isHiddenBehindDisc([near, far], 1)).toBe(false);
  });

  it('тело не закрывает само себя', () => {
    expect(isHiddenBehindDisc([disc(0, 0, 300, 1_000)], 0)).toBe(false);
  });

  it('тело вне кадра в расчёте не участвует', () => {
    const jupiter = disc(800, 450, 185, 328_863);

    expect(isHiddenBehindDisc([jupiter, null], 1)).toBe(false);
    expect(isHiddenBehindDisc([null, jupiter], 1)).toBe(false);
  });

  it('край диска подпись не гасит', () => {
    // Ровно на границе тело видно краем: мигать подписью там нельзя.
    const jupiter = disc(800, 450, 185, 328_863);
    const atLimb = disc(800 + 185, 450, 1.2, 1_371_366);

    expect(isHiddenBehindDisc([jupiter, atLimb], 1)).toBe(false);
  });
});
