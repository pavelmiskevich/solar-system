/** Алфавит base64 - разбор своими руками избавляет от разницы сред. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Base64 → байты.
 *
 * Своя реализация вместо atob или Buffer: первого нет в Node, второго нет в
 * браузере, а ветвление по среде пришлось бы объяснять в каждом тесте.
 * Разбор занимает миллисекунду на пятьдесят килобайт и делается один раз.
 *
 * Общая у звёздного каталога и каталога малых тел: оба лежат упакованными по
 * одной и той же причине - иначе тысячи записей превращаются в сотни
 * килобайт нечитаемого исходника.
 */
export function decodeBase64(base64: string): Uint8Array {
  const clean = base64.replace(/=+$/, '');
  const bytes = new Uint8Array((clean.length * 3) >> 2);

  let accumulator = 0;
  let bits = 0;
  let out = 0;

  for (let i = 0; i < clean.length; i += 1) {
    const value = ALPHABET.indexOf(clean[i]!);
    if (value < 0) throw new Error(`Недопустимый символ base64: ${clean[i]}`);

    accumulator = (accumulator << 6) | value;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      bytes[out++] = (accumulator >> bits) & 0xff;
    }
  }

  return bytes;
}
