import {
  ACESFilmicToneMapping,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { ExposureShader } from '../shaders/exposure.pass';

/**
 * Ближняя плоскость — один метр: с ней можно подлететь к поверхности вплотную.
 * Дальняя — 1e13 км, дальше звёздной сферы. Такой диапазон возможен только
 * благодаря логарифмическому буферу глубины; с обычным буфером кольца Сатурна
 * начали бы резаться о фон уже на подлёте.
 */
const NEAR = 1e-3;
const FAR = 1e13;

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
  private resolutionScale = 1;

  constructor({ container, fov = 55 }: ViewportOptions) {
    this.baseFov = fov;

    this.renderer = new WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      logarithmicDepthBuffer: true,
      stencil: false,
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    // Экспозиция применяется отдельным проходом до bloom, поэтому здесь она
    // остаётся единицей — иначе она подействовала бы дважды.
    this.renderer.toneMappingExposure = 1;
    this.renderer.setClearColor(0x000000, 1);
    container.appendChild(this.renderer.domElement);

    this.camera = new PerspectiveCamera(fov, 1, NEAR, FAR);

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    this.exposurePass = new ShaderPass(ExposureShader);
    this.composer.addPass(this.exposurePass);

    /*
     * strength / radius / threshold.
     *
     * Порог заметно выше единицы, а радиус мал. Причина — адаптация экспозиции
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

  /** Плотность пикселей: 2 — потолок, выше неё разницы не видно, а цена квадратичная. */
  private get pixelRatio(): number {
    return Math.min(window.devicePixelRatio, 2) * this.resolutionScale;
  }

  readonly resize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;

    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(w, h);
    this.bloom.setSize(w / 2, h / 2);

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

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

  /** Понизить внутреннее разрешение композитора — первая ступень после отключения bloom. */
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
