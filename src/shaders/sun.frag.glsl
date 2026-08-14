uniform float uTime;
uniform float uIntensity;
uniform vec3 uCoolColor;
uniform vec3 uHotColor;

varying vec3 vObjectPosition;
varying vec3 vViewNormal;
varying vec3 vViewPosition;

void main() {
  // Косинус угла между нормалью и лучом зрения. У края диска стремится к нулю.
  vec3 viewDir = normalize(-vViewPosition);
  float mu = clamp(dot(normalize(vViewNormal), viewDir), 0.0, 1.0);

  // Потемнение к краю: наблюдаемый закон I(mu) = I0 * (1 - u * (1 - mu)).
  // В видимом диапазоне u ≈ 0.6, но при такой величине пересвеченный центр
  // читается как блик на глянцевом шаре, а не как диск Солнца. 0.48 сохраняет
  // объём и убирает ложный блик.
  float limb = 1.0 - 0.48 * (1.0 - mu);

  // Гранулы и супергрануляция — два масштаба конвекции, дрейфующие с разной скоростью.
  vec3 p = vObjectPosition;
  float granules = fbm(p * 26.0 + vec3(uTime * 0.035), 3);
  float supergranules = fbm(p * 6.0 - vec3(uTime * 0.012), 2);
  float texture = 0.62 * granules + 0.38 * supergranules;

  // Пятна: редкие глубокие провалы яркости в холодных областях.
  float spots = smoothstep(-0.34, -0.20, supergranules + 0.35 * granules);

  float heat = clamp(0.5 + 0.9 * texture, 0.0, 1.0);
  vec3 color = mix(uCoolColor, uHotColor, heat);

  float brightness = uIntensity * limb * (0.72 + 0.28 * heat) * mix(0.45, 1.0, spots);

  gl_FragColor = vec4(color * brightness, 1.0);
}
