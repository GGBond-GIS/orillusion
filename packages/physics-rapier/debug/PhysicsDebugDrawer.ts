import { Vector3, Color } from '@orillusion/core';
import { Physics } from '../Physics';

export interface DebugDrawerOptions {
    enable?: boolean;
    /** Draw every N frames. Default 1 = every frame. */
    updateFreq?: number;
    /** Hard cap on rendered segments to prevent UI freeze on huge scenes. */
    maxLineCount?: number;
}

/**
 * Visualize the physics world via `world.debugRender()`. Wraps the
 * `Graphic3D` line renderer.
 *
 * Mirrors `@orillusion/physics`'s `PhysicsDebugDrawer` shape, but uses Rapier's
 * built-in debug renderer (returns line buffer + color buffer in one call).
 *
 * @example
 * ```ts
 * const g = new Graphic3D();
 * scene.addChild(g);
 * Physics.initDebugDrawer(g);
 * ```
 */
export class PhysicsDebugDrawer {
    private _enable: boolean;
    private _frameCount: number = 0;
    private _drawnUuids: string[] = [];

    /** A `Graphic3D` instance (typed loosely so this package doesn't hard-depend on `@orillusion/graphic`). */
    public graphic3D: any;
    public updateFreq: number;
    public maxLineCount: number;

    private readonly _tmpA = new Vector3();
    private readonly _tmpB = new Vector3();

    constructor(graphic3D: any, options: DebugDrawerOptions = {}) {
        if (!graphic3D) throw new Error('PhysicsDebugDrawer: requires a Graphic3D-like object.');
        this.graphic3D = graphic3D;
        this._enable = options.enable ?? true;
        this.updateFreq = options.updateFreq ?? 1;
        this.maxLineCount = options.maxLineCount ?? 25000;
    }

    public set enable(value: boolean) {
        this._enable = value;
        if (!value) this._clearLines();
    }
    public get enable(): boolean { return this._enable; }

    /** Called once per frame from `Physics.update`. */
    public update(): void {
        if (!this._enable) return;
        if (++this._frameCount % this.updateFreq !== 0) return;

        this._clearLines();
        const buffers = Physics.world.debugRender();
        const verts = buffers.vertices;
        const colors = buffers.colors;

        const segs = Math.min(verts.length / 6, this.maxLineCount);
        for (let i = 0; i < segs; i++) {
            const v = i * 6;
            this._tmpA.set(verts[v], verts[v + 1], verts[v + 2]);
            this._tmpB.set(verts[v + 3], verts[v + 4], verts[v + 5]);

            const c = i * 8;
            const color = new Color(colors[c], colors[c + 1], colors[c + 2], colors[c + 3]);

            const uuid = `RapierDebug_${i}`;
            this._drawnUuids.push(uuid);
            this.graphic3D.drawLines(uuid, [this._tmpA.clone(), this._tmpB.clone()], color);
        }
    }

    private _clearLines(): void {
        for (const uuid of this._drawnUuids) this.graphic3D.Clear?.(uuid);
        this._drawnUuids.length = 0;
    }
}
