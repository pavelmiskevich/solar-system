import { formatDistance, onDistanceUnitChange } from './distanceUnits';

/**
 * Список тел для быстрого перелёта.
 *
 * По умолчанию свёрнут до одной кнопки: развёрнутая панель отнимает край
 * экрана, а смотреть в этой сцене надо на небо, а не на интерфейс. Развёрнутая
 * панель ловит мышь только собой — остальной кадр остаётся кликабельным.
 */

/** Расстояния в списке обновляются трижды в секунду: чаще глазу не нужно. */
const REFRESH_SECONDS = 0.33;

export interface BodyListEntry {
  readonly id: string;
  readonly name: string;
  /** Цвет метки в списке. */
  readonly color: number;
  /** Короткая пометка: «планета», «спутник Земли», «звезда». */
  readonly kind: string;
  /** Расстояние от камеры до поверхности, км. */
  distance(): number;
}

interface Row {
  readonly entry: BodyListEntry;
  readonly element: HTMLButtonElement;
  readonly distanceNode: HTMLElement;
  shownDistance: string;
}

export class BodyList {
  private readonly root: HTMLElement;
  private readonly toggleButton: HTMLButtonElement;
  private readonly rows: Row[] = [];
  private age = REFRESH_SECONDS;
  private open = false;
  private activeId: string | null = null;

  constructor(
    container: HTMLElement,
    entries: readonly BodyListEntry[],
    private readonly onSelect: (id: string) => void,
  ) {
    this.root = document.createElement('aside');
    this.root.id = 'bodies';
    this.root.className = 'closed';

    this.toggleButton = document.createElement('button');
    this.toggleButton.className = 'bodies-toggle';
    this.toggleButton.type = 'button';
    this.toggleButton.title = 'Список тел (B)';
    this.toggleButton.addEventListener('click', () => this.setOpen(!this.open));
    this.updateToggleLabel();

    const list = document.createElement('div');
    list.className = 'panel-list bodies-list';

    for (const entry of entries) {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'panel-row bodies-row';

      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = `#${entry.color.toString(16).padStart(6, '0')}`;

      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = entry.name;

      const kind = document.createElement('span');
      kind.className = 'kind';
      kind.textContent = entry.kind;

      const distanceNode = document.createElement('span');
      distanceNode.className = 'distance';
      distanceNode.textContent = '—';

      element.append(dot, name, kind, distanceNode);
      element.addEventListener('click', () => this.onSelect(entry.id));
      list.appendChild(element);

      this.rows.push({ entry, element, distanceNode, shownDistance: '' });
    }

    this.root.append(this.toggleButton, list);
    container.appendChild(this.root);

    // Расстояния здесь обновляются раз в несколько долей секунды, и смену
    // единиц пришлось бы ждать. Ждать нечего: щелчок должен отзываться сразу
    // во всех местах, иначе выглядит, что переключилось не везде.
    onDistanceUnitChange(() => {
      this.age = Infinity;
      this.update(0);
    });
  }

  get isOpen(): boolean {
    return this.open;
  }

  /**
   * Колонка, в которой лежит панель. Карточка тела встаёт в неё же, чтобы
   * список и карточка выстраивались друг под другом сами, без второй раскладки.
   */
  get column(): HTMLElement {
    return this.root;
  }

  setOpen(open: boolean): void {
    if (open === this.open) return;
    this.open = open;
    this.root.classList.toggle('closed', !open);
    this.updateToggleLabel();
    // Панель бесполезна, пока мышь захвачена полётом: курсора нет, кликать
    // нечем. Поэтому открытие панели захват отпускает.
    if (open && document.pointerLockElement) document.exitPointerLock();
    if (open) this.age = REFRESH_SECONDS;
  }

  toggle(): void {
    this.setOpen(!this.open);
  }

  /** Отметить тело, к которому идёт перелёт. */
  setActive(id: string | null): void {
    if (id === this.activeId) return;
    this.activeId = id;
    for (const row of this.rows) {
      row.element.classList.toggle('active', row.entry.id === id);
    }
  }

  update(dt: number): void {
    if (!this.open) return;

    this.age += dt;
    if (this.age < REFRESH_SECONDS) return;
    this.age = 0;

    for (const row of this.rows) {
      const text = formatDistance(Math.max(row.entry.distance(), 0));
      if (text !== row.shownDistance) {
        row.shownDistance = text;
        row.distanceNode.textContent = text;
      }
    }
  }

  private updateToggleLabel(): void {
    this.toggleButton.textContent = this.open ? 'Тела ✕' : 'Тела ☰';
  }
}
