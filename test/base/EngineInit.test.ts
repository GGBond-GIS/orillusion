import { test, end, expect } from '../util'
import { Engine3D } from '@orillusion/core';

await test('Init', async () => {
    const engine = await Engine3D.init();
    let width = Math.floor(engine.context3D.canvas.clientWidth * engine.context3D.pixelRatio)
    let height = Math.floor(engine.context3D.canvas.clientHeight * engine.context3D.pixelRatio)
    let aspect = width / height;

    expect(engine.aspect).toEqual(aspect)
})

setTimeout(end, 500)