import { Color, ShaderMaterial, Vector2, Vector3, Vector4 } from 'three';

import { DEG, SOLAR_IRRADIANCE_SCALE } from '../core/units';
import type { Appearance, SurfaceSpot } from '../data/appearance';
import noiseGlsl from '../shaders/lib/noise.glsl?raw';
import cellularGlsl from '../shaders/lib/cellular.glsl?raw';
import ringsGlsl from '../shaders/lib/rings.glsl?raw';
import planetVert from '../shaders/planet.vert.glsl?raw';
import planetFrag from '../shaders/planet.frag.glsl?raw';
import { packBands } from './rings';

/**
 * Материал поверхности тела.
 *
 * Семейство поверхности выбирается через defines, а не ветвлением в шейдере: у
 * каждого тела свой материал, программ получается десяток, и ни один пиксель
 * не платит за код, который к нему не относится. Кратеры вообще компилируются
 * только у твёрдых тел — двадцать семь ячеек клеточного шума не должны даже
 * присутствовать в программе Юпитера.
 */

const FAMILY_DEFINE: Record<Appearance['family'], string> = {
  rocky: 'FAMILY_ROCKY',
  gas: 'FAMILY_GAS',
  earth: 'FAMILY_EARTH',
};

export interface PlanetMaterialOptions {
  appearance: Appearance;
  /** Экваториальный радиус, км. */
  radius: number;
  /** Полярный радиус, км. */
  polarRadius: number;
}

/**
 * Направление на центр пятна в системе координат тела.
 *
 * Ось вращения тела — y, нулевой меридиан смотрит вдоль x: те же соглашения,
 * что у геометрии сферы three и у широты в шейдере.
 */
export function spotDirection(spot: SurfaceSpot, out = new Vector3()): Vector3 {
  const lat = spot.latitude * DEG;
  const lon = spot.longitude * DEG;
  return out.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
}

export function createPlanetMaterial({
  appearance,
  radius,
  polarRadius,
}: PlanetMaterialOptions): ShaderMaterial {
  const spot = appearance.spot;
  const direction = spot ? spotDirection(spot) : new Vector3(1, 0, 0);

  const fragment = [
    noiseGlsl,
    appearance.family === 'rocky' ? cellularGlsl : '',
    appearance.rings ? ringsGlsl : '',
    planetFrag,
  ].join('\n');

  const defines: Record<string, string> = { [FAMILY_DEFINE[appearance.family]]: '' };
  if (appearance.rings) {
    defines.RING_SHADOW = '';
    defines.RING_BANDS = String(appearance.rings.bands.length);
  }

  return new ShaderMaterial({
    vertexShader: planetVert,
    fragmentShader: fragment,
    defines,
    uniforms: {
      ...(appearance.rings
        ? {
            uSunBodyDirection: { value: new Vector3(1, 0, 0) },
            uTrueEquatorial: { value: radius },
            uTruePolar: { value: polarRadius },
            uRingInner: { value: appearance.rings.inner },
            uRingOuter: { value: appearance.rings.outer },
            uRingBands: { value: packBands(appearance.rings.bands) },
            uRingletStrength: { value: appearance.rings.ringlets },
          }
        : {}),
      uInvScaleSq: { value: invScaleSquared(radius, polarRadius) },
      uSunPosition: { value: new Vector3() },
      uIrradianceScale: { value: SOLAR_IRRADIANCE_SCALE },
      uSecondPosition: { value: new Vector3() },
      uSecondColor: { value: new Color(1, 1, 1) },
      uSecondStrength: { value: 0 },

      uBase: { value: new Color(appearance.base) },
      uAccent: { value: new Color(appearance.accent) },
      uHighlight: { value: new Color(appearance.highlight) },
      uCapColor: { value: new Color(appearance.capColor) },
      uAtmosphereColor: { value: new Color(appearance.atmosphereColor) },
      uSpotColor: { value: new Color(spot?.color ?? 0xffffff) },

      uDetail: { value: appearance.detail },
      uContrast: { value: appearance.contrast },
      uCapLatitude: { value: appearance.capLatitude },
      uCraters: { value: appearance.craters },
      uAtmosphere: { value: appearance.atmosphere },
      uSpecular: { value: appearance.specular },
      uBumpScale: { value: radius * appearance.relief },
      uTime: { value: 0 },

      uSpot: { value: new Vector4(direction.x, direction.y, direction.z, (spot?.radius ?? 0) * DEG) },
      uSpotShape: { value: new Vector2(spot?.aspect ?? 1, spot?.strength ?? 0) },
    },
  });
}

/**
 * Обратный квадрат масштаба по осям — им нормаль эллипсоида приводится к
 * настоящей. Полярное сжатие Сатурна десять процентов, и без поправки
 * терминатор проходит не там, где должен.
 */
function invScaleSquared(radius: number, polarRadius: number, out = new Vector3()): Vector3 {
  return out.set(1 / (radius * radius), 1 / (polarRadius * polarRadius), 1 / (radius * radius));
}

/** Пересчитать масштабные величины после смены множителя размера тел. */
export function updatePlanetScale(
  material: ShaderMaterial,
  radius: number,
  polarRadius: number,
  relief: number,
): void {
  invScaleSquared(radius, polarRadius, material.uniforms.uInvScaleSq!.value as Vector3);
  material.uniforms.uBumpScale!.value = radius * relief;
}
