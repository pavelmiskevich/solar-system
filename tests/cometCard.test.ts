import { describe, expect, it } from 'vitest';

import { AU } from '../src/core/units';
import { scenarioById } from '../src/data/scenarios';
import { TAIL_CUTOFF_AU } from '../src/physics/cometTail';
import { cometRows } from '../src/ui/bodyCard';

/**
 * Строки карточки кометы.
 *
 * Комета вдали от Солнца - тёмная глыба без хвоста, и сцена в этом права.
 * Неправа была карточка: молчала о том, почему хвоста нет, и выдавала
 * перигелийные температуру и кому за нынешние.
 */
describe('cometRows', () => {
  it('за афелием: хвоста нет, комы нет, и мороз', () => {
    // Сентябрь 2026 года: Галлея в 35.17 а.е., дальше Нептуна.
    const rows = cometRows('halley', 35.17 * AU)!;

    expect(rows.tail).toMatch(/^нет/);
    expect(rows.tail).toContain(`${TAIL_CUTOFF_AU} а.е.`);
    expect(rows.atmosphere).toMatch(/^нет/);
    expect(rows.atmosphere).not.toContain('водяной пар');
    expect(rows.temperature).toBe('−227 °C');
  });

  it('за афелием зовёт в готовые виды, где хвост есть', () => {
    const rows = cometRows('halley', 35.17 * AU)!;

    expect(rows.views.map((view) => view.id)).toEqual(['halley-1986', 'halley-1910']);
    // Имена берутся из самих видов: в карточке и в списке одно и то же.
    for (const view of rows.views) {
      expect(view.name).toBe(scenarioById(view.id)!.name);
    }
  });

  it('в перигелии: хвост и кома есть, и жарко', () => {
    const rows = cometRows('halley', 0.6 * AU)!;

    expect(rows.tail).toMatch(/^есть/);
    expect(rows.atmosphere).toContain('кома');
    expect(rows.atmosphere).toContain('водяной пар');
    expect(rows.temperature).toMatch(/^\+\d+ °C$/);
    // Хвост на экране и так виден - звать за ним некуда.
    expect(rows.views).toEqual([]);
  });

  it('порог тот же, что у хвоста в сцене', () => {
    // Карточка обязана объяснять ровно тот кадр, что на экране: за порогом
    // сцена хвоста не строит, и карточка должна говорить то же.
    expect(cometRows('halley', TAIL_CUTOFF_AU * AU)!.tail).toMatch(/^нет/);
    expect(cometRows('halley', (TAIL_CUTOFF_AU - 0.5) * AU)!.tail).toMatch(/^есть/);
  });

  it('у слабого хвоста доля не округляется до нуля', () => {
    // У самого порога испарение - доли процента от перигелийного, и «0 %»
    // рядом со словом «есть» читалось бы как противоречие.
    const rows = cometRows('halley', (TAIL_CUTOFF_AU - 0.01) * AU)!;
    expect(rows.tail).toMatch(/^есть/);
    expect(rows.tail).not.toMatch(/\b0 %/);
  });

  it('у тел, которые не кометы, этих строк нет', () => {
    expect(cometRows('saturn', 9.5 * AU)).toBeNull();
    expect(cometRows('sun', 0)).toBeNull();
  });
});
