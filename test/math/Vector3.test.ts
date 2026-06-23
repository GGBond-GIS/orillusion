import { test, expect, end, delay } from '../util'
import { Vector3 } from '@orillusion/core';

await test('Vector3 base', async () => {
    let a = new Vector3(20, 10, 0);

    expect(a.x).toEqual(20);
    expect(a.y).toEqual(10);
    expect(a.z).toEqual(0);

    let b = a.clone();
    expect(b.x).toEqual(a.x);
    expect(b.y).toEqual(a.y);
    expect(b.z).toEqual(a.z);

    a.set(0, 0, 0);
    expect(a.x).toEqual(0);
    expect(a.y).toEqual(0);
    expect(a.z).toEqual(0);
})

await test('Vector3 add', async () => {
    let a = new Vector3(20, 10, 0);
    let b = new Vector3(10, 10, 0);

    let result = a.add(b);
    expect(result.x).toEqual(30);
    expect(result.y).toEqual(20);
    expect(result.z).toEqual(0);
})

await test('Vector3 sub', async () => {
    let a = new Vector3(20, 10, 0);
    let b = new Vector3(10, 10, 0);

    let result = a.sub(b);
    expect(result.x).toEqual(10);
    expect(result.y).toEqual(0);
    expect(result.z).toEqual(0);
})

await test('Vector3 dotProduct', async () => {
    let a = new Vector3(20, 10, 0);
    let b = new Vector3(10, 10, 0);

    let result = a.dotProduct(b);
    expect(result).toEqual(300);
})

await test('Vector3 addScalar', async () => {
    let a = new Vector3(20, 10, 0);

    let result = a.addXYZW(10, 10, 10, 0);
    expect(result.x).toEqual(30);
    expect(result.y).toEqual(20);
    expect(result.z).toEqual(10);
})

await test('Vector3 scaleBy', async () => {
    let a = new Vector3(20, 10, 0);
    a.multiplyScalar(10);

    expect(a.x).toEqual(200);
    expect(a.y).toEqual(100);
    expect(a.z).toEqual(0);
})

await test('Vector3 divideScalar', async () => {
    let a = new Vector3(20, 10, 0);

    let result = a.divideScalar(10);

    expect(result.x).toSubequal(2);
    expect(result.y).toSubequal(1);
    expect(result.z).toSubequal(0);
})

await test('Vector3 distance', async () => {
    let a = new Vector3(20, 10, 0);
    let b = new Vector3(10, 10, 0);

    let result = Vector3.distance(a, b)
    expect(result).toSubequal(10);
})

await test('Vector3 length', async () => {
    let a = new Vector3(20, 10, 0);
    let result = a.length;

    expect(result).toSubequal(22.360679774997898);
})

await test('Vector3 getAngle', async () => {
    let a = new Vector3(20, 10, 0);
    let b = new Vector3(10, 10, 0);

    let result = Vector3.getAngle(a, b);

    expect(result).toSubequal(18.43494882292201);
})

await test('Vector3 normalize', async () => {
    let a = new Vector3(20, 10, 0)
    a.normalize();

    expect(a.x).toSubequal(0.89442719099);
    expect(a.y).toSubequal(0.44721359549);
    expect(a.z).toSubequal(0);
})

// --- Standard mutator semantics ---

await test('Vector3 add returns this (mutator)', async () => {
    let a = new Vector3(1, 2, 3);
    let b = new Vector3(10, 20, 30);
    let r = a.add(b);
    expect(r === a).toEqual(true);
    expect(a.x).toEqual(11);
})

await test('Vector3 clone preserves source', async () => {
    let a = new Vector3(1, 2, 3);
    let c = a.clone().add(new Vector3(10, 0, 0));
    expect(a.x).toEqual(1);
    expect(c.x).toEqual(11);
})

// --- Short-name aliases ---

await test('Vector3 sub', async () => {
    let a = new Vector3(20, 10, 0);
    a.sub(new Vector3(5, 3, 1));
    expect(a.x).toEqual(15);
    expect(a.z).toEqual(-1);
})

await test('Vector3 cross', async () => {
    let a = new Vector3(1, 0, 0);
    a.cross(new Vector3(0, 1, 0));
    expect(a.z).toEqual(1);
})

// --- Canonical instance-API additions ---

await test('Vector3 addVectors (this = a + b)', async () => {
    let out = new Vector3();
    out.addVectors(new Vector3(1, 2, 3), new Vector3(10, 20, 30));
    expect(out.x).toEqual(11);
    expect(out.z).toEqual(33);
})

await test('Vector3 dot', async () => {
    let r = new Vector3(1, 2, 3).dot(new Vector3(4, 5, 6));
    expect(r).toEqual(32);
})

await test('Vector3 distanceTo / angleTo', async () => {
    let d = new Vector3(0, 0, 0).distanceTo(new Vector3(3, 4, 0));
    expect(d).toSubequal(5);
    let a = new Vector3(1, 0, 0).angleTo(new Vector3(0, 1, 0));
    expect(a).toSubequal(Math.PI / 2);
})

await test('Vector3 reflect', async () => {
    let v = new Vector3(1, -1, 0);
    v.reflect(new Vector3(0, 1, 0));
    expect(v.x).toEqual(1);
    expect(v.y).toEqual(1);
})

await test('Vector3 projectOnVector', async () => {
    let v = new Vector3(3, 4, 0);
    v.projectOnVector(new Vector3(1, 0, 0));
    expect(v.x).toEqual(3);
    expect(v.y).toEqual(0);
})

await test('Vector3 setFromMatrixPosition', async () => {
    let fakeMat: any = { rawData: [1,0,0,0, 0,1,0,0, 0,0,1,0, 7,8,9,1] };
    let v = new Vector3().setFromMatrixPosition(fakeMat);
    expect(v.x).toEqual(7);
    expect(v.y).toEqual(8);
    expect(v.z).toEqual(9);
})

setTimeout(end, 500)
