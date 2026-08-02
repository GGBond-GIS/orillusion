import { FloatArray } from '../../../components/matrix/WasmMatrix';
import { Color } from '../../../math/Color';
import { Quaternion } from '../../../math/Quaternion';
import { Vector2 } from '../../../math/Vector2';
import { Vector3 } from '../../../math/Vector3';
import { Vector4 } from '../../../math/Vector4';

/**
 * A typed view onto a slice of a shared memory block, exposing read/write
 * accessors for the scalar, vector, color and array data stored there.
 * @internal
 * @group Core
 */
export class MemoryInfo {

    /** Byte offset of this slice within the owning memory block. */
    public byteOffset: number;
    /** Size of this slice in bytes. */
    public byteSize: number;
    /** Current write cursor, in bytes, used by the `write*` methods. */
    public offset: number = 0;
    /** Data view bound to this slice's bytes. */
    public dataBytes: DataView;

    /** Get the first float component. */
    public get x(): number {
        return this.dataBytes.getFloat32(0 * Float32Array.BYTES_PER_ELEMENT, true);
    }

    /** Set the first float component. */
    public set x(v: number) {
        this.dataBytes.setFloat32(0 * Float32Array.BYTES_PER_ELEMENT, v, true);
    }

    /** Get the second float component. */
    public get y(): number {
        return this.dataBytes.getFloat32(1 * Float32Array.BYTES_PER_ELEMENT, true);
    }

    /** Set the second float component. */
    public set y(v: number) {
        this.dataBytes.setFloat32(1 * Float32Array.BYTES_PER_ELEMENT, v, true);
    }

    /** Get the third float component. */
    public get z(): number {
        return this.dataBytes.getFloat32(2 * Float32Array.BYTES_PER_ELEMENT, true);
    }

    /** Set the third float component. */
    public set z(v: number) {
        this.dataBytes.setFloat32(2 * Float32Array.BYTES_PER_ELEMENT, v, true);
    }

    /** Get the fourth float component. */
    public get w(): number {
        return this.dataBytes.getFloat32(3 * Float32Array.BYTES_PER_ELEMENT, true);
    }

    /** Set the fourth float component. */
    public set w(v: number) {
        this.dataBytes.setFloat32(3 * Float32Array.BYTES_PER_ELEMENT, v, true);
    }

    /** Set the x component. */
    public setX(x: number) {
        this.x = x;
    }

    /** Set the x and y components. */
    public setXY(x: number, y: number) {
        this.x = x;
        this.y = y;
    }

    /** Set the x, y and z components. */
    public setXYZ(x: number, y: number, z: number) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    /** Set the x, y, z and w components. */
    public setXYZW(x: number, y: number, z: number, w: number) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.w = w;
    }

    /** Write an array of Vector2 packed as consecutive xy float pairs. */
    public setVector2Array(vs: Vector2[]) {
        for (let i = 0; i < vs.length; i++) {
            const element = vs[i];
            this.dataBytes.setFloat32((i * 2 + 0) * Float32Array.BYTES_PER_ELEMENT, element.x, true);
            this.dataBytes.setFloat32((i * 2 + 1) * Float32Array.BYTES_PER_ELEMENT, element.y, true);
        }
    }

    /** Write an array of Vector3 packed as consecutive xyz float triples. */
    public setVector3Array(vs: Vector3[]) {
        for (let i = 0; i < vs.length; i++) {
            const element = vs[i];
            this.dataBytes.setFloat32((i * 3 + 0) * Float32Array.BYTES_PER_ELEMENT, element.x, true);
            this.dataBytes.setFloat32((i * 3 + 1) * Float32Array.BYTES_PER_ELEMENT, element.y, true);
            this.dataBytes.setFloat32((i * 3 + 2) * Float32Array.BYTES_PER_ELEMENT, element.z, true);
        }
    }

    /** Write an array of 4-component vectors/quaternions packed as xyzw float quads. */
    public setVector4Array(vs: Vector3[] | Vector4[] | Quaternion[]) {
        for (let i = 0; i < vs.length; i++) {
            const element = vs[i];
            this.dataBytes.setFloat32((i * 4 + 0) * Float32Array.BYTES_PER_ELEMENT, element.x, true);
            this.dataBytes.setFloat32((i * 4 + 1) * Float32Array.BYTES_PER_ELEMENT, element.y, true);
            this.dataBytes.setFloat32((i * 4 + 2) * Float32Array.BYTES_PER_ELEMENT, element.z, true);
            this.dataBytes.setFloat32((i * 4 + 3) * Float32Array.BYTES_PER_ELEMENT, element.w, true);
        }
    }

    /** Write an array of colors packed as consecutive rgba float quads. */
    public setColorArray(colorArray: Color[]) {
        for (let i = 0; i < colorArray.length; i++) {
            const element = colorArray[i];
            this.dataBytes.setFloat32((i * 4 + 0) * Float32Array.BYTES_PER_ELEMENT, element.r, true);
            this.dataBytes.setFloat32((i * 4 + 1) * Float32Array.BYTES_PER_ELEMENT, element.g, true);
            this.dataBytes.setFloat32((i * 4 + 2) * Float32Array.BYTES_PER_ELEMENT, element.b, true);
            this.dataBytes.setFloat32((i * 4 + 3) * Float32Array.BYTES_PER_ELEMENT, element.a, true);
        }
    }

    /** Write an 8-bit signed integer at the given element index. */
    public setInt8(v: number, index: number = 0) {
        this.dataBytes.setInt8(index * Int8Array.BYTES_PER_ELEMENT, v);
    }

    /** Read an 8-bit signed integer at the given element index. */
    public getInt8(index: number = 0): number {
        return this.dataBytes.getInt8(index * Int8Array.BYTES_PER_ELEMENT);
    }

    /** Write a 16-bit signed integer at the given element index. */
    public setInt16(v: number, index: number = 0) {
        this.dataBytes.setInt16(index * Int16Array.BYTES_PER_ELEMENT, v, true);
    }

    /** Read a 16-bit signed integer at the given element index. */
    public getInt16(index: number = 0): number {
        return this.dataBytes.getInt16(index * Int16Array.BYTES_PER_ELEMENT, true);
    }

    /** Write a 32-bit signed integer at the given element index. */
    public setInt32(v: number, index: number = 0) {
        this.dataBytes.setInt32(index * Int32Array.BYTES_PER_ELEMENT, v, true);
    }

    /** Read a 32-bit signed integer at the given element index. */
    public getInt32(index: number = 0): number {
        return this.dataBytes.getInt32(index * Int32Array.BYTES_PER_ELEMENT, true);
    }

    /** Write a 32-bit float at the given element index. */
    public setFloat(v: number, index: number = 0) {
        this.dataBytes.setFloat32(index * Float32Array.BYTES_PER_ELEMENT, v, true)
    }

    /** Read a 32-bit float at the given element index. */
    public getFloat(index: number = 0): number {
        return this.dataBytes.getFloat32(index * Float32Array.BYTES_PER_ELEMENT, true);
    }

    /** Write an 8-bit unsigned integer at the given element index. */
    public setUint8(v: number, index: number = 0) {
        this.dataBytes.setUint8(index * Uint8Array.BYTES_PER_ELEMENT, v);
    }

    /** Read an 8-bit unsigned integer at the given element index. */
    public getUint8(index: number = 0): number {
        return this.dataBytes.getUint8(index * Uint8Array.BYTES_PER_ELEMENT);
    }

    /** Write a 16-bit unsigned integer at the given element index. */
    public setUint16(v: number, index: number = 0) {
        this.dataBytes.setUint16(index * Uint16Array.BYTES_PER_ELEMENT, v, true);
    }

    /** Read a 16-bit unsigned integer at the given element index. */
    public getUint16(index: number = 0): number {
        return this.dataBytes.getUint16(index * Uint16Array.BYTES_PER_ELEMENT, true);
    }

    /** Write a 32-bit unsigned integer at the given element index. */
    public setUint32(v: number, index: number = 0) {
        this.dataBytes.setUint32(index * Uint32Array.BYTES_PER_ELEMENT, v, true);
    }

    /** Read a 32-bit unsigned integer at the given element index. */
    public getUint32(index: number = 0): number {
        return this.dataBytes.getUint32(index * Uint32Array.BYTES_PER_ELEMENT, true);
    }

    /** Write a number array as consecutive floats starting at the given float index. */
    public setArray(index: number, data: number[]) {
        for (let i = 0; i < data.length; i++) {
            const element = data[i];
            this.dataBytes.setFloat32((index + i) * Float32Array.BYTES_PER_ELEMENT, element, true);
        }
    }

    /** Copy a Float32Array into this slice starting at the given float index. */
    public setFloat32Array(index: number, data: Float32Array) {
        let tmp = new Float32Array(this.dataBytes.buffer, this.dataBytes.byteOffset + index * Float32Array.BYTES_PER_ELEMENT, data.length);
        tmp.set(data);
    }

    /** Copy a FloatArray into this slice as 32-bit floats at the given float index. */
    public setFloatArray(index: number, value: FloatArray) {
        let data: Float32Array;
        if (value instanceof Float32Array) {
            data = value;
        } else {
            // GPU nonsupport f64
            data = new Float32Array(value)
        }

        let tmp = new Float32Array(this.dataBytes.buffer, this.dataBytes.byteOffset + index * Float32Array.BYTES_PER_ELEMENT, data.length);
        tmp.set(data);
    }

    /** Copy a typed-array buffer into this slice, dispatching by its concrete type. */
    public setArrayBuffer(index: number, arrayBuffer: ArrayBuffer) {
        if (arrayBuffer instanceof Uint8Array) {
            this.setUint8Array(index, arrayBuffer);
        } else if (arrayBuffer instanceof Uint16Array) {
            this.setUint16Array(index, arrayBuffer);
        } else if (arrayBuffer instanceof Uint32Array) {
            this.setUint32Array(index, arrayBuffer);
        } else if (arrayBuffer instanceof Int8Array) {
            this.setInt8Array(index, arrayBuffer);
        } else if (arrayBuffer instanceof Int16Array) {
            this.setInt16Array(index, arrayBuffer);
        } else if (arrayBuffer instanceof Int32Array) {
            this.setInt32Array(index, arrayBuffer);
        } else if (arrayBuffer instanceof Float32Array) {
            this.setFloat32Array(index, arrayBuffer);
        } else if (arrayBuffer instanceof Float64Array) {

        }
    }

    /** Copy an Int8Array into this slice starting at the given element index. */
    public setInt8Array(index: number, data: Int8Array) {
        let tmp = new Int8Array(this.dataBytes.buffer, this.dataBytes.byteOffset + index * Int8Array.BYTES_PER_ELEMENT);
        tmp.set(data);
    }

    /** Copy an Int16Array into this slice starting at the given element index. */
    public setInt16Array(index: number, data: Int16Array) {
        let tmp = new Int16Array(this.dataBytes.buffer, this.dataBytes.byteOffset + index * Int16Array.BYTES_PER_ELEMENT);
        tmp.set(data);
    }

    /** Copy an Int32Array into this slice starting at the given element index. */
    public setInt32Array(index: number, data: Int32Array) {
        let tmp = new Int32Array(this.dataBytes.buffer, this.dataBytes.byteOffset + index * Int32Array.BYTES_PER_ELEMENT);
        tmp.set(data);
    }

    /** Copy a Uint8Array into this slice starting at the given element index. */
    public setUint8Array(index: number, data: Uint8Array) {
        let tmp = new Uint8Array(this.dataBytes.buffer, this.dataBytes.byteOffset + index * Uint8Array.BYTES_PER_ELEMENT);
        tmp.set(data);
    }

    /** Copy a Uint16Array into this slice starting at the given element index. */
    public setUint16Array(index: number, data: Uint16Array) {
        let tmp = new Uint16Array(this.dataBytes.buffer, this.dataBytes.byteOffset + index * Uint16Array.BYTES_PER_ELEMENT);
        tmp.set(data);
    }

    /** Copy a Uint32Array into this slice starting at the given element index. */
    public setUint32Array(index: number, data: Uint32Array) {
        let tmp = new Uint32Array(this.dataBytes.buffer, this.dataBytes.byteOffset + index * Uint32Array.BYTES_PER_ELEMENT);
        tmp.set(data);
    }

    /** Write a single float at the given float index. */
    public setData(index: number, data: number) {
        this.dataBytes.setFloat32(index * Float32Array.BYTES_PER_ELEMENT, data, true);
    }

    /** Write a Vector2 at the given float index. */
    public setVector2(index: number, data: Vector2) {
        this.dataBytes.setFloat32((index) * Float32Array.BYTES_PER_ELEMENT, data.x, true);
        this.dataBytes.setFloat32((index + 1) * Float32Array.BYTES_PER_ELEMENT, data.y, true);
    }

    /** Write a Vector3 at the given float index. */
    public setVector3(index: number, data: Vector3) {
        this.dataBytes.setFloat32((index) * Float32Array.BYTES_PER_ELEMENT, data.x, true);
        this.dataBytes.setFloat32((index + 1) * Float32Array.BYTES_PER_ELEMENT, data.y, true);
        this.dataBytes.setFloat32((index + 2) * Float32Array.BYTES_PER_ELEMENT, data.z, true);
    }

    /** Write a Vector4 at the given float index. */
    public setVector4(index: number, data: Vector4) {
        this.dataBytes.setFloat32((index) * Float32Array.BYTES_PER_ELEMENT, data.x, true);
        this.dataBytes.setFloat32((index + 1) * Float32Array.BYTES_PER_ELEMENT, data.y, true);
        this.dataBytes.setFloat32((index + 2) * Float32Array.BYTES_PER_ELEMENT, data.z, true);
        this.dataBytes.setFloat32((index + 3) * Float32Array.BYTES_PER_ELEMENT, data.w, true);
    }

    /** Write a Color (rgba) at the given float index. */
    public setColor(index: number, data: Color) {
        this.dataBytes.setFloat32((index) * Float32Array.BYTES_PER_ELEMENT, data.r, true);
        this.dataBytes.setFloat32((index + 1) * Float32Array.BYTES_PER_ELEMENT, data.g, true);
        this.dataBytes.setFloat32((index + 2) * Float32Array.BYTES_PER_ELEMENT, data.b, true);
        this.dataBytes.setFloat32((index + 3) * Float32Array.BYTES_PER_ELEMENT, data.a, true);
    }

    /** Read a single float at the given float index. */
    public getData(index: number): number {
        return this.dataBytes.getFloat32(index * Float32Array.BYTES_PER_ELEMENT, true);
    }

    /** Write a float at the current cursor and advance the cursor. */
    public writeFloat(v: number) {
        this.dataBytes.setFloat32(this.offset, v, true);
        this.offset += Float32Array.BYTES_PER_ELEMENT;
    }

    /** Write an 8-bit signed integer at the current cursor and advance the cursor. */
    public writeInt8(v: number) {
        this.dataBytes.setInt8(this.offset, v);
        this.offset += Int8Array.BYTES_PER_ELEMENT;
    }

    /** Write a 16-bit signed integer at the current cursor and advance the cursor. */
    public writeInt16(v: number) {
        this.dataBytes.setInt16(this.offset, v, true);
        this.offset += Int16Array.BYTES_PER_ELEMENT;
    }

    /** Write a 32-bit signed integer at the current cursor and advance the cursor. */
    public writeInt32(v: number) {
        this.dataBytes.setInt32(this.offset, v, true);
        this.offset += Int32Array.BYTES_PER_ELEMENT;
    }

    /** Write an 8-bit unsigned integer at the current cursor and advance the cursor. */
    public writeUint8(v: number) {
        this.dataBytes.setUint8(this.offset, v);
        this.offset += Uint8Array.BYTES_PER_ELEMENT;
    }

    /** Write a 16-bit unsigned integer at the current cursor and advance the cursor. */
    public writeUint16(v: number) {
        this.dataBytes.setUint16(this.offset, v, true);
        this.offset += Uint16Array.BYTES_PER_ELEMENT;
    }

    /** Write a 32-bit unsigned integer at the current cursor and advance the cursor. */
    public writeUint32(v: number) {
        this.dataBytes.setUint32(this.offset, v, true);
        this.offset += Uint32Array.BYTES_PER_ELEMENT;
    }

    /** Write a Vector2 at the current cursor and advance the cursor. */
    public writeVector2(v: Vector2) {
        this.writeFloat(v.x);
        this.writeFloat(v.y);
    }

    /** Write a Vector3 at the current cursor and advance the cursor. */
    public writeVector3(v: Vector3) {
        this.writeFloat(v.x);
        this.writeFloat(v.y);
        this.writeFloat(v.z);
    }

    /** Write a Vector4 at the current cursor and advance the cursor. */
    public writeVector4(v: Vector4) {
        this.writeFloat(v.x);
        this.writeFloat(v.y);
        this.writeFloat(v.z);
        this.writeFloat(v.w);
    }

    /** Write the rgb channels of a color at the current cursor and advance the cursor. */
    public writeRGBColor(v: Color) {
        this.writeFloat(v.r);
        this.writeFloat(v.g);
        this.writeFloat(v.b);
        // this.writeFloat(v.a);
    }

    /** Write a number array as consecutive floats at the current cursor. */
    public writeArray(v: number[]) {
        for (let i = 0; i < v.length; i++) {
            const d = v[i];
            this.writeFloat(d);
        }
    }

    /** Write a Float32Array at the current cursor and advance the cursor. */
    public writeFloat32Array(v: Float32Array) {
        new Float32Array(this.dataBytes.buffer, this.dataBytes.byteOffset + this.offset).set(v);
        this.offset += v.byteLength;
    }

    /** Write an Int8Array at the current cursor and advance the cursor. */
    public writeInt8Array(v: Int8Array) {
        new Int8Array(this.dataBytes.buffer, this.dataBytes.byteOffset + this.offset).set(v);
        this.offset += v.byteLength;
    }

    /** Write an Int16Array at the current cursor and advance the cursor. */
    public writeInt16Array(v: Int16Array) {
        new Int16Array(this.dataBytes.buffer, this.dataBytes.byteOffset + this.offset).set(v);
        this.offset += v.byteLength;
    }

    /** Write an Int32Array at the current cursor and advance the cursor. */
    public writeInt32Array(v: Int32Array) {
        new Int32Array(this.dataBytes.buffer, this.dataBytes.byteOffset + this.offset).set(v);
        this.offset += v.byteLength;
    }

    /** Write a Uint8Array at the current cursor and advance the cursor. */
    public writeUint8Array(v: Uint8Array) {
        new Uint8Array(this.dataBytes.buffer, this.dataBytes.byteOffset + this.offset).set(v);
        this.offset += v.byteLength;
    }

    /** Write a Uint16Array at the current cursor and advance the cursor. */
    public writeUint16Array(v: Uint16Array) {
        new Uint16Array(this.dataBytes.buffer, this.dataBytes.byteOffset + this.offset).set(v);
        this.offset += v.byteLength;
    }

    /** Write a Uint32Array at the current cursor and advance the cursor. */
    public writeUint32Array(v: Uint32Array) {
        new Uint32Array(this.dataBytes.buffer, this.dataBytes.byteOffset + this.offset).set(v);
        this.offset += v.byteLength;
    }

    /** Reset the write cursor back to the start of this slice. */
    public reset() {
        this.offset = 0;
    }

    /** Release references held by this memory view. */
    destroy() {
        this.byteOffset = null;
        this.byteSize = null;
        this.offset = null;
        this.dataBytes = null;
    }
}
