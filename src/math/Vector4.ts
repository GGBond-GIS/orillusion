
/***
 * Vector 4D
 * @internal
 * @group Math
 */
export class Vector4 {

    /**
     * The x axis defined as a Vector4 object with coordinates (1,0,0).
     */
    public static X_AXIS: Vector4 = new Vector4(1, 0, 0);

    /**
     * The y axis defined as a Vector4 object with coordinates (0,1,0).
     */
    public static Y_AXIS: Vector4 = new Vector4(0, 1, 0);

    /**
     * The z axis defined as a Vector4 object with coordinates (0,0,1).
     */
    public static Z_AXIS: Vector4 = new Vector4(0, 0, 1);

    /**
     * @internal
     */
    public static HELP_0: Vector4 = new Vector4();

    /**
     * @internal
     */
    public static HELP_1: Vector4 = new Vector4();

    /**
     * @internal
     */
    public static HELP_2: Vector4 = new Vector4();

    /**
     * @internal
     */
    public static EPSILON: number = 0.00001;

    /**
     * @internal
     */
    public static HELP_3: Vector4 = new Vector4();

    /**
     * @internal
     */
    public static HELP_4: Vector4 = new Vector4();

    /**
     * @internal
     */
    public static HELP_5: Vector4 = new Vector4();

    /**
     * @internal
     */
    public static HELP_6: Vector4 = new Vector4();

    public static ZERO: Vector4 = new Vector4();

    public static ONE: Vector4 = new Vector4(1, 1, 1, 1);

    public static LEFT: Vector4 = new Vector4(-1, 0, 0);

    public static RIGHT: Vector4 = new Vector4(1, 0, 0);

    public static UP: Vector4 = new Vector4(0, -1, 0);

    public static DOWN: Vector4 = new Vector4(0, 1, 0);

    public static BACK: Vector4 = new Vector4(0, 0, -1);

    public static FORWARD: Vector4 = new Vector4(0, 0, 1);

    /**
     * @language en_US
     * The first element of a Vector4 object, such as the x coordinate of
     * a point in the three-dimensional space. The default value is 0.
     */
    public x: number = 0;

    /**
     * @language en_US
     * The second element of a Vector4 object, such as the y coordinate of
     * a point in the three-dimensional space. The default value is 0.
     */
    public y: number = 0;

    /**
     * @language en_US
     * The third element of a Vector4 object, such as the y coordinate of
     * a point in the three-dimensional space. The default value is 0.
     */
    public z: number = 0;


    /**
     * A three-dimensional position or projection that can be used as 
     * a perspective projection can also be a w in a quaternion
     */
    public w: number = 1;

    constructor(x: number = 0, y: number = 0, z: number = 0, w: number = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.w = w;
    }

    public get width() {
        return this.z;
    }

    public get height() {
        return this.w;
    }

    public static crossVectors(a: Vector4, b: Vector4, target?: Vector4) {
        target = target || new Vector4();
        var ax = a.x,
            ay = a.y,
            az = a.z;
        var bx = b.x,
            by = b.y,
            bz = b.z;

        target.x = ay * bz - az * by;
        target.y = az * bx - ax * bz;
        target.z = ax * by - ay * bx;

        return target;
    }

    /**
     * Add two vectors
     */
    public static add(a: Vector4, b: Vector4, result?: Vector4): Vector4 {
        result ||= new Vector4();
        result.x = a.x + b.x;
        result.y = a.y + b.y;
        result.z = a.z + b.z;
        result.w = a.w + b.w;
        return result;
    }

    /**
     * Subtract two vectors
     */
    public static sub(a: Vector4, b: Vector4, result?: Vector4): Vector4 {
        result ||= new Vector4();
        result.x = a.x - b.x;
        result.y = a.y - b.y;
        result.z = a.z - b.z;
        result.w = a.w - b.w;
        return result;
    }

    /**
     * Multiply a vector by a scalar
     */
    public static multiplyScalar(a: Vector4, s: number, result?: Vector4): Vector4 {
        result ||= new Vector4();
        result.x = a.x * s;
        result.y = a.y * s;
        result.z = a.z * s;
        result.w = a.w * s;
        return result;
    }

    /**
     * Linear interpolation between two vectors: result = a + (b - a) * t
     */
    public static lerp(a: Vector4, b: Vector4, t: number, result?: Vector4): Vector4 {
        result ||= new Vector4();
        result.x = a.x + (b.x - a.x) * t;
        result.y = a.y + (b.y - a.y) * t;
        result.z = a.z + (b.z - a.z) * t;
        result.w = a.w + (b.w - a.w) * t;
        return result;
    }

    public static distance(pt1: Vector4, pt2: Vector4): number {
        let x: number = pt1.x - pt2.x;
        let y: number = pt1.y - pt2.y;
        let z: number = pt1.z - pt2.z;
        let w: number = pt1.w - pt2.w;
        return Math.sqrt(x * x + y * y + z * z + w * w);
    }

    public set(x: number, y: number, z: number, w: number): this {
        this.x = x;
        this.y = y;
        this.z = z;
        this.w = w;
        return this;
    }

    public multiplyScalar(scalar: number): this {
        this.x *= scalar;
        this.y *= scalar;
        this.z *= scalar;
        this.w *= scalar;
        return this;
    }

    public copy(v: Vector4): this {
        this.x = v.x;
        this.y = v.y;
        this.z = v.z;
        this.w = v.w;
        return this;
    }

    public clone(): Vector4 {
        return new Vector4(this.x, this.y, this.z, this.w);
    }

    // -------- Standard instance API --------

    public add(a: Vector4): this {
        return Vector4.add(this, a, this) as this;
    }

    public sub(a: Vector4): this {
        return Vector4.sub(this, a, this) as this;
    }

    public addVectors(a: Vector4, b: Vector4): this {
        return Vector4.add(a, b, this) as this;
    }

    public subVectors(a: Vector4, b: Vector4): this {
        return Vector4.sub(a, b, this) as this;
    }

    public divideScalar(s: number): this {
        return this.multiplyScalar(1 / s);
    }

    public negate(): this {
        this.x = -this.x;
        this.y = -this.y;
        this.z = -this.z;
        this.w = -this.w;
        return this;
    }

    public dot(v: Vector4): number {
        return this.x * v.x + this.y * v.y + this.z * v.z + this.w * v.w;
    }

    public lengthSq(): number {
        return this.dot(this);
    }

    public length(): number {
        return Math.sqrt(this.lengthSq());
    }

    public normalize(): this {
        return this.divideScalar(this.length() || 1);
    }

    /** Linearly interpolate this towards v by alpha. */
    public lerp(v: Vector4, alpha: number): this {
        this.x += (v.x - this.x) * alpha;
        this.y += (v.y - this.y) * alpha;
        this.z += (v.z - this.z) * alpha;
        this.w += (v.w - this.w) * alpha;
        return this;
    }

    public lerpVectors(v1: Vector4, v2: Vector4, alpha: number): this {
        return Vector4.lerp(v1, v2, alpha, this) as this;
    }

    public equals(v: Vector4): boolean {
        return this.x === v.x && this.y === v.y && this.z === v.z && this.w === v.w;
    }

    public fromArray(array: ArrayLike<number>, offset: number = 0): this {
        this.x = array[offset];
        this.y = array[offset + 1];
        this.z = array[offset + 2];
        this.w = array[offset + 3];
        return this;
    }

    public toArray(array: number[] = [], offset: number = 0): number[] {
        array[offset] = this.x;
        array[offset + 1] = this.y;
        array[offset + 2] = this.z;
        array[offset + 3] = this.w;
        return array;
    }

    /** Apply a 4x4 matrix to this vector (w included). */
    public applyMatrix4(m: { rawData: ArrayLike<number> }): this {
        const e = m.rawData;
        const x = this.x, y = this.y, z = this.z, w = this.w;
        this.x = e[0] * x + e[4] * y + e[8] * z + e[12] * w;
        this.y = e[1] * x + e[5] * y + e[9] * z + e[13] * w;
        this.z = e[2] * x + e[6] * y + e[10] * z + e[14] * w;
        this.w = e[3] * x + e[7] * y + e[11] * z + e[15] * w;
        return this;
    }
}
