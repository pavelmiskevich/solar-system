/**
 * Умножение кадра на экспозицию — отдельный проход перед bloom.
 *
 * Так надо потому, что порог свечения у bloom задаётся в абсолютных единицах.
 * Если оставить экспозицию на откуп OutputPass (то есть применить её последней,
 * уже после bloom), то порог «ярче белого» перестаёт что-либо значить: у
 * внешних планет экспозиция вырастает в десятки раз, и любая мало-мальски
 * светлая точка кадра уходит за порог и заливает экран.
 *
 * С экспозицией перед bloom порог снова означает ровно то, что должен:
 * «ярче белого после экспозиции».
 *
 * Здесь же стоит потолок яркости. Он нужен из-за адаптации к темноте: когда
 * экспозиция раскрывается на ночную сторону Луны, тонкий освещённый серп
 * оказывается ярче нового «белого» в сотни раз, и bloom от него заливает весь
 * кадр. Потолок срезает эту нефизичную добавку, не трогая обычные виды: там
 * ярче дюжины не бывает ничего, кроме диска Солнца, который и так выжжен.
 */
export const ExposureShader = {
  name: 'ExposureShader',

  uniforms: {
    tDiffuse: { value: null },
    uExposure: { value: 1 },
    uCeiling: { value: 4 },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uExposure;
    uniform float uCeiling;
    varying vec2 vUv;

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      gl_FragColor = vec4(min(texel.rgb * uExposure, vec3(uCeiling)), texel.a);
    }
  `,
};
