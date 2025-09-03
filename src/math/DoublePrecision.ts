import { Engine3D } from "..";
import { Vector3 } from "./Vector3";

export function splitDouble(value: number): number[] {
    let doubleHigh;
    const dividend = Engine3D.setting.RTEScale;

    if (value >= 0.0) {
        doubleHigh = Math.floor(value / dividend) * dividend;
        const high = doubleHigh;
        const low = value - doubleHigh;
        return [high, low];
    }

    doubleHigh = Math.floor(-value / dividend) * dividend;
    const high = -doubleHigh;
    const low = value + doubleHigh;
    return [high, low];
}

export function splitDouble_Vector3(value: Vector3): Vector3[] {
    let xHL = splitDouble(value.x);
    let yHL = splitDouble(value.y);
    let zHL = splitDouble(value.z);
    let hi = new Vector3(xHL[0], yHL[0], zHL[0]);
    let low = new Vector3(xHL[1], yHL[1], zHL[1]);
    return [hi, low];
}

export function subtractSplitDoubles(aH: Vector3, aL: Vector3, bH: Vector3, bL: Vector3): Vector3 {
    let hi: Vector3 = new Vector3(
        aH.x - bH.x,
        aH.y - bH.y,
        aH.z - bH.z,
    );

    let low: Vector3 = new Vector3(
        aL.x - bL.x,
        aL.y - bL.y,
        aL.z - bL.z,
    );

    return new Vector3(
        hi.x + low.x,
        hi.y + low.y,
        hi.z + low.z,
    );
}
