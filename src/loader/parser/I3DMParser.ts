import { ParserBase } from './ParserBase';
import { ParserFormat } from './ParserFormat';
import { I3DMLoader } from "./i3dm/I3DMLoader";

/**
 * Parser for the Instanced 3D Model (i3dm) tile format used by 3D Tiles.
 * Decodes an i3dm buffer into an Object3D scene graph via the I3DMLoader.
 * @group Loader
 */
export class I3DMParser extends ParserBase {
    static format: ParserFormat = ParserFormat.BIN;

    /**
     * Parse an i3dm binary buffer and store the resulting model in `this.data`.
     * @param buffer The raw i3dm file contents.
     */
    async parseBuffer(buffer: ArrayBuffer) {
        let loader = new I3DMLoader();
        loader.adjustmentTransform = this.userData;
        this.data = await loader.parse(buffer);
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