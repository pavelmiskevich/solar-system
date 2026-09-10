import type { EventRow } from '../data/events';

/**
 * Список ближайших астрономических событий.
 *
 * Третья панель той же колонки, что список тел и готовые виды, и устроена так
 * же намеренно. Отличие в том, что строки здесь не записаны в коде: их каждый
 * раз считает поиск по эфемеридам, и дата в строке - ответ, а не подпись.
 *
 * Ради этого ответа и считались точные орбиты. Сцена, в которой можно
 * повернуть Сатурн, - красивая игрушка; сцена, которая говорит, когда
 * ближайшее полное затмение и куда смотреть, - инструмент.
 */

/** Дата события: без секунд - точности модели на них всё равно не хватает. */
const DATE_FORMAT = new Intl.DateTimeFormat('ru-RU', {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});

export class EventList {
  private readonly root: HTMLElement;
  private readonly toggleButton: HTMLButtonElement;
  private readonly list: HTMLElement;
  private readonly rows: { id: string; element: HTMLButtonElement }[] = [];
  private open = false;
  private filled = false;
  /** Панель открыли: соседняя в той же колонке должна закрыться. */
  private opened: () => void = () => {};

  /**
   * @param load события считаются не в конструкторе, а при первом открытии:
   *        поиск по пяти годам занимает около четверти секунды, и платить её
   *        при загрузке страницы за список, который могут и не открыть, незачем
   */
  constructor(
    container: HTMLElement,
    private readonly load: () => readonly EventRow[],
    private readonly onSelect: (row: EventRow) => void,
  ) {
    this.root = document.createElement('aside');
    this.root.className = 'views closed';
    // Панелей вида «views» в колонке две, и снаружи их надо различать: у
    // свёрнутой строки списка остаются в разметке - она гаснет обрезкой, а не
    // удалением, - и «закрыта ли панель» читается только по ней самой.
    this.root.dataset.panel = 'events';

    this.toggleButton = document.createElement('button');
    this.toggleButton.type = 'button';
    this.toggleButton.className = 'bodies-toggle';
    this.toggleButton.title = 'Ближайшие события (E)';
    this.toggleButton.addEventListener('click', () => this.setOpen(!this.open));

    this.list = document.createElement('div');
    this.list.className = 'panel-list views-list';

    this.root.append(this.toggleButton, this.list);
    container.prepend(this.root);
    this.updateLabel();
  }

  get isOpen(): boolean {
    return this.open;
  }

  /**
   * Задаётся после создания, а не в конструкторе: список видов создаётся
   * следующим, и в момент постройки этой панели его ещё нет.
   */
  onOpen(handler: () => void): void {
    this.opened = handler;
  }

  setOpen(open: boolean): void {
    if (open === this.open) return;
    if (open) this.fill();

    this.open = open;
    this.root.classList.toggle('closed', !open);
    this.updateLabel();
    if (open) this.opened();

    // Пока мышь захвачена полётом, курсора нет и кликать нечем.
    if (open && document.pointerLockElement) document.exitPointerLock();
  }

  toggle(): void {
    this.setOpen(!this.open);
  }

  /** Отметить выбранное событие: по нему видно, куда сейчас смотрит камера. */
  setActive(id: string | null): void {
    for (const row of this.rows) row.element.classList.toggle('active', row.id === id);
  }

  /** Пересобрать список: дата сцены ушла за край окна поиска. */
  reload(): void {
    this.filled = false;
    if (this.open) this.fill();
  }

  private fill(): void {
    if (this.filled) return;
    this.filled = true;

    this.list.replaceChildren();
    this.rows.length = 0;

    const events = this.load();

    if (events.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'panel-row views-row';
      empty.textContent = 'В ближайшие годы ничего не найдено';
      this.list.appendChild(empty);
      return;
    }

    for (const event of events) {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'panel-row views-row';
      element.dataset.event = event.id;

      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = event.title;

      const when = document.createElement('span');
      when.className = 'views-hint';
      // Дата и пояснение в одной строке: дата - главное, ради чего список и
      // открывают, а пояснение отвечает на «и что с того».
      when.textContent = `${DATE_FORMAT.format(event.date)} · ${event.hint}`;

      element.append(name, when);
      element.addEventListener('click', () => {
        this.onSelect(event);
        this.setOpen(false);
      });

      this.list.appendChild(element);
      this.rows.push({ id: event.id, element });
    }
  }

  private updateLabel(): void {
    this.toggleButton.textContent = this.open ? 'События ✕' : 'События ☄';
  }
}
