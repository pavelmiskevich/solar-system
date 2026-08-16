import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';

import { OrbitControls } from '../src/camera/orbit';

const BODY = new Vector3(1e8, 2e7, -3e8);
const RADIUS = 60268;

/** Прогнать сглаживание до установившегося положения. */
function settle(orbit: OrbitControls, body: Vector3, radius: number, seconds = 5): Vector3 {
  const out = new Vector3();
  for (let t = 0; t < seconds; t += 1 / 60) orbit.update(1 / 60, body, radius, out);
  return out;
}

function engaged(distanceInRadii = 4): OrbitControls {
  const orbit = new OrbitControls();
  const camera = BODY.clone().add(new Vector3(RADIUS * distanceInRadii, 0, 0));
  orbit.engage(camera, BODY);
  return orbit;
}

describe('включение режима', () => {
  it('не сдвигает камеру: углы берутся из того, где она уже стоит', () => {
    // Иначе включение дёргало бы кадр, а происходит оно само, по прибытии.
    const orbit = new OrbitControls();
    const camera = BODY.clone().add(new Vector3(3e5, 1e5, -2e5));
    orbit.engage(camera, BODY);

    const out = new Vector3();
    orbit.update(1 / 60, BODY, RADIUS, out);

    expect(out.distanceTo(camera)).toBeLessThan(1);
  });

  it('запоминает расстояние до центра тела', () => {
    const orbit = engaged(4);
    expect(orbit.radius).toBeCloseTo(RADIUS * 4, 3);
  });
});

describe('вращение протаскиванием', () => {
  it('меняет ракурс, но не расстояние', () => {
    const orbit = engaged(4);
    const before = settle(orbit, BODY, RADIUS);

    orbit.drag(300, 0, 900);
    const after = settle(orbit, BODY, RADIUS);

    // Расстояние сохраняется — это главное свойство орбитального режима.
    expect(after.distanceTo(BODY)).toBeCloseTo(before.distanceTo(BODY), 0);
    // А ракурс изменился.
    expect(after.distanceTo(before)).toBeGreaterThan(RADIUS);
  });

  it('протаскивание на всю высоту кадра поворачивает на половину оборота', () => {
    const orbit = engaged(4);
    const before = settle(orbit, BODY, RADIUS);

    orbit.drag(900, 0, 900);
    const after = settle(orbit, BODY, RADIUS);

    // Половина оборота ставит камеру с противоположной стороны: расстояние
    // между двумя положениями равно диаметру окружности облёта.
    expect(after.distanceTo(before)).toBeCloseTo(2 * RADIUS * 4, -2);
  });

  it('не заваливается через полюс', () => {
    const orbit = engaged(4);

    // Тянем далеко вверх — гораздо дальше, чем нужно для подъёма к полюсу.
    orbit.drag(0, -5000, 900);
    const out = settle(orbit, BODY, RADIUS);

    const height = (out.y - BODY.y) / out.distanceTo(BODY);
    // У самого полюса направление на тело вырождается, поэтому туда не пускаем.
    expect(height).toBeLessThan(1);
    expect(height).toBeGreaterThan(0.99);
    expect(Number.isFinite(out.x)).toBe(true);
  });

  it('азимут не разматывается при обороте через 2π', () => {
    const orbit = engaged(4);
    const before = settle(orbit, BODY, RADIUS);

    // Полный оборот возвращает камеру туда же, откуда начали.
    orbit.drag(1800, 0, 900);
    const after = settle(orbit, BODY, RADIUS, 10);

    expect(after.distanceTo(before)).toBeLessThan(RADIUS * 0.05);
  });
});

describe('приближение колесом', () => {
  it('меняет расстояние, но не ракурс', () => {
    const orbit = engaged(8);
    const before = settle(orbit, BODY, RADIUS);

    orbit.zoom(-1);
    const after = settle(orbit, BODY, RADIUS);

    expect(after.distanceTo(BODY)).toBeLessThan(before.distanceTo(BODY));

    // Направление от тела на камеру не изменилось — двигались строго по лучу.
    const dirBefore = before.clone().sub(BODY).normalize();
    const dirAfter = after.clone().sub(BODY).normalize();
    expect(dirBefore.dot(dirAfter)).toBeCloseTo(1, 6);
  });

  it('не пускает внутрь тела, сколько ни крути', () => {
    const orbit = engaged(4);
    for (let i = 0; i < 50; i += 1) orbit.zoom(-1);

    const out = settle(orbit, BODY, RADIUS, 20);

    expect(out.distanceTo(BODY)).toBeGreaterThan(RADIUS);
  });

  it('отпускает режим, когда тело отдаляется до точки', () => {
    const orbit = engaged(4);
    for (let i = 0; i < 60; i += 1) orbit.zoom(1);

    const out = new Vector3();
    const alive = orbit.update(1 / 60, BODY, RADIUS, out);

    // Вращать вокруг того, что стало точкой, нечего — режим выключается сам.
    expect(alive).toBe(false);
    expect(orbit.isActive).toBe(false);
  });
});

describe('выключение', () => {
  it('после release режим ничего не считает', () => {
    const orbit = engaged(4);
    orbit.release();

    const out = new Vector3(42, 42, 42);
    expect(orbit.update(1 / 60, BODY, RADIUS, out)).toBe(false);
    // Позиция не тронута: режим выключен и на камеру больше не влияет.
    expect(out.x).toBe(42);
  });

  it('выключенный режим не реагирует на мышь', () => {
    const orbit = engaged(4);
    orbit.release();

    orbit.drag(500, 500, 900);
    orbit.zoom(-1);

    expect(orbit.isActive).toBe(false);
  });
});

describe('движение тела', () => {
  it('камера следует за телом, сохраняя ракурс и расстояние', () => {
    // Планета идёт по орбите; облёт не должен от этого сбиваться.
    const orbit = engaged(4);
    const before = settle(orbit, BODY, RADIUS);
    const offsetBefore = before.clone().sub(BODY);

    const moved = BODY.clone().add(new Vector3(5e6, 0, 1e6));
    const after = settle(orbit, moved, RADIUS);
    const offsetAfter = after.clone().sub(moved);

    expect(offsetAfter.distanceTo(offsetBefore)).toBeLessThan(1);
  });
});
