import { DirectLight } from '../../../components/lights/DirectLight';
import { ILight } from '../../../components/lights/ILight';
import { LightType } from '../../../components/lights/LightData';
import { Scene3D } from '../../../core/Scene3D';
import { View3D } from '../../../core/View3D';
import { CameraUtil } from '../../../util/CameraUtil';
import { GlobalBindGroup } from '../../graphics/webGpu/core/bindGroups/GlobalBindGroup';
import { GlobalUniformGroup } from '../../graphics/webGpu/core/bindGroups/GlobalUniformGroup';
/**
 * @internal
 */
export class ShadowLightsCollect {

    public static maxNumDirectionShadow = 8;
    public static maxNumPointShadow = 8;

    public static directionLightList: Map<Scene3D, ILight[]>;
    public static pointLightList: Map<Scene3D, ILight[]>;
    public static shadowLights: Map<Scene3D, Float32Array<ArrayBuffer>>;

    public static init() {
        this.directionLightList = new Map<Scene3D, ILight[]>();
        this.pointLightList = new Map<Scene3D, ILight[]>();
        this.shadowLights = new Map<Scene3D, Float32Array<ArrayBuffer>>();
    }

    public static createBuffer(view: View3D) {
        if (!this.shadowLights.has(view.scene)) {
            let list = new Float32Array(16);
            this.shadowLights.set(view.scene, list);
        }
    }

    static getShadowLightList(light: ILight) {
        if (!light.transform.view3D) return null;
        if (light.lightData.lightType == LightType.DirectionLight) {
            let list = this.directionLightList.get(light.transform.view3D.scene);
            if (!list) {
                list = [];
                this.directionLightList.set(light.transform.view3D.scene, list);
            }
            return list;
        } else if (light.lightData.lightType == LightType.PointLight) {
            let list = this.pointLightList.get(light.transform.view3D.scene);
            if (!list) {
                list = [];
                this.pointLightList.set(light.transform.view3D.scene, list);
            }
            return list;
        } else if (light.lightData.lightType == LightType.SpotLight) {
            let list = this.pointLightList.get(light.transform.view3D.scene);
            if (!list) {
                list = [];
                this.pointLightList.set(light.transform.view3D.scene, list);
            }
            return list;
        }
    }

    static getShadowLightWhichScene(scene: Scene3D, type: LightType) {
        if (type == LightType.DirectionLight) {
            let list = this.directionLightList.get(scene);
            if (!list) {
                list = [];
                this.directionLightList.set(scene, list);
            }
            return list;
        } else if (type == LightType.PointLight) {
            let list = this.pointLightList.get(scene);
            if (!list) {
                list = [];
                this.pointLightList.set(scene, list);
            }
            return list;
        }
    }

    static getDirectShadowLightWhichScene(scene: Scene3D) {
        let list = this.directionLightList.get(scene);
        if (!list) {
            list = [];
            this.directionLightList.set(scene, list);
        }
        return list;
    }

    static getPointShadowLightWhichScene(scene: Scene3D) {
        let list = this.pointLightList.get(scene);
        if (!list) {
            list = [];
            this.pointLightList.set(scene, list);
        }
        return list;
    }

    static addShadowLight(light: ILight) {
        if (!light.transform.view3D) return null;
        let scene = light.transform.view3D.scene;

        if (light.lightData.lightType == LightType.DirectionLight) {
            let list = this.directionLightList.get(scene);
            if (!list) {
                list = [];
                this.directionLightList.set(scene, list);
            }
            if (!light.shadowCamera) {
                light.shadowCamera = CameraUtil.createCamera3DObject(null, 'shadowCamera');
                light.shadowCamera.shadowLight = light;
                light.shadowCamera.isShadowCamera = true;
                let shadowBound = -1000;
                light.shadowCamera.orthoOffCenter(shadowBound, -shadowBound, shadowBound, -shadowBound, 1, 10000);
            }
            // Shadow cameras are not added to the scene graph, so their
            // transform.view3D is always null. Bind directly to the light's
            // engine context so GlobalBindGroup can find its device.
            // Re-resolve on every call so a light that gained view3D after
            // first creation still gets bound.
            if (!light.shadowCamera._boundCtx) {
                const lightCtx = light.transform.view3D?.engine3D?.context3D;
                if (lightCtx) (light.shadowCamera as any)._boundCtx = lightCtx;
            }
            if (list.indexOf(light) == -1) {
                list.push(light);
            }
            return list;
        } else if (light.lightData.lightType == LightType.PointLight || light.lightData.lightType == LightType.SpotLight) {
            let list = this.pointLightList.get(scene);
            if (list && list.length >= 8) {
                return list;
            }
            if (!list) {
                list = [];
                this.pointLightList.set(scene, list);
            }
            if (list.indexOf(light) == -1) {
                list.push(light);
            }


            return list;
        }
    }

    public static removeShadowLight(light: ILight) {
        light.lightData.castShadowIndex = -1;
        if (!light.transform.view3D) return null;
        if (light.lightData.lightType == LightType.DirectionLight) {
            let list = this.directionLightList.get(light.transform.view3D.scene);
            if (list) {
                let index = list.indexOf(light);
                if (index != -1) {
                    list.splice(index, 1);
                }
            }
            light.lightData.castShadowIndex = -1;
            return list;
        } else if (light.lightData.lightType == LightType.PointLight || light.lightData.lightType == LightType.SpotLight) {
            let list = this.pointLightList.get(light.transform.view3D.scene);
            if (list) {
                let index = list.indexOf(light);
                if (index != -1) {
                    list.splice(index, 1);
                }
            }
            light.lightData.castShadowIndex = -1;
            return list;
        }
    }


    // Called from Engine3D.dispose() — the scene-keyed maps here would
    // otherwise grow one entry per disposed engine and pin every Scene3D
    // (plus its light list) forever.
    public static removeScene(scene: Scene3D) {
        this.directionLightList?.delete(scene);
        this.pointLightList?.delete(scene);
        this.shadowLights?.delete(scene);
    }

    public static update(view: View3D) {

        let shadowLights = this.shadowLights.get(view.scene);
        let directionLightList = ShadowLightsCollect.directionLightList.get(view.scene);
        let pointLightList = ShadowLightsCollect.pointLightList.get(view.scene);

        let nDirShadowStart: number = 0;
        let nDirShadowEnd: number = 0;
        let nPointShadowStart: number = 0;
        let nPointShadowEnd: number = 0;
        shadowLights.fill(0);
        if (directionLightList) {
            let j = 0;
            for (let i = 0; i < directionLightList.length; i++) {
                const light = directionLightList[i] as DirectLight;
                shadowLights[i] = light.lightData.index;
                if (light.enableCSM) {
                    light.lightData.castShadowIndex = j;
                    j += light.lightData.csmShadowMapNum;
                } else {
                    light.lightData.castShadowIndex = j++;
                }
            }
            if (j > view.engine3D.setting.shadow.maxShadowMapNum) {
                console.error('ShadowLightsCollect: max shadow map num reached, please increase engine.setting.shadow.maxShadowMapNum');
            }
            nDirShadowEnd = directionLightList.length;
        }

        if (pointLightList) {
            nPointShadowStart = nDirShadowEnd;
            let j = 0;
            for (let i = nPointShadowStart; i < pointLightList.length; i++) {
                const light = pointLightList[i];
                shadowLights[i] = light.lightData.index;
                light.lightData.castShadowIndex = j++;
            }
            nPointShadowEnd = nPointShadowStart + pointLightList.length;
        }

        let cameraGroup = GlobalBindGroup.getAllCameraGroup();
        cameraGroup.forEach((group: GlobalUniformGroup) => {
            group.dirShadowStart = nDirShadowStart;
            group.dirShadowEnd = nDirShadowEnd;
            group.pointShadowStart = nPointShadowStart;
            group.pointShadowEnd = nPointShadowEnd;
            group.shadowLights = shadowLights;
        });
    }
}
