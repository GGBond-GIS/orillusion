import { Object3D } from '../../core/entities/Object3D';
import { ParserBase } from './ParserBase';
import { ParserFormat } from './ParserFormat';

/**
 * Parser for Batched 3D Model (`.b3dm`) tiles used by 3D Tiles datasets.
 * Decodes the binary buffer into an {@link Object3D} scene graph.
 * @group Loader
 */
export class B3DMParser extends ParserBase {
    static format: ParserFormat = ParserFormat.JSON;

    /**
     * Parse a `.b3dm` binary buffer into an {@link Object3D}.
     * @param buffer Raw `.b3dm` binary data.
     * @param customLoader Optional hook to load the embedded glTF/GLB payload.
     */
    public async parseBuffer(buffer: ArrayBuffer, customLoader?: (array: ArrayBuffer) => Promise<Object3D | null>) {
        let loader = new B3DMLoader();
        loader.adjustmentTransform = this.userData;
        this.data = await loader.parse(buffer, customLoader);
    }

    /**
     * Verify that parsing produced valid data.
     * @returns true when data is present; throws otherwise.
     */
    public verification(): boolean {
        if (this.data) {
            return true;
        }
        throw new Error('Method not implemented.');
    }
}

import { B3DMLoader } from './b3dm/B3DMLoader';
import { GLBParser } from './gltf/GLBParser';

const BINARY_EXTENSION_HEADER_MAGIC = 'glTF';
const BINARY_EXTENSION_HEADER_LENGTH = 12;
const BINARY_EXTENSION_CHUNK_TYPES = { JSON: 0x4e4f534a, BIN: 0x004e4942 };
const EXTENSIONS = {
    KHR_BINARY_GLTF: 'KHR_binary_glTF',
    KHR_DRACO_MESH_COMPRESSION: 'KHR_draco_mesh_compression',
    KHR_LIGHTS_PUNCTUAL: 'KHR_lights_punctual',
    KHR_MATERIALS_CLEARCOAT: 'KHR_materials_clearcoat',
    KHR_MATERIALS_IOR: 'KHR_materials_ior',
    KHR_MATERIALS_PBR_SPECULAR_GLOSSINESS: 'KHR_materials_pbrSpecularGlossiness',
    KHR_MATERIALS_SHEEN: 'KHR_materials_sheen',
    KHR_MATERIALS_SPECULAR: 'KHR_materials_specular',
    KHR_MATERIALS_TRANSMISSION: 'KHR_materials_transmission',
    KHR_MATERIALS_UNLIT: 'KHR_materials_unlit',
    KHR_MATERIALS_VOLUME: 'KHR_materials_volume',
    KHR_TEXTURE_BASISU: 'KHR_texture_basisu',
    KHR_TEXTURE_TRANSFORM: 'KHR_texture_transform',
    KHR_MESH_QUANTIZATION: 'KHR_mesh_quantization',
    EXT_TEXTURE_WEBP: 'EXT_texture_webp',
    EXT_MESHOPT_COMPRESSION: 'EXT_meshopt_compression',
};

/**
 * Reads the `KHR_binary_glTF` container embedded inside a `.b3dm` payload,
 * splitting the binary chunk into its JSON content and BIN body.
 * @internal
 */
export class GLTFBinaryExtension {
    name: string;
    content: string;
    body: ArrayBuffer;
    header: { magic: string; length: number; version: number };

    constructor(data: ArrayBuffer) {
        this.name = EXTENSIONS.KHR_BINARY_GLTF;
        this.content = null;
        this.body = null;

        const headerView = new DataView(data, 0, BINARY_EXTENSION_HEADER_LENGTH);

        this.header = {
            magic: B3DMLoader.decodeText(new Uint8Array(data.slice(0, 4))),
            version: headerView.getUint32(4, true),
            length: headerView.getUint32(8, true),
        };

        if (this.header.magic !== BINARY_EXTENSION_HEADER_MAGIC) {
            throw new Error('GLTFLoader: Unsupported glTF-Binary header.');
        } else if (this.header.version < 2.0) {
            throw new Error('GLTFLoader: Legacy binary file detected.');
        }

        const chunkContentsLength = this.header.length - BINARY_EXTENSION_HEADER_LENGTH;
        const chunkView = new DataView(data, BINARY_EXTENSION_HEADER_LENGTH);
        let chunkIndex = 0;

        while (chunkIndex < chunkContentsLength) {
            const chunkLength = chunkView.getUint32(chunkIndex, true);
            chunkIndex += 4;

            const chunkType = chunkView.getUint32(chunkIndex, true);
            chunkIndex += 4;

            if (chunkType === BINARY_EXTENSION_CHUNK_TYPES.JSON) {
                const contentArray = new Uint8Array(data, BINARY_EXTENSION_HEADER_LENGTH + chunkIndex, chunkLength);
                this.content = B3DMLoader.decodeText(contentArray);
            } else if (chunkType === BINARY_EXTENSION_CHUNK_TYPES.BIN) {
                const byteOffset = BINARY_EXTENSION_HEADER_LENGTH + chunkIndex;
                this.body = data.slice(byteOffset, byteOffset + chunkLength);
            }

            chunkIndex += chunkLength;
        }

        if (this.content === null) {
            throw new Error('GLTFLoader: JSON content not found.');
        }
    }
}

/**
 * Internal helper that detects the binary magic of a `.b3dm` payload and
 * delegates GLB decoding to {@link GLBParser}.
 * @internal
 */
export class B3DMParseUtil {
    private _binary: ArrayBufferLike;

    public async parseBinary(bytes: ArrayBuffer) {
        this._binary = bytes;
        const magic = B3DMLoader.decodeText(new Uint8Array(this._binary, 0, 4));
        const extensions = {};
        let content;
        let info: GLTFBinaryExtension;

        if (magic === BINARY_EXTENSION_HEADER_MAGIC) {
            try {
                info = extensions[EXTENSIONS.KHR_BINARY_GLTF] = new GLTFBinaryExtension(this._binary);
            } catch (error) {
                // if ( onError ) onError( error );
                return;
            }

            content = extensions[EXTENSIONS.KHR_BINARY_GLTF].content;
        } else {
            content = B3DMLoader.decodeText(new Uint8Array(this._binary));
        }
        const json = JSON.parse(content);
        let obj3d = await this.parseGLB(json, info.body);
        return obj3d;
    }

    private async parseGLB(json: object, bin: ArrayBuffer): Promise<Object3D> {
        let loader = new GLBParser();
        let obj3d: Object3D = await loader.parseJsonAndBuffer(json, bin);
        return obj3d;
    }
}
