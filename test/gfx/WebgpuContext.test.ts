import { test, expect, end, delay } from '../util'
import { Engine3D } from '@orillusion/core';

const engine = await Engine3D.init();

await test('webgpu context', async () => {
    expect(engine.context3D != null).toEqual(true);
})

await test('webgpu context adapter', async () => {
    expect(engine.context3D != null).toEqual(true);
    expect(engine.context3D.adapter != null).toEqual(true);
    expect(engine.context3D.device != null).toEqual(true);
})


await test('webgpu context pixelRatio', async () => {
    expect(engine.context3D != null).toEqual(true);
    expect(engine.context3D.pixelRatio >= 1).toEqual(true);
})

await test('webgpu canvas', async () => {
    expect(engine.context3D != null).toEqual(true);
    expect(engine.context3D.canvas != null).toEqual(true);
})

await test('webgpu size', async () => {
    expect(engine.context3D != null).toEqual(true);
    expect(engine.context3D.presentationSize[0] > 32).toEqual(true);
    expect(engine.context3D.presentationSize[1] > 32).toEqual(true);
    expect(engine.context3D.presentationSize[0] == engine.context3D.windowWidth).toEqual(true);
    expect(engine.context3D.presentationSize[1] == engine.context3D.windowHeight).toEqual(true);
})


setTimeout(end, 500)
