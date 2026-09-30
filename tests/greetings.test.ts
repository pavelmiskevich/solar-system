import { describe, expect, it } from 'vitest';

import {
  BODY_CLEARANCE,
  SUN_CLEARANCE,
  angleBetween,
  placeShape,
  shapeOf,
  type SkyPoint,
} from '../src/core/inscription';
import {
  GREETINGS,
  GREETING_ID,
  avoidFromEarth,
  greetingById,
  greetingLayout,
  greetingView,
  seenFromEarth,
} from '../src/data/greetings';
import { brightStars } from '../src/data/stars';

const JD = 2461314.5; // 2026-10-01, 0h UT
const DEG = Math.PI / 180;

describe('поздравления', () => {
  it('пишутся только поддерживаемыми знаками и с правильным именем', () => {
    const ids = new Set<string>();
    for (const greeting of GREETINGS) {
      expect(greeting.id).toMatch(GREETING_ID);
      expect(ids.has(greeting.id), greeting.id).toBe(false);
      ids.add(greeting.id);
      expect(() => shapeOf(greeting.stars), greeting.id).not.toThrow();
      expect(greeting.title.trim(), greeting.id).not.toBe('');
    }
  });

  it('находятся по имени, а чужое имя ничего не находит', () => {
    expect(greetingById('primer')?.stars).toBe('ПРИВЕТ');
    expect(greetingById('no-such')).toBeUndefined();
  });

  it('яркие звёзды каталога - около трёх сотен, как на настоящем небе', () => {
    const stars = brightStars(3.5);
    expect(stars.length).toBeGreaterThan(200);
    expect(stars.length).toBeLessThan(450);
    expect(stars.every((s) => s.magnitude <= 3.5)).toBe(true);
  });

  it('видит Солнце с Земли там, где оно в этот день', () => {
    const { sun } = avoidFromEarth(JD);
    // 1 октября Солнце у точки осеннего равноденствия: прямое восхождение около 12ч.
    expect(sun.ra / (Math.PI / 12)).toBeCloseTo(12.5, 0);
  });

  it('раскладывает поздравление вдали от Солнца', () => {
    const layout = greetingLayout(greetingById('primer')!, JD);
    expect(angleBetween(layout.placement.centre, avoidFromEarth(JD).sun)).toBeGreaterThanOrEqual(
      SUN_CLEARANCE,
    );
    expect(layout.vertices.some((v) => v.real)).toBe(true);
  });

  it('на узком экране пишет поздравление мельче, но так же вдали от Солнца', () => {
    const wide = greetingLayout(greetingById('primer')!, JD);
    const narrow = greetingLayout(greetingById('primer')!, JD, (20 * Math.PI) / 180);
    expect(narrow.placement.height).toBeLessThan(wide.placement.height);
    expect(shapeOf('ПРИВЕТ').width * narrow.placement.height).toBeCloseTo((20 * Math.PI) / 180, 6);
    expect(angleBetween(narrow.placement.centre, avoidFromEarth(JD).sun)).toBeGreaterThanOrEqual(
      SUN_CLEARANCE,
    );
  });

  it('ставит надпись в одно место на любом экране', () => {
    // Ссылку с камерой, снятую на ноутбуке, открывают на телефоне: камера
    // из адреса должна найти надпись там же, только буквы мельче.
    const greeting = greetingById('primer')!;
    for (let day = 0; day < 5; day++) {
      const wide = greetingLayout(greeting, JD + day * 4);
      const phone = greetingLayout(greeting, JD + day * 4, (19.5 * Math.PI) / 180);
      expect(phone.placement.height).toBeLessThan(wide.placement.height);
      expectSameCentre(phone.placement.centre, wide.placement.centre);
    }
  });

  it('держит место весь день, пока идут сутки', () => {
    // 10 ноября 2026 года: с засветкой на момент открытия место к вечеру
    // уходило на 78° - Луна за день двигала свою запретную зону.
    const day = 2461354.5;
    const greeting = greetingById('primer')!;
    const morning = greetingLayout(greeting, day + 0.1);
    const evening = greetingLayout(greeting, day + 0.9);
    expectSameCentre(morning.placement.centre, evening.placement.centre);

    // И весь день Луна не входит в буквы: отступ держится по всему её пути,
    // а не только в начале суток. Отметки пути через три часа оставляют
    // между собой запас меньше десятой градуса.
    const letters = placeShape(shapeOf(greeting.stars), morning.placement);
    for (let hour = 0; hour <= 24; hour += 0.5) {
      const moon = seenFromEarth('moon', day + hour / 24);
      for (const point of letters) {
        expect(angleBetween(point, moon)).toBeGreaterThan(BODY_CLEARANCE - 0.1 * DEG);
      }
    }
  });

  it('ставит камеру у Земли лицом к надписи', () => {
    const layout = greetingLayout(greetingById('primer')!, JD);
    const view = greetingView(layout.placement.centre, JD);
    expect(view.kind).toBe('free');
    // Взгляд обратно в направление: сцена читает углы порядком YXZ и
    // смотрит вдоль -z - как в paradeView.
    const yaw = (view.yaw * Math.PI) / 180;
    const pitch = (view.pitch * Math.PI) / 180;
    const forward = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
    const c = layout.placement.centre;
    const eq = [Math.cos(c.dec) * Math.cos(c.ra), Math.cos(c.dec) * Math.sin(c.ra), Math.sin(c.dec)];
    const e = (23.43928 * Math.PI) / 180;
    const ecl = [eq[0]!, eq[1]! * Math.cos(e) + eq[2]! * Math.sin(e), -eq[1]! * Math.sin(e) + eq[2]! * Math.cos(e)];
    const scene = [ecl[0]!, ecl[2]!, -ecl[1]!];
    const cos = forward[0]! * scene[0]! + forward[1]! * scene[1]! + forward[2]! * scene[2]!;
    expect(cos).toBeGreaterThan(Math.cos((0.5 * Math.PI) / 180));
  });
});

/**
 * Один и тот же центр - по координатам, а не по углу между ними: арккосинус
 * у нуля теряет точность, и для одной и той же точки даёт до 1.5e-8.
 */
function expectSameCentre(a: SkyPoint, b: SkyPoint): void {
  expect(Math.abs(a.ra - b.ra)).toBeLessThan(1e-9);
  expect(Math.abs(a.dec - b.dec)).toBeLessThan(1e-9);
}
