import type { SimClock } from '../core/clock';
import { onLanguageChange, strings, type Dictionary } from '../i18n';

/**
 * Ввод даты и времени сцены.
 *
 * Дата здесь - полноправная координата: от неё зависит всё, от фаз Луны до
 * раскрытия колец Сатурна. До сих пор задать её можно было только из консоли
 * разработчика, то есть практически никак.
 *
 * Время всюду в сцене - всемирное, и поле подписано этим прямо. Родное поле
 * браузера показывает местное время, и молчаливая разница в три часа развела
 * бы введённую дату с той, что стоит в HUD, - а сверять их по кадру человеку
 * нечем.
 */

/** Шаг стрелок: сутки и календарный год. */
const DAY = 1;

type StepWord = Exclude<keyof Dictionary['date'], 'title'>;

export class DatePanel {
  private readonly input: HTMLInputElement;

  constructor(
    container: HTMLElement,
    private readonly clock: SimClock,
  ) {
    const wrapper = document.createElement('div');
    wrapper.className = 'date-panel';

    this.input = document.createElement('input');
    this.input.type = 'datetime-local';
    this.input.step = '1';
    this.input.className = 'date-input';
    this.input.addEventListener('change', () => this.applyInput());

    const label = document.createElement('span');
    label.className = 'date-label';
    label.textContent = 'UTC';

    const row = document.createElement('div');
    row.className = 'date-buttons';

    const steps: { word: StepWord; shift: () => void }[] = [
      { word: 'yearBack', shift: () => this.shiftYears(-1) },
      { word: 'dayBack', shift: () => this.shiftDays(-DAY) },
      { word: 'now', shift: () => this.now() },
      { word: 'dayForward', shift: () => this.shiftDays(DAY) },
      { word: 'yearForward', shift: () => this.shiftYears(1) },
    ];

    const buttons = steps.map((step) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'date-step';
      button.addEventListener('click', () => {
        step.shift();
        this.write();
      });
      row.appendChild(button);
      return { button, word: step.word };
    });

    // Подписи - отдельно от постройки: их переписывает смена языка.
    const writeWords = () => {
      const words = strings().date;
      this.input.title = words.title;
      for (const { button, word } of buttons) {
        button.textContent = words[word].text;
        button.title = words[word].title;
      }
    };
    writeWords();
    onLanguageChange(writeWords);

    wrapper.append(this.input, label, row);
    container.appendChild(wrapper);
    this.write();
  }

  /**
   * Показать текущую дату сцены.
   *
   * Пока поле в работе - открыт календарь, набирается год, - переписывать его
   * нельзя: время в сцене идёт, и набранное вырывало бы из-под рук.
   */
  update(): void {
    if (document.activeElement === this.input) return;
    this.write();
  }

  private write(): void {
    // `datetime-local` понимает ровно этот вид, без буквы Z и без смещения.
    this.input.value = this.clock.date.toISOString().slice(0, 19);
  }

  private applyInput(): void {
    // Поле не несёт часового пояса, поэтому введённое читается как всемирное.
    const entered = new Date(`${this.input.value}Z`);
    if (Number.isNaN(entered.getTime())) {
      this.write();
      return;
    }

    this.clock.date = entered;
  }

  private shiftDays(days: number): void {
    this.clock.jd += days;
  }

  /**
   * Год отсчитывается календарём, а не числом суток.
   *
   * «Через год» для человека - то же число того же месяца; 365.25 суток
   * промахнулись бы мимо него на четверть суток и уводили бы дату всё дальше
   * с каждым нажатием.
   */
  private shiftYears(years: number): void {
    const date = this.clock.date;
    date.setUTCFullYear(date.getUTCFullYear() + years);
    this.clock.date = date;
  }

  private now(): void {
    this.clock.date = new Date();
  }
}
