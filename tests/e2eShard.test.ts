import { describe, expect, it } from 'vitest';
import { checkPlan, fileFilters, planShards } from '../scripts/e2e-shard.mjs';

const files = [
  { file: 'interface.spec.ts', tests: 25 },
  { file: 'tour.spec.ts', tests: 10 },
  { file: 'navigation.spec.ts', tests: 9 },
  { file: 'scenarios.spec.ts', tests: 8 },
  { file: 'events.spec.ts', tests: 3 },
  { file: 'state.spec.ts', tests: 2 },
];
const durations = {
  'interface.spec.ts': 900,
  'tour.spec.ts': 540,
  'navigation.spec.ts': 380,
  'scenarios.spec.ts': 340,
  'events.spec.ts': 30,
  'state.spec.ts': 30,
};

describe('раскладка сквозных тестов по долям', () => {
  it('каждый файл ровно в одной доле', () => {
    const shards = planShards(files, durations, 3);
    const all = shards.flatMap((s) => s.files).sort();
    expect(all).toEqual(files.map((f) => f.file).sort());
    expect(() => checkPlan(shards, files.map((f) => f.file))).not.toThrow();
  });

  it('делит по времени, а не по числу проверок', () => {
    // По счёту проверок на самый длинный файл пришлась бы треть набора, и к
    // нему легли бы ещё файлы. По времени он один тяжелее любой пары
    // остальных, идёт один, и никакая доля не длиннее его самого.
    const shards = planShards(files, durations, 3);
    expect(shards.find((s) => s.files.includes('interface.spec.ts'))?.files).toEqual(['interface.spec.ts']);
    expect(Math.max(...shards.map((s) => s.seconds))).toBe(900);
  });

  it('файл без замера не теряется, а весит по числу своих проверок', () => {
    const extended = [...files, { file: 'new.spec.ts', tests: 4 }];
    const shards = planShards(extended, durations, 3);
    expect(shards.filter((s) => s.files.includes('new.spec.ts'))).toHaveLength(1);
    expect(() => checkPlan(shards, extended.map((f) => f.file))).not.toThrow();

    // Средняя проверка по замерам - 2220 с на 57 проверок.
    const alone = planShards([{ file: 'new.spec.ts', tests: 4 }, ...files], durations, 1);
    const known = Object.values(durations).reduce((a, b) => a + b, 0);
    expect(alone[0]?.seconds).toBeCloseTo(known + (4 * known) / 57, 6);
  });

  it('раскладка одна и та же, в каком порядке ни пришли файлы', () => {
    const forward = planShards(files, durations, 4);
    const backward = planShards([...files].reverse(), durations, 4);
    expect(backward).toEqual(forward);
  });

  it('проверка ловит потерянный файл, дубль и пустую долю', () => {
    const names = files.map((f) => f.file);
    expect(() => checkPlan([{ files: names.slice(1) }], names)).toThrow(/interface\.spec\.ts не попал/);
    expect(() => checkPlan([{ files: names }, { files: ['tour.spec.ts'] }], names)).toThrow(/сразу в долях/);
    expect(() => planShardsChecked(names.length + 1)).toThrow(/пуста/);
  });

  it('фильтр совпадает только со своим файлом', () => {
    const root = '/repo/e2e';
    const cwd = '/repo';
    expect(fileFilters(['scene.spec.ts'], ['scene.spec.ts', 'scenarios.spec.ts'], root, cwd)).toEqual([
      'e2e/scene.spec.ts',
    ]);
    expect(() => fileFilters(['scene.spec.ts'], ['scene.spec.ts', 'old/e2e/scene.spec.ts'], root, cwd)).toThrow(
      /не только со своим/,
    );
  });
});

function planShardsChecked(total: number): void {
  checkPlan(
    planShards(files, durations, total),
    files.map((f) => f.file),
  );
}
