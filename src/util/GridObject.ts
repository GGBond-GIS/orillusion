import { UnLitMaterial, Color, MeshRenderer, BlendMode, GeometryBase, VertexAttributeName } from "..";
import { Object3D } from "../core/entities/Object3D";

/**
 * An object contains grids - two dimensional arrrys of lines
 * @group Util
 */
export class GridObject extends Object3D {
    public size: number = 100;

    public divisions: number = 10;

    constructor(size: number = 100, divisions: number = 10) {
        super();
        this.size = size;
        this.divisions = divisions;
        this.buildGeometry();
        this.addAxis();
    }

    private buildGeometry() {
        const step = this.size / this.divisions;
        const halfSize = this.size / 2;
        const center = this.divisions / 2;

        const vertices: number[] = [];

        for (let i = 0, k = -halfSize; i <= this.divisions; i++, k += step) {
            if (i === center) continue;
            // Row along X at z=k
            vertices.push(-halfSize, 0, k, halfSize, 0, k);
            // Column along Z at x=k
            vertices.push(k, 0, -halfSize, k, 0, halfSize);
        }

        const vertexCount = vertices.length / 3;
        const indices: number[] = new Array(vertexCount);
        for (let i = 0; i < vertexCount; i++) indices[i] = i;

        const grid = new GeometryBase();
        grid.setIndices(vertexCount > 65535 ? new Uint32Array(indices) : new Uint16Array(indices));
        grid.setAttribute(VertexAttributeName.position, new Float32Array(vertices));
        grid.addSubGeometry({
            indexStart: 0,
            indexCount: indices.length,
            vertexStart: 0,
            vertexCount: 0,
            firstStart: 0,
            index: 0,
            topology: 0,
        });

        const mat = new UnLitMaterial();
        mat.topology = 'line-list';
        mat.baseColor = new Color(1, 1, 1, 0.15);
        mat.blendMode = BlendMode.ADD;
        mat.castReflection = false;
        const mr = this.addComponent(MeshRenderer);
        mr.geometry = grid;
        mr.material = mat;
    }

    private addAxis() {
        const halfSize = this.size / 2;

        const makeLine = (x0: number, z0: number, x1: number, z1: number) => {
            const geo = new GeometryBase();
            geo.setIndices(new Uint16Array([0, 1]));
            geo.setAttribute(VertexAttributeName.position, new Float32Array([x0, 0, z0, x1, 0, z1]));
            geo.addSubGeometry({
                indexStart: 0,
                indexCount: 2,
                vertexStart: 0,
                vertexCount: 0,
                firstStart: 0,
                index: 0,
                topology: 0,
            });
            return geo;
        };

        {
            const x = new Object3D();
            const mr = x.addComponent(MeshRenderer);
            mr.geometry = makeLine(-halfSize, 0, halfSize, 0);
            const mat = mr.material = new UnLitMaterial();
            mat.topology = 'line-list';
            mat.baseColor = new Color(1, 0, 0, 0.5);
            mat.blendMode = BlendMode.ADD;
            mat.castReflection = false;
            this.addChild(x);
        }
        {
            const z = new Object3D();
            const mr = z.addComponent(MeshRenderer);
            mr.geometry = makeLine(0, -halfSize, 0, halfSize);
            const mat = mr.material = new UnLitMaterial();
            mat.topology = 'line-list';
            mat.baseColor = new Color(0, 1, 0, 0.5);
            mat.blendMode = BlendMode.ADD;
            mat.castReflection = false;
            this.addChild(z);
        }
    }
}
