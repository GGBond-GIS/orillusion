import { Camera3D } from '../../core/Camera3D';
import { UUID } from '../../util/Global';
import { RegisterComponent } from '../../util/SerializeDecoration';
import { LightBase } from './LightBase';
import { LightType } from './LightData';
import { CameraUtil } from '../../util/CameraUtil';
import { Vector3 } from '../../math/Vector3';
import { Engine3D, FrustumCSM } from '../..';
/**
 *
 *Directional light source.
 *The light of this light source is parallel, for example, sunlight. This light source can generate shadows.
 * @group Lights
 */
@RegisterComponent(DirectLight, 'DirectLight')
export class DirectLight extends LightBase {
    public shadowCamera: Camera3D;
    public showDebug: boolean = false;
    public csmShadowCamera: Camera3D[] = [];
    public frustumCSM: FrustumCSM;
    public csmAutoUpdate: boolean = true;
    public csmSplitFunction: (near: number, far: number, index: number, max: number) => number;
    protected _enableCSM: boolean = false;

    constructor() {
        super();
        this.shadowCamera = CameraUtil.createCamera3DObject(null, 'shadowCamera');
        this.shadowCamera.shadowLight = this;
        this.shadowCamera.isShadowCamera = true;
        this.shadowBoundWidth = Engine3D.setting.shadow.shadowBound;
        this.shadowBoundHeight = Engine3D.setting.shadow.shadowBound;
        this.shadowBoundNear = 0.01;
        this.shadowBoundFar = Engine3D.setting.shadow.shadowBound;
    }

    public updateShadowCameraCSM(renderCamera: Camera3D) {
        if (!this.csmAutoUpdate) return;

        this.frustumCSM.update(renderCamera.projectionMatrix, renderCamera.pvMatrixInv, renderCamera.near, renderCamera.far, Engine3D.setting.shadow, this.csmSplitFunction);

        for (let i = 0; i < this.cascadeNum; i++) {
            const lookAt = this.frustumCSM.children[i].bound.center;

            const shadowPos = Vector3.HELP_0;
            shadowPos.copy(this.direction).normalize(renderCamera.far);

            const shadowCameraTarget = Vector3.HELP_1;
            lookAt.add(shadowPos, shadowCameraTarget);
            lookAt.subtract(shadowPos, shadowPos);

            this.csmShadowCamera[i].near = renderCamera.near;
            this.csmShadowCamera[i].far = renderCamera.far * 2;

            this.csmShadowCamera[i].transform.lookAt(shadowPos, shadowCameraTarget);
            const extents = Math.round(this.frustumCSM.children[i].bound.extents.length);
            this.csmShadowCamera[i].orthoOffCenter(-extents, extents, -extents, extents, renderCamera.near, renderCamera.far * 2);
        }
    }

    private _shadowBias: number = 0.01;
    private _shadowCSMBias: number = 0.01;

    public get enableCSM(): boolean{
        return this._enableCSM;
    }

    public set enableCSM(value: boolean) {
        if (this._enableCSM != value) {
            if (value) {
                if (this.cascadeNum == 0){
                    this.cascadeNum = 4;
                }
            } else if (this.lightData.csmShadowMapIndex != -1) {
                this.lightData.csmShadowMapIndex = -1;
            }
            this._enableCSM = value;
            this.onChange();
        }
    }

    public get cascadeNum(): number{
        return this.lightData.csmShadowMapNum;
    }

    public set cascadeNum(value: number){
        value = Math.max(value, 1);
        if (this.lightData.csmShadowMapNum != value) {
            this.csmShadowCamera = [];
            this.frustumCSM = new FrustumCSM(value);
            for (let i = 0; i < value; i++) {
                const csmCamera = CameraUtil.createCamera3DObject(null, `csmShadowCamera_${i}`);
                csmCamera.shadowLight = this;
                csmCamera.isShadowCamera = true;
                this.csmShadowCamera.push(csmCamera);
            }
            this.lightData.csmShadowMapNum = value;
        }
    }

    public get shadowCSMBias(): number {
        return this._shadowCSMBias;
    }
    
    public set shadowCSMBias(value: number) {
        if (this.shadowCSMBias != value) {
            this._shadowCSMBias = value;
            this.onChange();
        }
    }

    public get shadowBias(): number {
        return this._shadowBias;
    }

    public set shadowBias(value: number) {
        if (this.shadowBias != value) {
            this._shadowBias = value;
            this.onChange();
        }
    }

    public get shadowBoundWidth(): number {
        return this._shadowBoundWidth;
    }

    public set shadowBoundWidth(value: number) {
        if (this._shadowBoundWidth != value && !this.enableCSM) {
            this._shadowBoundWidth = value;
            const halfValue = value * 0.5;
            this.shadowCamera.left = -halfValue;
            this.shadowCamera.right = halfValue;
            this.onChange();
        }
    }

    public get shadowBoundHeight(): number {
        return this._shadowBoundHeight;
    }

    public set shadowBoundHeight(value: number) {
        if (this._shadowBoundHeight != value && !this.enableCSM) {
            this._shadowBoundHeight = value;
            const halfValue = value * 0.5;
            this.shadowCamera.bottom = -halfValue;
            this.shadowCamera.top = halfValue;
            this.onChange();
        }
    }

    public get shadowBoundNear(): number {
        return this.shadowCamera.near;
    }

    public set shadowBoundNear(value: number) {
        if (this.shadowCamera.near != value && !this.enableCSM) {
            this.shadowCamera.near = value;
            this.onChange();
        }
    }

    public get shadowBoundFar(): number {
        return this.shadowCamera.far;
    }

    public set shadowBoundFar(value: number) {
        if (this.shadowCamera.far != value && !this.enableCSM) {
            this.shadowCamera.far = value;
            this.onChange();
        }
    }

    public init(): void {
        super.init();
        if (this.object3D.name == "") {
            this.object3D.name = "DirectionLight_" + UUID();
        }
        this.radius = Number.MAX_SAFE_INTEGER;
        this.lightData.lightType = LightType.DirectionLight;
        this.lightData.linear = 0;
        this.lightData.quadratic = 0.3;
    }

    public start(): void {
        super.start();
        this.castGI = true;
    }

    /**
     *
     * Get the radius of a directional light source
     */
    public get radius(): number {
        return this.lightData.range as number;
    }

    /**
     * Set the radius of a directional light source
     */
    public set radius(value: number) {
        this.lightData.range = value;
        this.onChange();
    }

    /**
     *
     * Get the radius of a directional light source
     */
    public get indirect(): number {
        return this.lightData.quadratic as number;
    }

    /**
     * Set the radius of a directional light source
     */
    public set indirect(value: number) {
        this.lightData.quadratic = value;
        this.onChange();
    }

    // /**
    //  * Set cast shadow
    //  * @param value
    //  **/
    // public set castShadow(value: boolean) {
    //     if (value != this._castShadow) {
    //         this.onChange();
    //     }
    //     this._castShadow = value;
    // }

    // /**
    //  * get cast shadow
    //  * @return boolean
    //  * */
    // public get castShadow(): boolean {
    //     return this.lightData.castShadowIndex as number >= 0;
    // }

    protected onChange() {
        super.onChange();
        if (this.object3D && this.lightData) {
            let depth = this.shadowBoundFar - this.shadowBoundNear;
            let sizeOnePixel = this.shadowBoundWidth / this.shadowMapWidth;
            this.lightData.shadowBias[0] = sizeOnePixel / depth - this.shadowBias * 0.01;
        }
    }
}
