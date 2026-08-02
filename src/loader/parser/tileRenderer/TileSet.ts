/**
 * Data carrier for a parsed 3D Tiles tileset.json document.
 * @internal
 */
export class TileSet {
    public asset: { generatetool: string, version: string, gltfUpAxis?: any };
    public extras: { scenetree: string };
    public geometricError: number
    public properties: any;
    public refine: any;
    public root: TileSetRoot;
}

/**
 * Data carrier for the root tile of a tileset, including its transform and children.
 * @internal
 */
export class TileSetRoot {
    public boundingVolume: { box: number[] };
    public children: TileSetChild[];
    public geometricError: number;
    public transform: number[];
}

/**
 * Data carrier for a child tile node and its content references.
 * @internal
 */
export class TileSetChild {
    public boundingVolume: { box: number[] };
    public geometricError: number;
    public refine: string;
    public content: { uri: string };
    public contents: TileSetChildContent[]
}

/**
 * Data carrier for a single tile content entry (URI, group, metadata).
 * @internal
 */
export class TileSetChildContent {
    public uri: string;
    public group: number;
    public metadata: TileSetChildContentMetaData;
}

/**
 * Data carrier for tile content metadata (class name and property counts).
 * @internal
 */
export class TileSetChildContentMetaData {
    public class: string;
    public properties: { vertices: number, materials: number }
}
