import { describe, expect, it } from 'vitest';

import { dateFromJulianDay, julianDayFromDate } from '../src/core/units';
import {
  conjunctions,
  findMinima,
  findRoots,
  lunarEclipses,
  oppositions,
  ringMaximumOpening,
  ringOpeningToEarth,
  ringPlaneCrossings,
  solarEclipses,
  transits,
} from '../src/physics/events';

/**
 * Поиск астрономических событий.
 *
 * Проверять здесь надо не «нашлось ли что-нибудь», а совпадает ли найденное с
 * тем, что независимо от этого кода напечатано в справочниках. Даты ниже взяты
 * из каталога затмений NASA и таблиц противостояний; ни одна из них нигде в
 * коде не записана - все они получаются из элементов орбит.
 *
 * Точность у разных родов событий разная, и это не небрежность, а свойство
 * задачи: у затмения тень пробегает Землю за часы, и момент наибольшей фазы
 * определён остро. У пересечения плоскости колец Сатурна раскрытие меняется на
 * 0.05° в сутки, и ошибка в направлении оси Сатурна всего в сотую долю градуса
 * уводит дату на пять часов. Требовать там часа значило бы требовать от модели
 * того, чего в ней нет.
 */

const jd = (iso: string) => julianDayFromDate(new Date(iso));
const iso = (value: number) => dateFromJulianDay(value).toISOString();
/** Расхождение с справочным моментом в минутах - так его удобнее читать. */
const minutesFrom = (value: number, reference: string) =>
  Math.abs(value - jd(reference)) * 24 * 60;

describe('поиск минимумов и нулей', () => {
  it('находит минимум параболы и уточняет его до часа', () => {
    // Вершина в 10.3: грубый перебор с шагом в сутки её не видит, уточнение
    // обязано довести до часа. Точнее часа не спрашиваем - на этом уточнение
    // и останавливается, потому что тоньше модель положений всё равно не знает.
    const found = findMinima((x) => (x - 10.3) * (x - 10.3), 0, 20, 1);

    expect(found).toHaveLength(1);
    expect(Math.abs(found[0]! - 10.3)).toBeLessThan(1 / 24);
  });

  it('не выдумывает минимум там, где функция только растёт', () => {
    expect(findMinima((x) => x, 0, 20, 1)).toHaveLength(0);
  });

  it('находит оба нуля синуса на периоде', () => {
    const found = findRoots((x) => Math.sin(x), 0.1, 6.6, 0.5);

    expect(found).toHaveLength(2);
    expect(Math.abs(found[0]! - Math.PI)).toBeLessThan(1 / 24);
    expect(Math.abs(found[1]! - 2 * Math.PI)).toBeLessThan(1 / 24);
  });

  it('минимум, попавший между узлами перебора, не теряется', () => {
    // Узел в 10.0 и 11.0, вершина в 10.5 - ровно посередине. Тройка узлов её
    // всё равно обязана заметить: средний узел ниже обоих краёв.
    const found = findMinima((x) => Math.abs(x - 10.5), 0, 20, 1);

    expect(found.length).toBeGreaterThan(0);
    expect(found[0]!).toBeCloseTo(10.5, 1);
  });
});

describe('солнечные затмения', () => {
  it('двенадцатого августа 2026 года, с точностью до часа', () => {
    const found = solarEclipses(jd('2026-08-01T00:00:00Z'), jd('2026-09-01T00:00:00Z'));

    expect(found).toHaveLength(1);
    // Каталог NASA: наибольшая фаза 17:46:01 UTC, гамма 0.8977.
    expect(minutesFrom(found[0]!.jd, '2026-08-12T17:46:01Z')).toBeLessThan(60);
    expect(found[0]!.phase).toBe('total');
    expect(found[0]!.value).toBeCloseTo(0.898, 1);
  });

  it('все восемь затмений 2025-2028 годов, в порядке и с родом', () => {
    // Список полный: столько солнечных затмений за эти четыре года и было.
    // Промахнись поиск хоть одним - длина разойдётся, а лишний минимум,
    // мимо которого полутень прошла стороной, отсеется сам.
    const found = solarEclipses(jd('2025-01-01T00:00:00Z'), jd('2029-01-01T00:00:00Z'));

    expect(found.map((e) => `${iso(e.jd).slice(0, 10)} ${e.phase}`)).toEqual([
      '2025-03-29 partial',
      '2025-09-21 partial',
      '2026-02-17 annular',
      '2026-08-12 total',
      '2027-02-06 annular',
      '2027-08-02 total',
      '2028-01-26 annular',
      '2028-07-22 total',
    ]);
  });

  it('кольцеобразное отличается от полного размером Луны, а не глубиной', () => {
    const annular = solarEclipses(jd('2027-01-01T00:00:00Z'), jd('2027-04-01T00:00:00Z'))[0]!;
    const total = solarEclipses(jd('2027-07-01T00:00:00Z'), jd('2027-10-01T00:00:00Z'))[0]!;

    // Оба центральные - ось тени проходит близко к центру Земли, - и всё же
    // одно кольцеобразное, а другое полное: Луна в феврале дальше от Земли.
    expect(annular.value).toBeLessThan(1);
    expect(total.value).toBeLessThan(1);
    expect(annular.phase).toBe('annular');
    expect(total.phase).toBe('total');
  });
});

describe('лунные затмения', () => {
  it('третьего марта 2026 года Луна входит в тень целиком', () => {
    const found = lunarEclipses(jd('2026-02-15T00:00:00Z'), jd('2026-03-20T00:00:00Z'));

    expect(found).toHaveLength(1);
    // Каталог NASA: наибольшая фаза 11:33:47 UTC.
    expect(minutesFrom(found[0]!.jd, '2026-03-03T11:33:47Z')).toBeLessThan(60);
    expect(found[0]!.phase).toBe('total');
  });

  it('полутеневое затмение отделено от настоящего', () => {
    // Двадцатого февраля 2027 года Луна проходит только сквозь полутень:
    // потемнение едва заметно глазом, и называть это затмением наравне с
    // полным значило бы обмануть того, кто придёт смотреть.
    const found = lunarEclipses(jd('2027-02-01T00:00:00Z'), jd('2027-03-01T00:00:00Z'));

    expect(found).toHaveLength(1);
    expect(found[0]!.phase).toBe('penumbral');
  });

  it('за 2026 год ровно два: полное в марте и частное в августе', () => {
    const found = lunarEclipses(jd('2026-01-01T00:00:00Z'), jd('2027-01-01T00:00:00Z'));

    expect(found.map((e) => `${iso(e.jd).slice(0, 10)} ${e.phase}`)).toEqual([
      '2026-03-03 total',
      '2026-08-28 partial',
    ]);
  });
});

describe('противостояния', () => {
  it('великое противостояние Марса 2035 года', () => {
    const found = oppositions('mars', jd('2035-01-01T00:00:00Z'), jd('2036-01-01T00:00:00Z'));

    expect(found).toHaveLength(1);
    expect(iso(found[0]!.jd).slice(0, 7)).toBe('2035-09');
    // Великим противостояние делает не дата, а расстояние: оно приходится на
    // перигелий Марса, и до него остаётся 0.38 а.е. вместо обычных 0.6.
    expect(found[0]!.value).toBeLessThan(0.39);
    expect(found[0]!.value).toBeGreaterThan(0.37);
  });

  it('оно ближе всех соседних', () => {
    const found = oppositions('mars', jd('2030-01-01T00:00:00Z'), jd('2042-01-01T00:00:00Z'));
    const great = found.reduce((a, b) => (a.value < b.value ? a : b));

    expect(iso(great.jd).slice(0, 4)).toBe('2035');
    // Противостояния Марса повторяются раз в двадцать шесть месяцев.
    for (let i = 1; i < found.length; i++) {
      const months = ((found[i]!.jd - found[i - 1]!.jd) / 365.25) * 12;
      expect(months).toBeGreaterThan(24);
      expect(months).toBeLessThan(28);
    }
  });

  it('у внешних планет они бывают чаще раза в год, у Земли - никогда', () => {
    const year = [jd('2030-01-01T00:00:00Z'), jd('2031-01-01T00:00:00Z')] as const;

    expect(oppositions('jupiter', ...year)).toHaveLength(1);
    expect(oppositions('saturn', ...year)).toHaveLength(1);
    // Своё собственное противостояние - бессмыслица: угол всегда ноль.
    expect(oppositions('earth', ...year)).toHaveLength(0);
  });
});

describe('прохождения по диску Солнца', () => {
  it('Меркурий 13 ноября 2032 года и 7 ноября 2039-го', () => {
    const found = transits('mercury', jd('2030-01-01T00:00:00Z'), jd('2040-01-01T00:00:00Z'));

    expect(found.map((e) => iso(e.jd).slice(0, 10))).toEqual(['2032-11-13', '2039-11-07']);
  });

  it('Венера за это время по диску не проходит', () => {
    // Прохождения Венеры идут парами раз в столетие с лишним: после 2012 года
    // следующее - в 2117-м. Пустой список здесь и есть верный ответ.
    expect(transits('venus', jd('2030-01-01T00:00:00Z'), jd('2040-01-01T00:00:00Z'))).toEqual([]);
  });
});

describe('соединения', () => {
  it('великое соединение Юпитера и Сатурна 2020 года', () => {
    const found = conjunctions('jupiter', 'saturn', jd('2020-11-01T00:00:00Z'), jd('2021-02-01T00:00:00Z'));

    expect(found).toHaveLength(1);
    expect(iso(found[0]!.jd).slice(0, 7)).toBe('2020-12');
    // Шесть угловых минут: ближе они не сходились с 1623 года.
    expect(found[0]!.value).toBeLessThan(0.2);
  });

  it('широкие сближения в список не идут', () => {
    // Пять градусов - предел, за которым сближение перестаёт читаться как
    // событие: такое на небе бывает почти всегда.
    const all = conjunctions('mars', 'saturn', jd('2030-01-01T00:00:00Z'), jd('2035-01-01T00:00:00Z'));

    for (const event of all) expect(event.value).toBeLessThan(5);
  });
});

describe('кольца Сатурна', () => {
  it('плоскость колец пересекается трижды подряд на рубеже 2038-2039 годов', () => {
    // Земля переходит с одной стороны колец на другую и обратно: у пересечений
    // это бывает тройками, потому что Земля успевает обежать Солнце, пока
    // Сатурн проходит свой узел.
    const found = ringPlaneCrossings(jd('2037-01-01T00:00:00Z'), jd('2040-01-01T00:00:00Z'));

    expect(found).toHaveLength(3);
    expect(iso(found[0]!.jd).slice(0, 7)).toBe('2038-10');
    expect(iso(found[1]!.jd).slice(0, 7)).toBe('2039-03');
    expect(iso(found[2]!.jd).slice(0, 7)).toBe('2039-07');
  });

  it('в момент пересечения раскрытие обращается в ноль и меняет знак', () => {
    const crossing = ringPlaneCrossings(jd('2038-01-01T00:00:00Z'), jd('2039-01-01T00:00:00Z'))[0]!;

    expect(Math.abs(ringOpeningToEarth(crossing.jd))).toBeLessThan(0.005);
    expect(
      Math.sign(ringOpeningToEarth(crossing.jd - 30)) *
        Math.sign(ringOpeningToEarth(crossing.jd + 30)),
    ).toBe(-1);
  });

  it('час здесь недостижим, и вот почему', () => {
    const crossing = ringPlaneCrossings(jd('2038-01-01T00:00:00Z'), jd('2039-01-01T00:00:00Z'))[0]!;
    const perDay = Math.abs(ringOpeningToEarth(crossing.jd + 0.5) - ringOpeningToEarth(crossing.jd - 0.5));

    // Раскрытие меняется на пять сотых градуса в сутки. Ось Сатурна задана
    // постоянными полюса без вековых поправок, и ошибка в сотую долю градуса
    // уводит дату на несколько часов. Проверка сторожит саму эту оценку: если
    // геометрия однажды поедет, число разойдётся, и станет видно.
    expect(perDay).toBeGreaterThan(0.04);
    expect(perDay).toBeLessThan(0.07);
    expect((0.01 / perDay) * 24).toBeGreaterThan(3);
  });

  it('наибольшее раскрытие к Солнцу равно наклону оси Сатурна', () => {
    const found = ringMaximumOpening(jd('2028-01-01T00:00:00Z'), jd('2036-01-01T00:00:00Z'));

    expect(found).toHaveLength(1);
    // 26.7° - наклон оси Сатурна к плоскости его орбиты. Выше кольца к Солнцу
    // не раскрываются никогда, и совпадение этих двух чисел не совпадение.
    expect(found[0]!.value).toBeGreaterThan(26);
    expect(found[0]!.value).toBeLessThan(27.5);
    expect(iso(found[0]!.jd).slice(0, 4)).toBe('2032');
  });
});
