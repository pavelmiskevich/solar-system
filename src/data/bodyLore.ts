import { strings, type Dictionary } from '../i18n';
import { ALL_BODIES } from './bodies';

/**
 * Справочные сведения о телах, которых нет в механике.
 *
 * Радиус, масса, периоды и наклон оси карточка получает из `bodyFacts` - они
 * выводятся из тех же чисел, которыми считается движение, и разойтись с ним не
 * могут. Температура, атмосфера, число известных спутников и примета так не
 * выводятся ниоткуда: это чтение из справочника, и другого источника у них
 * нет. Поэтому таблица отдельная, а не дописана к `bodyFacts` - там нарочно
 * лежит только выводимое.
 *
 * Числа живут здесь, а слова - атмосфера и примета - в словаре интерфейса
 * (src/i18n): числа одни на всех, а слова у каждого языка свои.
 *
 * Числа - по данным NASA Planetary Fact Sheet и обзорам систем спутников.
 */
export interface BodyLore {
  /**
   * Средняя температура поверхности, °C. У газовых гигантов поверхности нет,
   * и берётся уровень давления в одну атмосферу - общепринятая условность.
   * У Солнца - фотосфера.
   *
   * `null` у комет: их температура меняется с расстоянием до Солнца в разы,
   * и справочного числа у неё нет. Карточка считает её сама.
   */
  temperatureC: number | null;

  /**
   * Состав атмосферы одной строкой. У кометы - состав комы: сама кома есть
   * не всегда, и показывать её карточка решает по испарению.
   */
  atmosphere: string;

  /**
   * Число известных естественных спутников.
   *
   * `null` там, где вопрос не имеет смысла: у Солнца спутники - сами планеты,
   * у спутников своих спутников не бывает. Строка в карточке тогда не
   * показывается: прочерк выглядел бы утверждением «ноль», а это не так.
   *
   * Число растёт: у Юпитера и Сатурна открытия идут каждый год. Здесь оно на
   * начало 2026 года и заведомо отстанет - это цена любого такого счётчика.
   */
  moons: number | null;

  /** Одна примета - то, ради чего на тело смотрят. */
  note: string;
}

type LoreNumbers = Pick<BodyLore, 'temperatureC' | 'moons'>;

const LORE: Readonly<Record<keyof Dictionary['lore'], LoreNumbers>> = {
  sun: { temperatureC: 5504, moons: null },
  mercury: { temperatureC: 167, moons: 0 },
  venus: { temperatureC: 464, moons: 0 },
  earth: { temperatureC: 15, moons: 1 },
  mars: { temperatureC: -63, moons: 2 },
  jupiter: { temperatureC: -108, moons: 97 },
  saturn: { temperatureC: -139, moons: 274 },
  uranus: { temperatureC: -197, moons: 28 },
  neptune: { temperatureC: -201, moons: 16 },
  pluto: { temperatureC: -229, moons: 5 },
  moon: { temperatureC: -20, moons: null },
  phobos: { temperatureC: -40, moons: null },
  deimos: { temperatureC: -40, moons: null },
  io: { temperatureC: -143, moons: null },
  europa: { temperatureC: -171, moons: null },
  ganymede: { temperatureC: -163, moons: null },
  callisto: { temperatureC: -139, moons: null },
  mimas: { temperatureC: -200, moons: null },
  enceladus: { temperatureC: -198, moons: null },
  titan: { temperatureC: -179, moons: null },
  titania: { temperatureC: -203, moons: null },
  oberon: { temperatureC: -198, moons: null },
  triton: { temperatureC: -235, moons: null },
  charon: { temperatureC: -220, moons: null },

  /*
   * Температура ядра ничего не значит в среднем: у афелия это минус двести
   * с лишним, у перигелия почти плюс девяносто. Одно число из справочника
   * было бы верно в одной точке орбиты и неверно во всех остальных, поэтому
   * его здесь нет: карточка считает температуру от нынешнего расстояния до
   * Солнца.
   *
   * Кома - по той же причине только состав. Есть ли она сейчас, решает
   * испарение: за тремя а.е. его нет, и карточка говорит, что комы нет.
   */
  halley: { temperatureC: null, moons: null },
};

/** Справочные сведения о теле - со словами на текущем языке. */
export function bodyLore(id: string): BodyLore | undefined {
  const numbers = (LORE as Readonly<Record<string, LoreNumbers>>)[id];
  const words = (strings().lore as Readonly<Record<string, Dictionary['lore']['sun']>>)[id];
  if (!numbers || !words) return undefined;

  return { ...numbers, atmosphere: words.atmosphere, note: words.note };
}

/**
 * Тела, для которых сведений нет.
 *
 * Нужна тесту: тело появляется в сцене из `bodies.ts`, а сюда его дописать
 * забывают - и карточка молча теряет половину строк.
 */
export function bodiesWithoutLore(): string[] {
  return ALL_BODIES.filter((body) => !bodyLore(body.id)).map((body) => body.id);
}
