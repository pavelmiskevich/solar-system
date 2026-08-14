import type { Object3D } from 'three';
import { Vector3 } from 'three';

/**
 * Плавающее начало координат.
 *
 * Мировые позиции тел живут в Float64 (обычные Vector3 — их x/y/z это обычные
 * числа JS). В сцену three.js мы кладём не их, а разность «мировая позиция
 * минус позиция камеры», так что камера всегда сидит в (0,0,0).
 *
 * Зачем, если three.js и так считает modelViewMatrix на CPU в Float64:
 *
 *  1. Uniform `cameraPosition` в шейдерах — Float32. На орбите Нептуна
 *     (4.5e9 км) шаг Float32 составляет уже ~300 км, и любой шейдер, который
 *     считает направление взгляда как `cameraPosition - worldPosition`,
 *     получает мусор. Атмосферный rim-scattering и блики на кольцах ломаются
 *     первыми. С плавающим началом координат этот uniform всегда около нуля.
 *
 *  2. Матрица `modelMatrix` (мировая, не view) тоже уходит в шейдер как
 *     Float32 — и по той же причине непригодна вдали от центра сцены.
 *
 * Практическое следствие для остального кода: в кастомных шейдерах мировое
 * пространство — это пространство, где камера в нуле. Пересчитывать вручную
 * ничего не нужно, но и полагаться на «абсолютные» координаты в шейдере тоже.
 */
export class FloatingOrigin {
  /** Мировая точка (км), которая рендерится как (0,0,0). */
  readonly origin = new Vector3();

  private readonly entries: { object: Object3D; worldPosition: Vector3 }[] = [];

  /**
   * Связать объект сцены с его мировой позицией. Vector3 захватывается по
   * ссылке: симуляция пишет в него новые координаты, `apply()` переносит их
   * в сцену.
   */
  track(object: Object3D, worldPosition: Vector3): void {
    this.entries.push({ object, worldPosition });
  }

  untrack(object: Object3D): void {
    const i = this.entries.findIndex((e) => e.object === object);
    if (i >= 0) this.entries.splice(i, 1);
  }

  /** Задать новое начало координат — обычно мировую позицию камеры. */
  setOrigin(worldPosition: Vector3): void {
    this.origin.copy(worldPosition);
  }

  /** Перенести все отслеживаемые объекты в координаты относительно начала. */
  apply(): void {
    const { origin } = this;
    for (const { object, worldPosition } of this.entries) {
      object.position.set(
        worldPosition.x - origin.x,
        worldPosition.y - origin.y,
        worldPosition.z - origin.z,
      );
    }
  }

  /** Мировые координаты → координаты сцены. */
  toRender(worldPosition: Vector3, out = new Vector3()): Vector3 {
    return out.copy(worldPosition).sub(this.origin);
  }

  /** Координаты сцены → мировые координаты. */
  toWorld(renderPosition: Vector3, out = new Vector3()): Vector3 {
    return out.copy(renderPosition).add(this.origin);
  }
}
