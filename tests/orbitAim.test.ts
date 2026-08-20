import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';

import { FlightControls } from '../src/camera/flight';

/**
 * Взгляд в орбитальном режиме.
 *
 * Орбитальный режим обещает, что тело остаётся на месте в кадре, пока камера
 * ходит вокруг него. Держится это обещание не сглаживанием: положение камеры
 * орбита уже сглаживает сама, и если пропустить взгляд через второй
 * сглаживатель, к нему добавится отставание, пропорциональное скорости
 * вращения. Хуже того, отставание пересчитывается из длительности кадра — и
 * вместе с её колебаниями тело дрожит вправо-влево. В экскурсии, где вращение
 * идёт непрерывно, это видно прямо на глаз.
 */

/**
 * Заглушки на события. Полёт при создании подписывается на мышь и клавиатуру,
 * а больше ничего от страницы не берёт: здесь проверяется его математика, и
 * тащить ради двух подписок целый поддельный браузер незачем.
 */
const listeners = { addEventListener() {}, removeEventListener() {} };
Object.assign(globalThis, { document: listeners, window: listeners });

const BODY = new Vector3(1.33e8, 0, 7.15e7);
const RADIUS = 6371;
const DISTANCE = RADIUS * 3.4;

/** Скорость, с которой экскурсия поворачивает тело, рад/с. */
const RATE = 0.47;

/** Длительности кадров: нарочно неровные, как на живой машине. */
const FRAMES = [0.0166, 0.0170, 0.0333, 0.0161, 0.0169, 0.0501, 0.0167, 0.0166, 0.0250, 0.0168];

/** На сколько градусов взгляд промахивается мимо центра тела. */
function missDegrees(flight: FlightControls): number {
  const forward = new Vector3(0, 0, -1).applyQuaternion(flight.quaternion);
  const toBody = new Vector3().subVectors(BODY, flight.worldPosition).normalize();
  return (Math.acos(Math.min(1, Math.max(-1, forward.dot(toBody)))) * 180) / Math.PI;
}

/**
 * Прогнать орбитальный режим так, как это делает кадровый цикл: орбита
 * переставляет камеру, взгляд наводится на тело, полёт обновляется.
 */
function orbitAround(seconds: number): number[] {
  const flight = new FlightControls(listeners as unknown as HTMLElement);
  let azimuth = 0;

  const place = () => {
    flight.worldPosition.set(
      BODY.x + Math.sin(azimuth) * DISTANCE,
      BODY.y,
      BODY.z + Math.cos(azimuth) * DISTANCE,
    );
  };

  place();
  flight.placeLookingAt(flight.worldPosition.clone(), BODY);

  const misses: number[] = [];
  let elapsed = 0;
  for (let i = 0; elapsed < seconds; i += 1) {
    const dt = FRAMES[i % FRAMES.length]!;
    elapsed += dt;

    azimuth += RATE * dt;
    place();
    flight.holdAimAt(BODY);
    flight.update(dt, DISTANCE - RADIUS);

    misses.push(missDegrees(flight));
  }
  return misses;
}

describe('взгляд в орбитальном режиме', () => {
  it('держит тело в центре кадра, пока камера идёт вокруг него', () => {
    const misses = orbitAround(3).slice(5);

    // Десятая доля градуса на кадре высотой 800 точек — меньше пикселя.
    expect(Math.max(...misses)).toBeLessThan(0.1);
  });

  it('не дрожит от неровных кадров', () => {
    const misses = orbitAround(3).slice(5);
    const swing = Math.max(...misses) - Math.min(...misses);

    // Дрожание — это когда промах гуляет вслед за длительностью кадра.
    // До исправления размах был около трети градуса, то есть шесть точек.
    expect(swing).toBeLessThan(0.02);
  });
});
