export class TourButton {
  private readonly button: HTMLButtonElement;

  /**
   * Последнее показанное состояние.
   *
   * Кадровый цикл зовёт setActive каждый кадр, и без этой памяти надпись на
   * кнопке переписывалась бы шестьдесят раз в секунду — правка вёрстки в
   * горячем цикле там, где менять нечего.
   */
  private shown: boolean | null = null;

  constructor(
    container: HTMLElement,
    private readonly onToggle: () => void,
  ) {
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'bodies-toggle';
    this.button.title = 'Начать экскурсию (T)';
    this.button.textContent = 'Экскурсия ▶';
    this.button.addEventListener('click', () => {
      this.onToggle();
    });

    container.prepend(this.button);
  }

  setActive(active: boolean) {
    if (this.shown === active) return;
    this.shown = active;

    this.button.classList.toggle('active', active);
    this.button.textContent = active ? 'Остановить экскурсию ✕' : 'Экскурсия ▶';
  }
}
