import { test, end, expect, delay } from '../util'
import {
    Engine3D,
    Scene3D,
    View3D,
    Camera3D,
    Object3D,
    GIPass,
    DDGI_IRRADIANCE_MAP,
    DDGI_DEPTH_MAP,
    MAIN_SHADOW_MAP,
    POINT_SHADOW_CUBE_ARRAY,
} from '@orillusion/core'

// C6 acceptance: GIPass is registered only when gi.enable is true,
// declares its shadow dependencies, exposes both DDGI output handles.
// Registration is lazy (happens in start(), not constructor) because
// ddgiProbeRenderer is created by ForwardRenderJob.start().

await test('GIPass is NOT registered when gi.enable is false (default)', async () => {
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
    // GIPass registers in start(); give the RAF one tick so
    // start() runs even in the disabled case.
    await delay(120)
    expect(view.renderGraph!.getPass('GIPass')).toEqual(null)
    expect(view.renderGraph!.pool.has(DDGI_IRRADIANCE_MAP)).toEqual(false)
    engine.dispose()
})

await test('GIPass is registered when gi.enable is true, with shadow reads + DDGI writes', async () => {
    const engine = await Engine3D.init({
        setting: {
            gi: { enable: true },
        } as any,
    })
    const scene = new Scene3D()
    const cameraObj = new Object3D()
    const camera = cameraObj.addComponent(Camera3D)
    camera.perspective(60, engine.aspect, 1, 5000)
    scene.addChild(cameraObj)
    const view = new View3D()
    view.scene = scene
    view.camera = camera
    engine.startRenderView(view)
    // start() fires on the first RAF tick; wait for it.
    await delay(150)

    const feature = view.renderGraph!.getPass('GIPass') as GIPass | null
    if (!feature) throw new Error('GIPass not registered after start()')
    expect(feature.reads.length).toEqual(2)
    expect(feature.reads.indexOf(MAIN_SHADOW_MAP) >= 0).toEqual(true)
    expect(feature.reads.indexOf(POINT_SHADOW_CUBE_ARRAY) >= 0).toEqual(true)
    expect(feature.writes.length).toEqual(2)
    expect(feature.writes.indexOf(DDGI_IRRADIANCE_MAP) >= 0).toEqual(true)
    expect(feature.writes.indexOf(DDGI_DEPTH_MAP) >= 0).toEqual(true)

    const pool = view.renderGraph!.pool
    expect(pool.has(DDGI_IRRADIANCE_MAP)).toEqual(true)
    expect(pool.has(DDGI_DEPTH_MAP)).toEqual(true)

    engine.dispose()
})

setTimeout(end, 3500)
