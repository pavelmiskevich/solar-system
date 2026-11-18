import {
  ACESFilmicToneMapping,
  HalfFloatType,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { ExposureShader } from '../shaders/exposure.pass';

/**
 * Ближняя плоскость - один метр: с ней можно подлететь к поверхности вплотную.
 * Дальняя - 1e13 км, дальше звёздной сферы. Такой диапазон возможен только
 * благодаря логарифмическому буферу глубины; с обычным буфером кольца Сатурна
 * начали бы резаться о фон уже на подлёте.
 */
const NEAR = 1e-3;
const FAR = 1e13;

/**
 * Сколько сэмплов сглаживания брать при данной плотности пикселей.
 *
 * Сглаживать надо там, где сцена рисуется, - в буфере композитора: до канваса
 * доходит только последний полноэкранный квадрат, и сглаживание канваса ему
 * ничего не даёт. Геометрия сцены почти сплошь окружности - диски, кольца,
 * лимбы, - и без сглаживания их край идёт лесенкой.
 *
 * Буферов у композитора два, и сцена попадает то в один, то в другой, поэтому
 * сэмплы берут оба. Цена - видеопамять: четыре сэмпла цвета half-float и
 * четыре глубины на каждый пиксель обоих буферов. На экране 1920x1080 при
 * плотности 1 буферы композитора занимают около 230 МБ вместо 50 без
 * сглаживания, на 2560x1440 при плотности 2 заняли бы больше полутора
 * гигабайт. А лесенку при плотности 2 и так почти не видно: пиксель вдвое
 * мельче. Поэтому выше полутора сглаживание не берётся вовсе.
 */
export function msaaSamples(pixelRatio: number): number {
  return pixelRatio < 1.5 ? 4 : 0;
}

/**
 * Программный ли это рендерер - по его имени.
 *
 * Без видеокарты (или с драйвером из чёрного списка) браузер рисует WebGL
 * процессором: Chrome - через SwiftShader, Firefox и Linux - через llvmpipe.
 * Там четыре сэмпла сглаживания роняли кадр до одного-пяти в секунду, и
 * адаптивное качество снимало их лишь через несколько секунд почти стоящей
 * сцены. В том же положении и CI: сквозные тесты идут на SwiftShader.
 */
export function isSoftwareRenderer(name: string): boolean {
  return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
}

export interface ViewportOptions {
  container: HTMLElement;
  fov?: number;
}

export class Viewport {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;

  /** Базовый угол обзора; варп-перелёт временно раздвигает его от этого значения. */
  baseFov: number;

  private readonly renderPass: RenderPass;
  private readonly exposurePass: ShaderPass;
  private readonly outputPass: OutputPass;
  private bloomEnabled = true;
  private msaaEnabled = true;
  private resolutionScale = 1;

  constructor({ container, fov = 55 }: ViewportOptions) {
    this.baseFov = fov;

    this.renderer = new WebGLRenderer({
      // Канвас не сглаживается: сцена рисуется не в него, а в буфер
      // композитора, и сглаживание взято там (см. msaaSamples). Здесь оно
      // только занимало бы видеопамять под буфер, который никто не читает.
      antialias: false,
      powerPreference: 'high-performance',
      logarithmicDepthBuffer: true,
      stencil: false,
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    // Экспозиция применяется отдельным проходом до bloom, поэтому здесь она
    // остаётся единицей - иначе она подействовала бы дважды.
    this.renderer.toneMappingExposure = 1;
    this.renderer.setClearColor(0x000000, 1);
    container.appendChild(this.renderer.domElement);

    this.camera = new PerspectiveCamera(fov, 1, NEAR, FAR);

    // Свой буфер вместо того, что композитор сделал бы сам: тот без сэмплов.
    // Тип тот же, half-float, - экспозиция и bloom работают с яркостью выше
    // единицы. Размер и число сэмплов выставит resize.
    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
    target.texture.name = 'EffectComposer.rt1';
    this.composer = new EffectComposer(this.renderer, target);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    this.exposurePass = new ShaderPass(ExposureShader);
    this.composer.addPass(this.exposurePass);

    /*
     * strength / radius / threshold.
     *
     * Порог заметно выше единицы, а радиус мал. Причина - адаптация экспозиции
     * к темноте: раскрывшись на пепельный свет, она поднимает над «белым»
     * тысячи мелких деталей вроде освещённых валов кратеров, и широкий мягкий
     * bloom с низким порогом заливал ими весь кадр. С этими числами светится
     * то, ради чего свечение и заводилось: диск Солнца, серп на терминаторе,
     * лимб плотной атмосферы.
     */
    this.bloom = new UnrealBloomPass(new Vector2(1, 1), 0.7, 0.4, 1.15);
    this.composer.addPass(this.bloom);

    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);

    this.resize();
    window.addEventListener('resize', this.resize);
  }

  /** Плотность пикселей: 2 - потолок, выше неё разницы не видно, а цена квадратичная. */
  private get pixelRatio(): number {
    return Math.min(window.devicePixelRatio, 2) * this.resolutionScale;
  }

  readonly resize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;

    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h);
    this.setSamples(this.msaaEnabled ? msaaSamples(this.pixelRatio) : 0);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(w, h);
    this.bloom.setSize(w / 2, h / 2);

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  /**
   * Число сэмплов в обоих буферах композитора.
   *
   * Сэмплы - свойство буфера, заданное при его создании в GL, поэтому смена
   * числа сопровождается dispose: three пересоздаст буфер при следующей
   * отрисовке, уже с новым числом. Меняется оно редко - когда окно ушло на
   * экран с другой плотностью или качество срезало разрешение.
   */
  private setSamples(samples: number): void {
    for (const target of [this.composer.renderTarget1, this.composer.renderTarget2]) {
      if (target.samples === samples) continue;
      target.samples = samples;
      target.dispose();
    }
  }

  /** Экспозиция «глаза». Физику освещения не трогает, см. lighting/exposure.ts. */
  set exposure(value: number) {
    this.exposurePass.uniforms.uExposure!.value = value;
  }

  get exposure(): number {
    return this.exposurePass.uniforms.uExposure!.value as number;
  }

  setBloomEnabled(enabled: boolean): void {
    if (enabled === this.bloomEnabled) return;
    this.bloomEnabled = enabled;
    this.bloom.enabled = enabled;
  }

  /**
   * Рисует ли браузер без видеокарты.
   *
   * Имя рендерера Chrome прячет за общим «WebKit WebGL» и отдаёт настоящее
   * через расширение; Firefox сразу пишет обезличенное, но честное имя, а
   * расширение у него устарело и сыплет предупреждением в консоль. Поэтому
   * расширение спрашивается только тогда, когда имя спрятано.
   */
  get softwareRendered(): boolean {
    const gl = this.renderer.getContext();
    let name = String(gl.getParameter(gl.RENDERER) ?? '');
    if (/^webkit webgl$/i.test(name)) {
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      if (info) name = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? '');
    }
    return isSoftwareRenderer(name);
  }

  /**
   * Включить или снять сглаживание: адаптивное качество снимает его первым.
   *
   * Просадку в программном растеризаторе оно делало четырёхкратной, и на
   * слабой видеокарте его цена тоже заметна, а потеря почти не видна.
   */
  setMsaaEnabled(enabled: boolean): void {
    if (enabled === this.msaaEnabled) return;
    this.msaaEnabled = enabled;
    this.setSamples(enabled ? msaaSamples(this.pixelRatio) : 0);
  }

  /** Понизить внутреннее разрешение композитора - первая ступень после отключения bloom. */
  setResolutionScale(scale: number): void {
    if (Math.abs(scale - this.resolutionScale) < 0.01) return;
    this.resolutionScale = scale;
    this.resize();
  }

  render(): void {
    this.composer.render();
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.composer.dispose();
    this.renderer.dispose();
  }
}
