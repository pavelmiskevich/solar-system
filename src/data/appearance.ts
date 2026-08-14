/**
 * Внешний вид тел.
 *
 * Текстур нет намеренно. Карта Земли в разрешении, которое выдержит подлёт на
 * сто километров, весит десятки мегабайт, и таких карт нужно девять. Поэтому
 * поверхность считается процедурно: рисунок не кончается ни на каком масштабе
 * и ничего не грузится.
 *
 * Цена за это — рисунок «похожий», а не настоящий: материки Земли не совпадут
 * с картой. Совпадает другое, и это важнее для узнавания: цвета, характер
 * деталей и приметы, по которым тело узнают с одного взгляда — полосы и
 * Красное пятно Юпитера, шапки Марса, моря Луны, кратеры Меркурия.
 *
 * Семейств три, потому что физически поверхностей тоже три: твёрдая
 * поверхность в кратерах, облачный слой газового гиганта и Земля с океаном,
 * сушей и отдельным слоем облаков.
 */
export type SurfaceFamily = 'rocky' | 'gas' | 'earth';

/** Пятно на поверхности: Красное у Юпитера, Тёмное у Нептуна, Тумба у Плутона. */
export interface SurfaceSpot {
  /** Широта центра, градусы. */
  latitude: number;
  /** Долгота центра, градусы. */
  longitude: number;
  /** Угловой радиус, градусы. */
  radius: number;
  /** Вытянутость по долготе: у вихрей гигантов она в разы больше единицы. */
  aspect: number;
  color: number;
  /** Насколько пятно перекрывает фон, 0…1. */
  strength: number;
}

/**
 * Полоса колец: от внутреннего радиуса до внешнего, километры.
 *
 * Отрицательная плотность означает щель — вычитание вещества из широкой
 * полосы, как щель Энке внутри кольца A.
 */
export interface RingBand {
  inner: number;
  outer: number;
  /** Плотность 0…1; отрицательная — щель. */
  density: number;
  /** Мягкость края, км. */
  edge: number;
}

/** Система колец. Радиусы — настоящие, километры от центра планеты. */
export interface RingSystem {
  inner: number;
  outer: number;
  color: number;
  bands: RingBand[];
  /** Сила мелкой структуры — тысяч отдельных колечек. */
  ringlets: number;
}

export interface Appearance {
  family: SurfaceFamily;
  /** Основной цвет поверхности или зон. */
  base: number;
  /** Цвет тёмных областей: морей, поясов, альбедных пятен. */
  accent: number;
  /** Цвет светлых областей. */
  highlight: number;
  /** Частота основного рисунка. Больше — мельче детали. */
  detail: number;
  /** Разброс между тёмным и светлым, 0…1. */
  contrast: number;
  /** Синус широты, с которого начинается полярная шапка. Единица — шапки нет. */
  capLatitude: number;
  capColor: number;
  /**
   * Высота рельефа в долях радиуса тела.
   *
   * Это настоящее отношение, а не художественный множитель, и завышать его
   * нельзя. Нормаль поверхности отклоняется пропорционально ему, и при
   * завышении в десяток раз склоны кратеров разворачиваются к Солнцу так, что
   * начинают ловить свет на ночной стороне: тёмное полушарие Луны светилось
   * ярче, чем от пепельного света, и целиком по вине этого числа.
   *
   * Порядок величины у всех тел один: горы и валы кратеров — единицы
   * километров при радиусе в тысячи, то есть тысячные доли.
   */
  relief: number;
  /**
   * Плотность кратеров относительно рисунка. Ноль — поверхность без кратеров:
   * у газовых гигантов её попросту нет.
   */
  craters: number;
  /** Сила лимбового свечения атмосферы, 0 — безвоздушное тело. */
  atmosphere: number;
  atmosphereColor: number;
  /** Зеркальность: заметна только там, где есть жидкость. */
  specular: number;
  spot?: SurfaceSpot;
  rings?: RingSystem;
}

const NONE = {
  capLatitude: 1,
  capColor: 0xffffff,
  atmosphere: 0,
  atmosphereColor: 0xffffff,
  specular: 0,
} as const;

export const APPEARANCE: Record<string, Appearance> = {
  // Меркурий: серая поверхность, насыщенная кратерами, без атмосферы.
  // Альбедо ниже лунного, поэтому базовый тон темнее, чем кажется на снимках.
  mercury: {
    ...NONE,
    family: 'rocky',
    base: 0x8e857c,
    accent: 0x60594f,
    highlight: 0xb4aca2,
    detail: 3.1,
    contrast: 0.55,
    relief: 0.0025,
    craters: 1.0,
  },

  // Венера: поверхности не видно вовсе — виден верх облачного слоя серной
  // кислоты. Отсюда семейство «газовое» у планеты земной группы: полосы
  // размыты, контраст ничтожен, а лимб светится плотной атмосферой.
  venus: {
    ...NONE,
    family: 'gas',
    base: 0xe6cf9b,
    accent: 0xd3b477,
    highlight: 0xf7edd2,
    detail: 1.5,
    contrast: 0.22,
    relief: 0,
    craters: 0,
    atmosphere: 1.5,
    atmosphereColor: 0xf6e2b0,
  },

  earth: {
    ...NONE,
    family: 'earth',
    base: 0x123a63,
    accent: 0x2e5c34,
    highlight: 0x9c8b62,
    detail: 1.7,
    contrast: 0.7,
    capLatitude: 0.972,
    capColor: 0xf0f4fa,
    relief: 0.0012,
    craters: 0,
    atmosphere: 1.15,
    atmosphereColor: 0x6ba8ff,
    specular: 0.55,
  },

  // Марс: ржавые равнины, тёмные альбедные области вроде Большого Сырта,
  // шапки из водяного и углекислотного льда и очень разреженная атмосфера.
  mars: {
    ...NONE,
    family: 'rocky',
    base: 0xb45c33,
    accent: 0x7d4a35,
    highlight: 0xd6875a,
    detail: 2.4,
    contrast: 0.6,
    capLatitude: 0.965,
    capColor: 0xf2f4f8,
    relief: 0.0022,
    craters: 0.55,
    atmosphere: 0.35,
    atmosphereColor: 0xe0a882,
  },

  // Юпитер: зоны и пояса, разорванные турбулентностью, и Большое Красное
  // пятно на 22° южной широты. Вихрь живёт четвёртый век и вдвое шире Земли.
  jupiter: {
    ...NONE,
    family: 'gas',
    base: 0xd6bb95,
    accent: 0x9a6a49,
    highlight: 0xf2e6d2,
    detail: 7.5,
    contrast: 0.85,
    relief: 0,
    craters: 0,
    atmosphere: 0.9,
    atmosphereColor: 0xe8d3b0,
    spot: {
      latitude: -22,
      longitude: 98,
      radius: 11,
      aspect: 2.1,
      color: 0xbb5f3a,
      strength: 0.9,
    },
  },

  // Сатурн: те же пояса, но вымытые дымкой — контраст втрое ниже юпитерова.
  saturn: {
    ...NONE,
    family: 'gas',
    base: 0xe3cf9f,
    accent: 0xc0a674,
    highlight: 0xf6edd4,
    detail: 6.0,
    contrast: 0.32,
    relief: 0,
    craters: 0,
    atmosphere: 0.8,
    atmosphereColor: 0xf0dfb4,
    // От внутреннего края кольца C до внешнего края кольца A. Толщина системы
    // при этом — десятки метров: если бы кольца были бумажным листом, они были
    // бы шириной с футбольное поле.
    rings: {
      inner: 74700,
      outer: 136775,
      color: 0xd8cbb0,
      ringlets: 1,
      bands: [
        // C — полупрозрачное и тёмное.
        { inner: 74700, outer: 92000, density: 0.28, edge: 2300 },
        // B — самое плотное и яркое в Солнечной системе.
        { inner: 91800, outer: 117580, density: 0.95, edge: 1700 },
        // Деление Кассини — не пустота, а провал плотности.
        { inner: 117580, outer: 122170, density: 0.12, edge: 900 },
        // A с резким внешним краем.
        { inner: 122170, outer: 136775, density: 0.72, edge: 1300 },
        // Щель Энке: триста километров пустоты, расчищенной спутником Пан.
        { inner: 133330, outer: 133850, density: -0.62, edge: 120 },
      ],
    },
  },

  // Уран: метановая дымка почти без деталей. Голубизна — метан, поглощающий
  // красную часть спектра.
  uranus: {
    ...NONE,
    family: 'gas',
    base: 0x9fd6e2,
    accent: 0x86c3d4,
    highlight: 0xc2e7ef,
    detail: 4.0,
    contrast: 0.12,
    relief: 0,
    craters: 0,
    atmosphere: 0.85,
    atmosphereColor: 0xa8e0ec,
    /*
     * Десять узких колец, открытых в 1977 году по покрытию звезды, а не глазом
     * и не на снимке. Причина видна в числах: ширина — единицы километров при
     * радиусе в пятьдесят тысяч, а вещество темнее угля: альбедо 0.03 против
     * половины у ледяных колец Сатурна. Поэтому здесь они и выглядят почти
     * невидимыми — такими, какие они есть.
     */
    rings: {
      inner: 41700,
      outer: 51300,
      color: 0x6e6a66,
      ringlets: 0,
      bands: [
        { inner: 41836, outer: 41838, density: 0.5, edge: 0.5 },
        { inner: 42233, outer: 42235, density: 0.5, edge: 0.5 },
        { inner: 42570, outer: 42573, density: 0.5, edge: 0.5 },
        // Альфа и бета — самые заметные после эпсилон.
        { inner: 44714, outer: 44721, density: 0.7, edge: 1 },
        { inner: 45657, outer: 45664, density: 0.7, edge: 1 },
        { inner: 47175, outer: 47177, density: 0.45, edge: 0.5 },
        { inner: 47625, outer: 47629, density: 0.6, edge: 1 },
        { inner: 48298, outer: 48302, density: 0.6, edge: 1 },
        { inner: 50023, outer: 50025, density: 0.35, edge: 0.5 },
        // Эпсилон: самое яркое и широкое, от двадцати до ста километров.
        { inner: 51120, outer: 51178, density: 1.0, edge: 4 },
      ],
    },
  },

  // Нептун: тот же метан, но заметно активнее — светлые перистые полосы и
  // тёмные вихри вроде Большого тёмного пятна.
  neptune: {
    ...NONE,
    family: 'gas',
    base: 0x3f63cf,
    accent: 0x2f4bab,
    highlight: 0x8fa9ea,
    detail: 5.0,
    contrast: 0.4,
    relief: 0,
    craters: 0,
    atmosphere: 0.9,
    atmosphereColor: 0x7fa2f0,
    spot: {
      latitude: -27,
      longitude: 200,
      radius: 9,
      aspect: 1.8,
      color: 0x27408f,
      strength: 0.75,
    },
  },

  // Плутон: тёмный экваториальный пояс Ктулху и светлая азотная равнина
  // Спутник — та самая «сердцевина», по которой Плутон узнают с одного взгляда.
  pluto: {
    ...NONE,
    family: 'rocky',
    base: 0xbfa891,
    accent: 0x6b5648,
    highlight: 0xe8dcc8,
    detail: 2.6,
    contrast: 0.7,
    relief: 0.003,
    craters: 0.4,
    spot: {
      latitude: 5,
      longitude: 180,
      radius: 28,
      aspect: 1.15,
      color: 0xefe6d2,
      strength: 0.85,
    },
  },

  // Ио: серные равнины и вулканические пятна. Кратеров нет вовсе — извержения
  // засыпают поверхность быстрее, чем она успевает их накопить. Это редкий
  // случай, когда отсутствие детали и есть главная примета тела.
  io: {
    ...NONE,
    family: 'rocky',
    base: 0xd9c268,
    accent: 0x8f5a2c,
    highlight: 0xf2e2a0,
    detail: 3.4,
    contrast: 0.62,
    relief: 0.0015,
    craters: 0,
  },

  // Европа: ледяной панцирь, самый гладкий в системе, с сеткой трещин-линий.
  europa: {
    ...NONE,
    family: 'rocky',
    base: 0xdccfba,
    accent: 0x9c8a74,
    highlight: 0xf4efe6,
    detail: 5.2,
    contrast: 0.35,
    relief: 0.0004,
    craters: 0.05,
  },

  // Ганимед: две поверхности сразу — древняя тёмная и молодая светлая, изрезанная
  // бороздами. Крупнейший спутник системы, больше Меркурия.
  ganymede: {
    ...NONE,
    family: 'rocky',
    base: 0x9b8e80,
    accent: 0x63594e,
    highlight: 0xc3b8ab,
    detail: 3.0,
    contrast: 0.6,
    relief: 0.0012,
    craters: 0.65,
  },

  // Каллисто: древнейшая поверхность Солнечной системы, кратер на кратере.
  callisto: {
    ...NONE,
    family: 'rocky',
    base: 0x6f665c,
    accent: 0x4a433b,
    highlight: 0x998f83,
    detail: 2.6,
    contrast: 0.55,
    relief: 0.0018,
    craters: 1.0,
  },

  // Титан: поверхности не видно, видна оранжевая дымка из органики. Полосы
  // почти неразличимы, лимб светится плотной атмосферой.
  titan: {
    ...NONE,
    family: 'gas',
    base: 0xd79a4e,
    accent: 0xc0812f,
    highlight: 0xeccb8e,
    detail: 2.0,
    contrast: 0.12,
    relief: 0,
    craters: 0,
    atmosphere: 1.3,
    atmosphereColor: 0xf0b566,
  },

  // Луна: тёмные базальтовые моря на светлых материках, сплошь в кратерах.
  moon: {
    ...NONE,
    family: 'rocky',
    base: 0xa8a29a,
    accent: 0x6a655f,
    highlight: 0xd0cac2,
    detail: 2.8,
    contrast: 0.75,
    relief: 0.002,
    craters: 1.0,
  },
};
