import { ParserBase } from "../ParserBase";
import { ParserFormat } from "../ParserFormat";

export enum GeoType {
    Point = "Point",
    LineString = "LineString",
    MultiPolygon = "MultiPolygon"
}

export interface GeoJsonGeometryStruct {
    type: GeoType;
    coordinates: any;
}

export interface GeoJsonPropertiesStruct {
    prop0: string;
    prop1: any;
}


export interface GeoJsonNodeStruct {
    type: string;
    geometry: GeoJsonGeometryStruct;
    properties: GeoJsonPropertiesStruct;
}

export interface GeoJsonStruct {
    type: string;
    features: GeoJsonNodeStruct[];
}

/**
 * Parser for GeoJSON feature collections. Parses the raw JSON text into
 * a typed {@link GeoJsonStruct} that downstream GIS utilities can consume.
 * @group Loader
 */
export class GeoJsonParser extends ParserBase {
    static format: ParserFormat = ParserFormat.JSON;
    /** Raw GeoJSON source text passed to the parser. */
    public json: string;
    /**
     * Parse GeoJSON text into a {@link GeoJsonStruct}.
     * @param data Raw GeoJSON string.
     */
    public async parseString(data: any) {
        this.json = data;
        this.data = JSON.parse(data) as GeoJsonStruct;
    }
}