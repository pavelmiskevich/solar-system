import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';

import { AimLock } from '../src/camera/aimLock';
import { FlightControls } from '../src/camera/flight';

/**
 * Захват цели.
 *
 * Обещание простое: пока захват включён, тело не уходит из центра кадра, чем
 * бы камера ни занималась. Проверяется оно на настоящем полёте — его взгляд
 * сглажен, и весь вопрос в том, поспевает ли сглаживание за движением.
 */

/** Заглушки на подписки: полёту от страницы больше ничего не нужно. */
const listeners = { addEventListener() {}, removeEventListener() {} };
Object.assign(globalThis, { document: listeners, window: listeners });

/** Вертикальный угол зрения сцены и треть кадра по нему. */
const FOV = 55;
const CENTRAL_THIRD = FOV / 6;

/** Длительности кадров: нарочно неровные, как на живой машине. */
const FRAMES = [0.0166, 0.017, 0.0333, 0.0161, 0.0169, 0.0501, 0.0167, 0.0166, 0.025, 0.0168];

function flightAt(position: Vector3, lookingAt: Vector3): FlightControls {
  const flight = new FlightControls({ addEventListener() {}, removeEventListener() {} } as never);
  flight.placeLookingAt(position, lookingAt);
  return flight;
}

/** На сколько градусов взгляд промахивается мимо центра тела. */
function missDegrees(flight: FlightControls, body: Vector3): number {
  const forward = new Vector3(0, 0, -1).applyQuaternion(flight.quaternion);
  const toBody = new Vector3().subVectors(body, flight.worldPosition).normalize();
  return (Math.acos(Math.min(1, Math.max(-1, forward.dot(toBody)))) * 180) / Math.PI;
}

describe('захват цели', () => {
  it('включается и снимается тем же телом', () => {
    const aim = new AimLock();
    expect(aim.isActive).toBe(false);

    aim.toggle('mars');
    expect(aim.targetId).toBe('mars');

    aim.toggle('mars');
    expect(aim.isActive).toBe(false);
  });

  it('другим телом переключается, а не снимается', () => {
    const aim = new AimLock();
    aim.toggle('mars');
    aim.toggle('jupiter');

    expect(aim.targetId).toBe('jupiter');
  });

  it('держит тело в центре кадра, пока камера летит мимо', () => {
    const body = new Vector3(2.28e8, 0, 0);
    const radius = 3390;

    // Стартуем сбоку и смотрим в противоположную сторону: захват обязан
    // сначала довернуть камеру, а потом уже удерживать.
    const start = new Vector3(body.x, 0, radius * 40);
    const flight = flightAt(start, new Vector3(0, 0, 1e9));

    const aim = new AimLock();
    aim.toggle('mars');
    const target = { id: 'mars', worldPosition: body };

    // Пролёт мимо тела: за десять секунд камера проходит его насквозь и
    // уходит по другую сторону, так что направление на него разворачивается
    // почти на 180 градусов.
    const velocity = new Vector3(-radius * 8, 0, 0);

    let worst = 0;
    let elapsed = 0;
    for (let i = 0; elapsed < 10; i += 1) {
      const dt = FRAMES[i % FRAMES.length]!;
      elapsed += dt;

      flight.worldPosition.addScaledVector(velocity, dt);
      aim.hold(flight, target);
      flight.update(dt, radius * 10);

      // Первая секунда — доворот на цель, его в счёт не берём.
      if (elapsed > 1) worst = Math.max(worst, missDegrees(flight, body));
    }

    expect(worst).toBeLessThan(CENTRAL_THIRD);
  });

  it('без захвата взгляд не трогается', () => {
    const body = new Vector3(2.28e8, 0, 0);
    const flight = flightAt(new Vector3(0, 0, 0), new Vector3(0, 0, -1e9));
    const before = flight.quaternion.clone();

    const aim = new AimLock();
    aim.hold(flight, { id: 'mars', worldPosition: body });
    flight.update(1 / 60, 1e6);

    expect(flight.quaternion.angleTo(before)).toBeLessThan(1e-9);
  });

  it('снимается сам, если захваченного тела больше нет в сцене', () => {
    const aim = new AimLock();
    aim.toggle('mars');

    const flight = flightAt(new Vector3(0, 0, 0), new Vector3(0, 0, -1e9));
    aim.hold(flight, null);

    expect(aim.isActive).toBe(false);
  });
});
