import { test, end, expect } from '../util'
import {
    Engine3D,
    ForwardRendererJob,
    Scene3D,
    View3D,
    Camera3D,
    Object3D,
    PreDepthPass,
    MAIN_DEPTH_TEXTURE,
    Z_BUFFER_TEXTURE,
} from '@orillusion/core'

// C2 acceptance: PreDepthPass is only added to the graph when
// `setting.render.zPrePass === true`. When added, its external
// handles (_MainDepthTexture + _ZBufferTexture) are resolvable
// immediately after startRenderView.

await test('PreDepthPass is NOT registered when zPrePass is false', async () => {
    const engine = await Engine3D.init({
        setting: { render: { zPrePass: false } as any },
    })
    const scene = new Scene3D()
    const cameraObj = new Object3D()
    const camera = cameraObj.addComponent(Camera3D)
    camera.perspective(60, engine.aspect, 1, 5000)
    scene.addChild(cameraObj)
    const view = new View3D()
    view.scene = scene
    view.camera = camera
    engine.startRenderView(view) as ForwardRendererJob

    expect(view.renderGraph!.getPass('PreDepthPass')).toEqual(null)
    expect(view.renderGraph!.pool.has(MAIN_DEPTH_TEXTURE)).toEqual(false)

    engine.dispose()
})

await test('PreDepthPass is registered and exposes _MainDepthTexture + _ZBufferTexture when zPrePass is true', async () => {
    const engine = await Engine3D.init({
        setting: { render: { zPrePass: true } as any },
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

    const feature = view.renderGraph!.getPass('PreDepthPass') as PreDepthPass | null
    if (!feature) throw new Error('PreDepthPass not registered')
    // The pass writes its internal depth RT (_PreDepthRT) plus the two
    // published side-channel handles. Assert the external handles are present
    // rather than the raw write count (which includes the RT edges).
    expect(feature.writes.indexOf(MAIN_DEPTH_TEXTURE) >= 0).toEqual(true)
    expect(feature.writes.indexOf(Z_BUFFER_TEXTURE) >= 0).toEqual(true)

    const pool = view.renderGraph!.pool
    expect(pool.has(MAIN_DEPTH_TEXTURE)).toEqual(true)
    expect(pool.has(Z_BUFFER_TEXTURE)).toEqual(true)

    const depthTex = pool.get(MAIN_DEPTH_TEXTURE)
    const zBuf = pool.get(Z_BUFFER_TEXTURE)
    if (!depthTex) throw new Error('_MainDepthTexture resolved to null')
    if (!zBuf) throw new Error('_ZBufferTexture resolved to null')

    engine.dispose()
})

setTimeout(end, 2500)
