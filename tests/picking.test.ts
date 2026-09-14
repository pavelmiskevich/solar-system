import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';

import { pickBody, type PickCandidate } from '../src/ui/picking';

/**
 * Выбор тела под курсором.
 *
 * Всё здесь строится на настоящей камере three.js, а не на подставных
 * координатах: проверяется именно связка «проекция плюс правило выбора», и
 * подменять проекцию значило бы проверять половину.
 */

const WIDTH = 1280;
const HEIGHT = 720;

function camera(): PerspectiveCamera {
  const result = new PerspectiveCamera(50, WIDTH / HEIGHT, 1, 1e12);
  // Камера в начале координат смотрит вдоль -z: те же координаты сцены, в
  // которых живёт плавающее начало.
  result.updateMatrixWorld(true);
  result.updateMatrix();
  result.matrixWorldInverse.copy(result.matrixWorld).invert();
  return result;
}

function body(id: string, position: [number, number, number], radius: number): PickCandidate {
  return {
    id,
    renderPosition: new Vector3(...position),
    radius,
    isDrawn: () => true,
  };
}

const centre = { x: WIDTH / 2, y: HEIGHT / 2 };

describe('выбор тела под курсором', () => {
  it('в середину диска планеты не вклинивается спутник-крошка перед ней', () => {
    // Вид с тридцати радиусов Марса. Фобос обходит планету в 2.8 радиуса,
    // то есть почти всегда проецируется на её диск, а угловой размер у него
    // при этом - десятая доля пикселя: одиннадцать километров против трёх с
    // половиной тысяч.
    const distance = 3396.2 * 30;
    const mars = body('mars', [0, 0, -distance], 3396.2);
    const phobos = body('phobos', [120, 0, -distance * 0.92], 11.267);

    const hit = pickBody(centre.x, centre.y, [mars, phobos], camera(), WIDTH, HEIGHT);

    expect(hit?.candidate.id).toBe('mars');
  });

  it('спутник на диске планеты выбирается, если курсор ближе к нему', () => {
    // Ио на фоне Юпитера: вот ради чего точка вообще может побеждать диск.
    // Курсор наведён на спутник, а не на середину планеты.
    const distance = 71492 * 20;
    const jupiter = body('jupiter', [0, 0, -distance], 71492);
    const io = body('io', [40000, 0, -distance * 0.97], 1821.6);

    const camera_ = camera();
    const point = new Vector3(40000, 0, -distance * 0.97).project(camera_);
    const x = (point.x * 0.5 + 0.5) * WIDTH;
    const y = (0.5 - point.y * 0.5) * HEIGHT;

    const hit = pickBody(x, y, [jupiter, io], camera_, WIDTH, HEIGHT);

    expect(hit?.candidate.id).toBe('io');
  });

  it('из двух точек в одном пикселе выбирается крупная', () => {
    // Правило, которое было и раньше: с орбиты Земли Юпитер и его спутники
    // стоят в одном пикселе, и щелчок по нему означает Юпитер.
    const distance = 6e8;
    const jupiter = body('jupiter', [0, 0, -distance], 71492);
    const ganymede = body('ganymede', [1e6, 0, -distance], 2631.2);

    const hit = pickBody(centre.x, centre.y, [jupiter, ganymede], camera(), WIDTH, HEIGHT);

    expect(hit?.candidate.id).toBe('jupiter');
  });

  it('вдали от всех тел не выбирается ничего', () => {
    const mars = body('mars', [0, 0, -1e6], 3396.2);

    const hit = pickBody(20, 20, [mars], camera(), WIDTH, HEIGHT);

    expect(hit).toBeNull();
  });
});
