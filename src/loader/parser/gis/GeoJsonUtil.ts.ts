import { Vector3 } from "../../..";
import { ParserBase } from "../ParserBase";
import { ParserFormat } from "../ParserFormat";
import { GeoJsonStruct, GeoType } from "./GeoJsonParser";

/**
 * Helper utilities for converting parsed GeoJSON structures into engine
 * geometry data (e.g. polylines / polygon outlines in world space).
 * @group Loader
 */
export class GeoJsonUtil {
    /**
     * Extract polyline paths from a GeoJSON structure.
     * @param data Parsed GeoJSON feature collection.
     * @returns Arrays of {@link Vector3} points, one array per matching feature.
     */
    public static getPath(data: GeoJsonStruct) {
        let lineArray: Vector3[][] = [];
        for (let i = 0; i < data.features.length; i++) {
            const element = data.features[i];
            switch (element.geometry.type) {
                case GeoType.LineString:
                    // lineArray.push(element.geometry.coordinates);
                    break;
                case GeoType.MultiPolygon:
                    let point3s = [];
                    for (let i = 0; i < element.geometry.coordinates.length; i++) {
                        const pointArray = element.geometry.coordinates[i];
                        for (const list of pointArray) {
                            for (const iterator of list) {
                                let point3 = new Vector3(iterator[0], 0, iterator[1]);
                                point3s.push(point3);
                            }
                        }
                    }
                    lineArray.push(point3s);
                    break;
                default:
                    break;
            }
        }
        return lineArray;
    }
}