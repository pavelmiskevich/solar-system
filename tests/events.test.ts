import { describe, expect, it } from 'vitest';

import { dateFromJulianDay, julianDayFromDate } from '../src/core/units';
import {
  conjunctions,
  findMinima,
  findRoots,
  lunarEclipses,
  oppositions,
  PARADE_LIMITS,
  arcSpan,
  elongationFromSun,
  geocentricLongitude,
  planetParades,
  ringMaximumOpening,
  ringOpeningToEarth,
  ringPlaneCrossings,
  SATELLITE_IDS,
  SEASON_CHUNK_DAYS,
  COVER_DAYS,
  findEvents,
  inSeason,
  satelliteEclipses,
  satelliteShadows,
  solarEclipses,
  transits,
} from '../src/physics/events';
import { scenarioById } from '../src/data/scenarios';

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

  it('минимум в первом полушаге после начала не теряется', () => {
    // Вершина в 0.2 шага от начала: значение в первом узле после начала уже
    // выше, чем в самом начале, и тройка, начатая с него, вершины не видит.
    const found = findMinima((x) => Math.abs(x - 10.2), 10, 20, 1);

    expect(found).toHaveLength(1);
    expect(found[0]!).toBeCloseTo(10.2, 1);
  });

  it('минимум в последнем полушаге перед концом не теряется', () => {
    const found = findMinima((x) => Math.abs(x - 19.8), 10, 20, 1);

    expect(found).toHaveLength(1);
    expect(found[0]!).toBeCloseTo(19.8, 1);
  });

  it('минимум за краями отрезка не выдаётся', () => {
    // Начинать перебор на шаг раньше - не повод возвращать то, о чём не
    // спрашивали: вершина в 9.8 лежит до начала, в 20.2 - после конца.
    expect(findMinima((x) => Math.abs(x - 9.8), 10, 20, 1)).toHaveLength(0);
    expect(findMinima((x) => Math.abs(x - 20.2), 10, 20, 1)).toHaveLength(0);
  });
});

describe('событие, до которого осталось меньше шага перебора', () => {
  // Кольцеобразное затмение 17 февраля 2026 года и противостояние Марса
  // 19 февраля 2027 года. На них задача #160 и была замечена: начатый за
  // несколько часов до максимума поиск их не находил.
  const eclipse = solarEclipses(jd('2026-02-01T00:00:00Z'), jd('2026-03-01T00:00:00Z'))[0]!;
  const opposition = oppositions('mars', jd('2027-01-01T00:00:00Z'), jd('2027-04-01T00:00:00Z'))[0]!;
  const HOUR = 1 / 24;

  it('затмение находится за три часа, за час и за четверть часа', () => {
    for (const before of [3, 1, 0.25]) {
      const from = eclipse.jd - before * HOUR;
      const found = solarEclipses(from, from + 30);

      expect(found, `${before} ч`).toHaveLength(1);
      expect(Math.abs(found[0]!.jd - eclipse.jd), `${before} ч`).toBeLessThan(HOUR);
    }
  });

  it('затмение не находится, если искать с суток после него', () => {
    const from = eclipse.jd + 1;
    expect(solarEclipses(from, from + 30)).toHaveLength(0);
  });

  it('противостояние находится за шесть и за два часа', () => {
    for (const before of [6, 2]) {
      const from = opposition.jd - before * HOUR;
      const found = oppositions('mars', from, from + 60);

      expect(found, `${before} ч`).toHaveLength(1);
      expect(Math.abs(found[0]!.jd - opposition.jd), `${before} ч`).toBeLessThan(HOUR);
    }
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

/**
 * Парады планет.
 *
 * У «парада» нет канонического определения, поэтому оно назначено здесь и в
 * `planetParades`: k ярких планет в одной дуге геоцентрической долготы, каждая
 * дальше 15° от Солнца. Пределы дуги - 20° для трёх, 45° для четырёх, 60° для
 * пяти.
 *
 * Проверять такое определение на себе бессмысленно, поэтому главная проверка
 * здесь одна: сентябрь 2040 года. Это известное соединение всех пяти ярких
 * планет в дуге меньше десяти градусов, и оно нигде в коде не записано -
 * поиск обязан прийти к нему сам, из элементов орбит.
 */

/**
 * Срок для проверок, которые просматривают тридцать лет эфемерид.
 *
 * Утверждения вида «за тридцать лет пятёрок всего две» без тридцатилетнего
 * просмотра не проверить, а сужать отрезок нельзя: изменится само
 * утверждение. Один такой поиск занимает около трёх секунд на свободной
 * машине, а в полном прогоне, где воркеры делят процессор, доходил до девяти.
 * Умолчание vitest в пять секунд придумано не для них, и проверки падали по
 * сроку через раз, хотя по сути были верны. Тридцать секунд - втрое больше
 * худшего замера: запас на медленную машину, но зависший поиск всё равно
 * будет пойман.
 */
const THIRTY_YEARS_BUDGET_MS = 30_000;

describe('парады планет', () => {
  it('находит редчайшее соединение пяти планет в сентябре 2040 года', () => {
    const found = planetParades(jd('2040-01-01T00:00:00Z'), jd('2041-01-01T00:00:00Z'));
    const five = found.filter((event) => event.bodies.length === 5);

    expect(five).toHaveLength(1);
    expect(iso(five[0]!.jd).slice(0, 7)).toBe('2040-09');
    // Дуга меньше десяти градусов: пять планет умещаются в кулак вытянутой руки.
    expect(five[0]!.value).toBeLessThan(10);
    expect([...five[0]!.bodies].sort()).toEqual([
      'jupiter',
      'mars',
      'mercury',
      'saturn',
      'venus',
    ]);
  });

  it('за тридцать лет пятёрок всего две, и это не недоработка поиска', () => {
    // Пять ярких планет действительно собираются редко. Число сторожит
    // пределы: расширение дуги сделает парадом то, что им не является, и
    // тогда их станет вдесятеро больше.
    const found = planetParades(jd('2020-01-01T00:00:00Z'), jd('2050-01-01T00:00:00Z'));

    expect(found.filter((event) => event.bodies.length === 5)).toHaveLength(2);
  }, THIRTY_YEARS_BUDGET_MS);

  it('планета вплотную к Солнцу в парад не идёт', () => {
    const found = planetParades(jd('2020-01-01T00:00:00Z'), jd('2050-01-01T00:00:00Z'));

    for (const event of found) {
      for (const id of event.bodies) {
        // Ближе 15° к Солнцу планета тонет в заре, и собрание, которого никто
        // не увидит, парадом называть нечестно.
        expect(elongationFromSun(id, event.jd), `${id} ${iso(event.jd)}`).toBeGreaterThan(15);
      }
    }
  }, THIRTY_YEARS_BUDGET_MS);

  it('из двух наложившихся эпизодов остаётся богатейший', () => {
    // Четвёрка почти всегда содержит в себе тройку, и без схлопывания список
    // показывал бы одно и то же событие дважды подряд.
    const found = planetParades(jd('2026-09-01T00:00:00Z'), jd('2031-09-01T00:00:00Z'));

    for (let i = 1; i < found.length; i += 1) {
      const days = found[i]!.jd - found[i - 1]!.jd;
      expect(days, `${iso(found[i - 1]!.jd)} и ${iso(found[i]!.jd)}`).toBeGreaterThan(15);
    }
  });

  it('мера события - настоящая дуга, вмещающая всех участников', () => {
    const found = planetParades(jd('2026-09-01T00:00:00Z'), jd('2031-09-01T00:00:00Z'));

    expect(found.length).toBeGreaterThan(0);

    for (const event of found) {
      const longitudes = event.bodies.map((id) => geocentricLongitude(id, event.jd));
      const span = arcSpan(longitudes);

      // Пересчёт по долготам участников - тот же ответ, что в мере события.
      expect(span, iso(event.jd)).toBeCloseTo(event.value, 6);
      // И он укладывается в предел, назначенный для такого числа планет.
      expect(event.value).toBeLessThan(PARADE_LIMITS[event.bodies.length]!);
    }
  });
});

/*
 * Затмения у других планет (#69).
 *
 * Справочники дают время для земного наблюдателя, а поиск - геометрическое,
 * когда тень в самом деле лежит на облаках. Поэтому из справочного времени
 * здесь вычитается путь света от планеты до Земли.
 */
describe('затмения у других планет', () => {
  const geometric = (when: string, lightMinutes: number) => jd(when) - lightMinutes / (24 * 60);

  it('тройная тень Ио, Европы и Каллисто на Юпитере 24 января 2015 года', () => {
    // С Земли все три тени были на диске с 06:27 до 06:52 UT, свет шёл 36 минут.
    const from = geometric('2015-01-24T06:27:00Z', 36);
    const to = geometric('2015-01-24T06:52:00Z', 36);
    for (const id of ['io', 'europa', 'callisto']) {
      const [shadow] = satelliteShadows(id, from - 0.5, to + 0.5);
      expect(shadow, id).toBeDefined();
      expect(shadow!.phase, id).toBe('total');
      // Тень идёт по диску два-три часа, и максимум каждой лежит не дальше
      // этого от общего для трёх окна.
      expect(Math.abs(shadow!.jd - (from + to) / 2) * 24, id).toBeLessThan(2);
    }
  });

  it('тень Титана на Сатурне в день снимка Хаббла, 24 февраля 2009 года', () => {
    const found = satelliteShadows('titan', jd('2009-02-24T00:00:00Z'), jd('2009-02-25T00:00:00Z'));
    expect(found).toHaveLength(1);
    expect(found[0]!.bodies).toEqual(['titan', 'saturn']);
  });

  it('готовый вид «Тень Ио на Юпитере» стоит внутри найденного прохождения', () => {
    // Вид подобран по сцене руками, поиск находит тень сам. Тень идёт по
    // диску два с половиной часа, и момент вида обязан лечь в эти часы.
    const view = scenarioById('io-shadow')!.state.jd!;
    const [shadow] = satelliteShadows('io', view - 1, view + 1);
    expect(shadow).toBeDefined();
    expect(Math.abs(shadow!.jd - view) * 24).toBeLessThan(1.25);
  });

  it('Фобос мельче Солнца и даёт кольцеобразные затмения, Ганимед - полные', () => {
    const from = jd('2026-11-27T00:00:00Z');
    const phobos = satelliteShadows('phobos', from, from + 3);
    const ganymede = satelliteShadows('ganymede', from, from + 30);
    expect(phobos.length).toBeGreaterThan(0);
    expect(ganymede.length).toBeGreaterThan(0);
    expect(new Set(phobos.map((e) => e.phase))).toEqual(new Set(['annular']));
    expect(ganymede.every((e) => e.phase === 'total' || e.phase === 'partial')).toBe(true);
  });

  it('тени Титана бывают у равноденствий Сатурна и пропадают к солнцестоянию', () => {
    const year = (y: number) => satelliteShadows('titan', jd(`${y}-01-01T00:00:00Z`), jd(`${y + 1}-01-01T00:00:00Z`));
    // Равноденствия - август 2009 и май 2025, солнцестояние - май 2017.
    expect(year(2009).length).toBeGreaterThan(5);
    expect(year(2025).length).toBeGreaterThan(5);
    expect(year(2017)).toHaveLength(0);
  });

  it('у спутников Урана сезон раз в 42 года, у равноденствий 2007 и 2049 годов', () => {
    for (const id of ['titania', 'oberon']) {
      const around = (y: number) => satelliteShadows(id, jd(`${y - 2}-01-01T00:00:00Z`), jd(`${y + 2}-01-01T00:00:00Z`));
      expect(around(2007).length, id).toBeGreaterThan(0);
      expect(around(2049).length, id).toBeGreaterThan(0);
      expect(around(2028), id).toHaveLength(0);
    }
  });

  it('спутник в тени планеты: Ио гаснет каждый оборот', () => {
    const from = jd('2026-11-27T00:00:00Z');
    const found = satelliteEclipses('io', from, from + 30);
    // За месяц Ио обходит Юпитер семнадцать раз и каждый раз уходит в тень.
    expect(found.length).toBeGreaterThanOrEqual(16);
    expect(found.length).toBeLessThanOrEqual(18);
    expect(found.every((e) => e.phase === 'total')).toBe(true);
    expect(found[0]!.bodies).toEqual(['jupiter', 'io']);
  });

  it('отсев по сезону не теряет ни одного события', () => {
    // У каждого спутника окно на краях его сезона: там отсев ближе всего к
    // ошибке. Перебирать все спутники во всех окнах слишком долго: Фобос
    // один даёт тысячи событий за несколько лет.
    const windows: [string, string, string[]][] = [
      ['1985-01-01', '1991-01-01', ['charon']],
      ['1950-01-01', '1960-01-01', ['triton']],
      ['2006-01-01', '2010-06-01', ['titania', 'oberon', 'titan']],
      ['2024-01-01', '2027-01-01', ['titan', 'mimas', 'enceladus']],
      ['2026-06-01', '2028-06-01', ['callisto']],
      ['2026-11-01', '2027-01-01', ['io', 'europa', 'ganymede']],
      ['2027-06-01', '2028-06-01', ['phobos', 'deimos']],
    ];
    // Ни один спутник не забыт.
    expect(new Set(windows.flatMap(([, , ids]) => ids))).toEqual(new Set(SATELLITE_IDS));

    for (const [a, b, ids] of windows) {
      for (const id of ids) {
        for (const search of [satelliteShadows, satelliteEclipses]) {
          for (const event of search(id, jd(`${a}T00:00:00Z`), jd(`${b}T00:00:00Z`))) {
            // Событие может оказаться в любом месте куска перебора.
            for (const shift of [0, 0.25, 0.5, 0.75, 1]) {
              const start = event.jd - shift * SEASON_CHUNK_DAYS;
              expect(inSeason(id, start, start + SEASON_CHUNK_DAYS), `${id} ${iso(event.jd)}`).toBe(true);
            }
          }
        }
      }
    }
  });

  it('вне сезона отсев действительно отсеивает', () => {
    expect(inSeason('titan', jd('2017-05-01T00:00:00Z'), jd('2017-05-31T00:00:00Z'))).toBe(false);
    expect(inSeason('titania', jd('2028-01-01T00:00:00Z'), jd('2028-01-31T00:00:00Z'))).toBe(false);
  });

  it('в общий список от каждого спутника идут два месяца событий, а не пять лет', () => {
    const from = jd('2026-11-27T00:00:00Z');
    const events = findEvents(from, from + 5 * 365.25).filter((e) => e.kind.startsWith('satellite-'));
    const byKey = new Map<string, number[]>();
    for (const e of events) {
      const key = `${e.kind} ${e.bodies.join(' ')}`;
      byKey.set(key, [...(byKey.get(key) ?? []), e.jd]);
    }
    // Все события одного спутника и рода - в пределах запаса от первого: Ио
    // за пять лет дала бы тысячу строк.
    for (const [key, moments] of byKey) {
      expect(Math.max(...moments) - Math.min(...moments), key).toBeLessThanOrEqual(COVER_DAYS + SEASON_CHUNK_DAYS);
    }
    // Галилеевы спутники - все четыре, и оба рода у каждого.
    for (const id of ['io', 'europa', 'ganymede', 'callisto']) {
      expect([...byKey.keys()], id).toContain(`satellite-shadow ${id} jupiter`);
      expect([...byKey.keys()], id).toContain(`satellite-eclipse jupiter ${id}`);
    }
    // Луна считается своими родами, солнечным и лунным затмением.
    expect(events.some((e) => e.bodies.includes('moon'))).toBe(false);
  });
});
