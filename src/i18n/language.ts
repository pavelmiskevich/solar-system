/**
 * Язык интерфейса: какой он бывает и как его выбрать.
 *
 * Модуль не знает ни словаря, ни страницы - только правило выбора. Так его
 * можно проверить юнит-тестом целиком, без браузера, и так же им пользуется
 * разбор адреса страницы, которому словарь не нужен вовсе.
 */

export type Language = 'ru' | 'en';

export const LANGUAGES: readonly Language[] = ['ru', 'en'];

export function isLanguage(value: unknown): value is Language {
  return value === 'ru' || value === 'en';
}

/**
 * Язык по настройкам браузера.
 *
 * Решает первый язык списка, который сцена знает: у человека с настройкой
 * «украинский, русский, английский» интерфейс будет русским, у того, кто
 * поставил английский раньше русского, - английским. Незнакомые языки
 * пропускаются, а если знакомого не нашлось вовсе, интерфейс английский: его
 * прочтёт больше людей, чем русский.
 */
export function browserLanguage(preferred: readonly string[]): Language {
  for (const tag of preferred) {
    const code = tag.trim().toLowerCase();
    if (code.startsWith('ru')) return 'ru';
    if (code.startsWith('en')) return 'en';
  }

  return 'en';
}

export interface LanguageSources {
  /** Язык из адреса страницы: тот, на котором ссылкой поделились. */
  fromAddress?: Language | undefined;
  /** Язык, выбранный переключателем в прошлый раз. */
  stored?: Language | null | undefined;
  /** Языки браузера по порядку предпочтения. */
  browser: readonly string[];
}

/**
 * Язык при открытии страницы.
 *
 * Старшинство - от явного к угаданному. Ссылка важнее всего: её прислали
 * затем, чтобы человек увидел ровно то, что видел отправитель. Сохранённый
 * выбор важнее браузера: переключатель нажимали руками, а настройку браузера
 * человек мог не трогать никогда.
 */
export function pickLanguage(sources: LanguageSources): Language {
  return sources.fromAddress ?? sources.stored ?? browserLanguage(sources.browser);
}

/** Ключ, под которым выбор лежит в хранилище браузера. */
const STORAGE_KEY = 'solar-system.language';

/**
 * Выбор, сохранённый в прошлый раз.
 *
 * Хранилище может не только пустовать, но и бросать исключение при одном
 * обращении - так ведёт себя приватное окно и браузер, которому запретили
 * хранить данные сайта. Язык - удобство, а не то, ради чего страницу
 * открывают, и терять из-за него сцену незачем.
 */
export function readStoredLanguage(): Language | null {
  try {
    const value = globalThis.localStorage?.getItem(STORAGE_KEY);
    return isLanguage(value) ? value : null;
  } catch {
    return null;
  }
}

/** Запомнить выбор. Не вышло - значит, в следующий раз язык снова угадают. */
export function storeLanguage(language: Language): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, language);
  } catch {
    // Молчать здесь можно: выбор уже применён, потерялась только память о нём.
  }
}
