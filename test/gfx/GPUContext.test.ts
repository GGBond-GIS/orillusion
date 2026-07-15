import { test, expect, end, delay } from '../util'
import { Engine3D } from '@orillusion/core';

await test('GPUContext createIndexBuffer', async () => {
    const engine = await Engine3D.init();
    expect(engine.context3D != null).toEqual(true);
})

setTimeout(end, 500)
