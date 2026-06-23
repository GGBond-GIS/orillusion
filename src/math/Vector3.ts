
/**
 * Vector 3D
 * @group Math
 */
export class Vector3 {

    /**
     * Vector maximum
     */
    public static readonly MAX: Vector3 = new Vector3(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE);

    /**
     * Vector minimum
     */
    public static readonly MIN: Vector3 = new Vector3(Number.MIN_VALUE, Number.MIN_VALUE, Number.MIN_VALUE);

    /**
     * Vector maximum integer value
     */
    public static readonly SAFE_MAX: Vector3 = new Vector3(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);

    /**
     * Vector minimum integer value
     */
    public static readonly SAFE_MIN: Vector3 = new Vector3(Number.MIN_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, Number.MIN_SAFE_INTEGER);

    /**
     * X axis positive axis coordinate (1, 0, 0).
     */
    public static readonly X_AXIS: Vector3 = new Vector3(1, 0, 0);

    /**
     * The X-axis is negative (-1, 0, 0).
     */
    public static readonly neg_X_AXIS: Vector3 = new Vector3(-1, 0, 0);

    /**
     * The y axis defined as a Vector3 object with coordinates (0,1,0).
     */
    public static readonly Y_AXIS: Vector3 = new Vector3(0, 1, 0);

    /**
     * The z axis defined as a Vector3 object with coordinates (0,0,1).
     */
    public static readonly Z_AXIS: Vector3 = new Vector3(0, 0, 1);

    /**
     * @internal
     */
    public static HELP_0: Vector3 = new Vector3();

    /**
     * @internal
     */
    public static HELP_1: Vector3 = new Vector3();

    /**
     * @internal
     */
    public static HELP_2: Vector3 = new Vector3();

    /**
     * @internal
     */
    public static readonly EPSILON: number = 0.00001;

    /**
     * @internal
     */
    public static HELP_3: Vector3 = new Vector3();

    /**
     * @internal
     */
    public static HELP_4: Vector3 = new Vector3();

    /**
     * @internal
     */
    public static HELP_5: Vector3 = new Vector3();

    /**
     * @internal
     */
    public static HELP_6: Vector3 = new Vector3();

    /**
     * Returns a new vector with zero x, y, and z components
     */
    public static get ZERO(): Vector3 {
        return new Vector3(0, 0, 0);
    }

    /**
     * Returns a new vector whose x, y, and z components are all 1
     */
    public static get ONE(): Vector3 {
        return new Vector3(1, 1, 1);
    };

    /**
     * Returns a new vector pointing to the left, x is -1, y is 0, and z is 0
     */
    public static get LEFT(): Vector3 {
        return new Vector3(-1, 0, 0);
    };

    /**
     * Returns a new vector pointing in the right direction, where x is 1, y is 0, and z is 0
     */
    public static get RIGHT(): Vector3 {
        return new Vector3(1, 0, 0);
    };

    /**
     * Returns a new vector pointing upwards, that is, x equals 0, y equals 1, and z equals 0
     */
    public static get UP(): Vector3 {
        return new Vector3(0, 1, 0);
    };

    /**
     * Returns a new vector pointing down, where x is 0, y is -1, and z is 0
     */
    public static get DOWN(): Vector3 {
        return new Vector3(0, -1, 0);
    };

    /** 
     * Returns a new backward vector, x equals 0, y equals 0, and z equals negative 1
     */
    public static get BACK(): Vector3 {
        return new Vector3(0, 0, -1);
    };

    /**
     * Returns a new forward-pointing vector, that is, x is 0, y is 0, and z is 1
     */
    public static get FORWARD(): Vector3 {
        return new Vector3(0, 0, 1);
    };

    /**
     * The first element of a Vector3 object, such as the x coordinate of
     * a point in the three-dimensional space. The default value is 0.
     */
    public x: number = 0;

    /**
     * The second element of a Vector3 object, such as the y coordinate of
     * a point in the three-dimensional space. The default value is 0.
     */
    public y: number = 0;

    /**
     * The third element of a Vector3 object, such as the y coordinate of
     * a point in the three-dimensional space. The default value is 0.
     */
    public z: number = 0;

    /**
     * The z component of the vector,
     * A three-dimensional position or projection that can be used as a perspective projection
     * We can also do w in the quaternion
     */
    public w: number = 1;

    /**
     * @internal
     */
    public index: number = 0;

    /**
     * @internal
     */
    private static _index: number = 0;


    /**
     * Creates an instance of a Vector3 object. If you do not specify a.
     * parameter for the constructor, a Vector3 object is created with
     * the elements (0,0,0,0).
     *
     * @param x The first element, such as the x coordinate.
     * @param y The second element, such as the y coordinate.
     * @param z The third element, such as the z coordinate.
     * @param w An optional element for additional data such as the angle
     *          of rotation.
     */
    constructor(x: number = 0, y: number = 0, z: number = 0, w: number = 0) {
        this.set(x, y, z, w);

        this.index = Vector3._index++;
    }

    /**
     *  Set w component
     * @param value
     */
    public set a(value: number) {
        this.w = value;
    }

    /**
     *  Set x component
     * @param value 
     */
    public set r(value: number) {
        this.x = value;
    }

    /**
     *  Set the y component
     * @param value 
     */
    public set g(value: number) {
        this.y = value;
    }

    /**
     *  Set z component
     * @param value 
     */
    public set b(value: number) {
        this.z = value;
    }

    /**
     *  get the w component
     * @returns value of w
     */
    public get a(): number {
        return this.w;
    }

    /**
     *  get the x component
     * @returns value of x
     */
    public get r(): number {
        return this.x;
    }

    /**
     *  get the y component
     * @returns value of y
     */
    public get g(): number {
        return this.y;
    }

    /**
     *  get the z component
     * @returns value of z
     */
    public get b(): number {
        return this.z;
    }

    /**
     * The length of the vector, the distance from the origin (0, 0, 0) to (x, y, z)
     */
    public get length(): number {
        return Math.sqrt(this.lengthSquared);
    }

    /**
     * You get the square of the length of the vector
     * @returns 
     */
    public get lengthSquared(): number {
        return this.x * this.x + this.y * this.y + this.z * this.z;
    }

    /**
     * Get the current vector
     */
    public get position() {
        return this;
    }

    /**
     *  Obtain a vertical line segment with width through an orientation
     * @param dir
     * @param tp1
     * @param tp2
     * @param width
     */
    public static getTowPointbyDir(dir: Vector3, tp1: Vector3, tp2: Vector3, width: number, aix: Vector3) {
        if (aix == Vector3.Z_AXIS) {
            tp1.x = dir.y;
            tp1.y = -dir.x;

            tp2.x = -dir.y;
            tp2.y = dir.x;

            tp1.multiplyScalar(width * 0.5);
            tp2.multiplyScalar(width * 0.5);
        } else if (aix == Vector3.Y_AXIS) {
            tp1.x = dir.z;
            tp1.z = -dir.x;

            tp2.x = -dir.z;
            tp2.z = dir.x;

            tp1.multiplyScalar(width * 0.5);
            tp2.multiplyScalar(width * 0.5);
        }
    }

    /**
     * Calculate the distance from the point to the line
     * @param point1 Starting point of line segment
     * @param point2 End point of line segment
     * @param position Point position
     * @returns Distance from a point to a line segment
     */
    public static pointToLine(point1: Vector3, point2: Vector3, position: Vector3) {
        let space = 0;
        let a, b, c;
        a = Vector3.distance(point1, point2);
        b = Vector3.distance(point1, position);
        c = Vector3.distance(point2, position);
        if (c <= 0.000001 || b <= 0.000001) {
            space = 0;
            return space;
        }
        if (a <= 0.000001) {
            space = b;
            return space;
        }
        if (c * c >= a * a + b * b) {
            space = b;
            return space;
        }
        if (b * b >= a * a + c * c) {
            space = c;
            return space;
        }
        let p = (a + b + c) / 2;
        let s = Math.sqrt(p * (p - a) * (p - b) * (p - c));
        space = (2 * s) / a;
        return space;
    }

    /**
     * Take the dot product of two vectors.
     * @param a Vector a
     * @param b Vector b
     * @returns 
     */
    public static dot(a: Vector3, b: Vector3): number {
        return a.x * b.x + a.y * b.y + a.z * b.z;
    }

    /** Generate `total` random Vector3 points within a cube of side `randSeed` centered at origin. */
    public static getPoints(total: number, randSeed: number) {
        let points = [];
        for (let index = 0; index < total; index++) {
            const element = new Vector3(Math.random() * randSeed - randSeed * 0.5, Math.random() * randSeed - randSeed * 0.5, Math.random() * randSeed - randSeed * 0.5);
            points.push(element);
        }
        return points;
    }

    /** Generate `total` random points as a flat number array (x, y, z, ...) within a cube of side `randSeed`. */
    public static getPointNumbers(total: number, randSeed: number) {
        let points = [];
        for (let index = 0; index < total; index++) {
            points.push(Math.random() * randSeed - randSeed * 0.5, Math.random() * randSeed - randSeed * 0.5, Math.random() * randSeed - randSeed * 0.5);
        }
        return points;
    }

    /**
     * Returns the Angle, in degrees, between the source vector and the target vector.
     * @param from source vector.
     * @param to target vector.
     * @returns 
     */
    public static getAngle(from: Vector3, to: Vector3): number {
        let t = from.dotProduct(to) / (from.length * to.length);
        return (Math.acos(t) * 180) / Math.PI;
    }

    /** Returns the squared magnitude (x^2 + y^2 + z^2) of the given vector. */
    public static sqrMagnitude(arg0: Vector3): number {
        return arg0.x * arg0.x + arg0.y * arg0.y + arg0.z * arg0.z;
    }

    /** Returns the angle, in degrees, between two vectors projected onto the ZY plane. */
    public static getZYAngle(zd: Vector3, yd: Vector3) {
        return this.calAngle(zd.y, zd.z, yd.y, yd.z);
    }
    /**
     * Subtract two vectors
     * @param a Vector a
     * @param b Vector b
     * @param target output vector
     * @returns 
     */
    public static sub(a: Vector3, b: Vector3, target: Vector3 = null): Vector3 {
        target = target || new Vector3();
        target.x = a.x - b.x;
        target.y = a.y - b.y;
        target.z = a.z - b.z;

        return target;
    }

    /**
     * Add two vectors
     * @param a Vector a
     * @param b Vector b
     * @param target output vector
     * @returns 
     */
    public static add(a: Vector3, b: Vector3, target: Vector3 = null): Vector3 {
        target = target || new Vector3();
        target.x = a.x + b.x;
        target.y = a.y + b.y;
        target.z = a.z + b.z;
        return target;
    }

    /**
     * Component-wise multiply two vectors
     */
    public static multiply(a: Vector3, b: Vector3, result?: Vector3): Vector3 {
        result ||= new Vector3();
        result.x = a.x * b.x;
        result.y = a.y * b.y;
        result.z = a.z * b.z;
        return result;
    }

    /**
     * Component-wise divide two vectors
     */
    public static divide(a: Vector3, b: Vector3, result?: Vector3): Vector3 {
        result ||= new Vector3();
        result.x = a.x / b.x;
        result.y = a.y / b.y;
        result.z = a.z / b.z;
        return result;
    }

    /**
     * Multiply a vector by a scalar
     */
    public static multiplyScalar(a: Vector3, s: number, result?: Vector3): Vector3 {
        result ||= new Vector3();
        result.x = a.x * s;
        result.y = a.y * s;
        result.z = a.z * s;
        return result;
    }

    /**
     * result = a + b * s
     */
    public static addScaledVector(a: Vector3, b: Vector3, s: number, result?: Vector3): Vector3 {
        result ||= new Vector3();
        result.x = a.x + b.x * s;
        result.y = a.y + b.y * s;
        result.z = a.z + b.z * s;
        return result;
    }

    /**
     * Cross product of two vectors
     */
    public static cross(a: Vector3, b: Vector3, result?: Vector3): Vector3 {
        result ||= new Vector3();
        const ax = a.x, ay = a.y, az = a.z;
        const bx = b.x, by = b.y, bz = b.z;
        result.x = ay * bz - az * by;
        result.y = az * bx - ax * bz;
        result.z = ax * by - ay * bx;
        result.w = 1;
        return result;
    }

    /**
     * Negate a vector
     */
    public static negate(a: Vector3, result?: Vector3): Vector3 {
        result ||= new Vector3();
        result.x = -a.x;
        result.y = -a.y;
        result.z = -a.z;
        return result;
    }

    /**
     * Component-wise minimum of two vectors
     */
    public static min(a: Vector3, b: Vector3, result?: Vector3): Vector3 {
        result ||= new Vector3();
        result.x = Math.min(a.x, b.x);
        result.y = Math.min(a.y, b.y);
        result.z = Math.min(a.z, b.z);
        return result;
    }

    /**
     * Component-wise maximum of two vectors
     */
    public static max(a: Vector3, b: Vector3, result?: Vector3): Vector3 {
        result ||= new Vector3();
        result.x = Math.max(a.x, b.x);
        result.y = Math.max(a.y, b.y);
        result.z = Math.max(a.z, b.z);
        return result;
    }

    /**
     * @internal
     * @param current 
     * @param target 
     * @param currentVelocity 
     * @param smoothTime 
     * @param maxSpeed 
     * @param deltaTime 
     * @returns 
     */
    public static smoothDamp(current: Vector3, target: Vector3, currentVelocity: Vector3, smoothTime: number, maxSpeed: number, deltaTime: number) {
        // smoothTime = Math.max(0.0001, smoothTime);
        // let num = 2 / smoothTime;
        // let num2 = num * deltaTime;
        // let num3 = 1 / (1 + num2 + 0.48 * num2 * num2 + 0.235 * num2 * num2 * num2);
        // let vector = Vector3.Sub(current, target);
        // let vector2 = target;
        // let maxLength = maxSpeed * smoothTime;
        // vector.clampLength(-maxLength, maxLength);
        // target = Vector3.Sub(current, vector, target);
        // let vector3 = Vector3.Add(currentVelocity, vector.multiplyScalar(num));
        // vector3.x = vector3.x + (vector.x - vector3.x) * num3;
        // vector3.y = vector3.y + (vector.y - vector3.y) * num3;
        // vector3.z = vector3.z + (vector.z - vector3.z) * num3;
        // currentVelocity = Vector3.Sub( vector3 , vector);
        // return target + (vector - vector2) * num3;
        return null;
    }

    /**
     * Calculate the distance between two vectors
     * @param pt1 Vector 1
     * @param pt2 Vector 2
     * @returns number The distance between two vectors
     */
    public static distance(pt1: Vector3, pt2: Vector3): number {
        var x: number = pt1.x - pt2.x;
        var y: number = pt1.y - pt2.y;
        var z: number = pt1.z - pt2.z;
        return Math.sqrt(x * x + y * y + z * z);
    }

    /**
     * Calculate the square distance between two vectors
     * @param pt1 Vector 1
     * @param pt2 Vector 2
     * @returns number The square distance between two vectors
     */
    public static squareDistance(pt1: Vector3, pt2: Vector3): number {
        var x: number = pt1.x - pt2.x;
        var y: number = pt1.y - pt2.y;
        var z: number = pt1.z - pt2.z;
        return x * x + y * y + z * z;
    }
    /**
     * Calculate the distance between two vectors XZ axes
     * @param pt1 Vector 1
     * @param pt2 Vector 2
     * @returns number The distance between two vectors
     */
    public static distanceXZ(pt1: Vector3, pt2: Vector3): number {
        var x: number = pt1.x - pt2.x;
        var y: number = 0;
        var z: number = pt1.z - pt2.z;
        return Math.sqrt(x * x + y * y + z * z);
    }

    /**
     * Sets the current vector x, y, z, and w components
     * @param x 
     * @param y 
     * @param z 
     * @param w 
     * @returns 
     */
    public set(x: number, y: number, z: number, w: number = 1) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.w = w;
        return this;
    }

    /**
     * Adds vector `a` to this vector (component-wise on xyz). Mutates and returns this.
     */
    public add(a: Vector3): this {
        return Vector3.add(this, a, this) as this;
    }

    /** Set this = a + b. Ternary mutator form. */
    public addVectors(a: Vector3, b: Vector3): this {
        return Vector3.add(a, b, this) as this;
    }

    /** Set this = a - b. Mutates and returns this. */
    public subVectors(a: Vector3, b: Vector3): this {
        return Vector3.sub(a, b, this) as this;
    }

    /** Set this = a * b component-wise. */
    public multiplyVectors(a: Vector3, b: Vector3): this {
        return Vector3.multiply(a, b, this) as this;
    }

    /** Add scalar to x, y, and z. Mutates and returns this. */
    public addScalar(scalar: number): Vector3{
        this.x += scalar;
        this.y += scalar;
        this.z += scalar;
        return this;
    }

    /** Subtract scalar from x, y, and z. Mutates and returns this. */
    public subScalar(scalar: number): Vector3{
        this.x -= scalar;
        this.y -= scalar;
        this.z -= scalar;
        return this;
    }

    /**
     * Component-wise minimum with `v`. Mutates and returns this.
     */
    public min(v: Vector3): this {
        return Vector3.min(this, v, this) as this;
    }

    /**
     * Component-wise maximum with `v`. Mutates and returns this.
     */
    public max(v: Vector3): this {
        return Vector3.max(this, v, this) as this;
    }

    /** Squared Euclidean distance from this vector to v. */
    public distanceToSquared(v: Vector3): number {
        let dx = this.x - v.x;
        let dy = this.y - v.y;
        let dz = this.z - v.z;
        return dx * dx + dy * dy + dz * dz;
    }

    /**
     * Adds (x, y, z, w) to each component. Mutates and returns this.
     */
    public addXYZW(x: number, y: number, z: number, w: number): this {
        this.x += x;
        this.y += y;
        this.z += z;
        this.w += w;
        return this;
    }

    /**
     * Clone a vector with the same components as the current vector
     */
    public clone(): Vector3 {
        return new Vector3(this.x, this.y, this.z, this.w);
    }

    /**
     * The components of the source vector are set to the current vector
     * @param src Original vector
     * @returns 
     */

    /**
     * Subtract two vectors and assign the result to yourself
     * @param a Minus vector
     */
    public decrementBy(a: Vector3): this {
        this.x -= a.x;
        this.y -= a.y;
        this.z -= a.z;
        return this;
    }

    /**
     * 
     * Calculate the dot product of two vectors and return the Angle relationship between the two vectors
     * @param a The vector that you need to compute
     * @returns number Returns the Angle relationship between two vectors
     */
    public dotProduct(a: Vector3): number {
        return this.x * a.x + this.y * a.y + this.z * a.z;
    }

    // /**
    //  * @language en_US
    //  * @param toCompare The Vector3 object to be compared with the current
    //  *                  Vector3 object.
    //  * @param allFour   An optional parameter that specifies whether the w
    //  *                  property of the Vector3 objects is used in the
    //  *                  comparison.
    //  * @returns 
    //  *          to the current Vector3 object; false if it is not equal.
    //  */

    /**
     * 
     * Find whether the values of two vectors are identical
     * @param toCompare The vector to compare
     * @param allFour The default parameter is 1, whether to compare the w component
     * @returns A value of true if the specified Vector3 object is equal to the current Vector3 object; false if it is not equal.
     */
    public equals(toCompare: Vector3, allFour: boolean = false): boolean {
        return this.x == toCompare.x && this.y == toCompare.y && this.z == toCompare.z && (!allFour || this.w == toCompare.w);
    }

    // /**
    //  * @language en_US
    //  * Increments the value of the x, y, and z elements of the current
    //  * Vector3 object by the values of the x, y, and z elements of a
    //  * specified Vector3 object. Unlike the <code>Vector3.add()</code>
    //  * method, the <code>incrementBy()</code> method changes the current
    //  * Vector3 object and does not return a new Vector3 object.
    //  *
    //  * @param a The Vector3 object to be added to the current Vector3
    //  *          object.
    //  */

    /**
     * The current vector plus is equal to the vector, plus just the x, y, and z components
     * @param a vector
     */
    public incrementBy(a: Vector3): this {
        this.x += a.x;
        this.y += a.y;
        this.z += a.z;
        return this;
    }


    /**
     * Component-wise divides this vector by `v`. Mutates and returns this.
     */
    public divide(v: Vector3): this {
        return Vector3.divide(this, v, this) as this;
    }


    /**
     * Sets the current Vector3 object to its inverse. The inverse object
     * is also considered the opposite of the original object. The value of
     * the x, y, and z properties of the current Vector3 object is changed
     * to -x, -y, and -z.
     */
    public negate() {
        this.x = -this.x;
        this.y = -this.y;
        this.z = -this.z;
        return this;
    }

    /**
     * Scales the line segment between(0,0) and the current point to a set
     * length.
     *
     * @param thickness The scaling value. For example, if the current
     * Vector3 object is (0,3,4), and you normalize it to
     * 1, the point returned is at(0,0.6,0.8).
     */
    public normalize(thickness: number = 1): Vector3 {
        let self = this;
        if (this.length != 0) {
            var invLength = thickness / this.length;
            this.x *= invLength;
            this.y *= invLength;
            this.z *= invLength;
            return self;
        }
        return self;
    }

    /**
     * Apply the rotation quaternion
     * @param q quaternion
     * @returns 
     */
    public applyQuaternion(q) {
        const x = this.x,
            y = this.y,
            z = this.z;
        const qx = q.x,
            qy = q.y,
            qz = q.z,
            qw = q.w;

        // calculate quat * vector

        const ix = qw * x + qy * z - qz * y;
        const iy = qw * y + qz * x - qx * z;
        const iz = qw * z + qx * y - qy * x;
        const iw = -qx * x - qy * y - qz * z;

        // calculate result * inverse quat

        this.x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
        this.y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
        this.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;

        return this;
    }

    /** Transform this vector as a point by Matrix4 m. Mutates and returns this. */
    public applyMatrix4(m): this {
        return m.transformPoint(this) as this;
    }

    /**
     * @language en_US
     * Sets the members of Vector3 to the specified values
     *
     * @param xa The first element, such as the x coordinate.
     * @param ya The second element, such as the y coordinate.
     * @param za The third element, such as the z coordinate.
     */
    public setTo(xa: number, ya: number, za: number, wa: number = 1): void {
        this.x = xa;
        this.y = ya;
        this.z = za;
        this.w = wa;
    }

    /**
     * Copy the components of the source vector to this vector
     * @param src Source vector
     * @returns 
     */
    public copy(src: Vector3): this {
        this.x = src.x;
        this.y = src.y;
        this.z = src.z;
        this.w = src.w;
        return this;
    }

    /**
     * @language en_US
     * Subtracts the value of the x, y, and z elements of the current
     * Vector3 object from the values of the x, y, and z elements of
     * another Vector3 object. Returns a new Vector3.
     *
     * @param a The Vector3 object to be subtracted from the current
     *          Vector3 object.
     * @returns A new Vector3 object that is the difference between the
     *          current Vector3 and the specified Vector3 object.
     */
    public sub(a: Vector3): this {
        return Vector3.sub(this, a, this) as this;
    }

    /**
     * Component-wise multiplies this vector by `other`. Mutates and returns this.
     */
    public multiply(other: Vector3): this {
        return Vector3.multiply(this, other, this) as this;
    }

    /**
    * Computes the linear interpolation between two Vector3, and the result is the current object
    * @param v0 Vector 1
    * @param v1 Vector 2
    * @param t Interpolation factor
    */
    public lerp(v0: Vector3, v1: Vector3, t: number): void {
        var v0x: number = v0.x,
            v0y: number = v0.y,
            v0z: number = v0.z,
            v0w: number = v0.w;
        var v1x: number = v1.x,
            v1y: number = v1.y,
            v1z: number = v1.z,
            v1w: number = v1.w;

        this.x = (v1x - v0x) * t + v0x;
        this.y = (v1y - v0y) * t + v0y;
        this.z = (v1z - v0z) * t + v0z;
        this.w = (v1w - v0w) * t + v0w;
    }

    /**
     * The x, y, and z components of this vector are rounded upward to the nearest integers.
     * @param min minimum value
     * @param max maximum value
     * @returns 
     */
    public clamp(min: Vector3, max: Vector3): Vector3 {
        // assumes min < max, componentwise

        this.x = Math.max(min.x, Math.min(max.x, this.x));
        this.y = Math.max(min.y, Math.min(max.y, this.y));
        this.z = Math.max(min.z, Math.min(max.z, this.z));

        return this;
    }

    //     /**
    //    *
    //    * Computes the linear interpolation between two Vector3, and the result is the current object
    //    * @param lhs Vector3 1
    //    * @param rhs Vector3 2
    //    * @param t Interpolation factor
    //    */
    //     public slerp(lhs: Vector3, rhs: Vector3, t: number): void {
    //         var lhsMag: number = Math.sqrt(this.Dot(lhs, lhs));
    //         var rhsMag: number = Math.sqrt(this.Dot(rhs, rhs));

    //         if (lhsMag < 0.00001 || rhsMag < 0.00001) {
    //             return this.lerp(lhs, rhs, t);
    //         }

    //         var lerpedMagnitude: number = lhsMag + t * (rhsMag - lhsMag);

    //         var dot: number = this.Dot(lhs, rhs) / (lhsMag * rhsMag);

    //         // direction is almost the same
    //         if (dot > 1.0 - 0.00001) {
    //             return this.lerp(lhs, rhs, t);
    //         }
    //         // directions are almost opposite
    //         else if (dot < -1.0 + 0.00001) {
    //             Vector3.HELP_0.copy(lhs);
    //             var lhsNorm: Vector3 = Vector3.HELP_0.divide(lhsMag);
    //             this.OrthoNormalVectorFast(lhsNorm, Vector3.HELP_1);
    //             var axis: Vector3 = Vector3.HELP_1;
    //             Quaternion.HELP_0.setFromAxisAngle(Vector3.HELP_1, 3.1415926 * t * MathConfig.RADIANS_TO_DEGREES);
    //             var m: Matrix4 = Quaternion.HELP_0.toMatrix3D(Matrix4.helpMatrix);
    //             m.transformVector4(lhsNorm, this);
    //             this.multiplyScalar(lerpedMagnitude);
    //             return;
    //         }
    //         // normal case
    //         else {
    //             lhs.dotProduct;
    //             this.Cross(lhs, rhs, Vector3.HELP_0);
    //             var axis: Vector3 = Vector3.HELP_0;
    //             Vector3.HELP_1.copy(lhs);
    //             var lhsNorm: Vector3 = Vector3.HELP_1.divide(lhsMag);
    //             axis.normalize();
    //             var angle: number = Math.acos(dot) * t;
    //             Quaternion.HELP_0.setFromAxisAngle(axis, angle * MathConfig.RADIANS_TO_DEGREES);
    //             var m: Matrix4 = Quaternion.HELP_0.toMatrix3D(Matrix4.helpMatrix);
    //             m.transformVector4(lhsNorm, this);
    //             this.multiplyScalar(lerpedMagnitude);
    //             return;
    //         }
    //     }

    /**
     * Returns the string form of the current vector
     * @returns 
     */
    public toString(): string {
        return '<' + this.x + ', ' + this.y + ', ' + this.z + '>';
    }

    //  */
    // public vertical(a: Vector3, dir: Vector3, target: Vector3) {
    //   let DoT = Vector3.dot(dir, target);
    //   if (DoT > 0) {
    //     target.x = a.y;
    //     target.y = -a.x;
    //   } else {
    //     target.x = -a.y;
    //     target.y = a.x;
    //   }
    // }

    /** Snap this vector to the nearest 2D axis direction (LEFT/RIGHT/UP/DOWN) based on x and y. */
    public normalizeToWay2D_XY() {
        let tx = Math.abs(this.x);
        let ty = Math.abs(this.y);
        if (tx > ty) {
            if (this.x > 0) {
                this.copy(Vector3.RIGHT);
            } else {
                this.copy(Vector3.LEFT);
            }
        } else {
            if (this.y > 0) {
                this.copy(Vector3.DOWN);
            } else {
                this.copy(Vector3.UP);
            }
        }
    }

    /** Returns the x, y, and z components as a new array. */
    public toArray() {
        return [this.x, this.y, this.z];
    }

    /** Write x, y, and z as little-endian float32 values into the DataView. */
    public copyToBytes(byte: DataView) {
        byte.setFloat32(0 * Float32Array.BYTES_PER_ELEMENT, this.x, true);
        byte.setFloat32(1 * Float32Array.BYTES_PER_ELEMENT, this.y, true);
        byte.setFloat32(2 * Float32Array.BYTES_PER_ELEMENT, this.z, true);
    }

    /**
     * You take the cross product of two vectors,
     * The cross product is going to be the perpendicular vector between these two vectors
     * @param a Take the cross product of another vector
     * @returns Vector3 returns the cross product vector
     */
    /**
     * Cross product with another vector. Returns a new Vector3.
     */
    public cross(a: Vector3): this {
        return Vector3.cross(this, a, this) as this;
    }

    /** Set this = cross product of a and b. Mutates and returns this. */
    public crossVectors(a: Vector3, b: Vector3): this {
        Vector3.cross(a, b, this);
        return this;
    }

    /** Multiply x, y, and z by scalar. Mutates and returns this. */
    public multiplyScalar(scalar: number) {
        this.x *= scalar;
        this.y *= scalar;
        this.z *= scalar;

        return this;
    }

    /** Set x/y/z from array starting at firstElementPos. */
    public setFromArray(array: number[], firstElementPos: number = 0) {
        this.x = array[firstElementPos];
        this.y = array[firstElementPos + 1];
        this.z = array[firstElementPos + 2];
    }

    /**
     * Divides this vector by scalar. Mutates and returns this.
     */
    public divideScalar(scalar: number): this {
        return Vector3.multiplyScalar(this, 1 / scalar, this) as this;
    }

    /**
     * Clamps the length of this vector into [min, max]. Mutates and returns this.
     */
    public clampLength(min: number, max: number): this {
        let length = this.length;
        return this.divideScalar(length || 1).multiplyScalar(Math.max(min, Math.min(max, length))) as this;
    }

    /** Set x, y, and z all to value. Mutates and returns this. */
    public setScalar(value: number) {
        this.x = value;
        this.y = value;
        this.z = value;
        return this;
    }

    /** Add v * scale to this vector. Mutates and returns this. */
    public addScaledVector(v: Vector3, scale: number): Vector3 {
        this.x += v.x * scale;
        this.y += v.y * scale;
        this.z += v.z * scale;
        return this;
    }

    // -------- Standard instance API --------

    /** Dot product. Canonical alias of {@link dotProduct}. */
    public dot(v: Vector3): number {
        return this.x * v.x + this.y * v.y + this.z * v.z;
    }

    /** Squared length of this vector. */
    public lengthSq(): number {
        return this.x * this.x + this.y * this.y + this.z * this.z;
    }

    /** Euclidean distance to v. */
    public distanceTo(v: Vector3): number {
        return Math.sqrt(this.distanceToSquared(v));
    }

    /** Angle between this and v, in radians (range [0, π]). */
    public angleTo(v: Vector3): number {
        const denom = Math.sqrt(this.lengthSq() * v.lengthSq());
        if (denom === 0) return Math.PI / 2;
        const theta = this.dot(v) / denom;
        return Math.acos(Math.max(-1, Math.min(1, theta)));
    }

    /** Set this to v1 + (v2 - v1) * alpha. Canonical alias of {@link lerp}. */
    public lerpVectors(v1: Vector3, v2: Vector3, alpha: number): this {
        this.lerp(v1, v2, alpha);
        return this;
    }

    /** Set this = position column of Matrix4 m. */
    public setFromMatrixPosition(m: { rawData: ArrayLike<number> }): this {
        const e = m.rawData;
        this.x = e[12];
        this.y = e[13];
        this.z = e[14];
        return this;
    }

    /** Set this = scale extracted from Matrix4 m (length of each column basis). */
    public setFromMatrixScale(m: { rawData: ArrayLike<number> }): this {
        const e = m.rawData;
        const sx = Math.hypot(e[0], e[1], e[2]);
        const sy = Math.hypot(e[4], e[5], e[6]);
        const sz = Math.hypot(e[8], e[9], e[10]);
        this.x = sx;
        this.y = sy;
        this.z = sz;
        return this;
    }

    /** Set this = column index of Matrix4 m (0, 1, 2, or 3). */
    public setFromMatrixColumn(m: { rawData: ArrayLike<number> }, index: number): this {
        const offset = index * 4;
        const e = m.rawData;
        this.x = e[offset];
        this.y = e[offset + 1];
        this.z = e[offset + 2];
        return this;
    }

    /** Project this onto v. Mutates and returns this. */
    public projectOnVector(v: Vector3): this {
        const denom = v.lengthSq();
        if (denom === 0) return this.set(0, 0, 0) as this;
        const scalar = v.dot(this) / denom;
        return this.copy(v).multiplyScalar(scalar) as this;
    }

    /** Project this onto a plane defined by its normal (unit vector). */
    public projectOnPlane(planeNormal: Vector3): this {
        Vector3._tmp.copy(this).projectOnVector(planeNormal);
        return this.sub(Vector3._tmp);
    }

    /** Reflect this off a surface with the given unit normal. */
    public reflect(normal: Vector3): this {
        return this.sub(Vector3._tmp.copy(normal).multiplyScalar(2 * this.dot(normal)));
    }

    /** Apply a 3x3 matrix to this vector. */
    public applyMatrix3(m: { rawData: ArrayLike<number> } | { a: number, b: number, c: number, d: number, tx: number, ty: number }): this {
        const r = (m as any).rawData;
        if (r) {
            const x = this.x, y = this.y, z = this.z;
            this.x = r[0] * x + r[3] * y + r[6] * z;
            this.y = r[1] * x + r[4] * y + r[7] * z;
            this.z = r[2] * x + r[5] * y + r[8] * z;
        } else {
            // Matrix3 (orillusion 2D-ish: a/b/c/d/tx/ty), treat as homogeneous 2D
            const a = m as any;
            const x = this.x, y = this.y;
            this.x = a.a * x + a.c * y + a.tx;
            this.y = a.b * x + a.d * y + a.ty;
        }
        return this;
    }

    /** Apply axis-angle rotation (axis must be unit, angle in radians). */
    public applyAxisAngle(axis: Vector3, angle: number): this {
        // Rodrigues' rotation formula
        const halfA = angle * 0.5;
        const s = Math.sin(halfA);
        // build quaternion (qx, qy, qz, qw) on the fly
        const qx = axis.x * s, qy = axis.y * s, qz = axis.z * s, qw = Math.cos(halfA);
        return this.applyQuaternion({ x: qx, y: qy, z: qz, w: qw });
    }

    /** Transform this as a direction (no translation) by Matrix4 m, then normalize. */
    public transformDirection(m: { rawData: ArrayLike<number> }): this {
        const e = m.rawData;
        const x = this.x, y = this.y, z = this.z;
        this.x = e[0] * x + e[4] * y + e[8] * z;
        this.y = e[1] * x + e[5] * y + e[9] * z;
        this.z = e[2] * x + e[6] * y + e[10] * z;
        return this.normalize() as this;
    }

    /** Canonical alias of {@link setFromArray}. */
    public fromArray(array: ArrayLike<number>, offset: number = 0): this {
        this.x = array[offset];
        this.y = array[offset + 1];
        this.z = array[offset + 2];
        return this;
    }

    /** Floors each component. Mutates and returns this. */
    public floor(): this {
        this.x = Math.floor(this.x);
        this.y = Math.floor(this.y);
        this.z = Math.floor(this.z);
        return this;
    }

    /** Ceils each component. Mutates and returns this. */
    public ceil(): this {
        this.x = Math.ceil(this.x);
        this.y = Math.ceil(this.y);
        this.z = Math.ceil(this.z);
        return this;
    }

    /** Rounds each component to the nearest integer. Mutates and returns this. */
    public round(): this {
        this.x = Math.round(this.x);
        this.y = Math.round(this.y);
        this.z = Math.round(this.z);
        return this;
    }

    /** Rounds each component toward zero. Mutates and returns this. */
    public roundToZero(): this {
        this.x = this.x < 0 ? Math.ceil(this.x) : Math.floor(this.x);
        this.y = this.y < 0 ? Math.ceil(this.y) : Math.floor(this.y);
        this.z = this.z < 0 ? Math.ceil(this.z) : Math.floor(this.z);
        return this;
    }

    /** Fill this with components in [0, 1). */
    public random(): this {
        this.x = Math.random();
        this.y = Math.random();
        this.z = Math.random();
        return this;
    }

    private static _tmp: Vector3 = new Vector3();

    private static calAngle(cx, cy, x, y) {
        const radian = getCosBy2pt(x, y, cx, cy);
        let angle = (Math.acos(radian) * 180) / Math.PI;

        if (x < cx) angle = -angle;
        // console.log(angle)
        return angle;

        // Calculate the vector formed by point 1 and point 2
        function getCosBy2pt(x, y, cx, cy) {
            // Dot product formula
            let a = [x - cx, y - cy];
            let b = [0, -1];
            return calCos(a, b);
        }
        function calCos(a, b) {
            let dotProduct = a[0] * b[0] + a[1] * b[1];
            let d = Math.sqrt(a[0] * a[0] + a[1] * a[1]) * Math.sqrt(b[0] * b[0] + b[1] * b[1]);
            return dotProduct / d;
        }
    }

    /** Tests whether point `pt` lies inside the triangle (pt0, pt1, pt2), using their x/z coordinates. */
    public static pointInsideTriangle(pt: Vector3, pt0: Vector3, pt1: Vector3, pt2: Vector3): boolean {
        Vector3.HELP_0.setTo(pt.x, pt.z, 0);
        Vector3.HELP_1.setTo(pt0.x, pt0.z, 0);
        Vector3.HELP_2.setTo(pt1.x, pt1.z, 0);
        Vector3.HELP_3.setTo(pt2.x, pt2.z, 0);

        return Vector3.pointInsideTriangle2d();
    }

    private static pointInsideTriangle2d(): boolean {
        if (Vector3.productXY(Vector3.HELP_1, Vector3.HELP_2, Vector3.HELP_3) >= 0) {
            return (Vector3.productXY(Vector3.HELP_1, Vector3.HELP_2, Vector3.HELP_0) >= 0)
                && (Vector3.productXY(Vector3.HELP_2, Vector3.HELP_3, Vector3.HELP_0)) >= 0
                && (Vector3.productXY(Vector3.HELP_3, Vector3.HELP_1, Vector3.HELP_0) >= 0);
        }
        else {
            return (Vector3.productXY(Vector3.HELP_1, Vector3.HELP_2, Vector3.HELP_0) <= 0)
                && (Vector3.productXY(Vector3.HELP_2, Vector3.HELP_3, Vector3.HELP_0)) <= 0
                && (Vector3.productXY(Vector3.HELP_3, Vector3.HELP_1, Vector3.HELP_0) <= 0);
        }
    }

    private static productXY(p1: { x: number, y: number }, p2: { x: number, y: number }, p3: { x: number, y: number }): number {
        var val: number = (p1.x - p3.x) * (p2.y - p3.y) - (p1.y - p3.y) * (p2.x - p3.x);
        if (val > -0.00001 && val < 0.00001)
            val = 0;
        return val;
    }

    /** Returns a new Vector3 copy of the given vector, used for serialization. */
    static serialize(position: Vector3): Vector3 {
        let v = new Vector3(position.x, position.y, position.z, position.w);
        return v;
    }

}


