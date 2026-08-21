import type { Scenario } from '../data/scenarios';

/**
 * Список готовых видов.
 *
 * Устроен как список тел и намеренно: обе панели — это выпадающий список в
 * правой колонке, и разное устройство читалось бы как разная природа. Отличие
 * одно — строка здесь не измеряет расстояние, а рассказывает, на что смотреть:
 * «Пепельный свет» ничего не говорит тому, кто о нём не слышал.
 *
 * Стоит первой в колонке. Человеку, открывшему сцену впервые, нужен не список
 * тел — тела он и так видит, — а ответ на вопрос «куда тут смотреть».
 */
export class ScenarioList {
  private readonly root: HTMLElement;
  private readonly toggleButton: HTMLButtonElement;
  private readonly rows: { id: string; element: HTMLButtonElement }[] = [];
  private open = false;

  constructor(
    container: HTMLElement,
    scenarios: readonly Scenario[],
    private readonly onSelect: (id: string) => void,
  ) {
    this.root = document.createElement('aside');
    this.root.className = 'views closed';

    this.toggleButton = document.createElement('button');
    this.toggleButton.type = 'button';
    this.toggleButton.className = 'bodies-toggle';
    this.toggleButton.title = 'Готовые виды (V)';
    this.toggleButton.addEventListener('click', () => this.setOpen(!this.open));

    const list = document.createElement('div');
    list.className = 'panel-list views-list';

    for (const scenario of scenarios) {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'panel-row views-row';
      element.dataset.scenario = scenario.id;

      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = scenario.name;

      const hint = document.createElement('span');
      hint.className = 'views-hint';
      hint.textContent = scenario.hint;

      element.append(name, hint);
      element.addEventListener('click', () => {
        this.onSelect(scenario.id);
        // Панель закрывается сама: вид выбран, смотреть надо на небо, а не в
        // список. Так же ведёт себя список тел после перелёта.
        this.setOpen(false);
      });

      list.appendChild(element);
      this.rows.push({ id: scenario.id, element });
    }

    this.root.append(this.toggleButton, list);
    container.prepend(this.root);
    this.updateLabel();
  }

  get isOpen(): boolean {
    return this.open;
  }

  setOpen(open: boolean): void {
    if (open === this.open) return;
    this.open = open;
    this.root.classList.toggle('closed', !open);
    this.updateLabel();

    // Пока мышь захвачена полётом, курсора нет и кликать нечем.
    if (open && document.pointerLockElement) document.exitPointerLock();
  }

  toggle(): void {
    this.setOpen(!this.open);
  }

  /** Отметить выбранный вид — по нему видно, где сейчас стоит камера. */
  setActive(id: string | null): void {
    for (const row of this.rows) {
      row.element.classList.toggle('active', row.id === id);
    }
  }

  private updateLabel(): void {
    this.toggleButton.textContent = this.open ? 'Виды ✕' : 'Виды ▦';
  }
}
