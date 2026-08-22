/**
 * Справка по управлению.
 *
 * Единственный источник правды о клавишах: и подсказка внизу экрана, и сама
 * карточка собираются из одной таблицы. Разъехавшаяся справка хуже её
 * отсутствия — человек пробует то, чего нет, и решает, что сломано.
 */

export interface HelpBinding {
  /** Клавиши или действия мыши. Несколько вариантов — через запятую в массиве. */
  keys: string[];
  what: string;
}

export interface HelpSection {
  title: string;
  bindings: HelpBinding[];
}

export const CONTROLS: HelpSection[] = [
  {
    title: 'Полёт',
    bindings: [
      { keys: ['Клик по небу'], what: 'взять мышь и осмотреться' },
      { keys: ['W', 'A', 'S', 'D'], what: 'вперёд, влево, назад, вправо' },
      { keys: ['Space', 'C'], what: 'вверх и вниз' },
      { keys: ['Shift'], what: 'ускорение в десять раз' },
      { keys: ['Колесо'], what: 'подстроить скорость' },
      { keys: ['Esc'], what: 'отпустить мышь' },
    ],
  },
  {
    title: 'Перелёт',
    bindings: [
      { keys: ['Клик по телу'], what: 'перелёт к нему' },
      { keys: ['Клик по подписи'], what: 'то же, но попасть проще' },
      { keys: ['B'], what: 'список тел' },
      { keys: ['W', 'Esc'], what: 'прервать перелёт' },
    ],
  },
  {
    title: 'Осмотр',
    bindings: [
      { keys: ['Тянуть мышью'], what: 'повернуть тело перед камерой' },
      { keys: ['Колесо'], what: 'ближе и дальше' },
      { keys: ['W', 'A', 'S', 'D'], what: 'выйти в свободный полёт' },
    ],
  },
  {
    title: 'Время',
    bindings: [
      { keys: ['P'], what: 'пауза' },
      // Голая запятая в рамке клавиши нечитаема: точка и запятая слишком
      // мелкие и сидят у самого края строки.
      { keys: [', запятая'], what: 'медленнее — вплоть до реального времени' },
      { keys: ['. точка'], what: 'быстрее — до двадцати лет в секунду' },
    ],
  },
  {
    title: 'Вид',
    bindings: [
      { keys: ['L'], what: 'подписи тел' },
      { keys: ['N'], what: 'созвездия и имена ярких звёзд' },
      { keys: ['M'], what: 'размеры тел: настоящие, ×10, ×100, ×1000' },
      { keys: ['T'], what: 'автоматическая экскурсия' },
      // Стрелки работают только на ходу экскурсии, и подпись говорит об
      // этом прямо: вне её они ничего не делают.
      { keys: ['←', '→'], what: 'во время экскурсии — предыдущая и следующая остановка' },
      { keys: ['H'], what: 'эта справка' },
    ],
  },
];

/**
 * Короткая строка-подсказка для новичка: три главных действия из таблицы выше.
 * Всё остальное — в справке, и незачем занимать ею экран.
 */
export const HINT = 'Клик по телу — перелёт · Клик по небу — осмотреться · H — справка';

export class HelpPanel {
  private readonly root: HTMLElement;
  private readonly button: HTMLButtonElement;
  private open = false;

  /**
   * @param container слой, в котором лежит затемнение с карточкой
   * @param buttonHost куда встаёт кнопка-переключатель; по умолчанию туда же
   * @param onOpen вызывается при открытии — им закрывается соседняя панель
   */
  constructor(
    container: HTMLElement,
    buttonHost: HTMLElement = container,
    private readonly onOpen?: () => void,
  ) {
    // Кнопка нужна тому, кто не знает про клавиши: узнать про H из справки,
    // которую открывают клавишей H, невозможно. Поэтому она стоит рядом со
    // списком тел, подписана словом и выглядит так же — два видимых входа в
    // интерфейс вместо одного значка в углу.
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'bodies-toggle help-toggle';
    this.button.title = 'Управление (H)';
    this.updateLabel();
    this.button.addEventListener('click', () => this.toggle());
    buttonHost.prepend(this.button);

    this.root = document.createElement('div');
    this.root.id = 'help';
    // Вид карточки — общий с панелью поддержки, см. `.overlay` в index.html.
    this.root.className = 'overlay closed';

    const card = document.createElement('div');
    card.className = 'overlay-card';

    const header = document.createElement('div');
    header.className = 'overlay-header';

    const title = document.createElement('h1');
    title.textContent = 'Управление';

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'overlay-close';
    close.textContent = '✕';
    close.title = 'Закрыть (H или Esc)';
    close.addEventListener('click', () => this.setOpen(false));

    header.append(title, close);
    card.appendChild(header);

    const columns = document.createElement('div');
    columns.className = 'help-columns';

    for (const section of CONTROLS) {
      const block = document.createElement('section');

      const heading = document.createElement('h2');
      heading.textContent = section.title;
      block.appendChild(heading);

      for (const binding of section.bindings) {
        const row = document.createElement('div');
        row.className = 'help-row';

        const keys = document.createElement('span');
        keys.className = 'help-keys';
        binding.keys.forEach((key, index) => {
          if (index > 0) keys.append(document.createTextNode(' '));
          const kbd = document.createElement('kbd');
          kbd.textContent = key;
          keys.appendChild(kbd);
        });

        const what = document.createElement('span');
        what.className = 'help-what';
        what.textContent = binding.what;

        row.append(keys, what);
        block.appendChild(row);
      }

      columns.appendChild(block);
      
      if (section.title === 'Время') {
        // Управление временем собрано в одном месте: сперва дата, под ней
        // скорость её течения. Порядок тот же, что в вопросе зрителя:
        // сначала «когда», потом «как быстро».
        const dateRow = document.createElement('div');
        dateRow.className = 'help-row';
        dateRow.id = 'date-panel-container';
        block.appendChild(dateRow);

        const sliderRow = document.createElement('div');
        sliderRow.className = 'help-row';
        sliderRow.id = 'time-slider-container';
        block.appendChild(sliderRow);
      }
    }

    card.appendChild(columns);

    const footer = document.createElement('p');
    footer.className = 'help-footer';
    // Две вещи, которые невозможно вывести из клавиш, но без которых сцена
    // кажется сломанной: почему далёкие планеты тусклые и почему камера
    // «висит» рядом с планетой, пока та летит по орбите.
    footer.textContent =
      'Расстояния настоящие, размеры тел тоже. Чем дальше от Солнца, тем темнее — ' +
      'так и есть на самом деле. После перелёта камера остаётся в системе отсчёта тела ' +
      'и движется вместе с ним.';
    card.appendChild(footer);

    this.root.appendChild(card);
    container.appendChild(this.root);

    // Клик мимо карточки закрывает справку — привычное поведение для окна,
    // занимающего середину экрана.
    this.root.addEventListener('click', (event) => {
      if (event.target === this.root) this.setOpen(false);
    });
  }

  get isOpen(): boolean {
    return this.open;
  }

  setOpen(open: boolean): void {
    if (open === this.open) return;
    this.open = open;
    this.root.classList.toggle('closed', !open);
    this.button.classList.toggle('active', open);
    this.updateLabel();
    // Справку читают мышью и глазами: захват мыши на это время отпускается.
    if (open && document.pointerLockElement) document.exitPointerLock();
    if (open) this.onOpen?.();
  }

  toggle(): void {
    this.setOpen(!this.open);
  }

  /** Подпись кнопки — по образцу списка тел: слово и знак состояния. */
  private updateLabel(): void {
    this.button.textContent = this.open ? 'Справка ✕' : 'Справка ?';
  }
}
