import { Vector3 } from "..";
import { PlaneClassification } from "./PlaneClassification";

/**
 * Plane3D represents a plane in 3D space.
 * It is composed of four coefficients (a, b, c, d) defining the plane equation Ax + By + Cz + D = 0.
 * @group Math
 */
export class Plane3D {
    /**
     * @language en_US
     * The A coefficient of this plane. (Also the x dimension of the plane normal)
     * @platform Web,Native
     */
    public a: number;

    /**
     * @language en_US
     * The B coefficient of this plane. (Also the y dimension of the plane normal)
     * @platform Web,Native
     */
    public b: number;

    /**
     * @language en_US
     * The C coefficient of this plane. (Also the z dimension of the plane normal)
     * @platform Web,Native
     */
    public c: number;

    /**
     * @language en_US
     * The D coefficient of this plane. (Also the inverse dot product between normal and point)
     * @platform Web,Native
     */
    public d: number;

    // indicates the alignment of the plane
    /**
     * Plane alignment: not aligned to any principal axis plane.
     */
    public static ALIGN_ANY: number = 0;

    /**
     * Plane alignment: aligned to the XY axis plane.
     */
    public static ALIGN_XY_AXIS: number = 1;

    /**
     * Plane alignment: aligned to the YZ axis plane.
     */
    public static ALIGN_YZ_AXIS: number = 2;

    /**
     * Plane alignment: aligned to the XZ axis plane.
     */
    public static ALIGN_XZ_AXIS: number = 3;

    /**
     * @language en_US
     * Create a Plane3D with ABCD coefficients
     * @param a
     * @param b
     * @param c
     * @param d
     * @platform Web,Native
     */
    constructor(a: number = 0, b: number = 0, c: number = 0, d: number = 0) {
        this.a = a;
        this.b = b;
        this.c = c;
        this.d = d;
    }

    /**
    * @language en_US
    * Fill the plane coefficients with the provided values.
    * @param a
    * @param b
    * @param c
    * @param d
    * @platform Web,Native
    */
    public setTo(a: number = 0, b: number = 0, c: number = 0, d: number = 0) {
        this.a = a;
        this.b = b;
        this.c = c;
        this.d = d;
    }

    /**
     * @language en_US
     * Fills this Plane3D with the coefficients from 3 points in 3d space.
     * @param p0 Vector3
     * @param p1 Vector3
     * @param p2 Vector3
     * @platform Web,Native
     */
    public fromPoints(p0: Vector3, p1: Vector3, p2: Vector3) {
        var d1x: number = p1.x - p0.x;
        var d1y: number = p1.y - p0.y;
        var d1z: number = p1.z - p0.z;

        var d2x: number = p2.x - p0.x;
        var d2y: number = p2.y - p0.y;
        var d2z: number = p2.z - p0.z;

        this.a = d1y * d2z - d1z * d2y;
        this.b = d1z * d2x - d1x * d2z;
        this.c = d1x * d2y - d1y * d2x;
        this.d = -(this.a * p0.x + this.b * p0.y + this.c * p0.z);
    }

    /**
     * @language en_US
     * Fills this Plane3D with the coefficients from the plane's normal and a point in 3d space.
     * @param normal Vector3
     * @param point  Vector3
     * @platform Web,Native
     */
    public fromNormalAndPoint(normal: Vector3, point: Vector3) {
        this.a = normal.x;
        this.b = normal.y;
        this.c = normal.z;
        this.d = -(this.a * point.x + this.b * point.y + this.c * point.z);
    }

    /**
     * @language en_US
     * Normalize this Plane3D
     * @returns number the length of the plane normal before normalization
     * @platform Web,Native
     */
    public normalize(): number {
        var len: number = Math.sqrt(this.a * this.a + this.b * this.b + this.c * this.c);
        if (len > 0.0) {
            var invLength: number = 1.0 / len;
            this.a *= invLength;
            this.b *= invLength;
            this.c *= invLength;
            this.d *= invLength;
        }

        return len;
    }

    /**
     * @language en_US
     * Returns the signed distance between this Plane3D and the point p.
     * @param p Vector3
     * @returns number
     * @platform Web,Native
     */
    public distance(p: Vector3): number {
        return this.a * p.x + this.b * p.y + this.c * p.z + this.d;
    }

    /**
     * @language en_US
     * Classify a point against this Plane3D. (in front, back or intersecting)
     * @param p Vector3
     * @param epsilon tolerance
     * @returns Plane3D.FRONT — point is in front of the plane;
     * Plane3D.BACK — point is behind the plane;
     * Plane3D.INTERSECT — point lies on the plane.
     * @platform Web,Native
     */
    public classifyPoint(p: Vector3, epsilon: number = 0.01): number {

        var dis: number = this.distance(p);

        if (dis < -epsilon) {
            return PlaneClassification.BACK;
        }
        else if (dis > epsilon) {
            return PlaneClassification.FRONT;
        }

        return PlaneClassification.INTERSECT;
    }

    /**
    * @language en_US
    * Returns a string representation of this Plane3D
    * @returns string
    * @platform Web,Native
    */
    public toString(): string {
        return "Plane3D [a:" + this.a + ", b:" + this.b + ", c:" + this.c + ", d:" + this.d + "]";
    }
}
