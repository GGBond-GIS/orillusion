import { Matrix4, Quaternion } from '../..';
import matrix from './matrix';

export type FloatArray = Float32Array | Float64Array;

/**
 * Create a typed float array view, picking 64-bit precision when
 * {@link WasmMatrix.useDoublePrecision} is enabled, otherwise 32-bit.
 */
export function CreateFloatArray(buffer: ArrayBufferLike, byteOffset?: number, length?: number) {
    if (WasmMatrix.useDoublePrecision)
        return new Float64Array(buffer, byteOffset, length);
    return new Float32Array(buffer, byteOffset, length);
}

/**
 * Bridge to the WebAssembly matrix module that batch-computes object
 * world transforms. Holds the shared SRT/state buffers mapped onto the
 * WASM heap and exposes setters used by {@link Transform} to feed
 * per-object translation, rotation and scale into the native solver.
 * @group Components
 */
export class WasmMatrix {

    /** World-matrix output buffer mapped onto the WASM heap. */
    public static matrixBuffer: FloatArray;
    /** 32-bit copy of the world matrices (used when running in double precision). */
    public static matrixBuffer_32bit: Float32Array;
    /** Per-object scale/rotation(quaternion)/translation input buffer. */
    public static matrixSRTBuffer: FloatArray;
    /** Per-object continuous (per-frame delta) SRT buffer for animated transforms. */
    public static matrixContinuedSRTBuffer: FloatArray;
    /** High/low split of world positions for relative-to-eye (RTE) precision. */
    public static matrixWorldPositionHLBuffer: Float32Array;
    /** Per-object state buffer (dirty flags, parent index, depth order). */
    public static matrixStateBuffer: Int32Array;
    /** WASM heap pointer to the world-matrix buffer. */
    static matrixBufferPtr: number;
    /** WASM heap pointer to the SRT buffer. */
    static matrixSRTBufferPtr: number;
    /** WASM heap pointer to the continuous SRT buffer. */
    static matrixContinuedSRTBufferPtr: number;
    /** WASM heap pointer to the world-position high/low buffer. */
    static matrixWorldPositionHLBufferPtr: number;
    /** WASM heap pointer to the state buffer. */
    static matrixStateBufferPtr: number;
    /** Loaded WASM matrix module instance. */
    static wasm: typeof matrix;
    /** Number of Int32 entries per object in the state buffer. */
    static stateStruct: number = 4;
    /** Number of float entries per object in {@link matrixSRTBuffer}: 3 scale + 4 rotation quaternion (x, y, z, w) + 3 translation. */
    static srtStride: number = 10;
    /** Number of float entries per object in {@link matrixContinuedSRTBuffer}: 3 scale + 4 rotation delta quaternion (x, y, z, w) + 3 translation delta. */
    static continuedSrtStride: number = 10;
    /** Whether matrices are stored in 64-bit (double) precision. */
    static useDoublePrecision: boolean = false;

    /**
     * Load and initialize the WASM module, then allocate buffers for
     * `count` matrices.
     * @param count maximum number of matrices to allocate
     * @param useDoublePrecision use 64-bit floats when true
     */
    public static async init(count: number, useDoublePrecision: boolean = false) {
        this.wasm = await matrix();
        this.useDoublePrecision = useDoublePrecision;
        this.wasm._initialize(count, useDoublePrecision, 0);
        this.allocMatrix(count);
    }

    /**
     * Allocate the WASM-side matrix storage and map the shared buffers
     * onto the WASM heap for `count` matrices.
     * @param count number of matrices to allocate
     */
    public static allocMatrix(count: number) {
        if (count > Matrix4.maxCount) {
            console.error(`The maximum allocation size is exceeded! current:${count}, limit:${Matrix4.maxCount}`);
        }

        this.wasm._allocMatrix(count);

        this.matrixBufferPtr = this.wasm._getMatrixBufferPtr();
        this.matrixSRTBufferPtr = this.wasm._getSRTPtr();
        this.matrixStateBufferPtr = this.wasm._getInfoPtr();
        this.matrixContinuedSRTBufferPtr = this.wasm._getContinuedSRTPtr();
        this.matrixWorldPositionHLBufferPtr = this.wasm._getWorldPositionHLPtr();

        if (this.useDoublePrecision) {
            this.matrixBuffer = CreateFloatArray(this.wasm.HEAPF64.buffer, this.matrixBufferPtr, 16 * count);
            this.matrixBuffer_32bit = new Float32Array(16 * count);
            this.matrixSRTBuffer = CreateFloatArray(this.wasm.HEAPF64.buffer, this.matrixSRTBufferPtr, WasmMatrix.srtStride * count);
            this.matrixContinuedSRTBuffer = CreateFloatArray(this.wasm.HEAPF64.buffer, this.matrixContinuedSRTBufferPtr, WasmMatrix.continuedSrtStride * count);
            this.matrixWorldPositionHLBuffer = new Float32Array(this.wasm.HEAPF32.buffer, this.matrixWorldPositionHLBufferPtr, (4 * 2) * count);
            Matrix4.blockBytes = Matrix4.block * 8;
        } else {
            this.matrixBuffer = CreateFloatArray(this.wasm.HEAPF32.buffer, this.matrixBufferPtr, 16 * count);
            this.matrixSRTBuffer = CreateFloatArray(this.wasm.HEAPF32.buffer, this.matrixSRTBufferPtr, WasmMatrix.srtStride * count);
            this.matrixContinuedSRTBuffer = CreateFloatArray(this.wasm.HEAPF32.buffer, this.matrixContinuedSRTBufferPtr, WasmMatrix.continuedSrtStride * count);
            this.matrixWorldPositionHLBuffer = new Float32Array(this.wasm.HEAPF32.buffer, this.matrixWorldPositionHLBufferPtr, (4 * 2) * count);
            Matrix4.blockBytes = Matrix4.block * 4;
        }

        this.matrixStateBuffer = new Int32Array(this.wasm.HEAP32.buffer, this.matrixStateBufferPtr, (WasmMatrix.stateStruct) * count);

        Matrix4.allocMatrix(count);
    }

    /**
     * Advance all continuous (auto-animating) transforms in the index
     * range `[start, end)` by `dt`.
     * @param start first matrix index
     * @param end one past the last matrix index
     * @param dt delta time in seconds
     * @param RTEScale relative-to-eye scale factor
     */
    public static updateAllContinueTransform(start: number, end: number, dt: number, RTEScale: number) {
        this.wasm._updateAllMatrixContinueTransform(start, end, dt, RTEScale);
    }

    /**
     * Set the parent index and depth order for a matrix.
     * @param matIndex matrix index to update
     * @param x parent matrix index, or negative for no parent
     * @param depthOrder hierarchy depth order used for update sequencing
     */
    public static setParent(matIndex: number, x: number, depthOrder: number) {
        const index = matIndex * WasmMatrix.stateStruct;
        this.matrixStateBuffer[index + 2] = x >= 0 ? x : -1;
        this.matrixStateBuffer[index + 3] = depthOrder;
        // console.warn(`${matIndex} -> ${depthOrder}`);
    }

    /** Set the local translation of a matrix. */
    public static setTranslate(matIndex: number, x: number, y: number, z: number) {
        const index = matIndex * WasmMatrix.srtStride;
        this.matrixSRTBuffer[index + 7] = x;
        this.matrixSRTBuffer[index + 8] = y;
        this.matrixSRTBuffer[index + 9] = z;
    }

    /** Set the local rotation of a matrix (quaternion x, y, z, w). */
    public static setRotation(matIndex: number, x: number, y: number, z: number, w: number) {
        const index = matIndex * WasmMatrix.srtStride;
        this.matrixSRTBuffer[index + 3] = x;
        this.matrixSRTBuffer[index + 4] = y;
        this.matrixSRTBuffer[index + 5] = z;
        this.matrixSRTBuffer[index + 6] = w;
    }

    /** Set the local scale of a matrix. */
    public static setScale(matIndex: number, x: number, y: number, z: number) {
        const index = matIndex * WasmMatrix.srtStride;
        this.matrixSRTBuffer[index + 0] = x;
        this.matrixSRTBuffer[index + 1] = y;
        this.matrixSRTBuffer[index + 2] = z;
    }

    /** Set a per-frame continuous translation delta (auto-applied each update). */
    public static setContinueTranslate(matIndex: number, x: number, y: number, z: number) {
        if (x != 0 || y != 0 || z != 0) {
            const index = matIndex * WasmMatrix.continuedSrtStride;
            this.matrixContinuedSRTBuffer[index + 7] = x;
            this.matrixContinuedSRTBuffer[index + 8] = y;
            this.matrixContinuedSRTBuffer[index + 9] = z;
            this.matrixStateBuffer[matIndex * WasmMatrix.stateStruct + 1] = 1;
        }
    }

    /** Set a per-frame continuous rotation delta (Euler degrees/frame, auto-applied each update). */
    public static setContinueRotation(matIndex: number, x: number, y: number, z: number) {
        if (x != 0 || y != 0 || z != 0) {
            const temp = Quaternion.HELP_2.setFromEuler(x, y, z);
            const index = matIndex * WasmMatrix.continuedSrtStride;
            this.matrixContinuedSRTBuffer[index + 3] = temp.x;
            this.matrixContinuedSRTBuffer[index + 4] = temp.y;
            this.matrixContinuedSRTBuffer[index + 5] = temp.z;
            this.matrixContinuedSRTBuffer[index + 6] = temp.w;
            this.matrixStateBuffer[matIndex * WasmMatrix.stateStruct + 1] = 1;
        }
    }

    /** Set a per-frame continuous scale delta (auto-applied each update). */
    public static setContinueScale(matIndex: number, x: number, y: number, z: number) {
        if (x != 0 || y != 0 || z != 0) {
            const index = matIndex * WasmMatrix.continuedSrtStride;
            this.matrixContinuedSRTBuffer[index + 0] = x;
            this.matrixContinuedSRTBuffer[index + 1] = y;
            this.matrixContinuedSRTBuffer[index + 2] = z;
            this.matrixStateBuffer[matIndex * WasmMatrix.stateStruct + 1] = 1;
        }
    }
}
