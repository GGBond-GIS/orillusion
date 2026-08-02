import { DirectLight, EntityCollect, Vector3 } from "../../../../..";
import { PointLight } from "../../../../../components/lights/PointLight";
import { SpotLight } from "../../../../../components/lights/SpotLight";
import { Camera3D } from "../../../../../core/Camera3D";
import { CSM } from "../../../../../core/csm/CSM";
import { splitDouble_Vector3 } from "../../../../../math/DoublePrecision";
import { Matrix4, matrixMultiply } from "../../../../../math/Matrix4";
import { UUID } from "../../../../../util/Global";
import { ProfilerUtil } from "../../../../../util/ProfilerUtil";
import { Time } from "../../../../../util/Time";
import { ShadowLightsCollect } from "../../../../renderJob/collect/ShadowLightsCollect";
import { ShadowBiasCalculator } from "../../../../renderJob/passRenderer/shadow/ShadowBiasCalculator";
import { bindCtx, Context3D } from "../../Context3D";
import { UniformGPUBuffer } from "../buffer/UniformGPUBuffer";
import { GlobalBindGroupLayout } from "./GlobalBindGroupLayout";
import { MatrixBindGroup } from "./MatrixBindGroup";

/**
 * @internal
 * @group GFX
 */
export class GlobalUniformGroup {

    public uuid: string;
    public usage: number;
    public globalBindGroup: GPUBindGroup;
    public uniformGPUBuffer: UniformGPUBuffer;
    private matrixBindGroup: MatrixBindGroup;
    private uniformByteLength: number;
    private matrixesByteLength: number;

    private shadowMatrixRaw: Float32Array;
    private csmMatrixRaw = new Float32Array(CSM.Cascades * 16);
    private csmShadowBias = new Float32Array(4);

    public shadowLights = new Float32Array(16);
    public dirShadowStart = 0;
    public dirShadowEnd = 0;
    public pointShadowStart = 0;
    public pointShadowEnd = 0;

    private _ctx: Context3D;

    /**
     *
     * @param ctx owning Context3D
     * @param matrixBindGroup global matrix bindgroup
     */
    constructor(ctx: Context3D, matrixBindGroup: MatrixBindGroup) {
        this.uuid = UUID();
        this.usage = GPUBufferUsage.UNIFORM | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
        this._ctx = ctx;
        const setting = ctx.engine!.setting;
        this.shadowMatrixRaw = new Float32Array(setting.shadow.maxShadowMapNum * 16);
        // ... + 8(shadow matrix) + 8(csm matrix) + 4(csm bias) + 4(csm scattering exp...)
        // this.uniformGPUBuffer = new UniformGPUBuffer(32 * 4 * 4 + (3 * 4 * 4) + 8 * 16 + CSM.Cascades * 16 + 4 + 4);
        this.uniformGPUBuffer = new UniformGPUBuffer(8192 + 9 * 4 * 4 + 8 + 1 + 4 + setting.shadow.maxShadowMapNum * 16);
        this.uniformGPUBuffer.visibility = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE;

        this.matrixBindGroup = matrixBindGroup;

        this.createBindGroup();
    }

    createBindGroup() {
        this.uniformByteLength = this.uniformGPUBuffer.memory.shareDataBuffer.byteLength;
        // matrices (maxCount*64B) + HL pairs (maxCount*32B); shader reads HL at matrix[maxCount + index/2]
        this.matrixesByteLength = (Matrix4.block * 4) * Matrix4.maxCount + Matrix4.maxCount * 32;

        let ctx = this._ctx;
        if (!this.uniformGPUBuffer._boundCtx) bindCtx(this.uniformGPUBuffer, ctx);
        const matrixBuf = this.matrixBindGroup.matrixBufferDst;
        if (matrixBuf && !matrixBuf._boundCtx) bindCtx(matrixBuf, ctx);
        this.globalBindGroup = ctx.device.createBindGroup({
            label: `global_bindGroupLayout`,
            layout: GlobalBindGroupLayout.getGlobalDataBindGroupLayout(ctx),
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.uniformGPUBuffer.buffer,
                        offset: 0, // this.uniformGPUBuffer.memory.shareDataBuffer.byteOffset,
                        size: this.uniformByteLength
                    }
                },
                {
                    binding: 1,
                    resource: {
                        buffer: this.matrixBindGroup.matrixBufferDst.buffer,
                        offset: 0,
                        size: this.matrixesByteLength
                    }
                }
            ]
        });
    }

    public temp_pvMatrix = new Matrix4();
    public temp_viewMatrix = new Matrix4();
    public temp_worldMatrix = new Matrix4();

    // Return the 3 scratch Matrix4 slots to the static table. Called from
    // GlobalBindGroup.removeContext() when the owning engine is disposed;
    // without this each reinit leaks 3 slots per camera.
    public destroy() {
        if (this.temp_pvMatrix) Matrix4.freeIndex(this.temp_pvMatrix);
        if (this.temp_viewMatrix) Matrix4.freeIndex(this.temp_viewMatrix);
        if (this.temp_worldMatrix) Matrix4.freeIndex(this.temp_worldMatrix);
        this.temp_pvMatrix = null;
        this.temp_viewMatrix = null;
        this.temp_worldMatrix = null;
    }

    public setCamera(camera: Camera3D) {
        this.uniformGPUBuffer.setMatrix(`_projectionMatrix`, camera.projectionMatrix);

        if (this._ctx.engine!.setting.useRTE) {
            const mainCamera = Camera3D.mainCamera || camera;

            this.temp_worldMatrix.copy(camera.transform.worldMatrix);
            const rtePos = Vector3.sub(camera.transform.worldPosition, mainCamera.transform.worldPosition);
            this.temp_worldMatrix.rawData[12] = rtePos.x;
            this.temp_worldMatrix.rawData[13] = rtePos.y;
            this.temp_worldMatrix.rawData[14] = rtePos.z;

            this.temp_viewMatrix.copy(this.temp_worldMatrix);
            this.temp_viewMatrix.invert();

            this.uniformGPUBuffer.setMatrix(`_viewMatrix`, this.temp_viewMatrix);
            this.uniformGPUBuffer.setMatrix(`_cameraWorldMatrix`, this.temp_worldMatrix);
            this.uniformGPUBuffer.setMatrix(`projMatInv`, camera.projectionMatrixInv);

            let cameraToWorld = Matrix4.helpMatrix.copy(camera.projectionMatrixInv);
            this.temp_viewMatrix.invert();
            cameraToWorld.multiply(this.temp_viewMatrix);
            this.uniformGPUBuffer.setMatrix(`viewToWorld`, cameraToWorld);
        } else {
            this.uniformGPUBuffer.setMatrix(`_viewMatrix`, camera.viewMatrix);
            this.uniformGPUBuffer.setMatrix(`_cameraWorldMatrix`, camera.transform.worldMatrix);
            this.uniformGPUBuffer.setMatrix(`projMatInv`, camera.projectionMatrixInv);
            this.uniformGPUBuffer.setMatrix(`viewToWorld`, camera.cameraToWorld);
        }

        let shadowLightList = ShadowLightsCollect.getDirectShadowLightWhichScene(camera.transform.scene3D);

        this.csmShadowBias.fill(0.0001);
        this.shadowMatrixRaw.fill(0);
        this.csmMatrixRaw.fill(0);
        if (!camera.isShadowCamera) {
            const maxShadowMapNum = this._ctx.engine!.setting.shadow.maxShadowMapNum;
            let shadowMatrixRawIndex: number = 0;
            for (let i = 0; i < maxShadowMapNum; i++) {
                if (i < shadowLightList.length) {
                    const shadowLight = shadowLightList[i] as DirectLight;

                    if (shadowLight.enableCSM && shadowLight.lightData.csmShadowMapIndex >= 0) {
                        for (let csm = 0; csm < shadowLight.lightData.csmShadowMapNum; csm++) {
                            let shadowCamera: Camera3D = shadowLight.csmShadowCamera[csm];

                            if (this._ctx.engine!.setting.useRTE) {
                                let viewMatrix = this.temp_viewMatrix.copy(shadowCamera.transform.worldMatrix);

                                let rtePos = Vector3.sub(shadowCamera.transform.worldPosition, camera.transform.worldPosition);
                                viewMatrix.rawData[12] = rtePos.x;
                                viewMatrix.rawData[13] = rtePos.y;
                                viewMatrix.rawData[14] = rtePos.z;
                                viewMatrix.invert();

                                matrixMultiply(shadowCamera.projectionMatrix, viewMatrix, this.temp_pvMatrix);
                                this.shadowMatrixRaw.set(this.temp_pvMatrix.rawData, shadowMatrixRawIndex * 16);
                            } else {
                                this.shadowMatrixRaw.set(shadowCamera.pvMatrix.rawData, shadowMatrixRawIndex * 16);
                            }

                            // RFC-003: per-cascade bias derived from auto formula or
                            // user override, scaled by frustum-relative cascade size.
                            shadowLight.lightData.shadowBias[csm] = ShadowBiasCalculator.resolveDirectShadowBias(shadowLight, csm);
                            shadowLight.lightData.normalBias[csm] = ShadowBiasCalculator.resolveDirectNormalBias(shadowLight, csm);

                            shadowMatrixRawIndex++;
                        }
                    } else {
                        let shadowCamera = shadowLight.shadowCamera;

                        if (this._ctx.engine!.setting.useRTE) {
                            let viewMatrix = this.temp_viewMatrix.copy(shadowCamera.transform.worldMatrix);

                            let rtePos = Vector3.sub(shadowCamera.transform.worldPosition, camera.transform.worldPosition, Vector3.HELP_6);
                            viewMatrix.rawData[12] = rtePos.x;
                            viewMatrix.rawData[13] = rtePos.y;
                            viewMatrix.rawData[14] = rtePos.z;
                            viewMatrix.invert();

                            matrixMultiply(shadowCamera.projectionMatrix, viewMatrix, this.temp_pvMatrix);

                            this.shadowMatrixRaw.set(this.temp_pvMatrix.rawData, shadowMatrixRawIndex * 16);
                        } else {
                            this.shadowMatrixRaw.set(shadowCamera.pvMatrix.rawData, shadowMatrixRawIndex * 16);
                        }

                        // Non-CSM directional light: fill cascade-0 bias slot
                        // (NDC units). Point/spot are handled in a separate loop
                        // below since getDirectShadowLightWhichScene only returns
                        // directional lights.
                        shadowLight.lightData.shadowBias[0] = ShadowBiasCalculator.resolveDirectShadowBias(shadowLight, 0);
                        shadowLight.lightData.normalBias[0] = ShadowBiasCalculator.resolveDirectNormalBias(shadowLight, 0);
                        shadowMatrixRawIndex++;
                    }
                } else if (shadowMatrixRawIndex < maxShadowMapNum) {
                    this.shadowMatrixRaw.set(camera.transform.worldMatrix.rawData, shadowMatrixRawIndex * 16);
                    shadowMatrixRawIndex++;
                }
            }

            // Point / spot shadow lights: cube-shadow path doesn't need a shadow
            // matrix, but the shader still reads light.shadowBias[0] /
            // normalBias[0]. Those values aren't touched by the directional
            // loop above (its list is filtered to directional lights), so walk
            // the point-shadow list here and populate from the host formula.
            const pointShadowList = ShadowLightsCollect.getPointShadowLightWhichScene(camera.transform.scene3D);
            if (pointShadowList && pointShadowList.length) {
                const pmSize = this._ctx.engine!.setting.shadow.pointShadowSize;
                for (let i = 0; i < pointShadowList.length; i++) {
                    const pLight = pointShadowList[i] as (PointLight | SpotLight);
                    pLight.lightData.shadowBias[0] = ShadowBiasCalculator.resolvePointShadowBias(pLight, pmSize);
                    pLight.lightData.normalBias[0] = ShadowBiasCalculator.resolvePointNormalBias(pLight, pmSize);
                    // Normalization factor for cube shadow depth. User-overridable
                    // via shadowCameraFar on the light; 0 = auto = use range.
                    const sFar = (pLight as any).shadowCameraFar;
                    pLight.lightData.shadowFar = (sFar && sFar > 0) ? sFar : (pLight.lightData.range || 1);
                }
            }
        }

        this.uniformGPUBuffer.setFloat32Array(`shadowMatrix`, this.shadowMatrixRaw);

        let shadowMapSize = this._ctx.engine!.setting.shadow.shadowSize;
        this.uniformGPUBuffer.setFloat32Array(`csmShadowBias`, this.csmShadowBias);
        this.uniformGPUBuffer.setFloat32Array(`csmMatrix`, this.csmMatrixRaw);
        this.uniformGPUBuffer.setFloat32Array(`shadowLights`, this.shadowLights);

        let reflectionSetting = this._ctx.engine!.setting.reflectionSetting;
        let reflectionCount = EntityCollect.instance.getReflections(camera.transform.scene3D).length;
        this.uniformGPUBuffer.setFloat(`reflectionProbeSize`, reflectionSetting.reflectionProbeSize);
        this.uniformGPUBuffer.setFloat(`reflectionProbeMaxCount`, reflectionSetting.reflectionProbeMaxCount);
        this.uniformGPUBuffer.setFloat(`reflectionMapWidth`, reflectionSetting.width);
        this.uniformGPUBuffer.setFloat(`reflectionMapHeight`, reflectionSetting.height);
        this.uniformGPUBuffer.setFloat(`reflectionCount`, reflectionCount);
        this.uniformGPUBuffer.setFloat(`test2`, ProfilerUtil.testObj.testValue2);
        this.uniformGPUBuffer.setFloat(`test3`, ProfilerUtil.testObj.testValue3);
        this.uniformGPUBuffer.setFloat(`test4`, ProfilerUtil.testObj.testValue4);

        if (this._ctx.engine!.setting.useRTE) {
            const cameraPos = Vector3.HELP_0.set(
                this.temp_worldMatrix.rawData[12],
                this.temp_worldMatrix.rawData[13],
                this.temp_worldMatrix.rawData[14]
            );
            this.uniformGPUBuffer.setVector3(`CameraPos`, cameraPos);
        } else {
            this.uniformGPUBuffer.setVector3(`CameraPos`, camera.transform.worldPosition);
        }
        this.uniformGPUBuffer.setFloat(`frame`, Time.frame);
        this.uniformGPUBuffer.setFloat32Array(`SH`, camera.sh);
        this.uniformGPUBuffer.setFloat(`time`, Time.time);
        this.uniformGPUBuffer.setFloat(`delta`, Time.delta);
        // Legacy globalUniform.shadowBias — read by DDGI / GodRay compute paths only.
        // Real-time shadow now uses per-light light.shadowBias[csm] instead. We feed
        // a conservative texel-derived default to keep baked-probe shadow stable.
        this.uniformGPUBuffer.setFloat(`shadowBias`, camera.getShadowBias(shadowMapSize));
        this.uniformGPUBuffer.setFloat(`skyExposure`, this._ctx.engine!.setting.sky.skyExposure);
        this.uniformGPUBuffer.setFloat(`renderPassState`, this._ctx.engine!.setting.render.renderPassState);
        this.uniformGPUBuffer.setFloat(`quadScale`, this._ctx.engine!.setting.render.quadScale);
        this.uniformGPUBuffer.setFloat(`hdrExposure`, this._ctx.engine!.setting.render.hdrExposure);
        this.uniformGPUBuffer.setInt32(`renderState_left`, this._ctx.engine!.setting.render.renderState_left);
        this.uniformGPUBuffer.setInt32(`renderState_right`, this._ctx.engine!.setting.render.renderState_right);
        this.uniformGPUBuffer.setFloat(`renderState_split`, this._ctx.engine!.setting.render.renderState_split);
        const ownerC = (camera?.transform as any)?.view3D?.engine3D;
        const inputC = ownerC?.inputSystem;
        const ctxC = ownerC?.context3D;
        let mouseX = (inputC?.mouseX ?? 0) * (ctxC?.pixelRatio ?? 1);
        let mouseY = (inputC?.mouseY ?? 0) * (ctxC?.pixelRatio ?? 1);
        this.uniformGPUBuffer.setFloat(`mouseX`, mouseX);
        this.uniformGPUBuffer.setFloat(`mouseY`, mouseY);
        this.uniformGPUBuffer.setFloat(`windowWidth`, ctxC?.windowWidth ?? 0);
        this.uniformGPUBuffer.setFloat(`windowHeight`, ctxC?.windowHeight ?? 0);
        this.uniformGPUBuffer.setFloat(`near`, camera.near);
        this.uniformGPUBuffer.setFloat(`far`, camera.far);
        // Legacy globalUniform.pointShadowBias — kept for shader struct compat.
        // Real-time point shadow now reads light.shadowBias[0] instead.
        this.uniformGPUBuffer.setFloat(`pointShadowBias`, 0.0);
        this.uniformGPUBuffer.setFloat(`shadowMapSize`, shadowMapSize);
        this.uniformGPUBuffer.setFloat(`shadowSoft`, this._ctx.engine!.setting.shadow.shadowSoft);
        // Live-tunable PCF kernel radius multiplier. 1.0 = single texel
        // step (default), >1.0 widens the 3x3 kernel for softer edges at
        // the cost of peter-panning, <1.0 tightens it.
        this.uniformGPUBuffer.setFloat(`pcfKernelScale`, this._ctx.engine!.setting.shadow.pcfKernelScale ?? 1.0);
        // Legacy globalUniform.enableCSM — kept for shader struct compat (DDGI / GodRay
        // compute paths still read it). Realtime shadow gates on per-light
        // light.csmShadowMapIndex >= 0 now, so this stays 0.
        this.uniformGPUBuffer.setFloat(`enableCSM`, 0.0);
        this.uniformGPUBuffer.setFloat(`csmMargin`, this._ctx.engine!.setting.shadow.csmMargin);
        this.uniformGPUBuffer.setInt32(`nDirShadowStart`, this.dirShadowStart);
        this.uniformGPUBuffer.setInt32(`nDirShadowEnd`, this.dirShadowEnd);
        this.uniformGPUBuffer.setInt32(`nPointShadowStart`, this.pointShadowStart);
        this.uniformGPUBuffer.setInt32(`nPointShadowEnd`, this.pointShadowEnd);
        this.uniformGPUBuffer.setVector3(`cameraForward`, camera.transform.forward);
        this.uniformGPUBuffer.setVector4Array(`frustumPlanes`, camera.frustum.planes);

        // JS bump-allocator / WGSL alignment bridge.
        //
        // The UniformGPUBuffer writes each setField call to the next
        // free byte without respecting WGSL member alignment. The
        // WGSL `GlobalUniform` struct, by contrast, pads `vec3f` +
        // `vec4`-array members to 16-byte boundaries. `_retain`
        // absorbs the cumulative padding difference so that
        // `cameraPositionH` (next field) lands at the WGSL-computed
        // offset.
        //
        // **The exact byte count of _retain depends on the number of
        // preceding f32/i32 fields in the struct.** Any commit that
        // adds or removes a 4-byte field before `cameraForward` MUST
        // update this pad size or every useRTE scene renders black.
        //
        // Known-good sizes:
        //   - 21 preceding f32/i32 fields (pre-pcfKernelScale) → vec4 (16 B)
        //   - 22 preceding f32/i32 fields (post-pcfKernelScale, now)  → vec3 (12 B)
        //
        // Diagnosing a regression: binary-search from a commit where
        // `Sample_RTE.ts` renders with ≥50% non-black center-region
        // pixels. The first commit that drops below ~5% is almost
        // always the one that added an unbalanced field.
        this.uniformGPUBuffer.setVector3(`_retain`, Vector3.ZERO);

        if (this._ctx.engine!.setting.useRTE) {
            const mainCamera = Camera3D.mainCamera || camera;

            const cameraPos: Vector3 = mainCamera.transform.worldPosition;
            const valueHL = splitDouble_Vector3(cameraPos, this._ctx.engine!.setting.RTEScale);
            const cameraPosH = valueHL[0];
            const cameraPosL = valueHL[1];
            this.uniformGPUBuffer.setVector3(`cameraPositionH`, cameraPosH);
            this.uniformGPUBuffer.setUint32(`maxModelsCount`, Matrix4.maxCount);
            this.uniformGPUBuffer.setVector3(`cameraPositionL`, cameraPosL);
            this.uniformGPUBuffer.setUint32(`cameraMatrixIndex`, camera.transform.worldMatrix.index);
            this.uniformGPUBuffer.setUint32(`useRTE`, 1);
        } else {
            this.uniformGPUBuffer.setVector3(`cameraPositionH`, Vector3.ZERO);
            this.uniformGPUBuffer.setUint32(`maxModelsCount`, Matrix4.maxCount);
            this.uniformGPUBuffer.setVector3(`cameraPositionL`, Vector3.ZERO);
            this.uniformGPUBuffer.setUint32(`cameraMatrixIndex`, 0);
            this.uniformGPUBuffer.setUint32(`useRTE`, 0);
        }

        this.uniformGPUBuffer.apply();
    }

    setShadowCamera(camera: Camera3D) {
        this.setCamera(camera);
    }

    public setShadowLight() {}
}
