import { describe, expect, it } from 'vitest';

import { ALL_BODIES, PLANETS } from '../src/data/bodies';
import { kindOf, listOrder } from '../src/data/targets';

describe('порядок тел в списке', () => {
  it('соответствует прежнему перечислению вручную', () => {
    // Ровно тот порядок, что был записан руками до вывода из определений.
    // Если он изменится, это должно быть осознанным решением, а не побочным
    // следствием правки в таблице тел.
    expect(listOrder()).toEqual([
      'sun',
      'mercury',
      'venus',
      'earth',
      'moon',
      'mars',
      'jupiter',
      'io',
      'europa',
      'ganymede',
      'callisto',
      'saturn',
      'titan',
      'uranus',
      'neptune',
      'pluto',
    ]);
  });

  it('включает каждое тело сцены ровно один раз', () => {
    // Ради этого порядок и выводится: раньше добавленный спутник появлялся в
    // сцене и не появлялся в списке, потому что второй список забывали.
    const order = listOrder();

    expect(new Set(order).size).toBe(order.length);
    expect([...order].sort()).toEqual(ALL_BODIES.map((body) => body.id).sort());
  });

  it('спутник идёт сразу за своей планетой', () => {
    const order = listOrder();

    for (const body of ALL_BODIES) {
      if (!body.parent) continue;

      const parentAt = order.indexOf(body.parent);
      const bodyAt = order.indexOf(body.id);

      expect(parentAt, `${body.id}: планета ${body.parent} не найдена`).toBeGreaterThanOrEqual(0);
      expect(bodyAt, `${body.id} стоит раньше своей планеты`).toBeGreaterThan(parentAt);

      // Между планетой и её спутником могут стоять только другие её спутники.
      for (const between of order.slice(parentAt + 1, bodyAt)) {
        const neighbour = ALL_BODIES.find((b) => b.id === between)!;
        expect(neighbour.parent, `${between} вклинился между ${body.parent} и ${body.id}`).toBe(
          body.parent,
        );
      }
    }
  });

  it('планеты идут в порядке удаления от Солнца', () => {
    const order = listOrder();
    const planetsInOrder = order.filter((id) => PLANETS.some((p) => p.id === id));

    expect(planetsInOrder).toEqual(PLANETS.map((p) => p.id));
  });
});

describe('род тела', () => {
  it('знает исключения', () => {
    expect(kindOf('sun')).toBe('звезда');
    expect(kindOf('moon')).toBe('спутник Земли');
    // Плутон с 2006 года карликовая планета.
    expect(kindOf('pluto')).toBe('карликовая планета');
    expect(kindOf('ganymede')).toBe('спутник Юпитера');
    expect(kindOf('titan')).toBe('спутник Сатурна');
  });

  it('для остальных — планета', () => {
    expect(kindOf('earth')).toBe('планета');
    expect(kindOf('neptune')).toBe('планета');
  });

  it('не спотыкается о незнакомый идентификатор', () => {
    expect(kindOf('нет такого тела')).toBe('планета');
  });
});
