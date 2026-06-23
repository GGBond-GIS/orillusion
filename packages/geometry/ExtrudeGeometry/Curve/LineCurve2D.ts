import { Vector2 } from "@orillusion/core";
import { Curve2D, CurveType } from "./Curve2D";

export class LineCurve2D extends Curve2D {
    public v0: Vector2;
    public v1: Vector2;

    constructor(v0: Vector2, v1: Vector2) {
        super();
        this.v0 = v0;
        this.v1 = v1;
        this.curveType = CurveType.LineCurve;
    }

    public get points(): Vector2[] {
        return [this.v0, this.v1];
    }

    public getPoint(t: number, result: Vector2 = new Vector2()): Vector2 {
        if (t >= 1) {
            result.copy(this.v1);
        } else {
            Vector2.sub(this.v1, this.v0, result);
            result.multiplyScalar(t);
            Vector2.add(result, this.v0, result);
        }
        return result;
    }

    public getPointAt(u: number, result: Vector2 = new Vector2()): Vector2 {
        return this.getPoint(u, result);
    }

    public getTangent(t: number, result: Vector2 = new Vector2()): Vector2 {
        Vector2.sub(this.v1, this.v0, result);
        result.normalize();
        return result;
    }

    public getTangentAt(u: number, result: Vector2 = new Vector2()): Vector2 {
        return this.getTangent(u, result);
    }

    public copyFrom(other: LineCurve2D) {
        this.v0.copy(other.v0);
        this.v1.copy(other.v1);
    }
}
