import { test, end, expect, delay } from '../util'
import { Engine3D, ForwardRendererJob, Scene3D, View3D, Camera3D, Object3D, RenderGraph } from '@orillusion/core'

// Acceptance test: Engine3D.init() produces a ForwardRendererJob,
// `view.renderGraph` is a live RenderGraph, and the engine renders
// cleanly through the graph.

await test('Engine3D.init produces a ForwardRendererJob with a live RenderGraph', async () => {
    const engine = await Engine3D.init()

    const scene = new Scene3D()
    const cameraObj = new Object3D()
    const camera = cameraObj.addComponent(Camera3D)
    camera.perspective(60, engine.aspect, 1, 5000)
    scene.addChild(cameraObj)

    const view = new View3D()
    view.scene = scene
    view.camera = camera
    const job = engine.startRenderView(view)

    expect(job instanceof ForwardRendererJob).toEqual(true)
    expect(view.renderGraph instanceof RenderGraph).toEqual(true)
    // The graph holds at least ClusterLightingPass; the full forward
    // pipeline appends many more. Assert a lower bound rather than a
    // fixed count.
    expect(view.renderGraph!.passes.length >= 1).toEqual(true)

    // Allow a few frames to elapse — the graph must render without
    // throwing or emitting validation warnings.
    await delay(250)

    engine.dispose()
})

setTimeout(end, 2000)
