import { test, end, expect } from '../util'
import {
    Engine3D,
    Scene3D,
    View3D,
    Camera3D,
    Object3D,
    ShadowPass,
    MAIN_SHADOW_MAP,
} from '@orillusion/core'

// ShadowPass is registered in the graph and exposes `_MainShadowMap`
// as an external handle resolving to the renderer's Depth2DTextureArray.

await test('ShadowPass is registered and exposes _MainShadowMap', async () => {
    const engine = await Engine3D.init({})
    const scene = new Scene3D()
    const cameraObj = new Object3D()
    const camera = cameraObj.addComponent(Camera3D)
    camera.perspective(60, engine.aspect, 1, 5000)
    scene.addChild(cameraObj)
    const view = new View3D()
    view.scene = scene
    view.camera = camera
    engine.startRenderView(view)

    const feature = view.renderGraph!.getPass('ShadowPass') as ShadowPass | null
    if (!feature) throw new Error('ShadowPass not registered')
    expect(feature.writes.length).toEqual(1)
    expect(feature.writes[0]).toEqual(MAIN_SHADOW_MAP)

    const pool = view.renderGraph!.pool
    expect(pool.has(MAIN_SHADOW_MAP)).toEqual(true)
    const shadowMap = pool.get(MAIN_SHADOW_MAP)
    if (!shadowMap) throw new Error('_MainShadowMap resolved to null')

    engine.dispose()
})

setTimeout(end, 1500)
