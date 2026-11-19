import type { EventRow } from '../data/events';
import { formatDateTime, onLanguageChange, strings } from '../i18n';

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

/*
 * Дата события - тем же форматом, что в HUD: без секунд - точности модели на
 * них всё равно не хватает.
 */

export class EventList {
  private readonly root: HTMLElement;
  private readonly toggleButton: HTMLButtonElement;
  private readonly list: HTMLElement;
  private readonly rows: { id: string; element: HTMLButtonElement }[] = [];
  private open = false;
  private filled = false;
  /** Последний полученный список: по нему строки пишутся заново при смене языка. */
  private events: readonly EventRow[] | null = null;
  /** Номер запроса: ответ на устаревший, пришедший позже нового, не показывается. */
  private request = 0;
  private activeId: string | null = null;
  /** Панель открыли: соседняя в той же колонке должна закрыться. */
  private opened: () => void = () => {};

  /**
   * @param load события считаются не в конструкторе, а при первом открытии:
   *        поиск по пяти годам идёт сотни миллисекунд даже в фоновом потоке,
   *        и тратить их при загрузке страницы на список, который могут и не
   *        открыть, незачем
   */
  constructor(
    container: HTMLElement,
    private readonly load: () => Promise<readonly EventRow[]>,
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
    this.toggleButton.addEventListener('click', () => this.setOpen(!this.open));

    this.list = document.createElement('div');
    this.list.className = 'panel-list views-list';

    this.root.append(this.toggleButton, this.list);
    container.prepend(this.root);
    this.updateLabel();

    // Строки собираются из того же посчитанного списка заново: поиск по
    // эфемеридам языка не касается, меняются только слова и формат даты.
    onLanguageChange(() => {
      this.updateLabel();
      if (this.events) this.render(this.events);
      else if (this.filled) this.showLoading();
    });
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
    this.activeId = id;
    for (const row of this.rows) row.element.classList.toggle('active', row.id === id);
  }

  /** Пересобрать список: дата сцены ушла за край окна поиска. */
  reload(): void {
    this.filled = false;
    if (this.open) this.fill();
  }

  /**
   * Запросить список и показать, когда придёт. Прежние строки до тех пор
   * остаются: на высокой скорости времени список устаревает раз в несколько
   * секунд, и мигать каждый раз строкой «считаю» незачем. Её видно только при
   * первом открытии.
   */
  private fill(): void {
    if (this.filled) return;
    this.filled = true;

    if (!this.events) this.showLoading();
    const request = ++this.request;
    void this.load().then((events) => {
      if (request !== this.request) return;
      this.events = events;
      this.render(events);
    });
  }

  private showLoading(): void {
    this.list.replaceChildren();
    this.rows.length = 0;
    const loading = document.createElement('div');
    loading.className = 'panel-row views-row';
    loading.dataset.loading = '';
    loading.textContent = strings().panels.events.loading;
    this.list.appendChild(loading);
  }

  private render(events: readonly EventRow[]): void {
    this.list.replaceChildren();
    this.rows.length = 0;

    if (events.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'panel-row views-row';
      empty.textContent = strings().panels.events.empty;
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
      when.textContent = `${formatDateTime(event.date)} · ${event.hint}`;

      element.append(name, when);
      element.addEventListener('click', () => {
        this.onSelect(event);
        this.setOpen(false);
      });

      this.list.appendChild(element);
      this.rows.push({ id: event.id, element });
    }
    this.setActive(this.activeId);
  }

  private updateLabel(): void {
    const words = strings().panels.events;
    this.toggleButton.title = words.title;
    this.toggleButton.textContent = this.open ? words.close : words.open;
  }
}
