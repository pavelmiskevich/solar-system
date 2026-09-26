import type { EclipsePhase } from '../physics/events';
import type { Dictionary, ParadeSky } from './ru';

/**
 * Английский словарь интерфейса.
 *
 * Ключи повторяют русский словарь, и это проверяет tsc: тип `Dictionary`
 * выведен оттуда. Перевод не калька с русского - строки написаны так, как их
 * написал бы англоязычный автор: «Mars at opposition», а не «Opposition of
 * Mars», и без русской привычки ставить пробел перед знаком процента.
 *
 * Имена тел и звёзд - общепринятые астрономические, те, под которыми их
 * знает англоязычный справочник.
 */

const BODIES: Dictionary['bodies'] = {
  sun: 'Sun',
  mercury: 'Mercury',
  venus: 'Venus',
  earth: 'Earth',
  mars: 'Mars',
  jupiter: 'Jupiter',
  saturn: 'Saturn',
  uranus: 'Uranus',
  neptune: 'Neptune',
  pluto: 'Pluto',
  moon: 'Moon',
  phobos: 'Phobos',
  deimos: 'Deimos',
  io: 'Io',
  europa: 'Europa',
  ganymede: 'Ganymede',
  callisto: 'Callisto',
  mimas: 'Mimas',
  enceladus: 'Enceladus',
  titan: 'Titan',
  titania: 'Titania',
  oberon: 'Oberon',
  triton: 'Triton',
  charon: 'Charon',
  halley: "Halley's Comet",
};

function name(id: string): string {
  return (BODIES as Readonly<Record<string, string>>)[id] ?? id;
}

/** Перечисление через запятую и «and» перед последним. */
function listNames(ids: readonly string[]): string {
  const names = ids.map(name);
  if (names.length < 2) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Единственное и множественное: «1 day/s», но «7 days/s». */
function plural(value: string, one: string, many: string): string {
  return Number(value) === 1 ? one : many;
}

const PHASES: Readonly<Record<EclipsePhase, string>> = {
  total: 'Total',
  annular: 'Annular',
  partial: 'Partial',
  penumbral: 'Penumbral',
};

const PARADE_COUNTS: Readonly<Record<number, string>> = {
  3: 'three in one arc',
  4: 'four in one arc',
  5: 'all five',
};

const PARADE_SKY: Readonly<Record<ParadeSky, string>> = {
  evening: 'of the evening sky',
  morning: 'of the morning sky',
  both: 'on both sides of the Sun',
};

export const EN: Dictionary = {
  locale: 'en-US',

  page: {
    title: 'Solar System',
    description: 'A simulation of the Solar System: real distances, Keplerian orbits, free flight',
  },

  languageSwitch: 'Interface language',

  bodies: BODIES,

  kinds: {
    star: 'star',
    planet: 'planet',
    dwarfPlanet: 'dwarf planet',
    comet: 'comet',
    moonOf: (parent: string) => `moon of ${name(parent)}`,
  },

  lore: {
    sun: {
      atmosphere: 'hydrogen 73%, helium 25%',
      note: 'It holds 99.86% of the mass of the whole system: everything else is a rounding error.',
    },
    mercury: {
      atmosphere: 'almost none: traces of sodium and oxygen',
      note: 'A solar day here lasts two Mercurian years.',
    },
    venus: {
      atmosphere: 'carbon dioxide 96%, nitrogen 3.5%',
      note: 'A day outlasts a year: 243 days to turn on its axis, 225 to go around the Sun.',
    },
    earth: {
      atmosphere: 'nitrogen 78%, oxygen 21%',
      note: 'The only known body with liquid water on its surface.',
    },
    mars: {
      atmosphere: 'carbon dioxide 95%, nitrogen 2.6%',
      note: 'Olympus Mons rises 22 km, higher than anything else in the system.',
    },
    jupiter: {
      atmosphere: 'hydrogen 90%, helium 10%',
      note: 'The Great Red Spot has been observed since the 17th century.',
    },
    saturn: {
      atmosphere: 'hydrogen 96%, helium 3%',
      note: 'Its average density is lower than that of water.',
    },
    uranus: {
      atmosphere: 'hydrogen 83%, helium 15%, methane 2%',
      note: 'Its axis is tilted by 98°: the planet rolls along its orbit on its side.',
    },
    neptune: {
      atmosphere: 'hydrogen 80%, helium 19%, methane 1.5%',
      note: 'The fastest winds in the system, up to 2,100 km/h.',
    },
    pluto: {
      atmosphere: 'nitrogen, methane, carbon monoxide; thin',
      note: 'Charon is so large that the pair revolves around a point outside Pluto.',
    },
    moon: {
      atmosphere: 'none',
      note: 'It keeps one face toward Earth: its rotation is locked to its orbit.',
    },
    phobos: {
      atmosphere: 'none',
      note: 'It circles Mars three times faster than Mars turns, so it rises in the west.',
    },
    deimos: {
      atmosphere: 'none',
      note: 'From the surface of Mars it looks like a star: only a telescope shows its disk.',
    },
    io: {
      atmosphere: 'sulfur dioxide, thin',
      note: 'The most volcanically active body in the system: its eruptions never stop.',
    },
    europa: {
      atmosphere: 'oxygen, extremely thin',
      note: 'Under the icy crust lies a saltwater ocean deeper than any on Earth.',
    },
    ganymede: {
      atmosphere: 'oxygen, extremely thin',
      note: 'The largest moon in the system, bigger than Mercury.',
    },
    callisto: {
      atmosphere: 'carbon dioxide, extremely thin',
      note: 'The oldest surface in the system: crater upon crater, never resurfaced.',
    },
    mimas: {
      atmosphere: 'none',
      note: 'Herschel Crater spans a third of its width: the impact nearly broke it apart.',
    },
    enceladus: {
      atmosphere: 'water vapor above the geysers, extremely thin',
      note: "Geysers at the south pole spray into space and feed Saturn's E ring.",
    },
    titan: {
      atmosphere: 'nitrogen 95%, methane 5%',
      note: 'The only moon with a dense atmosphere; its lakes are filled with methane.',
    },
    titania: {
      atmosphere: 'none',
      note: 'Canyons 1,500 km long: the crust cracked as it cooled.',
    },
    oberon: {
      atmosphere: 'none',
      note: 'Voyager caught an 11 km tall mountain on its limb.',
    },
    triton: {
      atmosphere: 'nitrogen, a few hundredths of a millibar',
      note: 'It orbits backward: a captured Kuiper Belt object rather than one born nearby.',
    },
    charon: {
      atmosphere: 'none',
      note: "Half of Pluto's diameter: the two always turn the same face to each other.",
    },
    halley: {
      atmosphere: 'coma: water vapor 80%, carbon monoxide, dust',
      note: 'Its returns have been recorded since 240 BC: no other comet has been traced so far back.',
    },
  },

  units: {
    m: 'm',
    km: 'km',
    au: 'AU',
    lightSecond: 'light-sec',
    lightMinute: 'light-min',
    kg: 'kg',
    metersPerSecond: 'm/s',
    kmPerSecond: 'km/s',
    days: 'days',
    years: 'years',
    hours: 'h',
    minutes: 'min',
  },

  unitNames: {
    auto: 'automatic',
    km: 'kilometers',
    au: 'astronomical units',
    light: 'light-minutes',
  },

  unitToggleTitle: (unit: string) => `Units: ${unit}. Click for the next`,

  retrograde: 'retrograde',

  timeScale: {
    paused: 'paused',
    stopped: 'stopped',
    realTime: 'real time',
    seconds: (value: string) => `${value} s/s`,
    minutes: (value: string) => `${value} min/s`,
    hours: (value: string) => `${value} h/s`,
    days: (value: string) => `${value} ${plural(value, 'day', 'days')}/s`,
    months: (value: string) => `${value} mo/s`,
    years: (value: string) => `${value} ${plural(value, 'year', 'years')}/s`,
  },

  hud: {
    rows: {
      date: 'date, UTC',
      time: 'time',
      sun: 'to Sun',
      nearest: 'nearest',
      frame: 'frame',
      aim: 'lock',
      size: 'sizes',
      speed: 'speed',
      fps: 'frames',
    },
    trueSizes: 'real',
  },

  card: {
    rows: {
      radius: 'radius',
      mass: 'mass',
      temperature: 'temperature',
      atmosphere: 'atmosphere',
      tail: 'tail',
      moons: 'moons',
      tilt: 'axial tilt',
      rings: 'rings to Sun',
      day: 'rotation',
      orbit: 'orbit',
      fromSun: 'from Sun',
      toCamera: 'to camera',
    },
    tailViews: 'See the full tail in the preset views:',
  },

  comet: {
    noComa: 'none: no sublimation, no coma',
    noTail: (cutoffAu: number) => `none: beyond ${cutoffAu} AU the ice does not sublimate`,
    tail: (percent: number) => `yes: ${percent < 1 ? 'under 1' : percent}% of its perihelion strength`,
  },

  panels: {
    bodies: { title: 'Bodies (B)', open: 'Bodies ☰', close: 'Bodies ✕' },
    views: { title: 'Preset views (V)', open: 'Views ▦', close: 'Views ✕' },
    events: {
      title: 'Upcoming events (E)',
      open: 'Events ☄',
      close: 'Events ✕',
      empty: 'Nothing found in the coming years',
    },
    tour: { title: 'Start the tour (T)', start: 'Tour ▶', stop: 'Stop the tour ✕' },
    snapshot: { title: 'Save the frame as PNG (K)', label: 'Snapshot ⤓', done: 'Snapshot ✓' },
    source: 'Source code on GitHub',
  },

  help: {
    title: 'Controls',
    buttonTitle: 'Controls (H)',
    open: 'Help ?',
    close: 'Help ✕',
    closeTitle: 'Close (H or Esc)',
    sections: {
      touch: 'Touch',
      flight: 'Flight',
      travel: 'Travel',
      inspect: 'Inspect',
      time: 'Time',
      view: 'View',
    },
    keys: {
      clickSky: 'Click the sky',
      wheel: 'Wheel',
      clickBody: 'Click a body',
      clickLabel: 'Click a label',
      drag: 'Drag',
      comma: ', comma',
      period: '. period',
      tapBody: 'Tap a body',
      tapLabel: 'Tap a label',
      dragFinger: 'Drag',
      pinch: 'Pinch',
      swipe: 'Swipe',
      buttons: 'Side buttons',
    },
    actions: {
      look: 'grab the mouse and look around',
      move: 'forward, left, back, right',
      upDown: 'up and down',
      boost: 'ten times faster',
      adjustSpeed: 'adjust the speed',
      releaseMouse: 'release the mouse',
      travel: 'fly to it',
      travelEasier: 'the same, but easier to hit',
      bodyList: 'list of bodies',
      views: 'preset views',
      events: 'upcoming events: eclipses, oppositions, conjunctions',
      abortTravel: 'abort the flight',
      rotate: 'turn the body in front of the camera',
      zoom: 'closer and farther',
      aimLock: 'target lock: keeps the body centered',
      freeFlight: 'back to free flight',
      pause: 'pause',
      slower: 'slower, down to real time',
      faster: 'faster, up to twenty years per second',
      labels: 'body labels',
      sky: 'constellations and bright star names',
      sizes: 'body sizes: real, ×10, ×100, ×1000',
      tour: 'guided tour',
      tourSteps: 'during the tour: previous and next stop',
      help: 'this help',
      touchLook: 'look around; near a body, turn it in front of the camera',
      touchZoom: 'closer and farther, while the camera is at a body',
      buttons: 'bodies, views, events, help',
    },
    footer:
      'Distances are real, and so are the sizes of the bodies. The farther from the Sun, ' +
      'the darker it gets, just as it is in reality. After a flight the camera stays in ' +
      "the body's frame of reference and moves along with it.",
    hint: 'Click a body to fly there · Click the sky to look around · H for help',
    touchHint: 'Tap a body to fly there · Drag to look around · Pinch to zoom',
  },

  date: {
    title: 'Scene date and time, Universal Time',
    yearBack: { text: '−year', title: 'One year back' },
    dayBack: { text: '−day', title: 'One day back' },
    now: { text: 'now', title: 'The present moment' },
    dayForward: { text: '+day', title: 'One day forward' },
    yearForward: { text: '+year', title: 'One year forward' },
  },

  slider: {
    title: 'How fast time flows',
    marks: { real: 'real', hour: 'hour/s', day: 'day/s', year: 'year/s' },
  },

  support: {
    open: 'Support ♥',
    close: 'Support ✕',
    buttonTitle: 'Support the project',
    title: 'Support the author',
    closeTitle: 'Close (Esc)',
    lead: 'Enjoying the simulator? Any support is much appreciated: it goes into developing the project.',
    qrTitle: 'Open the CloudTips page',
    qrAlt: 'QR code for the CloudTips support page',
    qrCaption: 'Tap or scan',
    via: 'A quick transfer via ',
    methods: {
      before: 'One-click payment with ',
      sbp: 'SBP',
      after: ', T-Pay, SberPay or a bank card.',
    },
    pay: 'Send a tip ↗',
    share: 'Or share a link to the simulator',
    copy: 'Copy link',
    copied: 'Copied',
    copyFailed: "Couldn't copy",
  },

  scenarios: {
    'earth-moon': {
      name: 'Earth and Moon',
      hint: 'Both in one frame, and you can see how far away the Moon really is',
    },
    'jupiter-moons': {
      name: 'Jupiter and the Galilean moons',
      hint: 'Four moons on their orbits, locked in the Laplace resonance',
    },
    'saturn-rings-edge': {
      name: "Saturn's rings edge-on",
      hint: 'Every fifteen years they turn their edge to us and all but vanish',
    },
    earthshine: {
      name: 'Earthshine',
      hint: "The Moon's night side, lit by sunlight reflected off Earth",
    },
    'solar-eclipse': {
      name: 'Solar eclipse',
      hint: "August 12, 2026: the Moon's shadow sweeps across Earth",
    },
    'lunar-eclipse': {
      name: "The Moon in Earth's shadow",
      hint: 'March 3, 2026: a total lunar eclipse turns the Moon copper-red',
    },
    'io-shadow': {
      name: "Io's shadow on Jupiter",
      hint: 'A black spot on the clouds: for anyone beneath it, the Sun is completely hidden',
    },
    'inner-system': {
      name: 'The inner system from above',
      hint: 'The four rocky planets and their orbits, seen from high above the ecliptic',
    },
    'halley-1986': {
      name: "Halley's Comet at perihelion",
      hint: 'The tail points straight away from the Sun and grows as the comet closes in',
    },
    'halley-1910': {
      name: "Halley's Comet: the 1910 return",
      hint: 'The return when Earth passed through the edge of the tail and people bought gas masks',
    },
    'uranus-tilt': {
      name: 'Uranus on its side',
      hint: 'The pole faces the Sun, and the cloud bands circle around it',
    },
  },

  tour: {
    sun: 'The Sun is our star. It holds 99.8% of the mass of the entire system.',
    mercury:
      'Mercury is the smallest and fastest planet. It has no atmosphere, and its craters hide in eternal shadow.',
    venus:
      'Venus is the hottest place in the system. Thick clouds of sulfuric acid turn it into a greenhouse hell.',
    earth:
      'Earth is our home, the only known planet with liquid water on its surface, and with life.',
    moon: "The Moon is Earth's only natural satellite. It always keeps the same side turned toward us.",
    mars: 'Mars is a cold red desert. Long ago, rivers flowed here and there were vast lakes.',
    jupiter:
      'Jupiter is the largest gas giant. The Great Red Spot has raged in its atmosphere for centuries.',
    saturn: 'Saturn is the lord of the rings, made of countless icy fragments.',
    uranus: 'Uranus is an ice giant, unique in that it spins lying on its side.',
    neptune: 'Neptune is the most distant planet. The fastest winds in the Solar System blow here.',
    pluto: 'Pluto is a dwarf planet on the cold edge of our system, in the Kuiper Belt.',
  },

  events: {
    solarEclipse: (phase: EclipsePhase | undefined) =>
      phase ? `${PHASES[phase]} solar eclipse` : 'Solar eclipse',
    lunarEclipse: (phase: EclipsePhase | undefined) =>
      phase ? `${PHASES[phase]} lunar eclipse` : 'Lunar eclipse',
    opposition: (body: string) => `${name(body)} at opposition`,
    transit: (body: string) => `Transit of ${name(body)}`,
    conjunction: (a: string, b: string) => `Conjunction: ${name(a)} and ${name(b)}`,
    parade: (count: number) => `Planet parade: ${PARADE_COUNTS[count] ?? 'several at once'}`,
    ringPlaneCrossing: "Saturn's rings edge-on",
    ringOpening: "Saturn's rings at their widest",

    solarEclipseHint: (axisRadii: string) =>
      `The shadow axis passes ${axisRadii} Earth radii from the center of Earth`,
    solarEclipseGrazingHint: 'The penumbra only grazes Earth: no total eclipse anywhere',
    penumbralLunarHint: 'The Moon passes only through the penumbra: the dimming is barely visible',
    lunarEclipseHint: "The Moon enters Earth's shadow and turns copper-red",
    oppositionHint: (au: string) => `The planet is opposite the Sun, ${au} AU away`,
    transitHint: 'The planet crosses the face of the Sun as a black dot',
    conjunctionHint: (separation: string) => `${separation} apart`,
    paradeHint: (bodies: readonly string[], arcDeg: string, sky: ParadeSky) =>
      `${listNames(bodies)} within a ${arcDeg}° arc ${PARADE_SKY[sky]}`,
    ringPlaneCrossingHint: 'Earth crosses to the other side of the rings, and they disappear from view',
    ringOpeningHint: (deg: string) =>
      `The rings are tilted ${deg}° toward the Sun and lit more than ever`,
  },
};
