import { Engine3D } from "../../Engine3D";
import { TextureAtlas } from "../../assets/TextureAtlas";
import { Texture } from "../../gfx/graphics/webGpu/core/texture/Texture";
import { Vector4 } from "../../math/Vector4";
import { ParserBase } from "../../loader/parser/ParserBase";
import { ParserFormat } from "./ParserFormat";

/**
 * Parser for texture atlas descriptor files. Loads the companion atlas
 * image and builds a {@link TextureAtlas} whose regions are normalized
 * from the pixel rectangles described in the JSON.
 * @group Loader
 */
export class AtlasParser extends ParserBase {
    static format: ParserFormat = ParserFormat.TEXT;

    private _json: any;
    private _texture: Texture;

    /**
     * Parse the atlas JSON, load its sibling `.png` texture, and build
     * the {@link TextureAtlas}.
     * @param data Raw atlas descriptor JSON string.
     */
    public async parseString(data: string) {
        this._json = JSON.parse(data);
        let textureUrl = this.userData.replace('.json', '.png');
        this._texture = await Engine3D.resFor(this.ctx).loadTexture(textureUrl, null, true);

        this.parseAtlas();
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

    private parseAtlas() {
        const atlasW = this._json.size.x;
        const atlasH = this._json.size.y;
        const textureAtlas = new TextureAtlas(this._texture);
        textureAtlas.name = this.baseUrl;

        let atlasInfo = this._json.atlas;
        for (const key in atlasInfo) {
            const entry = atlasInfo[key];
            const rect = entry.textureRect;
            // atlas JSON stores textureRect as (x, y, w, h) in pixel units.
            const region = new Vector4(
                rect.x / atlasW,
                rect.y / atlasH,
                rect.z / atlasW,
                rect.w / atlasH,
            );
            // RFC-005: 9-slice border and native-size fields were removed
            // from Sprite/TextureAtlas (UI-only features handled by DOM now).
            // Any `entry.border` / `entry.size` in the atlas JSON is ignored.
            textureAtlas.add(key, region);
        }
        this.data = textureAtlas;
    }
}
