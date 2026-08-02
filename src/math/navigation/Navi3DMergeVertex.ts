import { GeometryBase } from "../../core/geometry/GeometryBase";
import { VertexAttributeName } from "../../core/geometry/VertexAttributeName";
import { Vector3 } from "../Vector3";

/**
 * Utility that merges coincident vertices when building a navigation mesh from geometry.
 * @group Math
 */
export class Navi3DMergeVertex {
    /** The vertex positions extracted from the source geometry. */
    vertex: Vector3[];
    /** The (possibly remapped) triangle indices into {@link vertex}. */
    indices: number[];

    /** Extracts vertices and indices from the geometry, merging vertices closer than the given threshold. */
    merge(geometry: GeometryBase, threshould: number = 0.1): this {
        let vertex = geometry.getAttribute(VertexAttributeName.position).data;
        this.makeOriginVertex(vertex);

        let sameVertexIndex: Map<number, Vector3> = new Map<number, Vector3>();
        let redirectionIndex: number[] = [];
        for (let i = 0, c = this.vertex.length; i < c; i++) {
            let item = this.vertex[i];
            let samePointIndex = -1;
            sameVertexIndex.forEach((v, i) => {
                let distance = Vector3.distance(v, item);
                if (distance < threshould) {
                    samePointIndex = i;
                }
            })
            if (samePointIndex > -1) {
                redirectionIndex[i] = samePointIndex;
            } else {
                sameVertexIndex.set(i, item);
                redirectionIndex[i] = i;
            }
        }

        //force modify indices
        this.indices = [];
        let indices = geometry.getAttribute(VertexAttributeName.indices).data;
        for (const i of indices) {
            this.indices.push(redirectionIndex[i]);
        }
        return this;
    }

    /** Extracts vertices and indices from the geometry without merging any vertices. */
    parse(geometry: GeometryBase): this {
        let vertex = geometry.getAttribute(VertexAttributeName.position).data;
        this.makeOriginVertex(vertex);
        this.indices = [];
        let indices = geometry.getAttribute(VertexAttributeName.indices).data;
        for (const i of indices) {
            this.indices.push(i);
        }
        return this;
    }

    private makeOriginVertex(source) {
        this.vertex = [];
        for (let i = 0, c = source.length / 3; i < c; i++) {
            let v = new Vector3(source[i * 3], source[i * 3 + 1], source[i * 3 + 2]);
            this.vertex.push(v);
        }
    }
}