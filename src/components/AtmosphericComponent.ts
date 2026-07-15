import { AtmosphericScatteringSky, AtmosphericScatteringSkySetting } from "../textures/AtmosphericScatteringSky";
import { Transform } from "./Transform";
import { SkyRenderer } from "./renderer/SkyRenderer";

class HistoryData {
    public rotateX: number;
    public rotateY: number;

    public sunX: number;
    public sunY: number;

    constructor() {
        this.reset();
    }

    public reset(): this {
        this.rotateX = this.rotateY = this.sunX = this.sunY = Number.MAX_VALUE;
        return this;
    }

    public isRotateChange(rx: number, ry: number): boolean {
        return Math.abs(this.rotateX - rx) >= 0.001 || Math.abs(this.rotateY - ry) >= 0.001;
    }

    public isSkyChange(x: number, y: number): boolean {
        return Math.abs(this.sunX - x) >= 0.001 || Math.abs(this.sunY - y) >= 0.001;
    }

    public save(x: number, y: number, rx: number, ry: number): this {
        this.sunX = x;
        this.sunY = y;
        this.rotateX = rx;
        this.rotateY = ry;

        return this;
    }
}

/**
 *
 * Atmospheric Sky Box Component
 * @group Components
 */
export class AtmosphericComponent extends SkyRenderer {

    private _atmosphericScatteringSky: AtmosphericScatteringSky;
    private _pendingSetting: AtmosphericScatteringSkySetting;
    private _onChange: boolean = true;
    private _relatedTransform: Transform;
    private _historyData: HistoryData;

    /** CPU-side setting object. Available pre-GPU: setters mutate this; the
     *  GPU sky consumes it on first render. */
    private get _setting(): AtmosphericScatteringSkySetting {
        return this._atmosphericScatteringSky?.setting ?? this._pendingSetting;
    }

    /** Horizontal sun position in normalized [0,1] sky coordinates. */
    public get sunX() { return this._setting.sunX; }
    public set sunX(value) {
        if (this._setting.sunX != value) { this._setting.sunX = value; this._onChange = true; }
    }

    /** Vertical sun position in normalized [0,1] sky coordinates. */
    public get sunY() { return this._setting.sunY; }
    public set sunY(value) {
        if (this._setting.sunY != value) { this._setting.sunY = value; this._onChange = true; }
    }

    /** Eye (viewer) altitude used by the atmospheric scattering model. */
    public get eyePos() { return this._setting.eyePos; }
    public set eyePos(value) {
        if (this._setting.eyePos != value) { this._setting.eyePos = value; this._onChange = true; }
    }

    /** Angular radius of the sun disc. */
    public get sunRadius() { return this._setting.sunRadius; }
    public set sunRadius(value) {
        if (this._setting.sunRadius != value) { this._setting.sunRadius = value; this._onChange = true; }
    }

    /** Radiance (intensity) of the sun. */
    public get sunRadiance() { return this._setting.sunRadiance; }
    public set sunRadiance(value) {
        if (this._setting.sunRadiance != value) { this._setting.sunRadiance = value; this._onChange = true; }
    }

    /** Overall brightness of the sun. */
    public get sunBrightness() { return this._setting.sunBrightness; }
    public set sunBrightness(value) {
        if (this._setting.sunBrightness != value) { this._setting.sunBrightness = value; this._onChange = true; }
    }

    /** Whether the sun disc is drawn in the sky. */
    public get displaySun() { return this._setting.displaySun; }
    public set displaySun(value) {
        if (this._setting.displaySun != value) { this._setting.displaySun = value; this._onChange = true; }
    }


    /** Initialize history tracking and the pending sky setting. */
    public init(): void {
        super.init();
        this._historyData = new HistoryData();
        this._pendingSetting = new AtmosphericScatteringSkySetting();
    }

    private _ensureSky(ctx?: import('../gfx/graphics/webGpu/Context3D').Context3D) {
        if (this._atmosphericScatteringSky) return;
        this._atmosphericScatteringSky = new AtmosphericScatteringSky(this._pendingSetting, ctx);
        let scene = this.transform.scene3D;
        this.map = this._atmosphericScatteringSky;
        scene.envMap = this._atmosphericScatteringSky;
    }

    /** Ensure the GPU sky exists, then run base startup. */
    public start(view?: any): void {
        const ctx = view?.engine3D?.context3D ?? this.transform?.view3D?.engine3D?.context3D;
        this._ensureSky(ctx);
        super.start();
    }

    /** Transform whose rotation is kept in sync with the sun direction. */
    public get relativeTransform() {
        return this._relatedTransform;
    }

    public set relativeTransform(value: Transform) {
        this._relatedTransform = value;
        this._historyData.reset();
    }

    /** Per-frame update: sync sun/transform rotation and re-bake the sky on change. */
    public onUpdate(view?: any) {
        const ctx = view?.engine3D?.context3D ?? this.transform?.view3D?.engine3D?.context3D;
        this._ensureSky(ctx);

        if (this._relatedTransform) {
            this._relatedTransform.rotationZ = 0;
            if (this._historyData.isRotateChange(this._relatedTransform.rotationX, this._relatedTransform.rotationY)) {
                this.sunX = (this._relatedTransform.rotationY + 90) / 360//
                this.sunY = this._relatedTransform.rotationX / 180 + 0.5;
            } else if (this._historyData.isSkyChange(this.sunX, this.sunY)) {
                this._relatedTransform.rotationY = this.sunX * 360 - 90;
                this._relatedTransform.rotationX = (this.sunY - 0.5) * 180;
            }
            this._historyData.save(this.sunX, this.sunY, this._relatedTransform.rotationX, this._relatedTransform.rotationY);
        }

        if (this._onChange && this._atmosphericScatteringSky) {
            this._onChange = false;
            this._atmosphericScatteringSky.apply();
        }

    }

    /** Destroy the component and release the GPU sky resources. */
    public destroy(force?: boolean): void {
        super.destroy(force);
        this._atmosphericScatteringSky?.destroy();
        this._atmosphericScatteringSky = null;
        this._onChange = null;
    }
}
