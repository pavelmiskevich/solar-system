import type { Greeting } from '../data/greetings';
import { onLanguageChange, strings } from '../i18n';

/**
 * Плашка поздравления.
 *
 * Звёздами пишется одно-два слова - имя. Всё остальное, что хочется
 * сказать, идёт сюда, обычным шрифтом. Плашка встаёт на место подсказки
 * управления и закрывается; надпись на небе после этого остаётся - её
 * можно облететь и снять.
 *
 * Текст плашки - слова автора, словарь его не трогает. Переводится только
 * подсказка кнопки.
 */
export class GreetingCard {
  private readonly element: HTMLElement;
  private readonly button: HTMLButtonElement;
  private open = true;

  constructor(
    parent: HTMLElement,
    greeting: Greeting,
    private readonly onClose: () => void,
  ) {
    this.element = document.createElement('div');
    this.element.id = 'greeting-card';
    // Плашка появляется сама, без действия зрителя: экранный диктор должен
    // её прочесть, не дожидаясь, пока до неё дойдут.
    this.element.setAttribute('role', 'status');

    const title = document.createElement('div');
    title.className = 'greeting-title';
    title.textContent = greeting.title;
    this.element.append(title);

    if (greeting.from) {
      const from = document.createElement('div');
      from.className = 'greeting-from';
      from.textContent = greeting.from;
      this.element.append(from);
    }

    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'greeting-close';
    this.button.addEventListener('click', () => this.close());
    this.element.append(this.button);

    this.applyLanguage();
    onLanguageChange(() => this.applyLanguage());
    parent.append(this.element);
  }

  get isOpen(): boolean {
    return this.open;
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.element.remove();
    this.onClose();
  }

  private applyLanguage(): void {
    const words = strings().greeting;
    this.button.textContent = words.close;
    this.button.title = words.closeTitle;
    this.button.setAttribute('aria-label', words.closeTitle);
  }
}
