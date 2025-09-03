import { DirectLight, EntityCollect, Vector3, Vector4 } from "../../../../..";
import { Engine3D } from "../../../../../Engine3D";
import { Camera3D } from "../../../../../core/Camera3D";
import { CSM } from "../../../../../core/csm/CSM";
import { splitDouble_Vector3 } from "../../../../../math/DoublePrecision";
import { Matrix4, matrixMultiply } from "../../../../../math/Matrix4";
import { UUID } from "../../../../../util/Global";
import { ProfilerUtil } from "../../../../../util/ProfilerUtil";
import { Time } from "../../../../../util/Time";
import { ShadowLightsCollect } from "../../../../renderJob/collect/ShadowLightsCollect";
import { webGPUContext } from "../../Context3D";
import { UniformGPUBuffer } from "../buffer/UniformGPUBuffer";
import { GlobalBindGroupLayout } from "./GlobalBindGroupLayout";
import { MatrixBindGroup } from "./MatrixBindGroup";

/**
 * @internal
 * @author sirxu
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

    private shadowMatrixRaw = new Float32Array(Engine3D.setting.shadow.maxShadowMapNum * 16);
    private csmMatrixRaw = new Float32Array(CSM.Cascades * 16);
    private csmShadowBias = new Float32Array(4);

    public shadowLights = new Float32Array(16);
    public dirShadowStart = 0;
    public dirShadowEnd = 0;
    public pointShadowStart = 0;
    public pointShadowEnd = 0;

    /**
     *
     * @param matrixBindGroup global matrix bindgroup
     */
    constructor(matrixBindGroup: MatrixBindGroup) {
        this.uuid = UUID();
        this.usage = GPUBufferUsage.UNIFORM | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
        // ... + 8(shadow matrix) + 8(csm matrix) + 4(csm bias) + 4(csm scattering exp...)
        // this.uniformGPUBuffer = new UniformGPUBuffer(32 * 4 * 4 + (3 * 4 * 4) + 8 * 16 + CSM.Cascades * 16 + 4 + 4);
        this.uniformGPUBuffer = new UniformGPUBuffer(8192 + 9 * 4 * 4 + 8 + 1 + 4 + Engine3D.setting.shadow.maxShadowMapNum * 16);
        this.uniformGPUBuffer.visibility = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE;

        this.matrixBindGroup = matrixBindGroup;

        this.createBindGroup();
    }

    createBindGroup() {
        this.uniformByteLength = this.uniformGPUBuffer.memory.shareDataBuffer.byteLength;
        // this.matrixesByteLength = (Matrix4.block * 4) * Matrix4.maxCount;

        let entries: GPUBindGroupEntry[] = [
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
                    size: this.matrixBindGroup.matrixBufferDst.buffer.size
                }
            }
        ];

        this.globalBindGroup = webGPUContext.device.createBindGroup({
            label: `global_bindGroupLayout`,
            layout: GlobalBindGroupLayout.getGlobalDataBindGroupLayout(),
            entries: entries
        });
    }

    public temp_pvMatrix = new Matrix4();
    public temp_viewMatrix = new Matrix4();
    public temp_worldMatrix = new Matrix4();
    public setCamera(camera: Camera3D) {
        this.uniformGPUBuffer.setMatrix(`_projectionMatrix`, camera.projectionMatrix);
        
        if (Engine3D.setting.useRTE) {
            const mainCamera = Camera3D.mainCamera;

            this.temp_worldMatrix.copyFrom(camera.transform.worldMatrix);
            const rtePos = Vector3.sub(camera.transform.worldPosition, mainCamera.transform.worldPosition);
            this.temp_worldMatrix.rawData[12] = rtePos.x;
            this.temp_worldMatrix.rawData[13] = rtePos.y;
            this.temp_worldMatrix.rawData[14] = rtePos.z;

            this.temp_viewMatrix.copyFrom(this.temp_worldMatrix);
            this.temp_viewMatrix.invert();

            this.uniformGPUBuffer.setMatrix(`_viewMatrix`, this.temp_viewMatrix);
            this.uniformGPUBuffer.setMatrix(`_cameraWorldMatrix`, this.temp_worldMatrix);
            this.uniformGPUBuffer.setMatrix(`pvMatrixInv`, camera.projectionMatrixInv);

            let cameraToWorld = Matrix4.helpMatrix.copyFrom(camera.projectionMatrixInv);
            this.temp_viewMatrix.invert();
            cameraToWorld.multiply(this.temp_viewMatrix);
            this.uniformGPUBuffer.setMatrix(`viewToWorld`, cameraToWorld);
        } else {
            this.uniformGPUBuffer.setMatrix(`_viewMatrix`, camera.viewMatrix);
            this.uniformGPUBuffer.setMatrix(`_cameraWorldMatrix`, camera.transform.worldMatrix);
            this.uniformGPUBuffer.setMatrix(`pvMatrixInv`, camera.projectionMatrixInv);
            this.uniformGPUBuffer.setMatrix(`viewToWorld`, camera.cameraToWorld);
        }

        let shadowLightList = ShadowLightsCollect.getDirectShadowLightWhichScene(camera.transform.scene3D);

        this.csmShadowBias.fill(0.0001);
        this.shadowMatrixRaw.fill(0);
        this.csmMatrixRaw.fill(0);
        if (!camera.isShadowCamera) {
            const maxShadowMapNum = Engine3D.setting.shadow.maxShadowMapNum;
            let shadowMatrixRawIndex: number = 0;
            for (let i = 0; i < maxShadowMapNum; i++) {
                if (i < shadowLightList.length) {
                    const shadowLight = shadowLightList[i] as DirectLight;

                    if (shadowLight.enableCSM && shadowLight.lightData.csmShadowMapIndex >= 0) {
                        const csmShadowBiasIndex = shadowMatrixRawIndex;
                        for (let csm = 0; csm < shadowLight.lightData.csmShadowMapNum; csm++) {
                            let shadowCamera: Camera3D = shadowLight.csmShadowCamera[csm];

                            if (Engine3D.setting.useRTE) {
                                let viewMatrix = this.temp_viewMatrix.copyFrom(shadowCamera.transform.worldMatrix);
            
                                let rtePos = Vector3.sub(shadowCamera.transform.worldPosition, camera.transform.worldPosition);
                                viewMatrix.rawData[12] = rtePos.x;
                                viewMatrix.rawData[13] = rtePos.y;
                                viewMatrix.rawData[14] = rtePos.z;
                                viewMatrix.invert();
                                
                                matrixMultiply(shadowCamera.projectionMatrix, viewMatrix, this.temp_pvMatrix);
                                // this.csmMatrixRaw.set(this.temp_pvMatrix.rawData, i * 16);
                                this.shadowMatrixRaw.set(this.temp_pvMatrix.rawData, shadowMatrixRawIndex * 16);
                            } else {
                                this.shadowMatrixRaw.set(shadowCamera.pvMatrix.rawData, shadowMatrixRawIndex * 16);
                            }

                            let baseCamera = shadowLight.csmShadowCamera[0];
                            let shadowBiasScale = (shadowCamera.right - shadowCamera.left) / (baseCamera.right - baseCamera.left);
                            if (csm == 0) {
                                let depth = shadowLight.shadowBoundFar - shadowLight.shadowBoundNear;
                                let sizeOnePixel = 1 / shadowLight.shadowMapWidth;
                                shadowLight.lightData.shadowBias[0] = sizeOnePixel / depth - shadowLight.shadowCSMBias * 0.01;
                            } else if (csm > 0) {
                                shadowLight.lightData.shadowBias[csm] = shadowLight.lightData.shadowBias[0] * shadowBiasScale;
                            }

                            shadowMatrixRawIndex++;
                        }
                    } else {
                        let shadowCamera = shadowLight.shadowCamera;
        
                        if (Engine3D.setting.useRTE) {
                            let viewMatrix = this.temp_viewMatrix.copyFrom(shadowCamera.transform.worldMatrix);
        
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
                        shadowMatrixRawIndex++;
                    }
                } else if (shadowMatrixRawIndex < maxShadowMapNum) {
                    this.shadowMatrixRaw.set(camera.transform.worldMatrix.rawData, shadowMatrixRawIndex * 16);
                    shadowMatrixRawIndex++;
                }
            }
        }

        this.uniformGPUBuffer.setFloat32Array(`shadowMatrix`, this.shadowMatrixRaw);

        let shadowMapSize = Engine3D.setting.shadow.shadowSize;
        this.uniformGPUBuffer.setFloat32Array(`csmShadowBias`, this.csmShadowBias);
        this.uniformGPUBuffer.setFloat32Array(`csmMatrix`, this.csmMatrixRaw);
        this.uniformGPUBuffer.setFloat32Array(`shadowLights`, this.shadowLights);

        let reflectionSetting = Engine3D.setting.reflectionSetting;
        let reflectionCount = EntityCollect.instance.getReflections(camera.transform.scene3D).length;
        this.uniformGPUBuffer.setFloat(`reflectionProbeSize`, reflectionSetting.reflectionProbeSize);
        this.uniformGPUBuffer.setFloat(`reflectionProbeMaxCount`, reflectionSetting.reflectionProbeMaxCount);
        this.uniformGPUBuffer.setFloat(`reflectionMapWidth`, reflectionSetting.width);
        this.uniformGPUBuffer.setFloat(`reflectionMapHeight`, reflectionSetting.height);
        this.uniformGPUBuffer.setFloat(`reflectionCount`, reflectionCount);
        this.uniformGPUBuffer.setFloat(`test2`, ProfilerUtil.testObj.testValue2);
        this.uniformGPUBuffer.setFloat(`test3`, ProfilerUtil.testObj.testValue3);
        this.uniformGPUBuffer.setFloat(`test4`, ProfilerUtil.testObj.testValue4);

        if (Engine3D.setting.useRTE) {
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
        this.uniformGPUBuffer.setFloat(`shadowBias`, camera.getShadowBias(shadowMapSize));
        this.uniformGPUBuffer.setFloat(`skyExposure`, Engine3D.setting.sky.skyExposure);
        this.uniformGPUBuffer.setFloat(`renderPassState`, Engine3D.setting.render.renderPassState);
        this.uniformGPUBuffer.setFloat(`quadScale`, Engine3D.setting.render.quadScale);
        this.uniformGPUBuffer.setFloat(`hdrExposure`, Engine3D.setting.render.hdrExposure);
        this.uniformGPUBuffer.setInt32(`renderState_left`, Engine3D.setting.render.renderState_left);
        this.uniformGPUBuffer.setInt32(`renderState_right`, Engine3D.setting.render.renderState_right);
        this.uniformGPUBuffer.setFloat(`renderState_split`, Engine3D.setting.render.renderState_split);
        let mouseX = Engine3D.inputSystem.mouseX * webGPUContext.pixelRatio;
        let mouseY = Engine3D.inputSystem.mouseY * webGPUContext.pixelRatio;
        this.uniformGPUBuffer.setFloat(`mouseX`, mouseX);
        this.uniformGPUBuffer.setFloat(`mouseY`, mouseY);
        this.uniformGPUBuffer.setFloat(`windowWidth`, webGPUContext.windowWidth);
        this.uniformGPUBuffer.setFloat(`windowHeight`, webGPUContext.windowHeight);
        this.uniformGPUBuffer.setFloat(`near`, camera.near);
        this.uniformGPUBuffer.setFloat(`far`, camera.far);
        this.uniformGPUBuffer.setFloat(`pointShadowBias`, Engine3D.setting.shadow.pointShadowBias);
        this.uniformGPUBuffer.setFloat(`shadowMapSize`, shadowMapSize);
        this.uniformGPUBuffer.setFloat(`shadowSoft`, Engine3D.setting.shadow.shadowSoft);
        this.uniformGPUBuffer.setFloat(`enableCSM`, camera.enableCSM ? 1 : 0);
        this.uniformGPUBuffer.setFloat(`csmMargin`, Engine3D.setting.shadow.csmMargin);
        this.uniformGPUBuffer.setInt32(`nDirShadowStart`, this.dirShadowStart);
        this.uniformGPUBuffer.setInt32(`nDirShadowEnd`, this.dirShadowEnd);
        this.uniformGPUBuffer.setInt32(`nPointShadowStart`, this.pointShadowStart);
        this.uniformGPUBuffer.setInt32(`nPointShadowEnd`, this.pointShadowEnd);
        this.uniformGPUBuffer.setVector3(`cameraForward`, camera.transform.forward);
        this.uniformGPUBuffer.setVector4Array(`frustumPlanes`, camera.frustum.planes);

        this.uniformGPUBuffer.setVector4(`_retain`, Vector4.ZERO);

        if (Engine3D.setting.useRTE) {
            const mainCamera = Camera3D.mainCamera;

            const cameraPos: Vector3 = mainCamera.transform.worldPosition; // camera.transform.worldPosition;
            const valueHL = splitDouble_Vector3(cameraPos);
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
