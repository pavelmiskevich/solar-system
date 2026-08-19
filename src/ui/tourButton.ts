export class TourButton {
  private readonly button: HTMLButtonElement;

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
    this.button.classList.toggle('active', active);
    this.button.textContent = active ? 'Остановить экскурсию ✕' : 'Экскурсия ▶';
  }
}
