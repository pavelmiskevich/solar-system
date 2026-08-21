import { describe, expect, it } from 'vitest';

import { TIME_SCALES } from '../src/core/clock';
import { decodeSceneState, encodeSceneState } from '../src/core/sceneState';
import { julianDayFromDate } from '../src/core/units';

const JD_2032 = julianDayFromDate(new Date('2032-06-01T12:00:00Z'));

describe('состояние сцены в адресе', () => {
  it('вид вокруг тела переживает дорогу туда и обратно', () => {
    const state = {
      jd: JD_2032,
      timeScale: 1,
      paused: false,
      view: { kind: 'body', body: 'saturn', radii: 3.4, azimuth: 41.5, elevation: 12.25 },
    } as const;

    const decoded = decodeSceneState(encodeSceneState(state));

    expect(decoded.jd).toBeCloseTo(JD_2032, 6);
    expect(decoded.timeScale).toBeCloseTo(1, 9);
    // Пауза в адрес не пишется, когда её нет: отсутствие метки и означает
    // «время идёт», а лишний параметр только удлинял бы ссылку.
    expect(decoded.paused ?? false).toBe(false);
    expect(decoded.view).toEqual({
      kind: 'body',
      body: 'saturn',
      radii: 3.4,
      azimuth: 41.5,
      elevation: 12.25,
    });
  });

  it('свободный полёт переживает дорогу туда и обратно', () => {
    const state = {
      jd: JD_2032,
      timeScale: TIME_SCALES[9]!,
      paused: true,
      view: {
        kind: 'free',
        position: [149597870.7, -12000.5, 34567.25] as [number, number, number],
        yaw: -117.5,
        pitch: 8.5,
      },
    } as const;

    const decoded = decodeSceneState(encodeSceneState(state));

    expect(decoded.paused).toBe(true);
    expect(decoded.timeScale).toBeCloseTo(TIME_SCALES[9]!, 9);
    expect(decoded.view?.kind).toBe('free');

    // Километры от Солнца до Земли — восемь значащих цифр; на них и проверяем,
    // что округление в адресе не увело камеру на тысячи километров.
    if (decoded.view?.kind === 'free') {
      expect(decoded.view.position[0]).toBeCloseTo(149597870.7, 0);
      expect(decoded.view.position[1]).toBeCloseTo(-12000.5, 1);
      expect(decoded.view.yaw).toBeCloseTo(-117.5, 2);
      expect(decoded.view.pitch).toBeCloseTo(8.5, 2);
    }
  });

  it('адрес читается глазами: в нём дата, тело и углы, а не набор знаков', () => {
    const search = encodeSceneState({
      jd: JD_2032,
      timeScale: 1,
      paused: false,
      view: { kind: 'body', body: 'saturn', radii: 3.4, azimuth: 41, elevation: 12 },
    });

    expect(search).toContain('d=2032-06-01T12:00:00Z');
    expect(search).toContain('b=saturn');
    expect(search).toContain('r=3.4');
  });

  it('пустой адрес не даёт состояния', () => {
    expect(decodeSceneState('')).toEqual({});
    expect(decodeSceneState('?')).toEqual({});
  });

  it('чужие параметры в адресе не мешают', () => {
    const decoded = decodeSceneState('?utm_source=telegram&fbclid=xyz&b=mars&r=5');

    expect(decoded.view).toEqual({ kind: 'body', body: 'mars', radii: 5, azimuth: 0, elevation: 0 });
  });

  it('мусор отбрасывается по частям, а не роняет разбор целиком', () => {
    // Тело есть, радиусы — бессмыслица: вид берётся, расстояние по умолчанию.
    const broken = decodeSceneState('?d=не-дата&t=-5&b=jupiter&r=-3&az=нет&el=999');

    expect(broken.jd).toBeUndefined();
    expect(broken.timeScale).toBeUndefined();
    expect(broken.view?.kind).toBe('body');
    if (broken.view?.kind === 'body') {
      expect(broken.view.body).toBe('jupiter');
      expect(broken.view.radii).toBeGreaterThan(1);
      expect(broken.view.azimuth).toBe(0);
      // Возвышение зажато полюсом: смотреть строго сверху камера не умеет.
      expect(Math.abs(broken.view.elevation)).toBeLessThan(90);
    }
  });

  it('несуществующее тело — не тело', () => {
    expect(decodeSceneState('?b=планета-х&r=3').view).toBeUndefined();
  });

  it('дата вне разумного отбрасывается', () => {
    expect(decodeSceneState('?d=0900-01-01T00:00:00Z').jd).toBeUndefined();
    expect(decodeSceneState('?d=9000-01-01T00:00:00Z').jd).toBeUndefined();
    expect(decodeSceneState('?d=2032-06-01T12:00:00Z').jd).toBeCloseTo(JD_2032, 6);
  });

  it('масштаб времени зажат лестницей скоростей', () => {
    const fastest = TIME_SCALES[TIME_SCALES.length - 1]!;

    expect(decodeSceneState('?t=1e9').timeScale).toBeCloseTo(fastest, 6);
    expect(decodeSceneState('?t=0').timeScale).toBeUndefined();
  });
});
