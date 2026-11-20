/**
 * Состояние кнопок и карточки-диалоги для клавиатуры и экранного диктора.
 *
 * Панели колонки раскрываются кнопками, а справка и поддержка - карточки
 * поверх сцены. Глазами видно, что открыто; диктору это надо сказать
 * атрибутами, а тому, кто идёт клавишей Tab, - вести фокус в карточку и
 * возвращать обратно.
 */

/**
 * Связать кнопку-переключатель с панелью, которую она раскрывает.
 *
 * @param id идентификатор панели, если своего у неё нет
 */
export function linkToggle(button: HTMLElement, panel: HTMLElement, id: string): void {
  if (!panel.id) panel.id = id;
  button.setAttribute('aria-controls', panel.id);
  setExpanded(button, false);
}

/** Сказать, раскрыта ли панель кнопки. */
export function setExpanded(button: HTMLElement, open: boolean): void {
  button.setAttribute('aria-expanded', String(open));
}

/**
 * Убрать фокус так, чтобы следующий Tab начал с начала страницы.
 *
 * Простой `blur` оставляет браузеру точку отсчёта там, где фокус был, - в
 * закрытой карточке в конце разметки, и первый Tab уводил фокус за пределы
 * страницы. Фокус на `body` переносит точку отсчёта в начало. Своего
 * `tabindex` у `body` нет, поэтому он ставится на мгновение.
 */
function focusPageStart(): void {
  const body = document.body;
  const own = body.getAttribute('tabindex');
  body.tabIndex = -1;
  body.focus({ preventScroll: true });
  if (own === null) body.removeAttribute('tabindex');
  else body.setAttribute('tabindex', own);
}

/** Элементы карточки, на которые встаёт фокус, по порядку. */
function focusables(within: HTMLElement): HTMLElement[] {
  return [
    ...within.querySelectorAll<HTMLElement>(
      'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ].filter(
    (element) => !element.closest('[inert]') && element.getClientRects().length > 0,
  );
}

/**
 * Карточка поверх сцены как диалог.
 *
 * При открытии фокус уходит в саму карточку, а не на первую кнопку: рамка
 * вокруг крестика на каждом старте, где справка открыта сама, была бы
 * шумом, а диктор и так прочтёт заголовок. Tab ходит по кругу внутри.
 *
 * При закрытии фокус возвращается туда, где был до открытия. Открыли
 * кнопкой - на кнопку. Открыли клавишей H или справка открылась сама на
 * старте - фокуса не было, и после закрытия его нет. Иначе пробел, которым
 * сразу после Esc поднимаются над плоскостью, нажимал бы кнопку «Справка» и
 * открывал её снова.
 */
export class DialogFocus {
  private returnTo: HTMLElement | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly card: HTMLElement,
    title: HTMLElement,
    titleId: string,
  ) {
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    title.id = titleId;
    card.setAttribute('aria-labelledby', titleId);
    card.tabIndex = -1;
    root.addEventListener('keydown', (event) => this.keepInside(event));
  }

  /** Вызывать сразу после того, как карточка стала доступной. */
  opened(): void {
    const active = document.activeElement;
    this.returnTo =
      active instanceof HTMLElement && active !== document.body && !this.root.contains(active)
        ? active
        : null;
    this.card.focus({ preventScroll: true });
  }

  /**
   * Вызывать до того, как карточка станет инертной: фокус внутри инертного
   * элемента браузер сбрасывает сам, и вернуть его было бы уже неоткуда.
   */
  closed(): void {
    const active = document.activeElement;
    const target = this.returnTo;
    this.returnTo = null;
    // Фокус уже ушёл - в соседнюю карточку, которая и закрыла эту, или
    // щелчком в сцену. Возвращать его оттуда не надо.
    if (!(active instanceof HTMLElement) || !this.root.contains(active)) return;
    if (target?.isConnected) target.focus({ preventScroll: true });
    else focusPageStart();
  }

  private keepInside(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const items = focusables(this.card);
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) {
      event.preventDefault();
      return;
    }
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === this.card)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
