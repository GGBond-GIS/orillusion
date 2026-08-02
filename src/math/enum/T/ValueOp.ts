import { CurveValueType, Quaternion, ValueEnumType, Vector2, Vector3, Vector4 } from "../../..";

/**
 * Generic arithmetic helpers for curve value types (number, Vector2/3/4, Quaternion).
 * @group Math
 */
export class ValueOp<T extends CurveValueType> {
    /**
     * Subtract one curve value from another, dispatching on the runtime value type.
     * @param v1 minuend
     * @param v2 subtrahend
     * @returns the component-wise difference of the same type
     */
    public static sub<T extends CurveValueType>(v1: T, v2: T) {
        let t = v1.constructor.name;
        switch (t) {
            case `number`:
                return (v1 as number) - (v2 as number);
            case 'Vector2':
                {
                    let vv1 = v1 as Vector2;
                    let vv2 = v2 as Vector2;
                    return new Vector2(vv1.x - vv2.x, vv1.y - vv2.y);
                }
            case 'Vector3':
                {
                    let vv1 = v1 as Vector3;
                    let vv2 = v2 as Vector3;
                    return new Vector3(vv1.x - vv2.x, vv1.y - vv2.y, vv1.z - vv2.z)
                }
            case 'Vector4':
                {
                    let vv1 = v1 as Vector4;
                    let vv2 = v2 as Vector4;
                    return new Vector4(vv1.x - vv2.x, vv1.y - vv2.y, vv1.z - vv2.z, vv1.w - vv2.w)
                }
            case 'Quaternion':
                {
                    let vv1 = v1 as Quaternion;
                    let vv2 = v2 as Quaternion;
                    return new Quaternion(vv1.x - vv2.x, vv1.y - vv2.y, vv1.z - vv2.z, vv1.w - vv2.w)
                }
            default:
                break;
        }


    }
}