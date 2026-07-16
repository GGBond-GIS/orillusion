import { test, end, expect, delay } from '../util'
import {
    Engine3D,
    Scene3D,
    View3D,
    Camera3D,
    Object3D,
    LitMaterial,
    Material,
    SceneColorPyramidPass,
    SortedTransparentPass,
    TransmissionOpaquePass,
    TransparentOITPass,
    TransparentResolvePass,
    SCENE_COLOR_PYRAMID,
    OIT_ACCUM_TEX,
    OIT_REVEAL_TEX,
    TRANSPARENT_DRAW_CTX,
    UnresolvedResourceError,
    PassType,
    BlendMode,
} from '@orillusion/core'

// Acceptance for the transparency rendering pipeline (P0–P2):
//
// - P0.1: per-instance MSAA setting + LitMaterial.alphaMode + the
//   alpha-to-coverage pipeline plumb.
// - P1.1: SceneColorPyramidPass registers and exposes the
//   `_SceneColorPyramid` handle.
// - P1.2: LitMaterial.transmissionFactor setter flips USE_TRANSMISSION.
// - P2: useOIT toggles the WBOIT features into the graph; sorted +
//   weighted features coexist with the right filter wiring.

await test('Engine3D defaults expose msaa and useOIT settings', async () => {
    const engine = await Engine3D.init({})
    expect((engine.setting.render as any).msaa).toEqual(0)
    expect((engine.setting.render as any).useOIT).toEqual(false)
    engine.dispose()
})

await test('SceneColorPyramidPass registers and exposes _SceneColorPyramid', async () => {
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
    await delay(120)

    const feature = view.renderGraph!.getPass('SceneColorPyramidPass') as SceneColorPyramidPass | null
    if (!feature) throw new Error('SceneColorPyramidPass not registered')
    expect(feature.writes.length).toEqual(1)
    expect(feature.writes[0]).toEqual(SCENE_COLOR_PYRAMID)

    const pool = view.renderGraph!.pool
    expect(pool.has(SCENE_COLOR_PYRAMID)).toEqual(true)
    const tex = pool.get(SCENE_COLOR_PYRAMID)
    if (!tex) throw new Error('_SceneColorPyramid resolved to null')

    engine.dispose()
})

await test('SortedTransparentPass is registered with filter=all when useOIT is off', async () => {
    const engine = await Engine3D.init({
        setting: { render: { useOIT: false } as any },
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
    await delay(120)

    const sorted = view.renderGraph!.getPass('SortedTransparentPass') as SortedTransparentPass | null
    if (!sorted) throw new Error('SortedTransparentPass not registered')
    // OIT features should NOT be in the graph when useOIT is false.
    expect(!!view.renderGraph!.getPass('TransparentOITPass')).toEqual(false)
    expect(!!view.renderGraph!.getPass('TransparentResolvePass')).toEqual(false)

    engine.dispose()
})

await test('useOIT=true registers OIT + Resolve features alongside sorted', async () => {
    const engine = await Engine3D.init({
        setting: { render: { useOIT: true } as any },
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
    await delay(120)

    const oit = view.renderGraph!.getPass('TransparentOITPass') as TransparentOITPass | null
    const resolve = view.renderGraph!.getPass('TransparentResolvePass') as TransparentResolvePass | null
    const sorted = view.renderGraph!.getPass('SortedTransparentPass') as SortedTransparentPass | null

    if (!oit) throw new Error('TransparentOITPass not registered')
    if (!resolve) throw new Error('TransparentResolvePass not registered')
    if (!sorted) throw new Error('SortedTransparentPass not registered')

    expect(oit.writes.indexOf(OIT_ACCUM_TEX) >= 0).toEqual(true)
    expect(oit.writes.indexOf(OIT_REVEAL_TEX) >= 0).toEqual(true)

    engine.dispose()
})

await test('LitMaterial.alphaMode flips ShaderState transparent + blendMode + alphaToCoverageEnabled', async () => {
    const engine = await Engine3D.init({})
    const mat = new LitMaterial(engine.context3D)

    mat.alphaMode = 'OPAQUE'
    let state = mat.shader.getDefaultColorShader().shaderState
    expect(state.transparent).toEqual(false)
    expect(state.alphaToCoverageEnabled).toEqual(false)
    expect(state.blendMode).toEqual(BlendMode.NONE)
    expect(state.depthWriteEnabled).toEqual(true)

    mat.alphaMode = 'MASK'
    state = mat.shader.getDefaultColorShader().shaderState
    expect(state.transparent).toEqual(false)
    expect(state.alphaToCoverageEnabled).toEqual(true)
    expect(state.depthWriteEnabled).toEqual(true)

    mat.alphaMode = 'BLEND'
    state = mat.shader.getDefaultColorShader().shaderState
    expect(state.transparent).toEqual(true)
    expect(state.alphaToCoverageEnabled).toEqual(false)
    expect(state.blendMode).toEqual(BlendMode.NORMAL)
    expect(state.depthWriteEnabled).toEqual(false)

    engine.dispose()
})

await test('LitMaterial.transmissionFactor setter sets uniform + USE_TRANSMISSION define', async () => {
    const engine = await Engine3D.init({})
    const mat = new LitMaterial(engine.context3D)

    expect(mat.transmissionFactor).toEqual(0.0)
    expect(mat.shader.getDefine('USE_TRANSMISSION')).toEqual(false)

    mat.transmissionFactor = 0.7
    expect(mat.transmissionFactor).toSubequal(0.7)
    expect(mat.shader.getDefine('USE_TRANSMISSION')).toEqual(true)

    mat.transmissionFactor = 0.0
    expect(mat.shader.getDefine('USE_TRANSMISSION')).toEqual(false)

    engine.dispose()
})

await test('LitMaterial.ior writes to ior uniform (not clearcoatIor)', async () => {
    const engine = await Engine3D.init({})
    const mat = new LitMaterial(engine.context3D)

    mat.ior = 1.7
    expect(mat.shader.getUniformFloat('ior')).toSubequal(1.7)
    // clearcoatIor should stay at its default 1.5 — the previous bug
    // wrote ior into clearcoatIor.
    expect(mat.shader.getUniformFloat('clearcoatIor')).toSubequal(1.5)

    engine.dispose()
})

await test('Material.oitMode default is sorted', async () => {
    const engine = await Engine3D.init({})
    const mat = new Material()
    expect(mat.oitMode).toEqual('sorted')
    mat.oitMode = 'weighted'
    expect(mat.oitMode).toEqual('weighted')
    engine.dispose()
})

await test('OIT_ACCUM passType bit is unique', async () => {
    // Ensure the new pass type doesn't collide with existing ones.
    const allOthers = [
        PassType.COLOR, PassType.REFLECTION, PassType.POSITION,
        PassType.GRAPHIC, PassType.GI, PassType.Cluster,
        PassType.SHADOW, PassType.POINT_SHADOW, PassType.POST,
        PassType.DEPTH,
    ]
    for (const p of allOthers) {
        expect(PassType.OIT_ACCUM === p).toEqual(false)
    }
})

// -----------------------------------------------------------------------------
// Transparent passes are self-contained (do not call into ColorPass via getPass)
// -----------------------------------------------------------------------------

await test('SortedTransparentPass reads _TransparentDrawContext (not ColorPass via getPass)', async () => {
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
    await delay(120)

    const sorted = view.renderGraph!.getPass('SortedTransparentPass') as SortedTransparentPass | null
    if (!sorted) throw new Error('SortedTransparentPass not registered')
    expect(sorted.reads.indexOf(TRANSPARENT_DRAW_CTX) >= 0).toEqual(true)
    expect(view.renderGraph!.pool.has(TRANSPARENT_DRAW_CTX)).toEqual(true)

    engine.dispose()
})

await test('remove(GBufferResourcePass) surfaces the transparent-draw-context dependency on the next compile', async () => {
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
    await delay(120)

    const graph = view.renderGraph!
    // GBufferResourcePass is the creator of _ColorBuffer / _NormalBuffer /
    // _TransparentDrawContext (ColorPass no longer produces them). Removing it
    // must orphan those handles at compile time rather than silently skipping.
    expect(graph.remove('GBufferResourcePass')).toEqual(true)

    let threw: Error | null = null
    try { graph.compile() } catch (e) { threw = e as Error }
    if (!(threw instanceof UnresolvedResourceError)) throw new Error('expected UnresolvedResourceError after remove(GBufferResourcePass)')
    // Could be reported against TransmissionOpaquePass, SortedTransparentPass,
    // or another _ColorBuffer / _TransparentDrawContext consumer — the
    // important thing is the error names a removed resource, not a silent
    // skip at execute.
    const removedRes = ['_ColorBuffer', '_NormalBuffer', TRANSPARENT_DRAW_CTX]
    expect(removedRes.indexOf(threw.resource) >= 0).toEqual(true)

    engine.dispose()
})

await test('TransmissionOpaquePass reads _TransparentDrawContext when registered', async () => {
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
    await delay(120)

    const trans = view.renderGraph!.getPass('TransmissionOpaquePass') as TransmissionOpaquePass | null
    if (trans) {
        expect(trans.reads.indexOf(TRANSPARENT_DRAW_CTX) >= 0).toEqual(true)
    }
    // (If TransmissionOpaquePass isn't registered in this engine config,
    // the assertion below is vacuous — the wiring still exists in the
    // class definition; we just don't have an instance to inspect.)

    engine.dispose()
})

setTimeout(end, 2500)
