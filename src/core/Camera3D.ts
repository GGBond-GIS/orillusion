import { ComponentBase } from '../components/ComponentBase';
import { HaltonSeq } from '../math/HaltonSeq';
import { MathUtil } from '../math/MathUtil';
import { Matrix4, matrixMultiply } from '../math/Matrix4';
import { Ray } from '../math/Ray';
import { Rect } from '../math/Rect';
import { Vector2 } from '../math/Vector2';
import { Vector3 } from '../math/Vector3';
import { CameraUtil } from '../util/CameraUtil';
import { Frustum } from './bound/Frustum';
import { CameraType } from './CameraType';
import { Context3D } from '../gfx/graphics/webGpu/Context3D';
import { CResizeEvent } from '../event/CResizeEvent';
import { ILight } from '../components/lights/ILight';
import { VisibleLayer } from '../gfx/renderJob/config/VisibleLayer';

/**
 * Camera components
 * @group Core
 */
export class Camera3D extends ComponentBase {

    /**
     * The primary camera used for rendering the main view.
     */
    public static mainCamera: Camera3D;

    /**
     * The graphics context this camera is bound to. Used for multi-engine
     * setups; `null` until the camera is bound to a {@link Context3D}.
     */
    public _boundCtx: Context3D | null = null;

    /**
     * camera Perspective
     */
    public fov: number = 60;

    /**
     * camera use name
     */
    public name: string;

    /**
     * Viewport width and height Scale
     */
    public aspect: number = 1;

    /**
     * camera near plane
     */
    public near: number = 1;

    /**
     * camera far plane
     */
    public far: number = 5000;

    /**
     * orth camera right plane
     */
    public left: number = -100;

    /**
     * orth camera left plane
     */
    public right: number = 100;

    /**
     * orth camera top plane
     */
    public top: number = 100;

    /**
     * orth camera bottom plane
     */
    public bottom: number = -100;

    /**
     * orth view size
     */
    public frustumSize: number = 0;

    /**
     * orth view depth range
     */
    public frustumDepth: number = 0;

    /**
     * camera view port size
     */
    public viewPort: Rect = new Rect();

    /**
     * camera frustum
     */
    public frustum: Frustum;

    // public sh_bak: Float32Array = new Float32Array([
    //     2.485296, 2.52417, 2.683965, 3.544894,
    //     0.2323964, 0.1813751, 0.08516902, -4.860471E-05,
    //     -0.2744142, -0.04131086, 0.2248164, -0.005996059,
    //     0.1551732, 0.137717, 0.1002693, -0.0006728604,
    //     0.2209381, 0.2109673, 0.1770538, -1.395991E-05,
    //     0.3529238, 0.2824739, 0.1817433, -0.0005164869,
    //     -0.1344275, -0.1289607, -0.1347626, 7.825881E-06,
    //     0.2125785, 0.1779549, 0.124602, 0.000503074,
    //     -0.1039777, -0.09676537, -0.07681116, -0.0004372867,
    // ]);

    /**
     * Spherical-harmonics coefficients of the ambient/diffuse environment lighting.
     */
    public sh: Float32Array = new Float32Array(36);

    /**
     * this camera is shadow camera
     */
    public isShadowCamera: boolean = false;

    /**
     * The light this camera renders the shadow map for, when it is a shadow camera.
     */
    public shadowLight?: ILight;

    /**
     * Layer-mask of layers this camera should see. Combined at pass
     * execute time with `node.visibleLayer` and the active pass's
     * `layerMask` via bitwise AND:
     *
     *     (node.visibleLayer & pass.layerMask & camera.cullingMask) !== 0
     *
     * Defaults to {@link VisibleLayer.All} so untouched cameras keep
     * the historical "see everything" behaviour. Sub-cameras
     * (minimaps, reflection probes, picking-only views) can clear
     * specific bits to suppress unwanted layers.
     *
     * Camera-side filtering is layered on top of pass-side filtering:
     * a layer must clear both masks AND the node's own membership to
     * be drawn.
     */
    public cullingMask: number = VisibleLayer.All;

    /**
   * @internal
   */
    private _projectionMatrixInv: Matrix4 = new Matrix4();
    private _projectionMatrix: Matrix4 = new Matrix4();
    private _viewMatrix: Matrix4 = new Matrix4();
    private _viewMatrixInv: Matrix4 = new Matrix4();
    private _unprojection: Matrix4 = new Matrix4();
    private _pvMatrixInv: Matrix4 = new Matrix4();
    private _pvMatrix: Matrix4 = new Matrix4();
    private _halfw: number;
    private _halfh: number;
    private _ray: Ray;

    /**
     * @internal
     */
    public get projectionMatrix() {
        return this._projectionMatrix;
    }


    /**
     * camera look at from where point
     */
    public lookTarget: Vector3;

    /**
     * camera type 
     */
    public type: CameraType = CameraType.perspective;

    constructor() {
        super();        
    }

    public init() {
        super.init();
        this._ray = new Ray();
        this.frustum = new Frustum();
        this.lookTarget = new Vector3(0, 0, 0);

        let ctx = this._deriveCtx();
        if (ctx) {
            this._bindToCtx(ctx);
        }
        this.updateProjection();
    }

    private _deriveCtx(): Context3D | null {
        return this._boundCtx ?? this.transform?.view3D?.engine3D?.context3D ?? null;
    }

    private _resizeListenerAttached: boolean = false;
    private _bindToCtx(ctx: Context3D) {
        this._boundCtx = ctx;
        this.viewPort.x = 0;
        this.viewPort.y = 0;
        this.viewPort.w = ctx.presentationSize[0];
        this.viewPort.h = ctx.presentationSize[1];
        if (!this._resizeListenerAttached) {
            ctx.addEventListener(CResizeEvent.RESIZE, this.updateProjection, this);
            this._resizeListenerAttached = true;
        }
    }

    public updateProjection() {
        let ctx = this._deriveCtx();
        if (ctx) {
            if (!this._resizeListenerAttached) this._bindToCtx(ctx);
            this.aspect = ctx.aspect;
        }
        if (this.type == CameraType.perspective) {
            this.perspective(this.fov, this.aspect, this.near, this.far);
        }else if(this.type == CameraType.ortho) {
            if(this.frustumSize && this.frustumDepth)
                this.ortho(this.frustumSize, this.frustumDepth);
            else if(this.frustumSize)
                this.ortho2(this.frustumSize, this.near, this.far);
            else
                this.orthoOffCenter(this.left, this.right, this.bottom, this.top, this.near, this.far);
        }  
    }

    /**
     * Compute a legacy auto shadow-bias baseline for the given depth texture size.
     *
     * Legacy auto baseline used by DDGI / GodRay compute paths.
     * Real-time shadow now derives bias per-light via ShadowBiasCalculator.
     * @param depthTexSize the side length of the shadow depth texture
     * @returns the computed shadow bias
     */
    public getShadowBias(depthTexSize: number): number {
        let sizeOnePixel = 2.0 * this.getShadowWorldExtents() / depthTexSize;
        let depth = Math.max(this.far - this.near, 1e-6);
        return (sizeOnePixel * 1.5) / depth;
    }

    /**
     * Get the rounded world-space extent of the camera frustum, used to scale shadow bias.
     * @returns the world-space extent value
     */
    public getShadowWorldExtents(): number {
        return Math.round(0.05 * this.frustum.boundingBox.extents.length);
    }


    /**
     * Create a perspective camera
     * @param fov 
     * @param aspect 
     * @param near  
     * @param far 
     */
    public perspective(fov: number, aspect: number, near: number, far: number) {
        this.fov = fov;
        this.aspect = aspect;
        this.near = Math.max(0.001, near);
        this.far = far;
        this._projectionMatrix.perspective(this.fov, this.aspect, this.near, this.far);
        this.type = CameraType.perspective;

        this._captureJitterBase();
    }

    /**
     * set an orthographic camera with a frustumSize(viewHeight) and frustumSizeDepth
     * @param frustumSize the frustum view height
     * @param frustumSizeDepth the frustum view depth
     */
    public ortho(frustumSize: number, frustumDepth: number) {
        this.frustumSize = frustumSize;
        this.frustumDepth = frustumDepth;
        
        let w = frustumSize * this.aspect;
        let h = frustumSize;
        let left = -w / 2;
        let right = w / 2;
        let top = h / 2;
        let bottom = -h / 2;

        let dis = Vector3.distance(this.object3D.localPosition, this.lookTarget)
        let near = dis - frustumDepth
        let far = dis + frustumDepth

        this.orthoOffCenter(left, right, bottom, top, near, far);
    }
    /**
     * set an orthographic camera with a frustumSize(viewHeight) and specific near & far
     * @param frustumSize the frustum view height
     * @param near camera near plane
     * @param far camera far plane
     */
    public ortho2(frustumSize: number, near: number, far: number) {
        this.frustumSize = frustumSize;
        let w = frustumSize * this.aspect;
        let h = frustumSize;
        let left = -w / 2;
        let right = w / 2;
        let top = h / 2;
        let bottom = -h / 2;

        this.orthoOffCenter(left, right, bottom, top, near, far);
    }
    
    /**
     * set an orthographic camera with specified frustum space
     * @param left camera left plane
     * @param right camera right plane
     * @param bottom camera bottom plane
     * @param top camera top plane
     * @param near camera near plane
     * @param far camera far plane
     */
    public orthoOffCenter(left: number, right: number, bottom: number, top: number, near: number, far: number){
        this.near = near;
        this.far = far;
        this.left = left;
        this.right = right;
        this.top = top;
        this.bottom = bottom;
        this.type = CameraType.ortho;
        this._projectionMatrix.orthoOffCenter(this.left, this.right, this.bottom, this.top, this.near, this.far);

        this._captureJitterBase();
    }

    /**
     *
     * view invert matrix
     */
    public get viewMatrix(): Matrix4 {
        this._viewMatrix.copy(this.transform.worldMatrix);
        this._viewMatrix.invert();
        return this._viewMatrix;
    }

    /**
     *
     * shadow camera view invert matrix
     */
    public get shadowViewMatrix(): Matrix4 {
        this._viewMatrix.copy(this.transform.worldMatrix);
        this._viewMatrix.appendScale(1, 1.0, 1.0);
        this._viewMatrix.invert();
        return this._viewMatrix;
    }

    /**
     * world space object to screen 
     * @param n world space
     * @param target Creating an orthogonal camera with 2D screen coordinates that default to null will return a new object
     */
    public object3DToScreenRay(n: Vector3, target: Vector3 = null): Vector3 {
        if (!target) {
            target = new Vector3(0, 0, 0, 1);
        }
        this._halfw = this.viewPort.width * 0.5;
        this._halfh = this.viewPort.height * 0.5;

        MathUtil.transformVector(this.viewMatrix, n, target);
        this.project(target, target);

        target.x = this._halfw + target.x * this._halfw;
        target.y = this.viewPort.height - (this._halfh - target.y * this._halfh);
        return target;
    }

    /**
     * Convert 2D screen coordinates to 3D coordinates as world space
     * @param n 2D screen coordinates
     * @param target 3D coordinates as world space
     */
    public screenRayToObject3D(n: Vector3, target: Vector3 = null): Vector3 {
        if (!target) {
            target = new Vector3();
        }
        this._halfw = this.viewPort.width * 0.5;
        this._halfh = this.viewPort.height * 0.5;

        let fScreenPtX = n.x;
        let fScreenPtY = n.y;
        target.x = fScreenPtX / this.viewPort.width - 0.25;
        target.y = fScreenPtY / this.viewPort.height - 0.25;

        this.unProject(target.x, target.y, n.z, target);
        return target;
    }

    /**
     * get project * view matrix
     */
    public get pvMatrix(): Matrix4 {
        matrixMultiply(this._projectionMatrix, this.viewMatrix, this._pvMatrix);
        return this._pvMatrix;
    }

    /**
     * get the inverse of (projection * world) matrix
     */
    public get pvMatrix2(): Matrix4 {
        matrixMultiply(this._projectionMatrix, this.transform.worldMatrix, this._pvMatrix);
        let matrix = this._pvMatrixInv.copy(this.pvMatrix);
        matrix.invert();
        return matrix;
    }

    /**
     * get (project * view) invert matrix
     */
    public get pvMatrixInv(): Matrix4 {
        let matrix = this._pvMatrixInv.copy(this.pvMatrix);
        matrix.invert();
        return matrix;
    }

    /**
     * get the inverse of the view matrix
     */
    public get vMatrixInv(): Matrix4 {
        let matrix = this._viewMatrixInv.copy(this.viewMatrix);
        matrix.invert();
        return matrix;
    }

    /**
     * get the matrix transforming camera/clip space back to world space
     */
    public get cameraToWorld(): Matrix4 {
        let cameraToWorld = Matrix4.helpMatrix;
        cameraToWorld.identity();
        cameraToWorld.copy(this.projectionMatrixInv);
        cameraToWorld.multiply(this.vMatrixInv);
        return cameraToWorld;
    }

    /**
     * get the matrix transforming NDC space to view space (inverse projection)
     */
    public get ndcToView(): Matrix4 {
        let cameraToWorld = Matrix4.helpMatrix;
        cameraToWorld.identity();
        cameraToWorld.copy(this.projectionMatrixInv);
        return cameraToWorld;
    }

    /**
     * get project invert matrix
     */
    public get projectionMatrixInv(): Matrix4 {
        this._projectionMatrixInv.copy(this._projectionMatrix);
        this._projectionMatrixInv.invert();
        return this._projectionMatrixInv;
    }

    /**
     * Enter a 3D coordinate point to obtain the projected coordinate point
     * @param nX 3D x
     * @param nY 3D y
     * @param sZ 3D z
     * @param target The projected coordinate point can be empty
     * @returns Coordinates after projection
     */
    public unProject(nX: number, nY: number, sZ: number, target?: Vector3): Vector3 {
        if (!target) target = new Vector3();
        target.x = nX;
        target.y = -nY;
        target.z = sZ;
        target.w = 1.0;

        target.x *= sZ;
        target.y *= sZ;

        this._unprojection.copy(this._projectionMatrix);
        this._unprojection.invert();

        MathUtil.transformVector(this._unprojection, target, target);
        target.z = sZ;

        return target;
    }

    /**
     * Enter the projected coordinate points to obtain a 3D coordinate point.
     * @param n Coordinate points after photography
     * @param target 3D coordinate points
     * @returns 3D coordinate points
     */
    private project(n: Vector3, target: Vector3): Vector3 {
        this._projectionMatrix.perspectiveMultiplyPoint3(n, target);
        target.x = target.x / target.w;
        target.y = -target.y / target.w;
        target.z = n.z;
        return target;
    }

    /**
     * Enter the 2D coordinates of the screen to obtain a ray that starts from the camera position and passes through the corresponding 3D position of the screen.
     * @param viewPortPosX Screen x coordinate
     * @param viewPortPosY Screen y coordinate
     * @returns ray
     */
    public screenPointToRay(viewPortPosX: number, viewPortPosY: number): Ray {
        let ray: Ray = this._ray;

        let start = CameraUtil.UnProjection(viewPortPosX, viewPortPosY, 0.01, this);
        let end = CameraUtil.UnProjection(viewPortPosX, viewPortPosY, 1.0, this);
        end = end.sub(start).normalize();

        ray.origin.copy(start);
        // ray.dir.copy(end);
        ray.direction = end;

        return ray;
    }

    /**
     * Convert screen coordinates to world coordinates
     * @param viewPortPosX Screen x coordinate
     * @param viewPortPosY Screen y coordinate
     * @param z Screen z coordinate
     * @returns World coordinates
     */
    public screenPointToWorld(viewPortPosX: number, viewPortPosY: number, z: number): Vector3 {
        let pos = CameraUtil.UnProjection(viewPortPosX, viewPortPosY, z, this);
        return pos;
    }

    /**
     * Convert world coordinates to screen coordinates
     * @param viewPortPosX Screen x coordinate
     * @param viewPortPosY Screen y coordinate
     * @param z Screen z coordinate
     * @returns World coordinates
     */
    public worldToScreenPoint(point: Vector3, target?: Vector3): Vector3 {
        let pos = CameraUtil.Projection(point, this, target);
        return pos;
    }

    /**
     * Current object's gaze position (global) (modified by its own global transformation)
     * @param pos Own position (global)
     * @param target Location of the target (global)
     * @param up Upward direction
     */
    public lookAt(pos: Vector3, target: Vector3, up: Vector3 = Vector3.Y_AXIS) {
        this.transform.lookAt(pos, target, up);
        if (target) this.lookTarget.copy(target);
    }

    /**
     * @internal
     */
    public onUpdate() {
        if (this._useJitterProjection) {
            this.getJitteredProjectionMatrix();
        }
        this.frustum.update(this.pvMatrix);
        this.frustum.updateBoundBox(this.pvMatrixInv);
        // CSM update moved to DirectLight.onUpdate (see 0.9 refactor)
    }

    // for jitter projection
    private _haltonSeq: HaltonSeq;
    private _jitterOffsetList: Vector2[];
    private _useJitterProjection: boolean = false;
    private _jitterFrameIndex: number = 0;
    private _sampleIndex: number = 0;
    private _jitterX: number = 0;
    private _jitterY: number = 0;
    private _jitterOffsetX: number;
    private _jitterOffsetY: number;

    /**
     * get the current TAA jitter frame index
     */
    public get jitterFrameIndex() {
        return this._jitterFrameIndex;
    }

    /**
     * get the current frame's TAA jitter offset on the X axis (in NDC)
     */
    public get jitterX(): number {
        return this._jitterX;
    }

    /**
     * get the current frame's TAA jitter offset on the Y axis (in NDC)
     */
    public get jitterY(): number {
        return this._jitterY;
    }

    /**
     * Enable or disable TAA jitter on the projection matrix.
     * @param value whether jitter projection should be applied each frame
     */
    public enableJitterProjection(value: boolean) {
        this._jitterFrameIndex = 0;
        this._useJitterProjection = value;
        this._haltonSeq ||= new HaltonSeq();
        this._jitterOffsetList = [];
        for (let i = 0; i < 32; i++) {
            let offset = this.generateRandomOffset();
            this._jitterOffsetList.push(offset);
        }
        this._jitterOffsetList.reverse();
        // Capture the un-jittered baseline of the projection-matrix slot
        // we'll be writing into. TAAPost typically calls enable AFTER
        // perspective()/ortho2() has built the matrix, so the captures
        // inside those functions were a no-op (the flag was still
        // false). Capturing here makes either call order work.
        this._captureJitterBase();
    }

    /**
     * Snapshot the projection-matrix slot we drive with TAA jitter, so
     * each frame writes `base + this-frame-jitter` instead of adding
     * onto the previously-jittered matrix (which would accumulate as
     * an unbounded random walk).
     *
     * Slot depends on camera type:
     *   - perspective: (row=0, col=2) and (row=1, col=2). After the
     *     perspective divide (clip.w = -z), the z-coefficient term
     *     produces a constant NDC offset.
     *   - ortho: (row=0, col=3) and (row=1, col=3) — the translation
     *     column. clip.w = 1 here, so any z-coefficient shift would
     *     scale linearly with depth (different layers would jitter
     *     different amounts, breaking TAA reprojection). Translation-
     *     column shift gives a constant NDC offset like perspective.
     */
    private _captureJitterBase() {
        if (!this._useJitterProjection) return;
        const col = this.type === CameraType.ortho ? 3 : 2;
        this._jitterOffsetX = this._projectionMatrix.get(0, col);
        this._jitterOffsetY = this._projectionMatrix.get(1, col);
    }

    private generateRandomOffset(): Vector2 {
        let offset = new Vector2(HaltonSeq.get((this._sampleIndex & 1023) + 1, 2) - 0.5, HaltonSeq.get((this._sampleIndex & 1023) + 1, 3) - 0.5);
        const k_SampleCount = 32;
        if (++this._sampleIndex >= k_SampleCount) this._sampleIndex = 0;

        return offset;
    }

    private getJitteredProjectionMatrix() {
        let setting = this._boundCtx!.engine!.setting.render.postProcessing.taa;
        let temporalJitterScale: number = setting.temporalJitterScale;
        let offsetIndex = this._jitterFrameIndex % setting.jitterSeedCount;
        let num1 = this._jitterOffsetList[offsetIndex].x * temporalJitterScale;
        let num2 = this._jitterOffsetList[offsetIndex].y * temporalJitterScale;

        this._jitterX = num1 / this.viewPort.width;
        this._jitterY = num2 / this.viewPort.height;

        // Always overwrite the slot with `base + this-frame-jitter`,
        // never `current_slot + this-frame-jitter`. The previous code
        // re-captured `_jitterOffsetX/Y` whenever they were falsy
        // (which is true for any centered camera, where the base is 0)
        // — that re-capture pulled last frame's jittered value as the
        // new "base", causing a random walk that grew unboundedly.
        // Bases are now snapshot once in _captureJitterBase().
        const baseX = this._jitterOffsetX ?? 0;
        const baseY = this._jitterOffsetY ?? 0;
        const col = this.type === CameraType.ortho ? 3 : 2;
        this._projectionMatrix.set(0, col, baseX + this._jitterX);
        this._projectionMatrix.set(1, col, baseY + this._jitterY);

        this._jitterFrameIndex++;
    }

    /**
     * Get the camera's forward direction in world space.
     * @param target optional vector to store the result
     * @returns the normalized world-space forward direction
     */
    public getWorldDirection(target?: Vector3) {
        target ||= new Vector3();
        // this.transform.updateWorldMatrix();
        const e = this.transform._worldMatrix.rawData;
        return target.set(-e[8], -e[9], -e[10]).normalize();
    }

    /**
     * Release the matrix slots held by this camera and destroy the component.
     * @param force whether to force-destroy
     */
    public destroy(force?: boolean): void {
        // Release the 7 Matrix4 slots this camera holds in the static matrix table;
        // ComponentBase.destroy() wouldn't know about these private fields.
        for (const m of [this._projectionMatrix, this._projectionMatrixInv, this._viewMatrix, this._viewMatrixInv, this._unprojection, this._pvMatrix, this._pvMatrixInv]) {
            if (m) Matrix4.freeIndex(m);
        }
        this._projectionMatrix = null;
        this._projectionMatrixInv = null;
        this._viewMatrix = null;
        this._viewMatrixInv = null;
        this._unprojection = null;
        this._pvMatrix = null;
        this._pvMatrixInv = null;
        super.destroy(force);
    }

}
