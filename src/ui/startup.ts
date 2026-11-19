/**
 * Что видит человек, когда сцена не запустилась или потеряла видеокарту.
 *
 * Без этого любое исключение до первого кадра обрывало main.ts, и заставка с
 * бегущей полоской оставалась на экране навсегда: человек ждал «загрузку» и
 * уходил, решив, что сайт сломан. Чаще всего причина - недоступный WebGL:
 * выключенное аппаратное ускорение, видеокарта в чёрном списке браузера,
 * удалённый рабочий стол, встроенное окно мессенджера.
 */

import { onLanguageChange, strings } from '../i18n';

/** Почему сцена не запустилась: без WebGL 2 или по другой причине. */
export type StartupFailure = 'webgl' | 'error';

/**
 * Даёт ли браузер контекст WebGL 2. Пробный контекст сразу отпускается:
 * их число на страницу ограничено, а этот рисовать не будет.
 */
export function webgl2Available(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return gl !== null;
  } catch {
    return false;
  }
}

/**
 * Сторож запуска. Ставится первым делом в main.ts и до первого кадра ловит
 * любое необработанное исключение: прячет бегущую полоску и пишет причину
 * на заставке. После первого кадра снимается - дальше ошибки уже не мешают
 * человеку увидеть сцену, и заставку им не вернуть.
 */
export class StartupGuard {
  private failure: StartupFailure | null = null;
  private finished = false;

  constructor(private readonly loader: HTMLElement | null) {
    window.addEventListener('error', this.onError);
    window.addEventListener('unhandledrejection', this.onError);
  }

  /** Сцена не запустилась: заставку прятать нельзя. */
  get failed(): boolean {
    return this.failure !== null;
  }

  /** Первый кадр отрисован: дальше сторож не нужен. */
  finish(): void {
    this.finished = true;
    window.removeEventListener('error', this.onError);
    window.removeEventListener('unhandledrejection', this.onError);
  }

  private readonly onError = (): void => {
    if (this.finished || this.failure !== null) return;
    // По самому исключению причину не узнать: three пишет своё, браузеры -
    // своё. Проще спросить браузер заново.
    this.failure = webgl2Available() ? 'error' : 'webgl';
    this.show();
    onLanguageChange(() => this.show());
  };

  private show(): void {
    if (!this.loader || this.failure === null) return;
    this.loader.querySelector('.bar')?.remove();
    let text = this.loader.querySelector<HTMLElement>('.failure');
    if (!text) {
      text = document.createElement('p');
      text.className = 'failure';
      text.setAttribute('role', 'alert');
      this.loader.append(text);
    }
    text.textContent = strings().startup[this.failure];
  }
}

/**
 * Плашка о потере контекста. На телефоне браузер отбирает видеокарту у
 * фоновой вкладки, а на компьютере - при сбое или обновлении драйвера. Холст
 * тогда чернеет, а интерфейс поверх выглядит живым, и непонятно, что
 * случилось. three сам восстанавливает отрисовку, когда браузер вернёт
 * контекст; до тех пор плашка объясняет, что происходит, и предлагает
 * перезагрузить страницу, если контекст не вернётся.
 */
export function watchContextLoss(canvas: HTMLCanvasElement, parent: HTMLElement): void {
  const notice = document.createElement('div');
  notice.className = 'context-lost';
  notice.setAttribute('role', 'status');
  notice.hidden = true;

  const text = document.createElement('span');
  const reload = document.createElement('button');
  reload.type = 'button';
  reload.addEventListener('click', () => window.location.reload());
  notice.append(text, reload);
  parent.append(notice);

  const write = (): void => {
    text.textContent = strings().contextLost.text;
    reload.textContent = strings().contextLost.reload;
  };
  write();
  onLanguageChange(write);

  canvas.addEventListener('webglcontextlost', (event) => {
    // Без preventDefault браузер не станет и пытаться вернуть контекст.
    event.preventDefault();
    notice.hidden = false;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    notice.hidden = true;
  });
}
