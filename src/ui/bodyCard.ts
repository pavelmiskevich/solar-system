import { AU } from '../core/units';
import { bodyFacts } from '../data/bodyFacts';
import { bodyLore } from '../data/bodyLore';
import { COMETS, bodyById } from '../data/bodies';
import { scenarioById, type Scenario } from '../data/scenarios';
import { TAIL_CUTOFF_AU, activityAt } from '../physics/cometTail';
import { ZERO_CELSIUS_K, equilibriumTemperatureK } from '../physics/temperature';
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
  if (days === null) return '-';
  if (days < 300) return `${days.toFixed(days < 100 ? 1 : 0)} сут`;

  const years = days / 365.25;
  return `${years.toFixed(years < 10 ? 2 : 1)} года`;
}

/**
 * Период вращения. Меньше двух суток - в часах и минутах: сутки Юпитера
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

/**
 * Готовые виды, где у кометы виден хвост.
 *
 * Вдали от Солнца комета - голое тёмное ядро, и зритель, прилетевший к ней в
 * сегодняшнюю дату, хвоста не увидит. Объяснить это мало: карточка должна
 * ещё сказать, куда смотреть. Виды перечислены здесь, а не выводятся из
 * списка: летят они к Солнцу, а не к комете, и связь с ней есть только в
 * замысле вида.
 */
const COMET_VIEWS: Readonly<Record<string, readonly string[]>> = {
  halley: ['halley-1986', 'halley-1910'],
};

/** Строки карточки, которые у кометы зависят от расстояния до Солнца. */
export interface CometRows {
  temperature: string;
  atmosphere: string;
  tail: string;
  /** Куда позвать за хвостом; пусто, когда хвост и так на экране. */
  views: readonly Scenario[];
}

/**
 * Строки кометы на данном расстоянии от Солнца; null - тело не комета.
 *
 * Хвост, кома и температура у кометы живые: у афелия она тёмная глыба при
 * минус двухстах двадцати, у перигелия - горячее ядро в облаке пара. Одно
 * справочное число на весь оборот было бы верно в одной точке орбиты, и
 * карточка, показавшая кому рядом с голым ядром, читалась как поломка сцены.
 *
 * Деятельность берётся из `activityAt` - той же, по которой сцена строит
 * хвост, - чтобы карточка объясняла ровно тот кадр, что на экране.
 */
export function cometRows(id: string, sunDistanceKm: number): CometRows | null {
  const comet = COMETS.find((body) => body.id === id);
  if (!comet?.orbit) return null;

  const distanceAu = sunDistanceKm / AU;
  const activity = activityAt(distanceAu, comet.orbit.a * (1 - comet.orbit.e));
  const temperature = formatTemperature(
    equilibriumTemperatureK(distanceAu, comet.albedo) - ZERO_CELSIUS_K,
  );

  if (activity === 0) {
    return {
      temperature,
      atmosphere: 'нет: без испарения нет и комы',
      tail: `нет: дальше ${TAIL_CUTOFF_AU} а.е. лёд не испаряется`,
      views: (COMET_VIEWS[id] ?? [])
        .map((view) => scenarioById(view))
        .filter((view): view is Scenario => view !== undefined),
    };
  }

  // Доля от перигелия, а не просто «есть»: у самого порога испаряется так
  // мало, что хвоста на экране почти не видно, и голое «есть» спорило бы с
  // кадром так же, как прежнее молчание. Меньше процента не округляется до
  // нуля - «есть: 0 %» читалось бы как противоречие.
  const share = Math.round(activity * 100);
  return {
    temperature,
    atmosphere: bodyLore(id)?.atmosphere ?? '-',
    tail: `есть: ${share < 1 ? 'меньше 1' : share} % от силы в перигелии`,
    views: [],
  };
}

export interface CardSource {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  /** Расстояние от камеры до поверхности, км. */
  distanceToCamera(): number;
  /** Расстояние тела от Солнца, км. */
  distanceToSun(): number;
  /**
   * Угол между плоскостью колец и направлением на Солнце, °; null - колец нет.
   *
   * Строка живая, как и расстояния: у Сатурна этот угол пробегает от нуля в
   * равноденствие до двадцати семи градусов за четырнадцать лет.
   */
  ringSunElevationDeg(): number | null;
}

const ROWS = [
  'радиус',
  'масса',
  'температура',
  'атмосфера',
  'хвост',
  'спутников',
  'наклон оси',
  'кольца к Солнцу',
  'сутки',
  'оборот',
  'от Солнца',
  'до камеры',
] as const;

type RowLabel = (typeof ROWS)[number];

/**
 * Строки с расстоянием: щелчок по ним меняет единицы во всём интерфейсе.
 * Радиус сюда не входит - это размер тела, а не расстояние до него, и мерить
 * поперечник Юпитера в световых секундах незачем.
 */
const DISTANCE_ROWS: ReadonlySet<string> = new Set(['от Солнца', 'до камеры']);

export class BodyCard {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly kind: HTMLElement;
  private readonly note: HTMLElement;
  private readonly views: HTMLElement;
  private readonly viewList: HTMLElement;
  /** Какие виды сейчас в приглашении: перестраивать его трижды в секунду незачем. */
  private shownViews = '';
  /** Строка целиком - её приходится прятать там, где величины не существует. */
  private readonly lines = new Map<RowLabel, HTMLElement>();
  private readonly rows = new Map<RowLabel, HTMLElement>();

  private source: CardSource | null = null;
  private age = 0;

  /**
   * @param showView открыть готовый вид по его id - карточка кометы зовёт
   *   туда, где у неё виден хвост
   */
  constructor(
    container: HTMLElement,
    private readonly showView: (id: string) => void,
  ) {
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
      value.textContent = '-';

      if (DISTANCE_ROWS.has(label)) makeUnitToggle(value);

      row.append(key, value);
      this.root.appendChild(row);
      this.rows.set(label, value);
      this.lines.set(label, row);
    }

    // Ссылка на вид, а не только его название: найти «Комету Галлея в
    // перигелии» в списке из дюжины видов человек сможет и сам, но не
    // догадается, что искать её надо именно там.
    this.views = document.createElement('div');
    this.views.className = 'body-card-views hidden';
    this.views.textContent = 'Хвост во всю длину - в готовых видах:';
    this.viewList = document.createElement('div');
    this.views.appendChild(this.viewList);
    this.root.appendChild(this.views);

    this.note = document.createElement('div');
    this.note.className = 'body-card-note';
    this.root.appendChild(this.note);

    container.appendChild(this.root);
  }

  /** Показать карточку тела; null - спрятать. */
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
    // У кометы справочной температуры нет, и обе строки заполнит update():
    // там они считаются от расстояния до Солнца.
    const temperature = lore?.temperatureC ?? null;
    this.set('температура', temperature === null ? '-' : formatTemperature(temperature));
    this.set('атмосфера', lore?.atmosphere ?? '-');

    // У Солнца и у спутников своих спутников нет, и прочерк здесь читался бы
    // как «ноль» - утверждение, которого никто не делал. Строка убирается.
    const moons = lore?.moons ?? null;
    this.showRow('спутников', moons !== null);
    if (moons !== null) this.set('спутников', String(moons));

    this.note.textContent = lore?.note ?? '';
    this.note.classList.toggle('hidden', !lore);

    // Живые строки заполняются сразу, чтобы карточка не появлялась пустой.
    this.age = Infinity;
    this.update(0);
  }

  /** Обновить меняющиеся строки - расстояния. */
  update(dt: number): void {
    if (!this.source) return;

    this.age += dt;
    if (this.age < 0.33) return;
    this.age = 0;

    this.set('от Солнца', formatDistance(Math.max(this.source.distanceToSun(), 0)));
    this.set('до камеры', formatDistance(Math.max(this.source.distanceToCamera(), 0)));

    // Кольца, повёрнутые к Солнцу ребром, получают почти ничего и тускнеют до
    // неразличимости. Без этой строки такой кадр читается как поломка, а это
    // явление: у равноденствия 2025 года кольцам Сатурна достаётся около
    // десятой доли того света, что в начале тридцатых.
    const rings = this.source.ringSunElevationDeg();
    this.showRow('кольца к Солнцу', rings !== null);
    if (rings !== null) this.set('кольца к Солнцу', `${rings.toFixed(1)}°`);

    // Комета вдали от Солнца - тёмная глыба без хвоста, и сцена в этом права.
    // Та же беда, что с кольцами: без объяснения верный кадр читается как
    // непрорисованная планета.
    const comet = cometRows(this.source.id, Math.max(this.source.distanceToSun(), 0));
    this.showRow('хвост', comet !== null);
    this.showViews(comet?.views ?? []);
    if (!comet) return;

    this.set('температура', comet.temperature);
    this.set('атмосфера', comet.atmosphere);
    this.set('хвост', comet.tail);
  }

  private showViews(views: readonly Scenario[]): void {
    const ids = views.map((view) => view.id).join(' ');
    this.views.classList.toggle('hidden', views.length === 0);
    if (ids === this.shownViews) return;

    this.shownViews = ids;
    this.viewList.replaceChildren(
      ...views.map((view) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.view = view.id;
        button.textContent = view.name;
        button.title = view.hint;
        button.addEventListener('click', () => this.showView(view.id));
        return button;
      }),
    );
  }

  private set(label: RowLabel, text: string): void {
    const value = this.rows.get(label);
    if (value && value.textContent !== text) value.textContent = text;
  }

  private showRow(label: RowLabel, visible: boolean): void {
    this.lines.get(label)?.classList.toggle('hidden', !visible);
  }
}

/** Разделение тысяч неразрывным пробелом - как в остальном интерфейсе. */
function format(value: number): string {
  return value.toLocaleString('ru-RU', { maximumFractionDigits: 0 });
}
