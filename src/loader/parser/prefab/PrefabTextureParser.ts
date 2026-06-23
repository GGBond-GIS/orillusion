import { Engine3D } from "../../../Engine3D";
import { BitmapTexture2D } from "../../../textures/BitmapTexture2D";
import { BytesArray } from "../../../util/BytesArray";
import { LoaderFunctions } from "../../LoaderFunctions";
import { ParserBase } from "../ParserBase";
import { ParserFormat } from "../ParserFormat";
import { PrefabParser } from "./PrefabParser";


/**
 * Parses the texture section of an Orillusion prefab binary stream. It resolves
 * each texture URL (optionally rewriting to the `webp` variant), loads the
 * bitmap textures, and registers them with the engine resource host.
 * @group Loader
 */
export class PrefabTextureParser extends ParserBase {
    static format: ParserFormat = ParserFormat.TEXT;

    /**
     * Read every texture reference from the stream, load the bitmap textures,
     * and register them on the resource host keyed by texture name.
     * @param bytesStream the prefab binary stream positioned at the texture section.
     * @param prefabParser the owning prefab parser, used for base URL and context.
     * @param loaderFunctions optional loader hooks (progress, URL transform, etc.).
     */
    public static async parserTexture(bytesStream: BytesArray, prefabParser: PrefabParser, loaderFunctions: LoaderFunctions) {
        let preTextureCount = bytesStream.readInt32();

        let textures = [];
        for (let i = 0; i < preTextureCount; i++) {
            let texName = bytesStream.readUTF();
            if (PrefabParser.useWebp) {
                texName = texName.replace("png", "webp");
                texName = texName.replace("jpb", "webp");
                textures.push(prefabParser.baseUrl + `webp\/` + texName);
            } else {
                textures.push(prefabParser.baseUrl + texName);
            }

        }

        const resHost = Engine3D.resFor(prefabParser.ctx);
        let textureList = await resHost.loadBitmapTextures(textures, prefabParser.ctx!.engine!.setting.loader.numConcurrent, loaderFunctions, true);
        for (const tex of textureList) {
            resHost.addTexture(tex.name, tex);
        }
    }

    /**
     * Verify that parsing produced valid data.
     * @returns true when data is present; throws otherwise.
     */
    public verification(): boolean {
        if (this.data) {
            return true;
        }
        throw new Error('verify failed.');
    }
}
