import { describe, expect, it } from 'vitest';

import { TourController } from '../src/camera/tour';
import type { OrbitControls } from '../src/camera/orbit';
import type { TravelController } from '../src/camera/travel';

/**
 * Экскурсия — автомат из двух состояний поверх перелёта и орбитального
 * режима, и проверять её удобнее всего на их заглушках: сам перелёт со своей
 * траекторией здесь ни при чём, важно лишь, что он когда-то кончается.
 */
class FakeTravel {
  active = false;
  cancelled = 0;

  get isActive() {
    return this.active;
  }

  cancel() {
    this.cancelled += 1;
    this.active = false;
  }
}

class FakeOrbit {
  active = false;
  dragged = 0;

  get isActive() {
    return this.active;
  }

  drag() {
    this.dragged += 1;
  }
}

interface Rig {
  tour: TourController;
  travel: FakeTravel;
  orbit: FakeOrbit;
  visited: string[];
  captions: (string | null)[];
}

function rig(): Rig {
  const travel = new FakeTravel();
  const orbit = new FakeOrbit();
  const visited: string[] = [];
  const captions: (string | null)[] = [];

  const tour = new TourController(
    travel as unknown as TravelController,
    orbit as unknown as OrbitControls,
    (id) => {
      visited.push(id);
      travel.active = true;
      orbit.active = false;
    },
    (text) => captions.push(text),
  );

  return { tour, travel, orbit, visited, captions };
}

/** Долететь: перелёт кончился, камера встала на орбиту вокруг тела. */
function arrive(r: Rig): void {
  r.travel.active = false;
  r.orbit.active = true;
  r.tour.update(1 / 60);
}

/** Простоять у тела дольше, чем экскурсия там задерживается. */
function wait(r: Rig, seconds = 9): void {
  for (let t = 0; t < seconds; t += 1 / 60) r.tour.update(1 / 60);
}

describe('экскурсия', () => {
  it('обходит маршрут по порядку и сама заканчивается', () => {
    const r = rig();
    r.tour.start();

    for (let stop = 0; stop < 20 && r.tour.isActive; stop += 1) {
      wait(r);
      if (r.travel.isActive) arrive(r);
    }

    expect(r.tour.isActive).toBe(false);
    expect(r.visited.slice(0, 4)).toEqual(['sun', 'mercury', 'venus', 'earth']);
    expect(r.visited.at(-1)).toBe('pluto');
    expect(new Set(r.visited).size).toBe(r.visited.length);
  });

  it('показывает подпись по прибытии и снимает её на взлёте', () => {
    const r = rig();
    r.tour.start();
    wait(r);
    arrive(r);

    expect(r.captions.at(-1)).toContain('Солнце');

    wait(r);
    expect(r.captions.at(-1)).toBeNull();
  });

  it('прерванная на перелёте, останавливает и перелёт', () => {
    const r = rig();
    r.tour.start();
    wait(r);
    expect(r.travel.isActive).toBe(true);

    r.tour.cancel();

    expect(r.tour.isActive).toBe(false);
    expect(r.travel.cancelled).toBe(1);
    expect(r.captions.at(-1)).toBeNull();
  });

  it('не зависает, если перелёт так и не кончился', () => {
    const r = rig();
    r.tour.start();
    wait(r);
    expect(r.travel.isActive).toBe(true);

    // Прибытие не наступает: перелёт висит, орбитальный режим не включился.
    wait(r, 25);

    expect(r.tour.isActive).toBe(false);
  });

  it('срок ожидания перелёта отмеряется заново на каждой точке', () => {
    const r = rig();
    r.tour.start();
    r.tour.update(1 / 60);
    expect(r.travel.isActive).toBe(true);

    // Три остановки подряд с долгим, но допустимым перелётом: если бы часы
    // ожидания не сбрасывались, экскурсия оборвалась бы на второй же.
    for (let stop = 0; stop < 3; stop += 1) {
      wait(r, 15);
      arrive(r);
      expect(r.tour.isActive).toBe(true);
      wait(r);
    }

    expect(r.visited).toEqual(['sun', 'mercury', 'venus', 'earth']);
  });
});

describe('переход по остановкам вручную', () => {
  it('шаг вперёд не ждёт восьми секунд и сбрасывает отсчёт', () => {
    const r = rig();
    r.tour.start();
    wait(r);
    arrive(r);
    expect(r.visited).toEqual(['sun']);

    // Полсекунды у Солнца — до конца остановки ещё далеко.
    wait(r, 0.5);
    r.tour.next();

    expect(r.visited).toEqual(['sun', 'mercury']);
    expect(r.captions.at(-1)).toBeNull();

    arrive(r);
    expect(r.captions.at(-1)).toContain('Меркурий');

    // Отсчёт начат заново: полсекунды, набранные у Солнца, не переехали сюда.
    wait(r, 7);
    expect(r.visited).toEqual(['sun', 'mercury']);
    wait(r, 1.5);
    expect(r.visited).toEqual(['sun', 'mercury', 'venus']);
  });

  it('шаг назад возвращает на предыдущую остановку', () => {
    const r = rig();
    r.tour.start();
    wait(r);
    arrive(r);
    wait(r);
    arrive(r);
    expect(r.visited).toEqual(['sun', 'mercury']);

    r.tour.previous();

    expect(r.visited).toEqual(['sun', 'mercury', 'sun']);
    arrive(r);
    expect(r.captions.at(-1)).toContain('Солнце');
  });

  it('с первой остановки назад идти некуда', () => {
    const r = rig();
    r.tour.start();
    wait(r);
    arrive(r);
    expect(r.visited).toEqual(['sun']);

    // Половина рассказа у Солнца уже позади.
    wait(r, 5);
    r.tour.previous();

    expect(r.visited).toEqual(['sun']);
    expect(r.tour.isActive).toBe(true);
    // Остановка не начата заново: оставшихся четырёх секунд хватает, чтобы
    // рассказ кончился в свой срок, а не спустя восемь секунд заново.
    wait(r, 4);
    expect(r.visited).toEqual(['sun', 'mercury']);
  });

  it('шаг вперёд с последней остановки завершает экскурсию', () => {
    const r = rig();
    r.tour.start();

    for (let stop = 0; stop < 20 && r.visited.at(-1) !== 'pluto'; stop += 1) {
      wait(r);
      if (r.travel.isActive) arrive(r);
    }
    expect(r.tour.isActive).toBe(true);

    r.tour.next();

    expect(r.tour.isActive).toBe(false);
    expect(r.captions.at(-1)).toBeNull();
  });

  it('шаг на перелёте бросает недолетевший перелёт и начинает новый', () => {
    const r = rig();
    r.tour.start();
    wait(r);
    arrive(r);
    wait(r);
    expect(r.travel.isActive).toBe(true);
    expect(r.visited).toEqual(['sun', 'mercury']);

    r.tour.next();

    expect(r.travel.cancelled).toBe(1);
    expect(r.visited).toEqual(['sun', 'mercury', 'venus']);
    expect(r.tour.isActive).toBe(true);
  });

  it('остановленную экскурсию стрелки не воскрешают', () => {
    const r = rig();
    r.tour.start();
    wait(r);
    arrive(r);
    r.tour.cancel();

    r.tour.next();
    r.tour.previous();

    expect(r.tour.isActive).toBe(false);
    expect(r.visited).toEqual(['sun']);
  });
});
