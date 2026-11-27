import type { EventRow } from '../data/events';
import { visibleRows, visibleUntil } from '../data/events';
import { formatDateTime, onLanguageChange, strings } from '../i18n';
import { linkToggle, setExpanded } from './a11y';

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

/**
 * Чаще этого строки не сменяются сами, мс. На сутках в секунду тень Фобоса
 * ложится на Марс каждые полсекунды, и строка, меняющаяся быстрее, чем её
 * успевают прочесть, ничего не сообщает. Тот же предел, что у пересчёта
 * списка в main.ts.
 */
const REFRESH_MS = 3000;

export class EventList {
  private readonly root: HTMLElement;
  private readonly toggleButton: HTMLButtonElement;
  private readonly list: HTMLElement;
  private readonly rows: { id: string; element: HTMLButtonElement }[] = [];
  /**
   * Кнопки строк по ключу (EventRow.key) и строка, которую каждая сейчас
   * показывает. Кнопка живёт, пока живёт ключ: когда тень Ио прошла и на её
   * место встала следующая, меняются дата и текст, а не сама кнопка. Иначе
   * при сутках в секунду строки Фобоса подменялись бы под курсором, и щелчок
   * между нажатием и отпусканием попадал бы в уже удалённую кнопку.
   */
  private readonly elements = new Map<string, HTMLButtonElement>();
  private readonly shown = new Map<HTMLButtonElement, EventRow>();
  private heading: HTMLElement | null = null;
  /** Когда строки отбирались последний раз, мс настенного времени. */
  private renderedMs = -Infinity;
  private open = false;
  private filled = false;
  /** Последний полученный список: по нему строки пишутся заново при смене языка. */
  private events: readonly EventRow[] | null = null;
  /** Номер запроса: ответ на устаревший, пришедший позже нового, не показывается. */
  private request = 0;
  /** Номер запроса, ответ на который сейчас на экране. */
  private shownRequest = 0;
  /** Момент сцены, когда показанные строки устареют (см. update). */
  private staleAt = -Infinity;
  /** Момент сцены, на который строки отобраны. */
  private shownAt = Infinity;
  private activeId: string | null = null;
  /** Панель открыли: соседняя в той же колонке должна закрыться. */
  private opened: () => void = () => {};

  /**
   * @param load события считаются не в конструкторе, а при первом открытии:
   *        поиск по пяти годам идёт сотни миллисекунд даже в фоновом потоке,
   *        и тратить их при загрузке страницы на список, который могут и не
   *        открыть, незачем
   * @param now момент сцены, юлианская дата: прошедшее из списка уходит
   */
  constructor(
    container: HTMLElement,
    private readonly load: () => Promise<readonly EventRow[]>,
    private readonly onSelect: (row: EventRow) => void,
    private readonly now: () => number,
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
    // Свёрнутый список гаснет, но остаётся в разметке: без `inert` Tab
    // проходил бы по его невидимым строкам.
    this.list.inert = true;
    linkToggle(this.toggleButton, this.list, 'events-list');

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
    this.list.inert = !open;
    setExpanded(this.toggleButton, open);
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
      // Показывается любой ответ новее того, что на экране, а не только
      // ответ на последний запрос: если запросы идут чаще, чем поиск
      // успевает отвечать, иначе список не обновился бы никогда.
      if (request < this.shownRequest) return;
      this.shownRequest = request;
      this.events = events;
      this.render(events);
    });
  }

  /**
   * Каждый кадр: показанное устарело, если одна из строк ушла в прошлое или
   * время повернули назад. Тогда строки отбираются заново из того же
   * найденного, без поиска: на место прошедшей тени Ио встаёт следующая.
   */
  update(): void {
    if (!this.open || !this.events) return;
    if (performance.now() - this.renderedMs < REFRESH_MS) return;
    const now = this.now();
    if (now > this.staleAt || now < this.shownAt) this.render(this.events);
  }

  private showLoading(): void {
    this.clear();
    const loading = document.createElement('div');
    loading.className = 'panel-row views-row';
    loading.dataset.loading = '';
    loading.textContent = strings().panels.events.loading;
    this.list.appendChild(loading);
  }

  private clear(): void {
    this.list.replaceChildren();
    this.rows.length = 0;
    this.elements.clear();
    this.shown.clear();
  }

  private render(found: readonly EventRow[]): void {
    this.renderedMs = performance.now();
    this.shownAt = this.now();
    const events = visibleRows(found, this.shownAt);
    this.staleAt = visibleUntil(events);

    if (events.length === 0) {
      this.clear();
      const empty = document.createElement('div');
      empty.className = 'panel-row views-row';
      empty.textContent = strings().panels.events.empty;
      this.list.appendChild(empty);
      return;
    }

    // Сначала то, что видно с Земли и о Земле, затем затмения у других
    // планет под своим заголовком. Внутри группы порядок прежний, по времени.
    const sky = events.filter((event) => event.group === 'sky');
    const planets = events.filter((event) => event.group === 'planets');

    const used = new Set<string>();
    const nodes: HTMLElement[] = sky.map((event) => this.rowElement(event, used));
    if (planets.length > 0) {
      nodes.push(this.headingElement());
      for (const event of planets) nodes.push(this.rowElement(event, used));
    }

    for (const [key, element] of this.elements) {
      if (used.has(key)) continue;
      this.elements.delete(key);
      this.shown.delete(element);
    }

    // Порядок узлов трогается, только если он изменился: каждая перестановка
    // - это перестройка списка для того, кто его сейчас читает.
    const children = this.list.children;
    const same = nodes.length === children.length && nodes.every((node, i) => children[i] === node);
    if (!same) this.list.replaceChildren(...nodes);

    this.rows.length = 0;
    for (const [element, row] of this.shown) this.rows.push({ id: row.id, element });
    this.setActive(this.activeId);
  }

  private headingElement(): HTMLElement {
    if (!this.heading) {
      this.heading = document.createElement('div');
      this.heading.className = 'events-heading';
      this.heading.dataset.group = 'planets';
    }
    this.heading.textContent = strings().panels.events.otherPlanets;
    return this.heading;
  }

  /** Кнопка строки: прежняя для того же ключа, с обновлёнными датой и словами. */
  private rowElement(event: EventRow, used: Set<string>): HTMLButtonElement {
    used.add(event.key);
    let element = this.elements.get(event.key);

    if (!element) {
      const created = document.createElement('button');
      created.type = 'button';
      created.className = 'panel-row views-row';

      const name = document.createElement('span');
      name.className = 'name';
      const when = document.createElement('span');
      when.className = 'views-hint';
      created.append(name, when);

      created.addEventListener('click', () => {
        const row = this.shown.get(created);
        if (!row) return;
        this.onSelect(row);
        this.setOpen(false);
      });

      this.elements.set(event.key, created);
      element = created;
    }

    element.dataset.event = event.id;
    element.dataset.group = event.group;
    const [name, when] = element.children as unknown as [HTMLElement, HTMLElement];
    name.textContent = event.title;
    // Дата и пояснение в одной строке: дата - главное, ради чего список и
    // открывают, а пояснение отвечает на «и что с того».
    when.textContent = `${formatDateTime(event.date)} · ${event.hint}`;

    this.shown.set(element, event);
    return element;
  }

  private updateLabel(): void {
    const words = strings().panels.events;
    this.toggleButton.title = words.title;
    this.toggleButton.textContent = this.open ? words.close : words.open;
  }
}
