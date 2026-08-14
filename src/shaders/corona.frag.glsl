#include <logdepthbuf_pars_fragment>

uniform float uTime;
uniform float uIntensity;
uniform vec3 uColor;
/** Радиус фотосферы в долях полукадра билборда. */
uniform float uCoreRadius;

varying vec2 vUv;

void main() {
  #include <logdepthbuf_fragment>

  vec2 d = vUv * 2.0 - 1.0;
  float r = length(d);
  if (r > 1.0) discard;

  // Лучи короны: по сути одномерная функция угла, поэтому двух октав хватает —
  // корона занимает весь экран, и каждая лишняя октава здесь стоит дороже,
  // чем на диске Солнца.
  float angle = atan(d.y, d.x);
  float rays = 0.72 + 0.28 * fbm(vec3(cos(angle) * 2.6, sin(angle) * 2.6, uTime * 0.02), 2);

  // Внешнее гало и плотное околодисковое свечение.
  float halo = pow(max(0.0, 1.0 - r), 3.5);
  float inner = exp(-r / max(uCoreRadius, 1e-3) * 1.9);

  float a = (halo * rays * 0.55 + inner * 0.85) * uIntensity;

  // Альфа единица: аддитивное смешивание (SrcAlpha, One) уже домножает вклад
  // на неё, и запись `a` дала бы квадрат яркости вместо линейной.
  gl_FragColor = vec4(uColor * a, 1.0);
}
