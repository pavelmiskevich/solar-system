import { describe, expect, it } from 'vitest';

import { dateFromJulianDay, julianDayFromDate } from '../src/core/units';

describe('юлианская дата', () => {
  it('переживает круг туда и обратно с точностью до миллисекунды', () => {
    // Круг «дата → юлианская → дата» проходит вся сцена: ссылка хранит момент
    // строкой, часы — юлианской датой, HUD показывает снова строку.
    for (const iso of [
      '2026-08-31T05:53:13.000Z',
      '2032-06-01T12:00:00.000Z',
      '1999-12-31T23:59:59.999Z',
      '2026-08-21T00:00:00.000Z',
      '2150-03-07T18:42:07.500Z',
    ]) {
      const back = dateFromJulianDay(julianDayFromDate(new Date(iso)));

      expect(back.toISOString(), `круг не сошёлся для ${iso}`).toBe(iso);
    }
  });

  it('секунда не теряется при обрезке до секунд', () => {
    // Так дата попадает в адрес страницы: `toISOString` отбрасывает дробную
    // часть, а не округляет, поэтому промах на долю миллисекунды вниз стоил бы
    // целой секунды — ссылка обещала бы 05:53:13, а сцена показывала 05:53:12.
    const iso = '2026-08-31T05:53:13.000Z';
    const back = dateFromJulianDay(julianDayFromDate(new Date(iso)));

    expect(back.toISOString().slice(0, 19)).toBe(iso.slice(0, 19));
  });
});
