import { language, onLanguageChange, strings, type Language } from '../i18n';
import { LANGUAGES } from '../i18n/language';

/**
 * Переключатель языка интерфейса: RU и EN рядом, выбранный подсвечен.
 *
 * Две кнопки, а не одна с надписью «другой язык». Одна кнопка заставляет
 * гадать, что она значит - язык, который сейчас, или тот, на который
 * переключит, - а пара с отмеченной половиной отвечает на это без слов.
 *
 * Подписи - коды языков, а не названия: «EN» узнает и тот, кто не читает
 * ни слова по-русски, а ради него переключатель и заведён.
 */

const CODES: Readonly<Record<Language, string>> = { ru: 'RU', en: 'EN' };

export class LanguageSwitch {
  readonly element: HTMLElement;
  private readonly buttons = new Map<Language, HTMLButtonElement>();

  /** @param onPick зритель выбрал язык - сменить и запомнить его решает сцена */
  constructor(onPick: (language: Language) => void) {
    this.element = document.createElement('div');
    this.element.className = 'bodies-toggle language-switch';
    this.element.setAttribute('role', 'group');

    for (const code of LANGUAGES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.lang = code;
      button.dataset.language = code;
      button.textContent = CODES[code];
      button.addEventListener('click', () => onPick(code));
      this.element.appendChild(button);
      this.buttons.set(code, button);
    }

    this.write();
    onLanguageChange(() => this.write());
  }

  private write(): void {
    const label = strings().languageSwitch;
    this.element.setAttribute('aria-label', label);
    this.element.title = label;

    for (const [code, button] of this.buttons) {
      const active = code === language();
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }
}
