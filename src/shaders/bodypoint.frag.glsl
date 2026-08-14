#include <logdepthbuf_pars_fragment>

uniform vec3 uColor;
uniform float uBrightness;

varying vec2 vUv;

void main() {
  #include <logdepthbuf_fragment>

  vec2 d = vUv * 2.0 - 1.0;
  float r2 = dot(d, d);
  if (r2 > 1.0) discard;

  // Плотное ядро плюс слабое гало — так точка читается как светящееся тело,
  // а не как наклейка. Профиль тот же, что у звёзд, чтобы планета в общем
  // плане не выбивалась из неба чужой формой.
  float core = exp(-r2 * 4.5);
  float glow = pow(max(0.0, 1.0 - r2), 2.5) * 0.3;

  float a = (core + glow) * uBrightness;

  // Альфа единица: аддитивное смешивание уже домножает вклад на неё.
  gl_FragColor = vec4(uColor * a, 1.0);
}
