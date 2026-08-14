/**
 * Единицы измерения.
 *
 * Одна мировая единица = 1 километр. Мировые координаты хранятся в обычных
 * числах JS (Float64), поэтому на орбите Нептуна (4.5e9 км) абсолютная
 * точность остаётся около миллиметра — с запасом. В шейдеры эти координаты
 * попадают уже относительно камеры, см. core/floatingOrigin.ts.
 */

/** Астрономическая единица в километрах (IAU 2012). */
export const AU = 149_597_870.7;

/** Юлианский день эпохи J2000.0 (2000-01-01 12:00 TT). */
export const JD_J2000 = 2451545.0;

/** Юлианских дней в юлианском столетии. */
export const DAYS_PER_CENTURY = 36525;

/** Секунд в сутках. */
export const SECONDS_PER_DAY = 86400;

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

/** Наклон эклиптики к экватору на эпоху J2000.0, радианы. */
export const OBLIQUITY_J2000 = 23.43928 * DEG;

/** Радиус Солнца, км. */
export const SUN_RADIUS = 696_340;

/**
 * Солнечная постоянная на 1 а.е. Используется как опорная точка освещённости:
 * на расстоянии 1 а.е. облучённость равна единице, а дальше падает честно
 * по 1/r².
 */
export const IRRADIANCE_AT_1AU = 1;

/**
 * Множитель облучённости для шейдеров: E = SOLAR_IRRADIANCE_SCALE / r², где r
 * в километрах. Ровно поэтому он равен квадрату астрономической единицы.
 */
export const SOLAR_IRRADIANCE_SCALE = AU * AU * IRRADIANCE_AT_1AU;

/** Юлианская дата из системного времени. */
export function julianDayFromDate(date: Date): number {
  return date.getTime() / 86_400_000 + 2440587.5;
}

/** Обратное преобразование: юлианская дата в Date. */
export function dateFromJulianDay(jd: number): Date {
  return new Date((jd - 2440587.5) * 86_400_000);
}

/** Юлианские столетия от J2000.0. */
export function centuriesSinceJ2000(jd: number): number {
  return (jd - JD_J2000) / DAYS_PER_CENTURY;
}
