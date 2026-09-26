import { strings } from '../i18n';
import { ALL_BODIES, COMETS, PLANETS, SUN, bodyById } from './bodies';

/**
 * Справочные сведения о телах для интерфейса: как называть их род и в каком
 * порядке показывать в списке.
 *
 * Живёт рядом с определениями тел, а не в месте сборки сцены: это данные, и
 * знание о наборе тел должно быть в одном месте. Раньше порядок списка был
 * записан отдельным перечислением идентификаторов, и добавление спутника
 * требовало не забыть дописать его во второй список - а забыть там легко,
 * потому что тело при этом появляется в сцене и не появляется в списке.
 */

/** Плутон с 2006 года карликовая планета, и списку положено это знать. */
const DWARF_PLANETS: ReadonlySet<string> = new Set(['pluto']);

/**
 * Род тела по идентификатору.
 *
 * Выводится из определений, а не перечисляется: спутник узнаётся по полю
 * `parent`, комета - по списку комет, и новое тело получает свой род само.
 * Слова берутся из словаря: «спутник Марса» и «moon of Mars» устроены
 * по-разному, и собрать одно из другого подстановкой имени нельзя.
 * Неизвестное тело считается планетой - так же, как планеты, у которых
 * род отдельно не задаётся.
 */
export function kindOf(id: string): string {
  const kinds = strings().kinds;

  if (id === SUN.id) return kinds.star;
  if (DWARF_PLANETS.has(id)) return kinds.dwarfPlanet;
  if (COMETS.some((comet) => comet.id === id)) return kinds.comet;

  const parent = bodyById(id)?.parent;
  return parent ? kinds.moonOf(parent) : kinds.planet;
}

/**
 * Порядок тел в списке - от Солнца наружу, спутники сразу за своей планетой.
 *
 * Выводится из самих определений, а не перечисляется руками: порядок планет
 * задан в `PLANETS`, принадлежность спутника - полем `parent`. Новое тело
 * встаёт в список само и на своё место.
 */
export function listOrder(): string[] {
  const satellites = ALL_BODIES.filter((body) => body.parent);
  const order: string[] = [SUN.id];

  for (const planet of PLANETS) {
    order.push(planet.id);
    for (const satellite of satellites) {
      if (satellite.parent === planet.id) order.push(satellite.id);
    }
  }

  // Кометы - в конце списка, за Плутоном: порядок в нём по удалению от
  // Солнца, а у кометы расстояние меняется в шестьдесят раз, и место среди
  // планет у неё было бы разное в разные годы.
  for (const comet of COMETS) order.push(comet.id);

  return order;
}
