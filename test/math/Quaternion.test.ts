import { test, expect, end, delay } from '../util'
import { Engine3D, Quaternion, Vector3 } from '@orillusion/core';

await test('Quaternion fromEulerAngles', async () => {
    let quat = new Quaternion();
    quat.setFromEuler(0, -90, 0);

    let result = new Vector3();
    Quaternion.transformVector(quat, new Vector3(10, 0, 0), result);

    expect(result.x).toSubequal(0);
    expect(result.y).toSubequal(0);
    expect(result.z).toSubequal(10);
})

await test('Quaternion multiply', async () => {
    let quatA = new Quaternion();
    quatA.setFromEuler(0, -45, 0);

    let quatB = new Quaternion();
    quatB.setFromEuler(0, -45, 0);

    let finalQuat = new Quaternion();
    finalQuat.multiply(quatA, quatB);

    let result = new Vector3();
    Quaternion.transformVector(finalQuat, new Vector3(10, 0, 0), result);

    expect(result.x).toSubequal(0);
    expect(result.y).toSubequal(0);
    expect(result.z).toSubequal(10);
})

setTimeout(end, 500)
