import type { Scenario } from '../data/scenarios';
import { onLanguageChange, strings } from '../i18n';

/**
 * Список готовых видов.
 *
 * Устроен как список тел и намеренно: обе панели - это выпадающий список в
 * правой колонке, и разное устройство читалось бы как разная природа. Отличие
 * одно - строка здесь не измеряет расстояние, а рассказывает, на что смотреть:
 * «Пепельный свет» ничего не говорит тому, кто о нём не слышал.
 *
 * Стоит первой в колонке. Человеку, открывшему сцену впервые, нужен не список
 * тел - тела он и так видит, - а ответ на вопрос «куда тут смотреть».
 */
export class ScenarioList {
  private readonly root: HTMLElement;
  private readonly toggleButton: HTMLButtonElement;
  private readonly rows: {
    id: string;
    element: HTMLButtonElement;
    scenario: Scenario;
    name: HTMLElement;
    hint: HTMLElement;
  }[] = [];
  private open = false;

  constructor(
    container: HTMLElement,
    scenarios: readonly Scenario[],
    private readonly onSelect: (id: string) => void,
    /** Панель открыли: соседняя в той же колонке должна закрыться. */
    private readonly onOpen: () => void = () => {},
  ) {
    this.root = document.createElement('aside');
    this.root.className = 'views closed';
    // Панелей этого вида в колонке две, и различать их надо снаружи: у
    // свёрнутой строки остаются в разметке, она гаснет обрезкой, а не
    // удалением, - и «какая панель закрыта» читается только по ней самой.
    this.root.dataset.panel = 'views';

    this.toggleButton = document.createElement('button');
    this.toggleButton.type = 'button';
    this.toggleButton.className = 'bodies-toggle';
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

      const hint = document.createElement('span');
      hint.className = 'views-hint';

      element.append(name, hint);
      element.addEventListener('click', () => {
        this.onSelect(scenario.id);
        // Панель закрывается сама: вид выбран, смотреть надо на небо, а не в
        // список. Так же ведёт себя список тел после перелёта.
        this.setOpen(false);
      });

      list.appendChild(element);
      this.rows.push({ id: scenario.id, element, scenario, name, hint });
    }

    this.root.append(this.toggleButton, list);
    container.prepend(this.root);
    this.writeWords();
    onLanguageChange(() => this.writeWords());
  }

  /** Имена и подсказки видов - на текущем языке. */
  private writeWords(): void {
    this.toggleButton.title = strings().panels.views.title;
    this.updateLabel();
    for (const row of this.rows) {
      row.name.textContent = row.scenario.name;
      row.hint.textContent = row.scenario.hint;
    }
  }

  get isOpen(): boolean {
    return this.open;
  }

  setOpen(open: boolean): void {
    if (open === this.open) return;
    this.open = open;
    this.root.classList.toggle('closed', !open);
    this.updateLabel();
    if (open) this.onOpen();

    // Пока мышь захвачена полётом, курсора нет и кликать нечем.
    if (open && document.pointerLockElement) document.exitPointerLock();
  }

  toggle(): void {
    this.setOpen(!this.open);
  }

  /** Отметить выбранный вид - по нему видно, где сейчас стоит камера. */
  setActive(id: string | null): void {
    for (const row of this.rows) {
      row.element.classList.toggle('active', row.id === id);
    }
  }

  private updateLabel(): void {
    const words = strings().panels.views;
    this.toggleButton.textContent = this.open ? words.close : words.open;
  }
}
