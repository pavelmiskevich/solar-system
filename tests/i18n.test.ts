import { afterEach, describe, expect, it, vi } from 'vitest';

import { describeTimeScale } from '../src/core/clock';
import { ALL_BODIES } from '../src/data/bodies';
import { bodyLore } from '../src/data/bodyLore';
import { describeEvent } from '../src/data/events';
import { SCENARIOS } from '../src/data/scenarios';
import { CONSTELLATIONS, NAMED_STARS } from '../src/data/sky';
import { kindOf } from '../src/data/targets';
import { bodyName, dictionary, setLanguage, strings } from '../src/i18n';
import {
  browserLanguage,
  pickLanguage,
  readStoredLanguage,
  storeLanguage,
} from '../src/i18n/language';
import { formatOrbitalPeriod, formatRotationPeriod } from '../src/ui/bodyCard';
import { formatDistanceIn } from '../src/ui/distanceUnits';
import { formatSpeed } from '../src/ui/hud';

const CYRILLIC = /[А-Яа-яЁё]/;

/**
 * Все строки словаря с путями до них.
 *
 * Функции здесь не вызываются - у каждой свои аргументы, - их проверяет
 * отдельная проверка ниже, где аргументы подобраны под каждую.
 */
function leaves(value: unknown, path = ''): { path: string; value: unknown }[] {
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => leaves(child, `${path}.${key}`));
  }
  return [{ path, value }];
}

afterEach(() => {
  // Язык - состояние модуля, общее на весь файл: проверка, забывшая его
  // вернуть, сломала бы соседние, которые ждут русского.
  setLanguage('ru');
  vi.unstubAllGlobals();
});

describe('словарь', () => {
  const ru = leaves(dictionary('ru'));
  const en = leaves(dictionary('en'));

  it('у английского те же ключи, что у русского, и того же рода', () => {
    // tsc ловит это же при сборке, но только для того, что описано типом.
    // Здесь - для всего, что в словаре лежит, включая вложенные таблицы.
    expect(en.map((leaf) => leaf.path)).toEqual(ru.map((leaf) => leaf.path));
    ru.forEach((leaf, index) => {
      expect(typeof en[index]!.value, leaf.path).toBe(typeof leaf.value);
    });
  });

  it('ни одна строка не пуста', () => {
    for (const leaf of [...ru, ...en]) {
      if (typeof leaf.value === 'string') expect(leaf.value.trim().length, leaf.path).toBeGreaterThan(0);
    }
  });

  it('в английском словаре нет русских слов', () => {
    // Самая частая ошибка перевода - строка, скопированная с русского и
    // забытая: tsc её не заметит, ключ-то на месте.
    for (const leaf of en) {
      if (typeof leaf.value === 'string') expect(leaf.value, leaf.path).not.toMatch(CYRILLIC);
    }
  });

  it('строки с числами собираются на обоих языках без русских слов в английском', () => {
    for (const language of ['ru', 'en'] as const) {
      const words = dictionary(language);
      const built = [
        words.kinds.moonOf('mars'),
        words.unitToggleTitle(words.unitNames.km),
        words.timeScale.seconds('10'),
        words.timeScale.minutes('5'),
        words.timeScale.hours('6'),
        words.timeScale.days('1'),
        words.timeScale.months('3'),
        words.timeScale.years('20'),
        words.comet.noTail(3),
        words.comet.tail(0),
        words.comet.tail(42),
        words.events.solarEclipse('total'),
        words.events.solarEclipse(undefined),
        words.events.lunarEclipse('penumbral'),
        words.events.opposition('mars'),
        words.events.transit('mercury'),
        words.events.conjunction('venus', 'jupiter'),
        words.events.parade(5),
        words.events.parade(7),
        words.events.solarEclipseHint('0.31'),
        words.events.oppositionHint('0.64'),
        words.events.conjunctionHint('12′'),
        words.events.paradeHint(['mercury', 'venus', 'saturn'], '9', 'evening'),
        words.events.ringOpeningHint('26.7'),
      ];

      for (const text of built) {
        expect(text.length, text).toBeGreaterThan(0);
        if (language === 'en') expect(text).not.toMatch(CYRILLIC);
        // Подставленное число или имя не должно остаться заготовкой.
        expect(text).not.toContain('undefined');
      }
    }
  });

  it('у каждого тела сцены есть имя, род и сведения на обоих языках', () => {
    for (const language of ['ru', 'en'] as const) {
      setLanguage(language);
      for (const body of [{ id: 'sun' }, ...ALL_BODIES]) {
        // Имя, совпавшее с опознавателем, - это имя, которого нет в словаре.
        expect(bodyName(body.id), `${language} ${body.id}`).not.toBe(body.id);
        expect(kindOf(body.id).length, `${language} ${body.id}`).toBeGreaterThan(0);
        expect(bodyLore(body.id), `${language} ${body.id}`).toBeDefined();
      }
    }
  });

  it('готовые виды названы на обоих языках, и названия не повторяются', () => {
    for (const language of ['ru', 'en'] as const) {
      setLanguage(language);
      const names = SCENARIOS.map((scenario) => scenario.name);
      expect(new Set(names).size, language).toBe(SCENARIOS.length);
      for (const scenario of SCENARIOS) {
        expect(scenario.hint.length, scenario.id).toBeGreaterThan(20);
        if (language === 'en') expect(scenario.name + scenario.hint).not.toMatch(CYRILLIC);
      }
    }
  });

  it('звёзды и созвездия подписаны по-английски, латиницей и без повторов', () => {
    const stars = NAMED_STARS.map((star) => star.names.en);
    const figures = CONSTELLATIONS.map((figure) => figure.names.en);

    expect(new Set(stars).size).toBe(stars.length);
    for (const name of [...stars, ...figures]) expect(name).not.toMatch(CYRILLIC);
    expect(stars).toContain('Sirius');
    expect(figures).toContain('Ursa Major');
    expect(figures).toContain('Orion');
  });
});

describe('смена языка', () => {
  it('меняет и слова, и разбивку чисел', () => {
    const neptune = 4.5e9;
    expect(formatDistanceIn(neptune, 'km')).toMatch(/км$/);

    setLanguage('en');
    // Тысячи - запятой, а не пробелом: «4 500 000 000 km» по-английски
    // читается как четыре отдельных числа.
    expect(formatDistanceIn(neptune, 'km')).toBe('4,500,000,000 km');
    expect(formatDistanceIn(149_597_870.7, 'au')).toBe('1.000 AU');
    expect(formatSpeed(12.5)).toBe('13 km/s');
    expect(strings().hud.rows.nearest).toBe('nearest');
  });

  it('роды тел и события строятся по правилам своего языка', () => {
    expect(kindOf('phobos')).toBe('спутник Марса');

    setLanguage('en');
    expect(kindOf('phobos')).toBe('moon of Mars');
    expect(kindOf('pluto')).toBe('dwarf planet');
    expect(bodyName('halley')).toBe("Halley's Comet");

    const opposition = describeEvent({ kind: 'opposition', jd: 2461000, bodies: ['mars'], value: 0.64 });
    expect(opposition.title).toBe('Mars at opposition');
    expect(opposition.hint).toContain('0.64 AU');
  });

  it('строка события, описанного заранее, читается уже на новом языке', () => {
    // Список событий считается один раз и держится в памяти, а язык могут
    // сменить, пока он открыт.
    const row = describeEvent({ kind: 'opposition', jd: 2461000, bodies: ['mars'], value: 0.64 });
    expect(row.title).toBe('Противостояние Марса');

    setLanguage('en');
    expect(row.title).toBe('Mars at opposition');
  });

  it('множественное число у каждого языка своё', () => {
    expect(describeTimeScale(365.25)).toBe('1 год/с');
    expect(describeTimeScale(365.25 * 5)).toBe('5 лет/с');

    setLanguage('en');
    expect(describeTimeScale(365.25)).toBe('1 year/s');
    expect(describeTimeScale(365.25 * 5)).toBe('5 years/s');
    expect(describeTimeScale(1)).toBe('1 day/s');
    expect(describeTimeScale(7)).toBe('7 days/s');
    expect(formatOrbitalPeriod(60195)).toBe('164.8 years');
    expect(formatRotationPeriod(-243.02)).toBe('243 days, retrograde');
  });
});

describe('выбор языка', () => {
  it('по браузеру: решает первый знакомый язык, незнакомые пропускаются', () => {
    expect(browserLanguage(['ru-RU', 'en-US'])).toBe('ru');
    expect(browserLanguage(['en-GB', 'ru'])).toBe('en');
    expect(browserLanguage(['uk-UA', 'ru-RU', 'en'])).toBe('ru');
    expect(browserLanguage(['de-DE', 'fr'])).toBe('en');
    expect(browserLanguage(['RU'])).toBe('ru');
    expect(browserLanguage([])).toBe('en');
  });

  it('ссылка старше сохранённого выбора, а тот старше браузера', () => {
    const browser = ['ru-RU'];

    expect(pickLanguage({ browser })).toBe('ru');
    expect(pickLanguage({ stored: 'en', browser })).toBe('en');
    expect(pickLanguage({ stored: null, browser })).toBe('ru');
    expect(pickLanguage({ fromAddress: 'ru', stored: 'en', browser: ['en'] })).toBe('ru');
    expect(pickLanguage({ fromAddress: 'en', stored: 'ru', browser })).toBe('en');
  });

  it('сохранённый выбор читается обратно, а мусор в хранилище - нет', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    });

    expect(readStoredLanguage()).toBeNull();
    storeLanguage('en');
    expect(readStoredLanguage()).toBe('en');

    for (const key of store.keys()) store.set(key, 'klingon');
    expect(readStoredLanguage()).toBeNull();
  });

  it('хранилище, которое бросает исключение, не роняет выбор', () => {
    // Так ведёт себя приватное окно и браузер с запретом хранить данные.
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });

    expect(readStoredLanguage()).toBeNull();
    expect(() => storeLanguage('en')).not.toThrow();
    expect(pickLanguage({ stored: readStoredLanguage(), browser: ['en-US'] })).toBe('en');
  });
});
