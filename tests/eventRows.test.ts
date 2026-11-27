import { describe, expect, it } from 'vitest';
import { Euler, Quaternion, Vector3 } from 'three';

import { DEG, julianDayFromDate } from '../src/core/units';
import {
  ONGOING_DAYS,
  coveredUntil,
  describeEvent,
  upcomingEvents,
  visibleRows,
  visibleUntil,
} from '../src/data/events';
import { setLanguage } from '../src/i18n';
import {
  geocentricLongitude,
  heliocentric,
  planetParades,
  satelliteEclipses,
  satelliteShadows,
  solarEclipses,
} from '../src/physics/events';

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

describe('ближайшие события', () => {
  // Кольцеобразное затмение 17 февраля 2026 года: момент берётся из самого
  // поиска, чтобы проверка мерила запас списка, а не точность эфемерид.
  const eclipse = solarEclipses(jd('2026-02-01T00:00:00Z'), jd('2026-03-01T00:00:00Z'))[0]!;
  const HOUR = 1 / 24;
  const eclipseIn = (rows: readonly { jd: number; id: string }[]) =>
    rows.some((row) => row.id.startsWith('solar-eclipse') && Math.abs(row.jd - eclipse.jd) < HOUR);

  it('затмение за пару часов до максимума стоит в списке', () => {
    expect(eclipseIn(upcomingEvents(eclipse.jd - 2 * HOUR, 0.1))).toBe(true);
  });

  it('идущее прямо сейчас затмение тоже стоит в списке', () => {
    expect(eclipseIn(upcomingEvents(eclipse.jd + 2 * HOUR, 0.1))).toBe(true);
  });

  it('прошедшее накануне затмение в список не попадает', () => {
    expect(eclipseIn(upcomingEvents(eclipse.jd + 1, 0.1))).toBe(false);
  });
});

describe('затмения у других планет в списке', () => {
  const from = jd('2026-11-27T00:00:00Z');
  const ioShadow = satelliteShadows('io', from, from + 3)[0]!;
  const phobosShadow = satelliteShadows('phobos', from, from + 3)[0]!;
  const ioEclipse = satelliteEclipses('io', from, from + 3)[0]!;

  it('названы по участникам на обоих языках', () => {
    try {
      expect(describeEvent(ioShadow).title).toBe('Тень Ио на Юпитере');
      expect(describeEvent(phobosShadow).title).toBe('Тень Фобоса на Марсе');
      expect(describeEvent(ioEclipse).title).toBe('Ио в тени Юпитера');
      expect(describeEvent(phobosShadow).hint).toContain('кольцеобразное');

      setLanguage('en');
      expect(describeEvent(ioShadow).title).toBe("Io's shadow on Jupiter");
      expect(describeEvent(ioEclipse).title).toBe("Io in Jupiter's shadow");
      expect(describeEvent(phobosShadow).hint).toContain('annular');
    } finally {
      setLanguage('ru');
    }
  });

  it('камера летит к планете, на которую легла тень, и время идёт реальное', () => {
    const row = describeEvent(ioShadow);
    expect(row.body).toBe('jupiter');
    expect(row.state.timeScale).toBeCloseTo(1 / 86_400, 12);
    expect(row.state.paused).toBe(false);

    // Камера со стороны Ио: тень лежит там, куда смотрит эта прямая.
    const view = row.state.view;
    if (view.kind !== 'body') throw new Error('вид не на тело');
    const toIo = toScene({
      x: heliocentric('io', ioShadow.jd).x - heliocentric('jupiter', ioShadow.jd).x,
      y: heliocentric('io', ioShadow.jd).y - heliocentric('jupiter', ioShadow.jd).y,
      z: heliocentric('io', ioShadow.jd).z - heliocentric('jupiter', ioShadow.jd).z,
    }).normalize();
    expect(Math.asin(toIo.y) / DEG).toBeCloseTo(view.elevation, 6);
  });

  it('стоят своей группой, отдельно от событий земного неба', () => {
    expect(describeEvent(ioShadow).group).toBe('planets');
    expect(describeEvent(ioEclipse).group).toBe('planets');
    const earth = solarEclipses(jd('2026-08-01T00:00:00Z'), jd('2026-09-01T00:00:00Z'))[0]!;
    expect(describeEvent(earth).group).toBe('sky');
  });

  it('спутник в тени: камера у самого спутника', () => {
    expect(describeEvent(ioEclipse).body).toBe('io');
  });

  it('ключи строк различаются у двух теней в один и тот же час', () => {
    const europa = { ...ioShadow, bodies: ['europa', 'jupiter'] };
    expect(describeEvent(ioShadow).id).not.toBe(describeEvent(europa).id);
  });
});

describe('что из найденного показать сейчас', () => {
  const from = jd('2026-11-27T00:00:00Z');
  const rows = upcomingEvents(from, 0.2);
  const io = <T extends { key: string }>(list: readonly T[]) =>
    list.filter((r) => r.key === 'satellite-shadow-io-jupiter');

  it('от спутника одна строка - ближайшая', () => {
    expect(io(rows).length).toBeGreaterThan(5);
    const shown = io(visibleRows(rows, from));
    expect(shown).toHaveLength(1);
    expect(shown[0]).toBe(io(rows)[0]);
  });

  it('когда тень прошла, на её место встаёт следующая, без нового поиска', () => {
    const [first, second] = io(rows);
    const later = visibleRows(rows, first!.jd + ONGOING_DAYS + 0.01);
    expect(io(later)).toEqual([second]);
    // Земное событие, которое ещё впереди, при этом остаётся.
    expect(later.some((r) => r.group === 'sky')).toBe(true);
  });

  it('идущее событие ещё стоит в списке, кончившееся уходит', () => {
    const [first] = io(rows);
    expect(io(visibleRows(rows, first!.jd + ONGOING_DAYS - 0.01))[0]).toBe(first);
    expect(io(visibleRows(rows, first!.jd + ONGOING_DAYS + 0.01))[0]).not.toBe(first);
  });

  it('показанное устаревает, когда уходит первая из показанных строк', () => {
    const shown = visibleRows(rows, from);
    expect(visibleUntil(shown)).toBeCloseTo(Math.min(...shown.map((r) => r.jd)) + ONGOING_DAYS, 9);
  });

  it('новый поиск нужен, когда у какого-то спутника кончились найденные затмения', () => {
    const covered = coveredUntil(rows);
    // Когда уходит первая из показанных строк, найденного ещё хватает: её
    // место займёт следующая из того же поиска. Раньше всех кончаются
    // затмения Каллисто - у неё одно-два в месяц, но и их хватает больше
    // чем на месяц.
    expect(covered).toBeGreaterThan(visibleUntil(visibleRows(rows, from)));
    expect(covered).toBeGreaterThan(from + 30);
    // А после него строка какого-то спутника опустела бы.
    const keys = new Set(rows.filter((r) => r.group === 'planets').map((r) => r.key));
    const left = new Set(visibleRows(rows, covered + 0.01).filter((r) => r.group === 'planets').map((r) => r.key));
    expect(left.size).toBeLessThan(keys.size);
  });
});
