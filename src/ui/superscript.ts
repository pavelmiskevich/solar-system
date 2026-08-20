/** Надстрочные цифры: «10²⁷», «10⁻⁵». */
const DIGITS = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

export function superscript(value: number): string {
  const sign = value < 0 ? '⁻' : '';
  return (
    sign +
    Math.abs(value)
      .toString()
      .split('')
      .map((digit) => DIGITS[Number(digit)] ?? '')
      .join('')
  );
}
