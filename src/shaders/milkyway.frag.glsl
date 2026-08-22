/**
 * Млечный Путь.
 *
 * Полоса Галактики рисуется процедурно, как и поверхности планет: карта неба
 * в разумном разрешении весила бы мегабайты, а всё, что от неё нужно, — это
 * широкая светящаяся полоса, темнеющая от центра к антицентру, с пылевыми
 * прожилками поперёк и Большим Провалом вдоль.
 *
 * Всё считается в галактических координатах: широта b отмеряется от плоскости
 * диска, долгота l — от направления на центр. В них Млечный Путь описывается
 * почти тривиально, и именно поэтому оси галактической системы приходят сюда
 * готовыми, а не выводятся из склонения на месте.
 *
 * Требует noise.glsl (fbm).
 */

#include <logdepthbuf_pars_fragment>

/** Оси галактической системы в координатах сцены. */
uniform vec3 uCentre;
uniform vec3 uEast;
uniform vec3 uPole;

/** Общая яркость полосы; ею же отменяется адаптация экспозиции. */
uniform float uIntensity;

varying vec3 vDirection;

/**
 * Полутолщина полосы по широте, радианы.
 *
 * У центра диск виден с ребра во всю его толщину и вздут балджем, к
 * антицентру полоса сужается вдвое — там мы смотрим на край диска изнутри.
 */
const float THICKNESS_CENTRE = 0.20;
const float THICKNESS_EDGE = 0.075;

void main() {
  #include <logdepthbuf_fragment>

  vec3 direction = normalize(vDirection);

  float latitude = asin(clamp(dot(direction, uPole), -1.0, 1.0));
  float longitude = atan(dot(direction, uEast), dot(direction, uCentre));

  // Насколько мы смотрим в сторону центра: 1 — точно в центр, 0 — в антицентр.
  float towardsCentre = 0.5 + 0.5 * cos(longitude);

  float thickness = mix(THICKNESS_EDGE, THICKNESS_CENTRE, towardsCentre * towardsCentre);
  float band = exp(-pow(latitude / thickness, 2.0));

  // Яркость вдоль полосы. В Стрельце мы смотрим сквозь весь диск и в балдж,
  // в Возничем — наружу, в край: там полоса втрое слабее, но никуда не
  // девается. Зимний Млечный Путь тусклее летнего, а не отсутствует.
  float along = mix(0.34, 1.0, pow(towardsCentre, 1.4));

  // Балдж: утолщение у самого центра, заметно ярче остального диска.
  float bulge = exp(-pow(longitude / 0.35, 2.0)) * exp(-pow(latitude / 0.17, 2.0));

  // Пылевые прожилки. Облака пыли лежат в самой плоскости диска и потому
  // тянутся вдоль полосы, а не поперёк: шум сжат по широте втрое.
  vec3 dustCoordinate = vec3(direction.x, direction.y, direction.z) * 2.6;
  float dust = fbm(dustCoordinate, 4) + 0.5 * fbm(dustCoordinate * 3.1, 3);
  float clouds = mix(0.45, 1.15, smoothstep(-0.28, 0.3, dust));

  // Большой Провал: тёмная полоса вдоль диска от Лебедя до Стрельца. Это не
  // пустота, а пыль ближнего рукава, закрывающая всё, что за ней.
  float rift = 1.0 - 0.55
    * exp(-pow((latitude + 0.02) / 0.045, 2.0))
    * smoothstep(-0.2, 0.7, cos(longitude));

  float glow = band * along * clouds * rift + bulge * 0.5;

  // Цвет тёплый: полоса — это свет миллиардов звёзд, среди которых
  // преобладают жёлтые и красные, да ещё и покрасневшие от пыли.
  vec3 color = mix(vec3(0.72, 0.78, 0.95), vec3(1.0, 0.92, 0.78), towardsCentre);

  gl_FragColor = vec4(color * glow * uIntensity, 1.0);
}
