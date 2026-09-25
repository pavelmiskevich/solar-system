/**
 * Справка по управлению.
 *
 * Единственный источник правды о клавишах: и подсказка внизу экрана, и сама
 * карточка собираются из одной таблицы. Разъехавшаяся справка хуже её
 * отсутствия - человек пробует то, чего нет, и решает, что сломано.
 *
 * Таблица знает только клавиши и то, какое действие к ним привязано; слова -
 * название раздела, клавиша, которую приходится называть словом, и само
 * действие - берутся из словаря интерфейса на текущем языке.
 */

import { onLanguageChange, strings, type Dictionary } from '../i18n';
import { isTouchPrimary } from './pointerKind';

type Words = Dictionary['help'];

export interface HelpBinding {
  /** Клавиши или действия мыши. Несколько вариантов - через запятую в массиве. */
  keys: string[];
  what: string;
}

export type HelpSectionId = keyof Words['sections'];

export interface HelpSection {
  id: HelpSectionId;
  title: string;
  bindings: HelpBinding[];
}

export function controls(words: Words = strings().help): HelpSection[] {
  const { keys, actions, sections } = words;

  return [
    {
      id: 'flight',
      title: sections.flight,
      bindings: [
        { keys: [keys.clickSky], what: actions.look },
        { keys: ['W', 'A', 'S', 'D'], what: actions.move },
        { keys: ['Space', 'C'], what: actions.upDown },
        { keys: ['Shift'], what: actions.boost },
        { keys: [keys.wheel], what: actions.adjustSpeed },
        { keys: ['Esc'], what: actions.releaseMouse },
      ],
    },
    {
      id: 'travel',
      title: sections.travel,
      bindings: [
        { keys: [keys.clickBody], what: actions.travel },
        { keys: [keys.clickLabel], what: actions.travelEasier },
        { keys: ['B'], what: actions.bodyList },
        { keys: ['V'], what: actions.views },
        { keys: ['E'], what: actions.events },
        { keys: ['W', 'Esc'], what: actions.abortTravel },
      ],
    },
    {
      id: 'inspect',
      title: sections.inspect,
      bindings: [
        { keys: [keys.drag], what: actions.rotate },
        { keys: [keys.wheel], what: actions.zoom },
        { keys: ['F'], what: actions.aimLock },
        { keys: ['W', 'A', 'S', 'D'], what: actions.freeFlight },
      ],
    },
    {
      id: 'time',
      title: sections.time,
      bindings: [
        { keys: ['P'], what: actions.pause },
        { keys: [keys.comma], what: actions.slower },
        { keys: [keys.period], what: actions.faster },
      ],
    },
    {
      id: 'view',
      title: sections.view,
      bindings: [
        { keys: ['L'], what: actions.labels },
        { keys: ['N'], what: actions.sky },
        { keys: ['M'], what: actions.sizes },
        { keys: ['T'], what: actions.tour },
        { keys: ['←', '→'], what: actions.tourSteps },
        { keys: ['H'], what: actions.help },
      ],
    },
  ];
}

/**
 * Управление пальцами.
 *
 * Отдельным разделом, а не правкой существующих: на сенсорном экране
 * бесполезна половина таблицы выше - ни WASD, ни колеса, ни захвата мыши там
 * нет. Раздел встаёт первым и только там, где указывают пальцем, - подсказка
 * про щипок на настольном экране сбивала бы с толку.
 */
export function touchControls(words: Words = strings().help): HelpSection {
  const { keys, actions } = words;

  return {
    id: 'touch',
    title: words.sections.touch,
    bindings: [
      { keys: [keys.tapBody], what: actions.travel },
      { keys: [keys.tapLabel], what: actions.travelEasier },
      { keys: [keys.dragFinger], what: actions.touchLook },
      { keys: [keys.pinch], what: actions.touchZoom },
      { keys: [keys.swipe], what: actions.tourSteps },
      { keys: [keys.buttons], what: actions.buttons },
    ],
  };
}

/** Разделы справки для текущего устройства. */
export function controlSections(touch: boolean, words: Words = strings().help): HelpSection[] {
  return touch ? [touchControls(words), ...controls(words)] : controls(words);
}

/*
 * Короткая строка-подсказка для новичка - `hint` в словаре: три главных
 * действия из таблицы выше. Всё остальное - в справке, и незачем занимать
 * ею экран.
 *
 * Для пальца строка своя, `touchHint`. Клик заменён касанием, а захват мыши -
 * щипком: из трёх действий на сенсорном экране невыполнимо ровно одно, и
 * подменять его нужно тем, которого там больше всего не хватает.
 */
export function hintText(touch: boolean): string {
  const words = strings().help;
  return touch ? words.touchHint : words.hint;
}

export class HelpPanel {
  private readonly root: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly title: HTMLElement;
  private readonly close: HTMLButtonElement;
  private readonly columns: HTMLElement;
  private readonly footer: HTMLElement;
  /**
   * Места под ввод даты и ползунок скорости.
   *
   * Их заполняют другие модули, и заполняют один раз. Разделы справки при
   * смене языка собираются заново, а эти два узла переезжают в новый раздел
   * «Время» целиком, вместе с тем, что в них уже стоит.
   */
  private readonly dateRow: HTMLElement;
  private readonly sliderRow: HTMLElement;
  private open = false;

  /**
   * @param container слой, в котором лежит затемнение с карточкой
   * @param buttonHost куда встаёт кнопка-переключатель; по умолчанию туда же
   * @param onOpen вызывается при открытии - им закрывается соседняя панель
   */
  constructor(
    container: HTMLElement,
    buttonHost: HTMLElement = container,
    private readonly onOpen?: () => void,
  ) {
    // Кнопка нужна тому, кто не знает про клавиши: узнать про H из справки,
    // которую открывают клавишей H, невозможно. Поэтому она стоит рядом со
    // списком тел, подписана словом и выглядит так же - два видимых входа в
    // интерфейс вместо одного значка в углу.
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'bodies-toggle help-toggle';
    this.button.addEventListener('click', () => this.toggle());
    buttonHost.prepend(this.button);

    this.root = document.createElement('div');
    this.root.id = 'help';
    // Вид карточки - общий с панелью поддержки, см. `.overlay` в index.html.
    this.root.className = 'overlay closed';

    const card = document.createElement('div');
    card.className = 'overlay-card';

    const header = document.createElement('div');
    header.className = 'overlay-header';

    this.title = document.createElement('h1');

    this.close = document.createElement('button');
    this.close.type = 'button';
    this.close.className = 'overlay-close';
    this.close.textContent = '✕';
    this.close.addEventListener('click', () => this.setOpen(false));

    header.append(this.title, this.close);
    card.appendChild(header);

    this.columns = document.createElement('div');
    this.columns.className = 'help-columns';
    card.appendChild(this.columns);

    // Управление временем собрано в одном месте: сперва дата, под ней
    // скорость её течения. Порядок тот же, что в вопросе зрителя:
    // сначала «когда», потом «как быстро».
    this.dateRow = document.createElement('div');
    this.dateRow.className = 'help-row';
    this.dateRow.id = 'date-panel-container';

    this.sliderRow = document.createElement('div');
    this.sliderRow.className = 'help-row';
    this.sliderRow.id = 'time-slider-container';

    // Две вещи, которые невозможно вывести из клавиш, но без которых сцена
    // кажется сломанной: почему далёкие планеты тусклые и почему камера
    // «висит» рядом с планетой, пока та летит по орбите.
    this.footer = document.createElement('p');
    this.footer.className = 'help-footer';
    card.appendChild(this.footer);

    this.root.appendChild(card);
    container.appendChild(this.root);

    this.write();
    onLanguageChange(() => this.write());

    // Клик мимо карточки закрывает справку - привычное поведение для окна,
    // занимающего середину экрана.
    this.root.addEventListener('click', (event) => {
      if (event.target === this.root) this.setOpen(false);
    });
  }

  /** Написать справку на текущем языке - при создании и при смене языка. */
  private write(): void {
    const words = strings().help;

    this.button.title = words.buttonTitle;
    this.title.textContent = words.title;
    this.close.title = words.closeTitle;
    this.footer.textContent = words.footer;
    this.updateLabel();

    const blocks = controlSections(isTouchPrimary(), words).map((section) => {
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

      if (section.id === 'time') block.append(this.dateRow, this.sliderRow);
      return block;
    });

    this.columns.replaceChildren(...blocks);
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

  /** Подпись кнопки - по образцу списка тел: слово и знак состояния. */
  private updateLabel(): void {
    const words = strings().help;
    this.button.textContent = this.open ? words.close : words.open;
  }
}
