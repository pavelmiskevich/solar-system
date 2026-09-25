import { onLanguageChange, strings } from '../i18n';

export class TourButton {
  private readonly button: HTMLButtonElement;

  /**
   * Последнее показанное состояние.
   *
   * Кадровый цикл зовёт setActive каждый кадр, и без этой памяти надпись на
   * кнопке переписывалась бы шестьдесят раз в секунду - правка вёрстки в
   * горячем цикле там, где менять нечего.
   */
  private shown = false;

  constructor(
    container: HTMLElement,
    private readonly onToggle: () => void,
  ) {
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'bodies-toggle';
    this.button.addEventListener('click', () => {
      this.onToggle();
    });

    container.prepend(this.button);
    this.write();
    onLanguageChange(() => this.write());
  }

  setActive(active: boolean) {
    if (this.shown === active) return;
    this.shown = active;
    this.write();
  }

  private write(): void {
    const words = strings().panels.tour;
    this.button.title = words.title;
    this.button.classList.toggle('active', this.shown);
    this.button.textContent = this.shown ? words.stop : words.start;
  }
}
