import { Context3D } from '../../gfx/graphics/webGpu/Context3D';
import { Texture } from '../../gfx/graphics/webGpu/core/texture/Texture';
import { LoaderFunctions } from '../LoaderFunctions';
import { ParserFormat } from './ParserFormat';

/**
 * @internal
 * @group Loader
 */
export class ParserBase {
    static format: ParserFormat = ParserFormat.BIN;
    public baseUrl: string;
    public initUrl: string;
    public loaderFunctions?: LoaderFunctions;
    public userData?: any;
    public data: any;
    /** Context3D this parser is operating under. Populated by FileLoader
     *  so default-texture lookups (`Engine3D.resFor(this.ctx)`) resolve
     *  against the owning engine's device rather than the global shim. */
    public ctx?: Context3D;

    public parseString(str: string) { }

    public parseJson(obj: object) { }

    public parseBuffer(buffer: ArrayBuffer) { }

    public parseTexture(buffer: ArrayBuffer): Texture {
        throw this.parserError('Method not implemented.', -1);
    }

    public parse(data: any) { }

    public verification(ret: void): boolean {
        throw this.parserError('Method not implemented.', -1);
    }

    protected parserError(info: string, id: number) {
        console.error(`error id:${id} ${info}`);
    }

    // public static getTypedArrayTypeFromGLType(componentType:number){
    //   switch (componentType) {
    //     case 5126:
    //       return Float32Array;
    //       break;
    //       case 5125:
    //         return Uint8Array;
    //         break;
    //     default:
    //       break;
    //   }

    // }
}
