import { Group, PerspectiveCamera, Vector3, Vector4 } from 'three';
import { describe, expect, it } from 'vitest';

import { APPEARANCE } from '../src/data/appearance';
import { Atmosphere } from '../src/scene/atmosphere';

/**
 * Слой рассеяния.
 *
 * Проверять сам расчёт нечем — он живёт в шейдере, — но у него есть данные, и
 * в них легко ошибиться незаметно. Коэффициенты рассеяния настоящие, и цвет
 * неба следует прямо из них: перепутанные местами каналы дали бы жёлтое небо
 * и синий закат, и никакая проверка кадра этого не поймает, если считать её
 * по яркости.
 */

const earth = APPEARANCE.earth!;

/** Настоящие числа: по ним же считаются угловые размеры в проверках ниже. */
const EARTH_RADIUS = 6378;
const MOON_RADIUS = 1737.4;
const MOON_DISTANCE = 384_400;
const SUN_RADIUS = 696_000;
const AU = 149_597_870.7;

/** Планета не в начале координат: так видно, вычтено ли её положение. */
const BODY = new Vector3(1.0e8, 2.0e7, -3.0e7);
const SUN = new Vector3(BODY.x + AU, BODY.y, BODY.z);

/** Камере в этих проверках всё равно где быть: тень от неё не зависит. */
const camera = () => {
  const view = new PerspectiveCamera();
  view.position.set(BODY.x, BODY.y, BODY.z + EARTH_RADIUS * 3);
  return view;
};

describe('атмосфера Земли', () => {
  it('рассеивает синий сильнее красного — отсюда и цвет неба', () => {
    const scattering = earth.scattering!;
    const [red, green, blue] = scattering.rayleigh;

    expect(blue).toBeGreaterThan(green);
    expect(green).toBeGreaterThan(red);
    // Рэлеевское рассеяние идёт как 1/λ⁴: между красным и синим это примерно
    // впятеро, и именно из этого числа получается и голубое небо, и красный
    // закат. Вдвое было бы блёкло, вдесятеро — ядовито.
    expect(blue / red).toBeGreaterThan(4);
    expect(blue / red).toBeLessThan(7);
  });

  it('аэрозоль рассеивает без цвета и лежит ниже воздуха', () => {
    const scattering = earth.scattering!;

    // У аэрозоля один коэффициент на все каналы: капли и пыль много крупнее
    // длины волны, и цвет им безразличен. Оттого дымка у горизонта белая.
    expect(scattering.mie).toBeGreaterThan(0);
    // Пыль и капли держатся у земли, воздух уходит выше.
    expect(scattering.mieHeight).toBeLessThan(scattering.scaleHeight);
  });

  it('высоты и толщина слоя — измеренные, а не подогнанные', () => {
    const scattering = earth.scattering!;

    // Высота однородной атмосферы Земли — восемь километров.
    expect(scattering.scaleHeight).toBeCloseTo(8, 0);
    // Сто километров: выше линии Кармана рассеивать уже нечему.
    expect(scattering.thickness).toBe(100);
  });

  it('оболочка выше поверхности ровно на толщину слоя', () => {
    const atmosphere = new Atmosphere({ radius: 6378, scattering: earth.scattering! });

    expect(atmosphere.surfaceRadius).toBe(6378);
    expect(atmosphere.radius).toBe(6478);
    // Слой тонкий: сотня километров против шести с половиной тысяч радиуса.
    // Если бы он оказался заметно толще, кайма на снимке была бы шире, чем
    // бывает на самом деле, — а её толщина и есть то, что проверяют глазом.
    expect(atmosphere.radius / atmosphere.surfaceRadius).toBeCloseTo(1.0157, 4);
  });

  it('есть только там, где атмосфера плотная', () => {
    // Земля — да; Луна и Меркурий — нет; Марсу и газовым гигантам хватает
    // прежнего лимбового свечения, слой рассеяния для них не считается.
    expect(APPEARANCE.earth!.scattering).toBeDefined();
    expect(APPEARANCE.moon!.scattering).toBeUndefined();
    expect(APPEARANCE.mercury!.scattering).toBeUndefined();
  });
});

/**
 * Тень соседа на слое рассеяния.
 *
 * Затенение считается в шейдере, и проверить оттуда его нечем. Но у него есть
 * вход — положения заслоняющих тел, переведённые в систему координат планеты и
 * в настоящие километры, — и ошибка в этом переводе уводит тень с того места,
 * где она лежит на поверхности. Проверяется именно перевод.
 */
describe('затмение на слое рассеяния', () => {
  /** Оболочка в группе: без родителя переводить координаты не во что. */
  function shell(eclipseCasters = 1) {
    const atmosphere = new Atmosphere({
      radius: EARTH_RADIUS,
      scattering: earth.scattering!,
      eclipseCasters,
    });
    const group = new Group();
    group.add(atmosphere.mesh);
    return atmosphere;
  }

  /** Луна на четверти миллиона километров от Земли, поперёк направления на Солнце. */
  const moon = (k: number) => new Vector4(BODY.x, BODY.y, BODY.z + MOON_DISTANCE, MOON_RADIUS * k);

  it('заслоняющее тело приходит в шейдер в километрах от центра планеты', () => {
    const atmosphere = shell();
    const k = 4;

    atmosphere.update(SUN, BODY, camera(), k, [moon(k)], SUN_RADIUS * k);

    const casters = atmosphere.mesh.material.uniforms.uEclipseCasters!.value as Vector4[];
    // Начало координат — центр планеты, оси — её собственные, длины — настоящие
    // километры: те же, в которых задана и геометрия оболочки.
    expect(casters[0]!.x).toBeCloseTo(0, 6);
    expect(casters[0]!.y).toBeCloseTo(0, 6);
    expect(casters[0]!.z).toBeCloseTo(MOON_DISTANCE / k, 6);
    expect(casters[0]!.w).toBeCloseTo(MOON_RADIUS, 6);
  });

  it('углы те же, что видит поверхность под слоем', () => {
    // Затмение решается двумя углами: под какими видны с точки диск Солнца и
    // диск соседа. Поверхность считает их прямо в координатах сцены, слой —
    // в своих километрах, и совпасть они обязаны до последнего знака: разойдись
    // они, и тень на воздухе поехала бы относительно тени на земле.
    const angles = [1, 4, 25].map((k) => {
      const atmosphere = shell();
      atmosphere.update(SUN, BODY, camera(), k, [moon(k)], SUN_RADIUS * k);
      const uniforms = atmosphere.mesh.material.uniforms;
      const caster = (uniforms.uEclipseCasters!.value as Vector4[])[0]!;

      const inLayer = {
        caster: caster.w / Math.hypot(caster.x, caster.y, caster.z),
        sun: (uniforms.uSunRadius!.value as number) / (uniforms.uSunDistance!.value as number),
      };
      // То же самое в координатах сцены: раздувание размеров множит радиусы и
      // не трогает расстояния, поэтому оба угла растут вместе с множителем.
      const inScene = { caster: (MOON_RADIUS * k) / MOON_DISTANCE, sun: (SUN_RADIUS * k) / AU };

      expect(inLayer.caster).toBeCloseTo(inScene.caster, 12);
      expect(inLayer.sun).toBeCloseTo(inScene.sun, 12);
      return inLayer;
    });

    // А их отношение от множителя не зависит вовсе — и не должно: им решается,
    // выйдет затмение полным или кольцеобразным, и раздувание размеров такое
    // решать не вправе.
    for (const angle of angles) {
      expect(angle.caster / angle.sun).toBeCloseTo(angles[0]!.caster / angles[0]!.sun, 12);
    }
    // И число настоящее: Луна и Солнце с Земли видны почти одинаковыми — из
    // этого совпадения и получаются полные солнечные затмения.
    expect(angles[0]!.caster / angles[0]!.sun).toBeGreaterThan(0.9);
    expect(angles[0]!.caster / angles[0]!.sun).toBeLessThan(1.1);
  });

  it('поворот планеты под слоем не уводит тень', () => {
    // Оболочка живёт в группе тела и вертится вместе с ней, а Луна — нет.
    // Значит, в системе координат тела она обязана ехать навстречу вращению.
    const atmosphere = new Atmosphere({
      radius: EARTH_RADIUS,
      scattering: earth.scattering!,
      eclipseCasters: 1,
    });
    const group = new Group();
    group.add(atmosphere.mesh);
    group.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);

    atmosphere.update(SUN, BODY, camera(), 1, [moon(1)], SUN_RADIUS);

    const caster = (atmosphere.mesh.material.uniforms.uEclipseCasters!.value as Vector4[])[0]!;
    // В собственных осях повёрнутой планеты сосед уезжает навстречу: четверть
    // оборота вокруг оси y переводит +z в −x.
    expect(caster.x).toBeCloseTo(-MOON_DISTANCE, 3);
    expect(caster.z).toBeCloseTo(0, 3);
  });

  it('у тела без соседей кода затмения в программе нет', () => {
    const atmosphere = shell(0);
    const material = atmosphere.mesh.material;

    // Ни библиотеки затмения в исходнике, ни define, без которого весь
    // затменный код в нём остаётся под `#ifdef` и до компилятора не доходит.
    expect(material.fragmentShader).not.toContain('float eclipseCoverage(');
    expect(material.defines?.ECLIPSE_CASTERS).toBeUndefined();
    expect(material.uniforms.uEclipseCasters).toBeUndefined();
    expect(material.uniforms.uSunDistance).toBeUndefined();
  });

  it('у тела с соседями библиотека затмения на месте', () => {
    const material = shell(2).mesh.material;

    expect(material.fragmentShader).toContain('float eclipseCoverage(');
    expect(material.defines?.ECLIPSE_CASTERS).toBe('2');
    expect((material.uniforms.uEclipseCasters!.value as Vector4[]).length).toBe(2);
  });
});
