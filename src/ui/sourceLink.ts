/**
 * Кнопка со ссылкой на исходники.
 *
 * Оформлена как соседи по колонке, но это не переключатель, а ссылка наружу,
 * поэтому и стоит последней: сначала то, что управляет сценой, потом то, что
 * уводит из неё.
 */

export const REPOSITORY_URL = 'https://github.com/pavelmiskevich/solar-system';

/** Логотип GitHub, официальный контур. Инлайном — сцена не грузит ничего извне. */
const MARK =
  'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 ' +
  '0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13' +
  '-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66' +
  '.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15' +
  '-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 ' +
  '2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 ' +
  '2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 ' +
  '2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z';

export function createSourceLink(): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = 'bodies-toggle source-link';
  link.href = REPOSITORY_URL;
  link.target = '_blank';
  // Без noopener открытая страница получает доступ к window.opener и может
  // подменить содержимое нашей вкладки.
  link.rel = 'noopener noreferrer';
  link.title = 'Исходный код на GitHub';

  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 16 16');
  icon.setAttribute('width', '13');
  icon.setAttribute('height', '13');
  icon.setAttribute('aria-hidden', 'true');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', MARK);
  path.setAttribute('fill', 'currentColor');
  icon.appendChild(path);

  const label = document.createElement('span');
  label.textContent = 'GitHub';

  link.append(icon, label);
  return link;
}
