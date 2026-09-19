import { describe, expect, it } from 'vitest';

import { COMETS, bodyById } from '../src/data/bodies';
import { DEG, JD_J2000 } from '../src/core/units';
import { orbitalPeriodDays, positionAt } from '../src/physics/kepler';

/** Юлианский день из даты, как в сценариях. */
function julianDayOf(iso: string): number {
  return new Date(iso).getTime() / 86_400_000 + 2440587.5;
}

const halley = () => {
  const comet = bodyById('halley');
  if (!comet?.orbit) throw new Error('кометы Галлея нет в списке тел');
  return comet;
};

describe('орбита кометы Галлея', () => {
  it('комета есть в списке тел и у неё есть орбита', () => {
    expect(COMETS).toHaveLength(1);
    expect(COMETS[0]!.id).toBe('halley');
    expect(halley().orbit).toBeDefined();
  });

  it('период, перигелий и афелий сходятся со справочником JPL', () => {
    const orbit = halley().orbit!;

    // Числа решения JPL (Farnocchia), а не из текста задачи: там записаны
    // 75.3 года, 0.586 и 35.1 а.е. - другой и более старый источник.
    const years = orbitalPeriodDays(orbit) / 365.25;
    expect(years).toBeCloseTo(75.92, 1);

    expect(orbit.a * (1 - orbit.e)).toBeCloseTo(0.5749, 3);
    expect(orbit.a * (1 + orbit.e)).toBeCloseTo(35.282, 2);
  });

  it('орбита ретроградная: комета обходит Солнце против общего движения', () => {
    // Наклонение больше прямого угла - это и значит обратное обращение.
    // Механику это не меняет ничем, и проверка стережёт, что знак не
    // потеряется при переводе элементов.
    expect(halley().orbit!.i).toBeGreaterThan(90);
    expect(halley().orbit!.i).toBeLessThan(180);
  });

  it('проходит перигелий 1986 года в тот же день, что и настоящая', () => {
    const orbit = halley().orbit!;

    // Ищем ближайший к Солнцу день вокруг февраля 1986-го.
    let best = { jd: 0, r: Infinity };
    const from = julianDayOf('1985-11-01T00:00:00Z');
    for (let day = 0; day < 200; day += 1) {
      const jd = from + day;
      const p = positionAt(orbit, jd);
      const r = Math.hypot(p.x, p.y, p.z);
      if (r < best.r) best = { jd, r };
    }

    const date = new Date((best.jd - 2440587.5) * 86_400_000).toISOString().slice(0, 10);
    // Настоящее прохождение - 9 февраля 1986 года. Сутки расхождения берутся
    // из того, что элементы неизменны, а орбиту комете правят планеты.
    expect(date).toMatch(/^1986-02-0[7-9]$/);
    expect(best.r).toBeCloseTo(0.5749, 2);
  });

  it('сейчас комета у афелия, а не у Солнца', () => {
    // Проверка стережёт замысел готовых видов: на дате по умолчанию смотреть
    // не на что, и потому их два.
    const p = positionAt(halley().orbit!, julianDayOf('2026-09-19T00:00:00Z'));
    expect(Math.hypot(p.x, p.y, p.z)).toBeGreaterThan(30);
  });

  it('элементы заданы на эпоху J2000, как у планет', () => {
    const orbit = halley().orbit!;
    const M = ((orbit.L - orbit.lp) % 360 + 360) % 360;

    // На J2000 комета уже возвращалась после перигелия 1986 года: средняя
    // аномалия в первой половине круга. Проверка ловит забытый перенос
    // элементов с родной эпохи каталога.
    expect(M).toBeGreaterThan(0);
    expect(M).toBeLessThan(180);

    const p = positionAt(orbit, JD_J2000);
    expect(Math.hypot(p.x, p.y, p.z)).toBeGreaterThan(15);
  });

  it('движется: средняя долгота растёт со временем', () => {
    const orbit = halley().orbit!;
    // Без LDot комета застыла бы на месте, и это не поймала бы ни одна
    // проверка положения на одну дату.
    expect(orbit.LDot).toBeGreaterThan(0);
    expect(orbit.LDot * DEG).toBeGreaterThan(0);
  });
});
