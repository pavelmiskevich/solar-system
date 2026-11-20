/**
 * Чья это клавиша: сцены или того, кто её сейчас ждёт.
 *
 * Сцена слушает клавиатуру на всём окне, и это удобно, пока клавиша ничья. Но
 * у некоторых нажатий есть хозяин важнее. Сочетания с Ctrl, Alt и Cmd
 * принадлежат браузеру: Ctrl+C копирует число из карточки, Ctrl+F ищет по
 * странице, и камера от этого уходить не должна. Поле в фокусе ждёт своих
 * клавиш: ползунок скорости - стрелок, поле даты - цифр.
 *
 * Прежде поле в фокусе забирало себе всю клавиатуру разом. Ползунку это не
 * нужно: после щелчка мышью по нему фокус оставался в нём, и переставали
 * работать все клавиши, включая Esc и H, которыми закрывается справка, где
 * этот ползунок и стоит. Выглядело как зависший интерфейс.
 *
 * Решение собрано здесь, а не в каждом обработчике: их два (сцена и полёт), и
 * разойдись они, камера летела бы от клавиши, которую сцена сочла чужой.
 */

/**
 * Что в фокусе. Ползунку нужны немногие клавиши, полю даты - почти все,
 * кнопке - две, которыми её нажимают.
 */
export type FocusedField = 'range' | 'text' | 'button' | null;

export interface KeyPress {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  field: FocusedField;
}

/**
 * Клавиши ползунка: ими он меняет значение. Всё прочее ему ни к чему, и
 * отдавать это прочее сцене безопасно.
 */
const RANGE_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

/** Клавиши, которыми нажимают кнопку. */
const BUTTON_KEYS = new Set(['Space', 'Enter', 'NumpadEnter']);

/** Достаётся ли нажатие сцене. */
export function belongsToScene(press: KeyPress): boolean {
  // Shift здесь не считается: он сам клавиша сцены (ускорение), и Shift+W - это
  // полёт вперёд быстрее, а не чужое сочетание.
  if (press.ctrlKey || press.altKey || press.metaKey) return false;

  // Esc - всегда сцене: им закрывают справку, где поле и стоит, и им же из
  // поля выходят. Сцене решать, что ещё он закроет.
  if (press.code === 'Escape') return true;

  if (press.field === 'range') return !RANGE_KEYS.has(press.code);
  // Кнопку с клавиатуры нажимают пробелом и Enter. Пробел у сцены - подъём,
  // и раньше он доставался ей: кнопка в фокусе (а фокус остаётся на ней и
  // после щелчка мышью) не нажималась, а камера уходила вверх на миллионы
  // километров. Остальные клавиши кнопке ни к чему.
  if (press.field === 'button') return !BUTTON_KEYS.has(press.code);
  // Поле даты набирается целиком с клавиатуры: цифры, стрелки по частям даты,
  // а в английской записи ещё и буквы A и P для половины суток. Свою клавишу
  // из этого набора сцена отняла бы у человека посреди набора.
  if (press.field === 'text') return false;

  return true;
}

/**
 * Клавиши, которые при удержании повторяются осмысленно: шаг скорости времени.
 * Остальные переключают состояние, и автоповтор гонял бы его туда-сюда.
 */
const REPEATABLE = new Set(['Comma', 'Period']);

/** Отрабатывать ли повтор удержанной клавиши. */
export function repeats(code: string): boolean {
  return REPEATABLE.has(code);
}

/** Какое поле в фокусе у события - по его цели. */
export function focusedField(target: EventTarget | null): FocusedField {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return null;
  if (target instanceof HTMLInputElement) {
    if (target.type === 'range') return 'range';
    // Кнопка в виде поля - всё та же кнопка.
    if (['button', 'submit', 'reset', 'checkbox', 'radio'].includes(target.type)) return 'button';
    return 'text';
  }
  if (target instanceof HTMLButtonElement) return 'button';
  if (target instanceof HTMLAnchorElement && target.hasAttribute('href')) return 'button';
  if (target.getAttribute('role') === 'button') return 'button';
  return null;
}
