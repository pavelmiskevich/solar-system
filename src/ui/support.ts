/**
 * Карточка поддержки проекта.
 *
 * Устроена так же, как справка (`ui/help.ts`), и намеренно: обе панели - это
 * одна и та же модальная карточка с разным содержимым, у них общие стили
 * (`.overlay` в index.html) и общее поведение - закрытие по `Esc`, по крестику
 * и по клику мимо карточки.
 *
 * Кнопка стоит первой в колонке, над справкой. Ссылка ведёт на CloudTips;
 * рядом QR-код - со стороны монитора им пользуются чаще, чем кажется: телефон
 * уже в руке, а переносить ссылку руками неудобно.
 */

import { onLanguageChange, strings, type Dictionary } from '../i18n';

/**
 * Страница приёма чаевых. Тот же адрес закодирован в `public/donate-qr.svg`;
 * чем сгенерирован и как перепроверить - в `docs/donate-qr.md`.
 */
export const DONATION_URL = 'https://pay.cloudtips.ru/p/86c3292c';

/** Сколько держать подпись «Скопировано» перед возвратом к исходной. */
const COPIED_FEEDBACK_MS = 2000;

type Words = Dictionary['support'];

export class SupportPanel {
  private readonly root: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly copyButton: HTMLButtonElement;
  private copiedTimer = 0;
  private open = false;

  /**
   * Что написать в каждый узел с текстом.
   *
   * Карточка собирается один раз, а слова в ней переписывает смена языка:
   * каждый узел запоминается вместе с тем, какую строку словаря он показывает.
   */
  private readonly writers: ((words: Words) => void)[] = [];

  /**
   * @param container слой, в котором лежит затемнение с карточкой
   * @param buttonHost куда встаёт кнопка-переключатель
   * @param onOpen вызывается при открытии - им закрывается соседняя панель
   */
  constructor(
    container: HTMLElement,
    buttonHost: HTMLElement = container,
    private readonly onOpen?: () => void,
  ) {
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'bodies-toggle support-toggle';
    this.writers.push((words) => {
      this.button.title = words.buttonTitle;
      this.updateLabel();
    });
    this.button.addEventListener('click', () => this.toggle());
    // `prepend` ставит кнопку выше уже добавленных, поэтому панель поддержки
    // создаётся после справки - тогда порядок сверху вниз выходит
    // «Поддержать», «Справка», «Тела».
    buttonHost.prepend(this.button);

    this.root = document.createElement('div');
    this.root.id = 'support';
    this.root.className = 'overlay closed';

    const card = document.createElement('div');
    card.className = 'overlay-card';

    const header = document.createElement('div');
    header.className = 'overlay-header';

    const title = this.text('h1', (words) => words.title);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'overlay-close';
    close.textContent = '✕';
    this.writers.push((words) => {
      close.title = words.closeTitle;
    });
    close.addEventListener('click', () => this.setOpen(false));

    header.append(title, close);
    card.appendChild(header);

    const lead = this.text('p', (words) => words.lead);
    lead.className = 'support-lead';
    card.appendChild(lead);

    const body = document.createElement('div');
    body.className = 'support-body';

    body.appendChild(this.createQrLink());
    body.appendChild(this.createActions());
    card.appendChild(body);

    const share = document.createElement('div');
    share.className = 'support-share';

    const shareText = this.text('span', (words) => words.share);

    this.copyButton = document.createElement('button');
    this.copyButton.type = 'button';
    this.copyButton.className = 'support-copy';
    // Подтверждение «Скопировано» держится своё время и на смене языка не
    // сбрасывается: оно всё равно вот-вот вернётся к обычной подписи.
    this.writers.push((words) => {
      if (this.copiedTimer === 0) this.copyButton.textContent = words.copy;
    });
    this.copyButton.addEventListener('click', () => void this.copyLink());

    share.append(shareText, this.copyButton);
    card.appendChild(share);

    this.root.appendChild(card);
    container.appendChild(this.root);

    this.write();
    onLanguageChange(() => this.write());

    this.root.addEventListener('click', (event) => {
      if (event.target === this.root) this.setOpen(false);
    });
  }

  private write(): void {
    const words = strings().support;
    for (const writer of this.writers) writer(words);
  }

  /** Узел с текстом из словаря: пишется сейчас и переписывается сменой языка. */
  private text<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    pick: (words: Words) => string,
  ): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    this.writers.push((words) => {
      node.textContent = pick(words);
    });
    return node;
  }

  private createQrLink(): HTMLAnchorElement {
    const link = document.createElement('a');
    link.className = 'support-qr';
    link.href = DONATION_URL;
    link.target = '_blank';
    // Без `noopener` открытая страница получает доступ к `window.opener` и
    // может подменить содержимое нашей вкладки.
    link.rel = 'noopener noreferrer';

    const image = document.createElement('img');
    image.src = 'donate-qr.svg';
    image.width = 104;
    image.height = 104;
    // Картинка не критична: если её нет, остаётся кнопка перехода, и терять
    // из-за неё весь блок незачем.
    image.addEventListener('error', () => link.removeChild(image));

    this.writers.push((words) => {
      link.title = words.qrTitle;
      image.alt = words.qrAlt;
    });

    const caption = this.text('span', (words) => words.qrCaption);

    link.append(image, caption);
    return link;
  }

  private createActions(): HTMLElement {
    const actions = document.createElement('div');
    actions.className = 'support-actions';

    // Название сервиса и платёжных систем выделено и стоит посреди фразы,
    // поэтому фраза собирается из кусков - но каждый кусок из словаря, и
    // порядок их задаёт он же.
    const lead = document.createElement('p');
    const via = document.createTextNode('');
    const service = document.createElement('b');
    service.textContent = 'CloudTips';
    lead.append(via, service);

    const methods = document.createElement('p');
    methods.className = 'support-methods';
    const before = document.createTextNode('');
    const sbp = document.createElement('b');
    const after = document.createTextNode('');
    methods.append(before, sbp, after);

    this.writers.push((words) => {
      via.textContent = words.via;
      before.textContent = words.methods.before;
      sbp.textContent = words.methods.sbp;
      after.textContent = words.methods.after;
    });

    const pay = this.text('a', (words) => words.pay);
    pay.className = 'support-pay';
    pay.href = DONATION_URL;
    pay.target = '_blank';
    pay.rel = 'noopener noreferrer';

    actions.append(lead, methods, pay);
    return actions;
  }

  private async copyLink(): Promise<void> {
    // Копируется адрес, с которого открыта страница, а не зашитая строка:
    // зашитая разошлась бы с реальностью при первом же переезде.
    const url = `${window.location.origin}${window.location.pathname}`;

    try {
      await navigator.clipboard.writeText(url);
      this.showCopied(strings().support.copied);
    } catch {
      // Буфер обмена недоступен без защищённого соединения и без жеста
      // пользователя. Молчать здесь нельзя: кнопка выглядела бы сломанной.
      this.showCopied(strings().support.copyFailed);
    }
  }

  private showCopied(text: string): void {
    this.copyButton.textContent = text;
    window.clearTimeout(this.copiedTimer);
    this.copiedTimer = window.setTimeout(() => {
      this.copiedTimer = 0;
      this.copyButton.textContent = strings().support.copy;
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

  /** Подпись кнопки - по образцу соседей: слово и знак состояния. */
  private updateLabel(): void {
    const words = strings().support;
    this.button.textContent = this.open ? words.close : words.open;
  }
}
