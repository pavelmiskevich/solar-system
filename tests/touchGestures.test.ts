import { describe, expect, it } from 'vitest';

import { TouchGestures } from '../src/ui/touchGestures';

interface Recorded {
  drags: { dx: number; dy: number }[];
  pinches: number[];
}

function gestures(): { touch: TouchGestures; log: Recorded } {
  const log: Recorded = { drags: [], pinches: [] };
  const touch = new TouchGestures({
    onDrag: (dx, dy) => log.drags.push({ dx, dy }),
    onPinch: (factor) => log.pinches.push(factor),
  });
  return { touch, log };
}

describe('протаскивание одним пальцем', () => {
  it('отдаёт смещение с прошлого события', () => {
    const { touch, log } = gestures();

    touch.down(1, 100, 100);
    touch.move(1, 140, 130);
    touch.move(1, 150, 130);

    expect(log.drags).toEqual([
      { dx: 40, dy: 30 },
      { dx: 10, dy: 0 },
    ]);
  });

  it('дрожание руки при касании не считается жестом', () => {
    // Иначе каждое касание по телу доворачивало бы камеру на долю градуса.
    const { touch, log } = gestures();

    touch.down(1, 100, 100);
    touch.move(1, 101, 101);
    touch.up(1);

    expect(log.drags).toEqual([]);
    expect(touch.travel).toBeLessThan(4);
  });

  it('путь пальца виден наружу: им касание отличают от жеста', () => {
    const { touch } = gestures();

    touch.down(1, 100, 100);
    touch.move(1, 160, 100);

    expect(touch.travel).toBeCloseTo(60, 6);
  });
});

describe('щипок двумя пальцами', () => {
  it('отдаёт отношение разведения пальцев', () => {
    const { touch, log } = gestures();

    touch.down(1, 100, 100);
    touch.down(2, 200, 100);
    // Пальцы развели вдвое: было сто пикселей между ними, стало двести.
    touch.move(2, 300, 100);

    expect(log.pinches).toHaveLength(1);
    expect(log.pinches[0]).toBeCloseTo(2, 6);
    // И ничего при этом не повернули: два пальца значат только щипок.
    expect(log.drags).toEqual([]);
  });

  it('сведение пальцев даёт множитель меньше единицы', () => {
    const { touch, log } = gestures();

    touch.down(1, 100, 100);
    touch.down(2, 300, 100);
    touch.move(2, 200, 100);

    expect(log.pinches[0]).toBeCloseTo(0.5, 6);
  });

  it('второй палец прекращает начатое протаскивание', () => {
    const { touch, log } = gestures();

    touch.down(1, 100, 100);
    touch.move(1, 160, 100);
    expect(log.drags).toHaveLength(1);

    touch.down(2, 260, 100);
    touch.move(1, 120, 100);

    // Движение первого пальца теперь часть щипка, а не поворот.
    expect(log.drags).toHaveLength(1);
    expect(log.pinches).toHaveLength(1);
  });

  it('подъём одного пальца не превращает остаток щипка в поворот', () => {
    // Пальцы отрываются от стекла не одновременно, и без этого правила кадр
    // доворачивало бы после каждого приближения.
    const { touch, log } = gestures();

    touch.down(1, 100, 100);
    touch.down(2, 300, 100);
    touch.move(2, 400, 100);
    touch.up(2);
    touch.move(1, 200, 300);

    expect(log.drags).toEqual([]);
  });

  it('следующий жест после щипка снова поворачивает', () => {
    const { touch, log } = gestures();

    touch.down(1, 100, 100);
    touch.down(2, 300, 100);
    touch.move(2, 400, 100);
    touch.up(2);
    touch.up(1);

    touch.down(3, 100, 100);
    touch.move(3, 160, 100);

    expect(log.drags).toEqual([{ dx: 60, dy: 0 }]);
  });

  it('сошедшиеся в точку пальцы не дают бесконечного множителя', () => {
    const { touch, log } = gestures();

    touch.down(1, 100, 100);
    touch.down(2, 300, 100);
    touch.move(2, 150, 100);
    touch.move(2, 100, 100);

    // Последнее движение свело пальцы в точку: множитель из него не выводится,
    // и лучше не менять расстояние вовсе, чем обратить его в ноль.
    expect(log.pinches).toHaveLength(1);
    expect(log.pinches[0]).toBeCloseTo(0.25, 6);
  });
});

describe('чужие касания', () => {
  it('движение незнакомого касания не разбирается', () => {
    // Так уживаются два обработчика: свайп по остановкам экскурсии ведёт своё
    // касание сам, и жесты не должны заодно крутить камеру.
    const { touch, log } = gestures();

    expect(touch.move(7, 100, 100)).toBe(false);
    expect(log.drags).toEqual([]);
  });

  it('своё касание разбирается и дальше не идёт', () => {
    const { touch } = gestures();

    touch.down(1, 100, 100);

    expect(touch.move(1, 160, 100)).toBe(true);
  });
});
