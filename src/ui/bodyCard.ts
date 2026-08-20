import { bodyFacts } from '../data/bodyFacts';
import { bodyLore } from '../data/bodyLore';
import { bodyById } from '../data/bodies';
import { formatDistance } from './distanceUnits';
import { makeUnitToggle } from './hud';
import { superscript } from './superscript';

/**
 * Карточка тела.
 *
 * Показывается для того тела, к которому летим или рядом с которым стоим:
 * ровно тогда, когда цифры про него уместны. Постоянно висящая карточка
 * заняла бы угол экрана ради данных, которые в полёте между планетами никому
 * не нужны.
 */

const EARTH = bodyFacts(bodyById('earth')!);

/** Масса в килограммах с показателем степени: «1.90·10²⁷ кг». */
export function formatMass(kg: number): string {
  const exponent = Math.floor(Math.log10(kg));
  const mantissa = kg / Math.pow(10, exponent);
  return `${mantissa.toFixed(2)}·10${superscript(exponent)} кг`;
}

/** Период обращения: сутки, если их немного, иначе годы. */
export function formatOrbitalPeriod(days: number | null): string {
  if (days === null) return '—';
  if (days < 300) return `${days.toFixed(days < 100 ? 1 : 0)} сут`;

  const years = days / 365.25;
  return `${years.toFixed(years < 10 ? 2 : 1)} года`;
}

/**
 * Период вращения. Меньше двух суток — в часах и минутах: сутки Юпитера
 * длятся девять часов пятьдесят пять минут, и округлять их до «0.4 суток»
 * значит выбрасывать самое интересное.
 */
export function formatRotationPeriod(days: number): string {
  const absolute = Math.abs(days);
  const retrograde = days < 0 ? ', обратное' : '';

  if (absolute < 2) {
    const hours = Math.floor(absolute * 24);
    const minutes = Math.round((absolute * 24 - hours) * 60);
    // Округление минут до шестидесяти: «9 ч 60 мин» выглядит как ошибка.
    const carry = minutes === 60;
    return `${hours + (carry ? 1 : 0)} ч ${carry ? 0 : minutes} мин${retrograde}`;
  }

  return `${absolute.toFixed(absolute < 100 ? 1 : 0)} сут${retrograde}`;
}

/**
 * Температура: «+15 °C», «−63 °C».
 *
 * Знак ставится всегда, в том числе плюс. Без него «15 °C» рядом с «−63 °C»
 * читается как недостающий минус, а не как тепло.
 */
export function formatTemperature(celsius: number): string {
  const rounded = Math.round(celsius);
  const sign = rounded < 0 ? '−' : '+';
  return `${sign}${Math.abs(rounded)} °C`;
}

/** Отношение к земному: «11.2 радиуса Земли». */
export function formatRelative(value: number, unit: string): string {
  if (value >= 100) return `${value.toFixed(0)} ${unit}`;
  if (value >= 10) return `${value.toFixed(1)} ${unit}`;
  return `${value.toFixed(2)} ${unit}`;
}

export interface CardSource {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  /** Расстояние от камеры до поверхности, км. */
  distanceToCamera(): number;
  /** Расстояние тела от Солнца, км. */
  distanceToSun(): number;
}

const ROWS = [
  'радиус',
  'масса',
  'температура',
  'атмосфера',
  'спутников',
  'наклон оси',
  'сутки',
  'оборот',
  'от Солнца',
  'до камеры',
] as const;

type RowLabel = (typeof ROWS)[number];

/**
 * Строки с расстоянием: щелчок по ним меняет единицы во всём интерфейсе.
 * Радиус сюда не входит — это размер тела, а не расстояние до него, и мерить
 * поперечник Юпитера в световых секундах незачем.
 */
const DISTANCE_ROWS: ReadonlySet<string> = new Set(['от Солнца', 'до камеры']);

export class BodyCard {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly kind: HTMLElement;
  private readonly note: HTMLElement;
  /** Строка целиком — её приходится прятать там, где величины не существует. */
  private readonly lines = new Map<RowLabel, HTMLElement>();
  private readonly rows = new Map<RowLabel, HTMLElement>();

  private source: CardSource | null = null;
  private age = 0;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'body-card hidden';

    this.title = document.createElement('b');
    this.kind = document.createElement('i');

    const header = document.createElement('div');
    header.className = 'body-card-header';
    header.append(this.title, this.kind);
    this.root.appendChild(header);

    for (const label of ROWS) {
      const row = document.createElement('div');
      row.className = 'body-card-row';

      const key = document.createElement('span');
      key.textContent = label;

      const value = document.createElement('span');
      value.className = 'value';
      value.textContent = '—';

      if (DISTANCE_ROWS.has(label)) makeUnitToggle(value);

      row.append(key, value);
      this.root.appendChild(row);
      this.rows.set(label, value);
      this.lines.set(label, row);
    }

    this.note = document.createElement('div');
    this.note.className = 'body-card-note';
    this.root.appendChild(this.note);

    container.appendChild(this.root);
  }

  /** Показать карточку тела; null — спрятать. */
  show(source: CardSource | null): void {
    if (source?.id === this.source?.id) return;

    this.source = source;
    this.root.classList.toggle('hidden', source === null);
    if (!source) return;

    const definition = bodyById(source.id);
    if (!definition) return;

    const facts = bodyFacts(definition);
    this.title.textContent = source.name;
    this.kind.textContent = source.kind;

    this.set('радиус', `${format(facts.radiusKm)} км · ${formatRelative(facts.radiusKm / EARTH.radiusKm, 'R⊕')}`);
    this.set('масса', `${formatMass(facts.massKg)} · ${formatRelative(facts.massKg / EARTH.massKg, 'M⊕')}`);
    this.set('наклон оси', `${facts.axialTiltDeg.toFixed(1)}°`);
    this.set('сутки', formatRotationPeriod(facts.rotationPeriodDays));
    this.set('оборот', formatOrbitalPeriod(facts.orbitalPeriodDays));

    const lore = bodyLore(source.id);
    this.set('температура', lore ? formatTemperature(lore.temperatureC) : '—');
    this.set('атмосфера', lore?.atmosphere ?? '—');

    // У Солнца и у спутников своих спутников нет, и прочерк здесь читался бы
    // как «ноль» — утверждение, которого никто не делал. Строка убирается.
    const moons = lore?.moons ?? null;
    this.showRow('спутников', moons !== null);
    if (moons !== null) this.set('спутников', String(moons));

    this.note.textContent = lore?.note ?? '';
    this.note.classList.toggle('hidden', !lore);

    // Живые строки заполняются сразу, чтобы карточка не появлялась пустой.
    this.age = Infinity;
    this.update(0);
  }

  /** Обновить меняющиеся строки — расстояния. */
  update(dt: number): void {
    if (!this.source) return;

    this.age += dt;
    if (this.age < 0.33) return;
    this.age = 0;

    this.set('от Солнца', formatDistance(Math.max(this.source.distanceToSun(), 0)));
    this.set('до камеры', formatDistance(Math.max(this.source.distanceToCamera(), 0)));
  }

  private set(label: RowLabel, text: string): void {
    const value = this.rows.get(label);
    if (value && value.textContent !== text) value.textContent = text;
  }

  private showRow(label: RowLabel, visible: boolean): void {
    this.lines.get(label)?.classList.toggle('hidden', !visible);
  }
}

/** Разделение тысяч неразрывным пробелом — как в остальном интерфейсе. */
function format(value: number): string {
  return value.toLocaleString('ru-RU', { maximumFractionDigits: 0 });
}
