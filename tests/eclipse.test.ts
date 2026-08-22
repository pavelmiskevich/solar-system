import { describe, expect, it } from 'vitest';

import { ALL_BODIES, eclipseCasters } from '../src/data/bodies';

/**
 * Кто кому может закрыть Солнце.
 *
 * Список не выдуман, а следует из устройства системы: заслонить свет способен
 * только сосед — тело, до которого несколько своих радиусов, а не миллионы.
 * Марс Земле Солнца не закроет никогда, и держать его в списке значило бы
 * считать в шейдере заведомую пустоту на каждом пикселе каждого кадра.
 */
describe('затмевающие тела', () => {
  it('Луна закрывает Солнце Земле, Земля — Луне', () => {
    expect(eclipseCasters('earth')).toEqual(['moon']);
    expect(eclipseCasters('moon')).toEqual(['earth']);
  });

  it('у Юпитера в списке все четыре галилеевых спутника', () => {
    expect(eclipseCasters('jupiter').sort()).toEqual(
      ['callisto', 'europa', 'ganymede', 'io'].sort(),
    );
  });

  it('спутник закрывает Солнце и соседям по планете, и его закрывает планета', () => {
    const io = eclipseCasters('io');

    expect(io).toContain('jupiter');
    expect(io).toContain('europa');
    expect(io).toContain('ganymede');
    expect(io).toContain('callisto');
    expect(io).not.toContain('io');
    expect(io).not.toContain('titan');
  });

  it('у планеты без спутников список пуст', () => {
    expect(eclipseCasters('venus')).toEqual([]);
    expect(eclipseCasters('mercury')).toEqual([]);
  });

  it('Солнце себе Солнце не закрывает', () => {
    expect(eclipseCasters('sun')).toEqual([]);
  });

  it('в списках только настоящие тела сцены', () => {
    const known = new Set(ALL_BODIES.map((body) => body.id));

    for (const body of ALL_BODIES) {
      for (const caster of eclipseCasters(body.id)) {
        expect(known.has(caster), caster).toBe(true);
        expect(caster).not.toBe(body.id);
      }
    }
  });

  it('список ни у кого не длиннее четырёх: столько спутников у Юпитера', () => {
    for (const body of ALL_BODIES) {
      expect(eclipseCasters(body.id).length, body.id).toBeLessThanOrEqual(4);
    }
  });
});
