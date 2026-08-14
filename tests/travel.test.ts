import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';

import {
  easeInOut,
  interpolateDistance,
  slerpDirection,
  travelDuration,
} from '../src/camera/travel';
import { pickBody, type PickCandidate } from '../src/ui/picking';
import { AU } from '../src/core/units';

describe('travelDuration', () => {
  it('короткий прыжок укладывается в нижнюю границу', () => {
    // От Земли к Луне: сближение всего в два порядка.
    expect(travelDuration(384400, 5900)).toBeGreaterThanOrEqual(2.5);
    expect(travelDuration(384400, 5900)).toBeLessThan(4);
  });

  it('бросок через всю систему длиннее, но не в тысячу раз', () => {
    const short = travelDuration(384400, 5900);
    const long = travelDuration(28 * AU, 87000);

    expect(long).toBeGreaterThan(short);
    expect(long).toBeLessThanOrEqual(7);
  });

  it('длительность ограничена сверху даже при абсурдном сближении', () => {
    expect(travelDuration(1e13, 1)).toBeLessThanOrEqual(7);
  });

  it('перелёт «на месте» не даёт отрицательной длительности', () => {
    expect(travelDuration(1000, 100000)).toBeGreaterThanOrEqual(2.5);
  });
});

describe('interpolateDistance', () => {
  it('концы отрезка воспроизводятся точно', () => {
    expect(interpolateDistance(1e9, 1e5, 0)).toBeCloseTo(1e9, 0);
    expect(interpolateDistance(1e9, 1e5, 1)).toBeCloseTo(1e5, 0);
  });

  it('середина пути — среднее геометрическое, а не арифметическое', () => {
    // Ровно в этом смысл: тело растёт на экране равномерно, а не рывком в конце.
    expect(interpolateDistance(1e8, 1e4, 0.5)).toBeCloseTo(1e6, 0);
  });

  it('за пределами отрезка значение не убегает', () => {
    expect(interpolateDistance(1e8, 1e4, 2)).toBeCloseTo(1e4, 0);
    expect(interpolateDistance(1e8, 1e4, -1)).toBeCloseTo(1e8, 0);
  });
});

describe('easeInOut', () => {
  it('начинается и заканчивается с нулевой скоростью', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    // Производная на концах: приращение у края много меньше, чем в середине.
    const atStart = easeInOut(0.02) - easeInOut(0);
    const atMiddle = easeInOut(0.52) - easeInOut(0.5);
    expect(atStart).toBeLessThan(atMiddle / 5);
  });

  it('монотонна и зажата в отрезок', () => {
    let previous = -1;
    for (let t = -0.5; t <= 1.5; t += 0.05) {
      const value = easeInOut(t);
      expect(value).toBeGreaterThanOrEqual(previous - 1e-9);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      previous = value;
    }
  });
});

describe('slerpDirection', () => {
  it('концы дуги воспроизводятся', () => {
    const from = new Vector3(1, 0, 0);
    const to = new Vector3(0, 1, 0);

    expect(slerpDirection(from, to, 0).angleTo(from)).toBeCloseTo(0, 9);
    expect(slerpDirection(from, to, 1).angleTo(to)).toBeCloseTo(0, 9);
  });

  it('середина дуги равноудалена от концов', () => {
    const from = new Vector3(1, 0, 0);
    const to = new Vector3(0, 0, 1);
    const middle = slerpDirection(from, to, 0.5);

    expect(middle.angleTo(from)).toBeCloseTo(middle.angleTo(to), 9);
    expect(middle.angleTo(from)).toBeCloseTo(Math.PI / 4, 9);
  });

  it('длина сохраняется — иначе камера проваливалась бы внутрь планеты', () => {
    const from = new Vector3(1, 0, 0);
    const to = new Vector3(-1, 0.02, 0).normalize();

    for (let t = 0; t <= 1; t += 0.1) {
      expect(slerpDirection(from, to, t).length()).toBeCloseTo(1, 9);
    }
  });

  it('противоположные направления обходятся по дуге, а не через ноль', () => {
    const from = new Vector3(1, 0, 0);
    const to = new Vector3(-1, 0, 0);
    const middle = slerpDirection(from, to, 0.5);

    expect(middle.length()).toBeCloseTo(1, 9);
    expect(Math.abs(middle.dot(from))).toBeLessThan(1e-6);
  });
});

describe('pickBody', () => {
  const WIDTH = 1600;
  const HEIGHT = 900;

  function camera(): PerspectiveCamera {
    const c = new PerspectiveCamera(55, WIDTH / HEIGHT, 1e-3, 1e13);
    c.position.set(0, 0, 0);
    c.updateMatrixWorld(true);
    return c;
  }

  function candidate(id: string, position: Vector3, radius: number, drawn = true): PickCandidate {
    return { id, renderPosition: position, radius, isDrawn: () => drawn };
  }

  it('точка размером меньше пикселя всё равно выбирается по допуску', () => {
    const far = candidate('pluto', new Vector3(0, 0, -1e9), 1188);
    const hit = pickBody(WIDTH / 2, HEIGHT / 2, [far], camera(), WIDTH, HEIGHT);

    expect(hit?.candidate.id).toBe('pluto');
  });

  it('промах дальше допуска ничего не возвращает', () => {
    const far = candidate('pluto', new Vector3(0, 0, -1e9), 1188);
    const hit = pickBody(WIDTH / 2 + 60, HEIGHT / 2, [far], camera(), WIDTH, HEIGHT);

    expect(hit).toBeNull();
  });

  it('по крупному диску можно попасть далеко от его центра', () => {
    // Земля с двух радиусов занимает почти весь кадр: клик в край — тоже клик.
    const earth = candidate('earth', new Vector3(0, 0, -12756), 6378);
    const hit = pickBody(WIDTH / 2 + 200, HEIGHT / 2, [earth], camera(), WIDTH, HEIGHT);

    expect(hit?.candidate.id).toBe('earth');
  });

  it('невидимое тело выбрать нельзя', () => {
    const hidden = candidate('pluto', new Vector3(0, 0, -1e9), 1188, false);

    expect(pickBody(WIDTH / 2, HEIGHT / 2, [hidden], camera(), WIDTH, HEIGHT)).toBeNull();
  });

  it('тело за спиной не выбирается, хотя его проекция попала бы в центр', () => {
    const behind = candidate('mars', new Vector3(0, 0, 1e8), 3396);

    expect(pickBody(WIDTH / 2, HEIGHT / 2, [behind], camera(), WIDTH, HEIGHT)).toBeNull();
  });

  it('из двух тел на одном луче выбирается ближнее', () => {
    const near = candidate('near', new Vector3(0, 0, -1e6), 3000);
    const far = candidate('far', new Vector3(0, 0, -1e9), 3000);

    const hit = pickBody(WIDTH / 2, HEIGHT / 2, [far, near], camera(), WIDTH, HEIGHT);

    expect(hit?.candidate.id).toBe('near');
  });

  it('точку за диском закрывает сам диск', () => {
    // Далёкая точка ровно под курсором, но её место на экране накрыто диском
    // ближней планеты. В кадре в этом месте видна планета, её и выбираем.
    const point = candidate('point', new Vector3(0, 0, -1e9), 1000);
    const disc = candidate('disc', new Vector3(-3000, 0, -12756), 6378);

    const hit = pickBody(WIDTH / 2, HEIGHT / 2, [disc, point], camera(), WIDTH, HEIGHT);

    expect(hit?.candidate.id).toBe('disc');
  });

  it('точка перед диском остаётся выбираемой', () => {
    // Спутник на фоне своей планеты: он ближе камеры и потому виден.
    const moon = candidate('moon', new Vector3(0, 0, -8000), 1737);
    const planet = candidate('planet', new Vector3(0, 0, -400000), 71492);

    const hit = pickBody(WIDTH / 2, HEIGHT / 2, [planet, moon], camera(), WIDTH, HEIGHT);

    expect(hit?.candidate.id).toBe('moon');
  });

  it('из нескольких точек в одном пикселе выбирается самая крупная', () => {
    // С орбиты Земли Юпитер и Ганимед стоят в одном пикселе. Клик по этому
    // пикселю означает Юпитер, даже если спутник оказался ближе к курсору.
    const jupiter = candidate('jupiter', new Vector3(0, 0, -6.3e8), 71492);
    const ganymede = candidate('ganymede', new Vector3(1e5, 0, -6.3e8), 2631);

    const hit = pickBody(WIDTH / 2, HEIGHT / 2, [ganymede, jupiter], camera(), WIDTH, HEIGHT);

    expect(hit?.candidate.id).toBe('jupiter');
  });
});
