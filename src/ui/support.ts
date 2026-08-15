/**
 * Карточка поддержки проекта.
 *
 * Устроена так же, как справка (`ui/help.ts`), и намеренно: обе панели — это
 * одна и та же модальная карточка с разным содержимым, у них общие стили
 * (`.overlay` в index.html) и общее поведение — закрытие по `Esc`, по крестику
 * и по клику мимо карточки.
 *
 * Кнопка стоит первой в колонке, над справкой. Ссылка ведёт на CloudTips;
 * рядом QR-код — со стороны монитора им пользуются чаще, чем кажется: телефон
 * уже в руке, а переносить ссылку руками неудобно.
 */

/**
 * Страница приёма чаевых. Тот же адрес закодирован в `public/donate-qr.svg`;
 * чем сгенерирован и как перепроверить — в `docs/donate-qr.md`.
 */
export const DONATION_URL = 'https://pay.cloudtips.ru/p/86c3292c';

/** Сколько держать подпись «Скопировано» перед возвратом к исходной. */
const COPIED_FEEDBACK_MS = 2000;

export class SupportPanel {
  private readonly root: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly copyButton: HTMLButtonElement;
  private copiedTimer = 0;
  private open = false;

  /**
   * @param container слой, в котором лежит затемнение с карточкой
   * @param buttonHost куда встаёт кнопка-переключатель
   * @param onOpen вызывается при открытии — им закрывается соседняя панель
   */
  constructor(
    container: HTMLElement,
    buttonHost: HTMLElement = container,
    private readonly onOpen?: () => void,
  ) {
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'bodies-toggle support-toggle';
    this.button.title = 'Поддержать проект';
    this.updateLabel();
    this.button.addEventListener('click', () => this.toggle());
    // `prepend` ставит кнопку выше уже добавленных, поэтому панель поддержки
    // создаётся после справки — тогда порядок сверху вниз выходит
    // «Поддержать», «Справка», «Тела».
    buttonHost.prepend(this.button);

    this.root = document.createElement('div');
    this.root.id = 'support';
    this.root.className = 'overlay closed';

    const card = document.createElement('div');
    card.className = 'overlay-card';

    const header = document.createElement('div');
    header.className = 'overlay-header';

    const title = document.createElement('h1');
    title.textContent = 'Поддержать автора';

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'overlay-close';
    close.textContent = '✕';
    close.title = 'Закрыть (Esc)';
    close.addEventListener('click', () => this.setOpen(false));

    header.append(title, close);
    card.appendChild(header);

    const lead = document.createElement('p');
    lead.className = 'support-lead';
    lead.textContent =
      'Понравился симулятор? Буду благодарен за любую поддержку — она идёт на развитие проекта.';
    card.appendChild(lead);

    const body = document.createElement('div');
    body.className = 'support-body';

    body.appendChild(this.createQrLink());
    body.appendChild(this.createActions());
    card.appendChild(body);

    const share = document.createElement('div');
    share.className = 'support-share';

    const shareText = document.createElement('span');
    shareText.textContent = 'Или поделитесь ссылкой на симулятор';

    this.copyButton = document.createElement('button');
    this.copyButton.type = 'button';
    this.copyButton.className = 'support-copy';
    this.copyButton.textContent = 'Скопировать ссылку';
    this.copyButton.addEventListener('click', () => void this.copyLink());

    share.append(shareText, this.copyButton);
    card.appendChild(share);

    this.root.appendChild(card);
    container.appendChild(this.root);

    this.root.addEventListener('click', (event) => {
      if (event.target === this.root) this.setOpen(false);
    });
  }

  private createQrLink(): HTMLAnchorElement {
    const link = document.createElement('a');
    link.className = 'support-qr';
    link.href = DONATION_URL;
    link.target = '_blank';
    // Без `noopener` открытая страница получает доступ к `window.opener` и
    // может подменить содержимое нашей вкладки.
    link.rel = 'noopener noreferrer';
    link.title = 'Открыть страницу CloudTips';

    const image = document.createElement('img');
    image.src = 'donate-qr.svg';
    image.alt = 'QR-код на страницу поддержки CloudTips';
    image.width = 104;
    image.height = 104;
    // Картинка не критична: если её нет, остаётся кнопка перехода, и терять
    // из-за неё весь блок незачем.
    image.addEventListener('error', () => link.removeChild(image));

    const caption = document.createElement('span');
    caption.textContent = 'Нажмите или сканируйте';

    link.append(image, caption);
    return link;
  }

  private createActions(): HTMLElement {
    const actions = document.createElement('div');
    actions.className = 'support-actions';

    const lead = document.createElement('p');
    lead.append(document.createTextNode('Быстрый перевод через '));
    const service = document.createElement('b');
    service.textContent = 'CloudTips';
    lead.append(service);

    const methods = document.createElement('p');
    methods.className = 'support-methods';
    methods.append(document.createTextNode('Оплата в один клик через '));
    const sbp = document.createElement('b');
    sbp.textContent = 'СБП';
    methods.append(sbp, document.createTextNode(', T-Pay, SberPay или банковские карты.'));

    const pay = document.createElement('a');
    pay.className = 'support-pay';
    pay.href = DONATION_URL;
    pay.target = '_blank';
    pay.rel = 'noopener noreferrer';
    pay.textContent = 'Отправить чаевые ↗';

    actions.append(lead, methods, pay);
    return actions;
  }

  private async copyLink(): Promise<void> {
    // Копируется адрес, с которого открыта страница, а не зашитая строка:
    // зашитая разошлась бы с реальностью при первом же переезде.
    const url = `${window.location.origin}${window.location.pathname}`;

    try {
      await navigator.clipboard.writeText(url);
      this.showCopied('Скопировано');
    } catch {
      // Буфер обмена недоступен без защищённого соединения и без жеста
      // пользователя. Молчать здесь нельзя: кнопка выглядела бы сломанной.
      this.showCopied('Не вышло скопировать');
    }
  }

  private showCopied(text: string): void {
    this.copyButton.textContent = text;
    window.clearTimeout(this.copiedTimer);
    this.copiedTimer = window.setTimeout(() => {
      this.copyButton.textContent = 'Скопировать ссылку';
    }, COPIED_FEEDBACK_MS);
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
    // Карточку читают мышью и глазами: захват мыши на это время отпускается.
    if (open && document.pointerLockElement) document.exitPointerLock();
    if (open) this.onOpen?.();
  }

  toggle(): void {
    this.setOpen(!this.open);
  }

  /** Подпись кнопки — по образцу соседей: слово и знак состояния. */
  private updateLabel(): void {
    this.button.textContent = this.open ? 'Поддержать ✕' : 'Поддержать ♥';
  }
}
