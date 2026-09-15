import { describe, expect, it } from 'vitest';
import { Euler, Quaternion, Vector3 } from 'three';

import { DEG, julianDayFromDate } from '../src/core/units';
import { describeEvent } from '../src/data/events';
import { geocentricLongitude, heliocentric, planetParades } from '../src/physics/events';

/**
 * События как строки списка и как готовые виды.
 *
 * Поиск отвечает на вопрос «когда», а здесь проверяется «что человек увидит,
 * если щёлкнет по строке». У парада это не пустяк: смотреть на него надо не на
 * Землю, а с Земли наружу, и если камера развёрнута не туда, список показывает
 * пустое небо, оставаясь при этом совершенно правым по датам.
 */

const jd = (iso: string) => julianDayFromDate(new Date(iso));

/** Эклиптический вектор в оси сцены - тот же перевод, что и во всей сцене. */
function toScene(v: { x: number; y: number; z: number }): Vector3 {
  return new Vector3(v.x, v.z, -v.y);
}

/**
 * Куда смотрит камера свободного вида.
 *
 * Углы разворачиваются ровно так же, как это делает `applySceneState` в
 * main.ts: порядок YXZ, взгляд вдоль −z. Повторено здесь нарочно - проверка
 * обязана ловить расхождение с тем, как сцена читает эти два числа.
 */
function forwardOf(view: { yaw: number; pitch: number }): Vector3 {
  const orientation = new Quaternion().setFromEuler(
    new Euler(view.pitch * DEG, view.yaw * DEG, 0, 'YXZ'),
  );
  return new Vector3(0, 0, -1).applyQuaternion(orientation);
}

/** Единственный парад пяти планет на ближайшее столетие: сентябрь 2040. */
function parade2040() {
  const found = planetParades(jd('2040-08-01T00:00:00Z'), jd('2040-11-01T00:00:00Z'));
  return found.find((event) => event.bodies.length === 5)!;
}

describe('парад в списке событий', () => {
  it('назван числом планет и описан настоящей дугой', () => {
    const row = describeEvent(parade2040());

    expect(row.title).toContain('Парад планет');
    expect(row.title).toContain('все пять');
    // В строке стоит та же дуга, что и мера события: девять градусов.
    expect(row.hint).toContain('в дуге 9°');
    expect(row.hint).toContain('Меркурий');
    expect(row.hint).toContain('Сатурн');
  });

  it('камера встаёт у Земли и смотрит на середину дуги', () => {
    const event = parade2040();
    const row = describeEvent(event);

    expect(row.state.view.kind).toBe('free');
    if (row.state.view.kind !== 'free') return;

    const earth = toScene(heliocentric('earth', event.jd));
    const camera = new Vector3(...row.state.view.position);

    // Рядом с Землёй, но не внутри неё: сотни тысяч километров против ста
    // пятидесяти миллионов до Солнца - на направлении это не сказывается.
    const offset = camera.distanceTo(earth);
    expect(offset).toBeGreaterThan(6378 * 2);
    expect(offset).toBeLessThan(6378 * 200);

    // Каждая из пяти планет попадает в кадр: угол до неё меньше половины поля
    // зрения. Это и есть проверка разворота - ошибка в знаке любого из двух
    // углов уводит камеру в пустое небо, а даты при этом остаются верными.
    const forward = forwardOf(row.state.view);

    for (const id of event.bodies) {
      const toPlanet = toScene(heliocentric(id, event.jd)).sub(camera).normalize();
      const degrees = Math.acos(Math.min(1, forward.dot(toPlanet))) / DEG;

      expect(degrees, id).toBeLessThan(25);
    }
  });

  it('Земля остаётся за спиной, а не заслоняет кадр', () => {
    const event = parade2040();
    const row = describeEvent(event);
    if (row.state.view.kind !== 'free') throw new Error('ожидался свободный вид');

    const earth = toScene(heliocentric('earth', event.jd));
    const camera = new Vector3(...row.state.view.position);
    const toEarth = earth.clone().sub(camera).normalize();

    expect(forwardOf(row.state.view).dot(toEarth)).toBeLessThan(0);
  });

  it('сторона неба названа по положению относительно Солнца', () => {
    const event = parade2040();
    const row = describeEvent(event);

    const sunLongitude = geocentricLongitude('sun', event.jd);
    const difference =
      ((geocentricLongitude(event.bodies[0]!, event.jd) - sunLongitude + 540) % 360) - 180;

    // Восточнее Солнца - заходит после него, значит небо вечернее.
    expect(row.hint).toContain(difference > 0 ? 'вечернего' : 'утреннего');
  });
});
