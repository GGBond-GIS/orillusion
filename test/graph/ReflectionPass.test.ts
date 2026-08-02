import { test, end, expect } from '../util'
import {
    Engine3D,
    Scene3D,
    View3D,
    Camera3D,
    Object3D,
    ReflectionPass,
    REFLECTION_CUBE_MAP,
} from '@orillusion/core'

// C5 acceptance: ReflectionPass registered at stage GI, exposes
// _ReflectionCubeMap external handle, and the feature's underlying
// impl (ReflectionRenderer) still owns pre-filter compute + cube
// face render.

await test('ReflectionPass is registered at stage=GI and exposes _ReflectionCubeMap', async () => {
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

    const feature = view.renderGraph!.getPass('ReflectionPass') as ReflectionPass | null
    if (!feature) throw new Error('ReflectionPass not registered')
    expect(feature.writes[0]).toEqual(REFLECTION_CUBE_MAP)

    const pool = view.renderGraph!.pool
    expect(pool.has(REFLECTION_CUBE_MAP)).toEqual(true)
    const cubemap = pool.get(REFLECTION_CUBE_MAP)
    if (!cubemap) throw new Error('_ReflectionCubeMap resolved to null')

    engine.dispose()
})

setTimeout(end, 1500)
