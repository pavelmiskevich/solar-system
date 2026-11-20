import { describe, expect, it } from 'vitest';

import { belongsToScene, repeats, type FocusedField } from '../src/core/keyRouting';

type Modifiers = Partial<Record<'ctrlKey' | 'altKey' | 'metaKey', boolean>>;

const press = (code: string, field: FocusedField = null, modifiers: Modifiers = {}) => ({
  code,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  field,
  ...modifiers,
});

describe('клавиша без фокуса в поле', () => {
  it('одиночная клавиша - сцене', () => {
    for (const code of ['KeyP', 'KeyL', 'KeyB', 'KeyC', 'KeyW', 'Escape', 'Space']) {
      expect(belongsToScene(press(code)), code).toBe(true);
    }
  });

  it('сочетание с Ctrl, Alt или Cmd - браузеру', () => {
    // Строки из задачи #158: каждое из этих сочетаний что-то меняло в сцене.
    for (const code of ['KeyP', 'KeyL', 'KeyB', 'KeyF', 'KeyC', 'KeyK', 'KeyE', 'KeyH', 'KeyN']) {
      expect(belongsToScene(press(code, null, { ctrlKey: true })), `Ctrl+${code}`).toBe(false);
      expect(belongsToScene(press(code, null, { metaKey: true })), `Cmd+${code}`).toBe(false);
      expect(belongsToScene(press(code, null, { altKey: true })), `Alt+${code}`).toBe(false);
    }
  });

  it('сам левый Ctrl сцене не достаётся: у браузера он начало сочетания', () => {
    // Нажатие самого Ctrl приходит с ctrlKey: true - так браузер сообщает
    // состояние модификаторов после нажатия.
    expect(belongsToScene(press('ControlLeft', null, { ctrlKey: true }))).toBe(false);
  });
});

describe('фокус в ползунке скорости', () => {
  it('стрелки и Home/End/PageUp/PageDown - ползунку', () => {
    const own = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'];
    for (const code of own) expect(belongsToScene(press(code, 'range')), code).toBe(false);
  });

  it('прочие клавиши, Esc и H в том числе, - сцене', () => {
    for (const code of ['Escape', 'KeyH', 'KeyP', 'KeyW', 'Space', 'Comma']) {
      expect(belongsToScene(press(code, 'range')), code).toBe(true);
    }
  });
});

describe('фокус в поле даты', () => {
  it('набор - полю: цифры, стрелки, Tab, Backspace и буквы половины суток', () => {
    const own = ['Digit1', 'Numpad5', 'ArrowUp', 'ArrowLeft', 'Tab', 'Backspace', 'KeyA', 'KeyP'];
    for (const code of own) expect(belongsToScene(press(code, 'text')), code).toBe(false);
  });

  it('Esc - сцене: им закрывают справку и выходят из поля', () => {
    expect(belongsToScene(press('Escape', 'text'))).toBe(true);
  });
});

describe('фокус на кнопке', () => {
  it('пробел и Enter - кнопке: ими её нажимают', () => {
    for (const code of ['Space', 'Enter', 'NumpadEnter']) {
      expect(belongsToScene(press(code, 'button')), code).toBe(false);
    }
  });

  it('прочие клавиши, полёт и Esc в том числе, - сцене', () => {
    for (const code of ['KeyW', 'KeyC', 'KeyB', 'KeyH', 'Escape', 'ArrowRight', 'Comma']) {
      expect(belongsToScene(press(code, 'button')), code).toBe(true);
    }
  });
});

describe('автоповтор', () => {
  it('переключатели не повторяются, шаг скорости времени - повторяется', () => {
    for (const code of ['KeyP', 'KeyB', 'KeyL', 'KeyM', 'KeyH', 'KeyT', 'ArrowRight']) {
      expect(repeats(code), code).toBe(false);
    }
    expect(repeats('Comma')).toBe(true);
    expect(repeats('Period')).toBe(true);
  });
});
