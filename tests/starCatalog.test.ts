import { describe, expect, it } from 'vitest';

import { buildCatalog, REQUIRED_COLUMNS } from '../scripts/star-catalog.mjs';

/**
 * Подставной CSV в формате HYG: те же колонки, пара звёзд.
 *
 * Положительный путь целиком здесь не проверить: ему нужны Полярная, сорок
 * именованных звёзд и все вершины фигур созвездий. Он проверяется запуском
 * scripts/fetch-stars.mjs на настоящем источнике и тестами каталога
 * (tests/stars.test.ts). Здесь - отказы, ради которых разбор и вынесен.
 */
function csv(columns: readonly string[], rows: Record<string, string>[]): string {
  const lines = [columns.join(',')];
  for (const row of rows) lines.push(columns.map((name) => row[name] ?? '').join(','));
  return lines.join('\n') + '\n';
}

const SIRIUS = {
  id: '32263',
  ra: '6.752481',
  dec: '-16.716116',
  mag: '-1.44',
  ci: '0.009',
  proper: 'Sirius',
  bayer: 'Alp',
  con: 'CMa',
  rarad: '1.767793',
  decrad: '-0.291751',
};
const VEGA = { ...SIRIUS, id: '91262', proper: 'Vega', mag: '0.03', con: 'Lyr' };

const source = 'test.csv';

describe('сборка звёздного каталога', () => {
  it('без колонки mag падает с её именем, а не на поиске Полярной', () => {
    const columns = REQUIRED_COLUMNS.filter((name) => name !== 'mag');
    expect(() => buildCatalog(csv(columns, [SIRIUS, VEGA]), { source })).toThrow(
      'в источнике нет колонок: mag',
    );
  });

  it('называет все пропавшие колонки сразу', () => {
    const columns = REQUIRED_COLUMNS.filter((name) => name !== 'ra' && name !== 'dec');
    expect(() => buildCatalog(csv(columns, [SIRIUS]), { source })).toThrow('в источнике нет колонок: ra, dec');
  });

  it('лишние колонки и другой порядок не мешают', () => {
    // Падает дальше, на правдоподобии числа звёзд: колонки разобраны верно.
    const columns = ['extra', ...[...REQUIRED_COLUMNS].reverse()];
    expect(() => buildCatalog(csv(columns, [SIRIUS, VEGA]), { source })).toThrow(/отобрано 2 звёзд/);
  });

  it('отказывается от неправдоподобно малого каталога', () => {
    // Звёзды есть, колонки на месте, но ярче предела почти никого: так выглядит
    // источник, сменивший единицы величины.
    const faint = Array.from({ length: 50 }, (_, i) => ({ ...SIRIUS, id: String(i + 1), mag: '9.5' }));
    expect(() => buildCatalog(csv(REQUIRED_COLUMNS, [SIRIUS, ...faint]), { source })).toThrow(
      /отобрано 1 звёзд ярче 6\.5ᵐ, а должно быть не меньше 3000/,
    );
  });

  it('Солнце и строки без координат в каталог не идут', () => {
    const sun = { ...SIRIUS, id: '0', mag: '-26.7' };
    // Нечисловое, а не пустое: Number('') - это ноль, то есть ноль часов.
    const noCoordinates = { ...VEGA, id: '7', ra: 'n/a' };
    expect(() =>
      buildCatalog(csv(REQUIRED_COLUMNS, [sun, noCoordinates, SIRIUS]), { source, minStars: 2 }),
    ).toThrow(/отобрано 1 звёзд/);
  });
});
