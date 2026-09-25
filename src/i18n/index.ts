import { EN } from './en';
import type { Language } from './language';
import { RU, type Dictionary } from './ru';

/**
 * Текущий язык интерфейса и словарь к нему.
 *
 * Язык здесь один на всю страницу, как и единицы расстояния: HUD по-английски
 * рядом с карточкой по-русски - это не два языка, а поломка. Модули
 * интерфейса берут строки через `strings()` в момент, когда их пишут, и
 * подписываются на смену языка там, где текст написан один раз и дальше не
 * трогается.
 *
 * До выбора языка страницей здесь русский. Так ведут себя и юнит-тесты: они
 * проверяют формат строк, а не выбор языка, и не должны зависеть от того, на
 * каком языке настроена машина, где их гоняют.
 */

export type { Dictionary } from './ru';
export type { Language } from './language';

const DICTIONARIES: Readonly<Record<Language, Dictionary>> = { ru: RU, en: EN };

let current: Language = 'ru';
const listeners = new Set<() => void>();

export function language(): Language {
  return current;
}

/** Словарь текущего языка. */
export function strings(): Dictionary {
  return DICTIONARIES[current];
}

/** Словарь заданного языка - для проверок, которым нужны оба. */
export function dictionary(language: Language): Dictionary {
  return DICTIONARIES[language];
}

/**
 * Сменить язык.
 *
 * Подписчики зовутся сразу и все: смена не ждёт очередного кадра, иначе
 * страница какое-то время говорила бы на двух языках, а неподвижные надписи
 * вроде справки не переписались бы вовсе.
 */
export function setLanguage(next: Language): void {
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
}

/**
 * Подписка на смену языка.
 *
 * Отписки нет намеренно: всё, что подписывается, живёт столько же, сколько
 * страница.
 */
export function onLanguageChange(listener: () => void): void {
  listeners.add(listener);
}

/** Текст, записанный сразу на обоих языках, - так приходят имена звёзд из генератора. */
export type Localized = Readonly<Record<Language, string>>;

export function localized(text: Localized): string {
  return text[current];
}

/** Имя тела по идентификатору; неизвестное тело не должно ронять строку. */
export function bodyName(id: string): string {
  return (strings().bodies as Readonly<Record<string, string>>)[id] ?? id;
}

/**
 * Разбивка тысяч по правилам языка: «149 597 871» и «149,597,871».
 *
 * Форматы заводятся один раз на язык: `Intl` дорог в создании, а числа
 * пишутся по нескольку раз в секунду.
 */
const integerFormats = new Map<string, Intl.NumberFormat>();

export function formatInteger(value: number, maximumFractionDigits = 0): string {
  const key = `${current} ${maximumFractionDigits}`;
  let format = integerFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(strings().locale, { maximumFractionDigits });
    integerFormats.set(key, format);
  }
  return format.format(value);
}

/**
 * Дата и время сцены по правилам языка - всемирным временем.
 *
 * Часы двадцатичетырёхчасовые на обоих языках: время в сцене одно для всех,
 * и «05:50 PM» рядом с полем ввода, где стоит 17:50, пришлось бы сверять.
 */
const dateFormats = new Map<Language, Intl.DateTimeFormat>();

export function formatDateTime(date: Date): string {
  let format = dateFormats.get(current);
  if (!format) {
    format = new Intl.DateTimeFormat(strings().locale, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: 'UTC',
    });
    dateFormats.set(current, format);
  }
  return format.format(date);
}
