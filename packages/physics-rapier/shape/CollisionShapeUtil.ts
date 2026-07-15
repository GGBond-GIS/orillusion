import {
    Object3D,
    Vector3,
    Quaternion,
    Matrix4,
    BoundUtil,
    BoundingBox,
    BoxGeometry,
    SphereGeometry,
    PlaneGeometry,
    CylinderGeometry,
    MeshRenderer,
    VertexAttributeName,
} from '@orillusion/core';
import RAPIER from '@dimforge/rapier3d-compat';

/**
 * One child entry of a "compound" shape. Rapier has no monolithic compound
 * primitive — every entry becomes its own collider attached to the same body
 * with the given offset.
 */
export interface ChildShape {
    shape: RAPIER.ColliderDesc;
    position: Vector3;
    rotation: Quaternion;
}

/**
 * Collider descriptor factories.
 *
 * Public method names mirror `@orillusion/physics`'s `CollisionShapeUtil`
 * one-to-one where semantics line up. Some return types deviate where
 * Rapier and Bullet model things differently:
 *
 * - `createCompoundShape*` returns `ChildShape[]` (Rapier has no monolithic
 *   compound primitive — multiple colliders attach to one body).
 * - `createConvexHullShape` may return `null` if the points are degenerate
 *   (Rapier surfaces this; ammo silently constructs an invalid hull).
 */
export class CollisionShapeUtil {
    /**
     * Box shape. Falls back to mesh-bounds size when `size` omitted.
     */
    public static createBoxShape(object3D: Object3D, size?: Vector3): RAPIER.ColliderDesc {
        size ||= this.calculateLocalBoundingBox(object3D).size;
        return RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2);
    }

    /**
     * Sphere shape. Falls back to mesh-bounds extents.x for radius.
     */
    public static createSphereShape(object3D: Object3D, radius?: number): RAPIER.ColliderDesc {
        radius ||= this.calculateLocalBoundingBox(object3D).extents.x;
        return RAPIER.ColliderDesc.ball(radius);
    }

    /**
     * Capsule shape. NOTE: Rapier's capsule takes `halfHeight` (the half
     * length of the cylindrical mid-section, NOT including the caps). The
     * ammo plugin's `createCapsuleShape(obj, radius, height)` uses the full
     * mid-section height; pass `height / 2` here.
     */
    public static createCapsuleShape(object3D: Object3D, radius?: number, halfHeight?: number): RAPIER.ColliderDesc {
        let bound: Vector3;
        if (radius == null || halfHeight == null) bound = this.calculateLocalBoundingBox(object3D).size;
        radius ??= bound.x / 2;
        halfHeight ??= Math.max((bound.y - radius * 2) / 2, 0.0001);
        return RAPIER.ColliderDesc.capsule(halfHeight, radius);
    }

    /**
     * Cylinder shape. NOTE: takes `halfHeight`, not full height.
     */
    public static createCylinderShape(object3D: Object3D, radius?: number, halfHeight?: number): RAPIER.ColliderDesc {
        let bound: Vector3;
        if (radius == null || halfHeight == null) bound = this.calculateLocalBoundingBox(object3D).size;
        radius ??= bound.x / 2;
        halfHeight ??= bound.y / 2;
        return RAPIER.ColliderDesc.cylinder(halfHeight, radius);
    }

    /**
     * Cone shape. NOTE: takes `halfHeight`, not full height.
     */
    public static createConeShape(object3D: Object3D, radius?: number, halfHeight?: number): RAPIER.ColliderDesc {
        let bound: Vector3;
        if (radius == null || halfHeight == null) bound = this.calculateLocalBoundingBox(object3D).size;
        radius ??= bound.x / 2;
        halfHeight ??= bound.y / 2;
        return RAPIER.ColliderDesc.cone(halfHeight, radius);
    }

    /**
     * Static plane stand-in. Rapier has no `staticPlane`; uses a wide thin
     * cuboid so behavior matches the ammo plugin's typical floor pattern.
     */
    public static createPlaneShape(extent: number = 1000, thickness: number = 0.1): RAPIER.ColliderDesc {
        return RAPIER.ColliderDesc.cuboid(extent, thickness, extent);
    }

    /**
     * Compound shape. Returns an array of child descriptors — pass to
     * `Rigidbody.shape = [...]` and each entry becomes its own collider.
     */
    public static createCompoundShape(childShapes: ChildShape[]): ChildShape[] {
        return childShapes.map(c => ({
            shape: c.shape.setTranslation(c.position.x, c.position.y, c.position.z)
                          .setRotation({ x: c.rotation.x, y: c.rotation.y, z: c.rotation.z, w: c.rotation.w }),
            position: c.position,
            rotation: c.rotation,
        }));
    }

    /**
     * Build a compound from an Object3D's mesh hierarchy. Each child
     * MeshRenderer contributes one collider, transformed into the parent's
     * local space.
     */
    public static createCompoundShapeFromObject(object3D: Object3D, includeParent: boolean = true): ChildShape[] {
        const out: ChildShape[] = [];
        if (includeParent) {
            const shape = this.createShapeFromObject(object3D);
            if (shape) {
                out.push({
                    shape: shape.setTranslation(0, 0, 0),
                    position: new Vector3(),
                    rotation: new Quaternion(),
                });
            }
        }

        const parentInverse = object3D.transform.worldMatrix.clone();
        parentInverse.invert();

        object3D.forChild((child: Object3D) => {
            const shape = this.createShapeFromObject(child);
            if (!shape) return;

            const local = Matrix4.help_matrix_0;
            local.multiplyMatrices(parentInverse, child.transform.worldMatrix);
            const position = new Vector3();
            const rotation = new Quaternion();
            local.decompose('quaternion', [position, rotation as any, Vector3.HELP_0]);

            out.push({
                shape: shape
                    .setTranslation(position.x, position.y, position.z)
                    .setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w }),
                position,
                rotation,
            });
        });

        return out;
    }

    /**
     * Pick the best primitive shape for a single Object3D, falling back to
     * `convexHull` for arbitrary meshes. Mirrors the ammo plugin's
     * `createShapeFromObject`.
     */
    public static createShapeFromObject(object3D: Object3D): RAPIER.ColliderDesc | null {
        const geometry = object3D.getComponent(MeshRenderer)?.geometry;
        if (!geometry) return null;

        const scale = Vector3.HELP_0.copy(object3D.localScale);

        if (geometry instanceof BoxGeometry) {
            const size = new Vector3(geometry.width, geometry.height, geometry.depth).multiply(scale);
            return this.createBoxShape(object3D, size);
        }
        if (geometry instanceof SphereGeometry) {
            return this.createSphereShape(object3D, geometry.radius * scale.x);
        }
        if (geometry instanceof PlaneGeometry) {
            const size = new Vector3(geometry.width, 0.001, geometry.height).multiply(scale);
            return this.createBoxShape(object3D, size);
        }
        if (geometry instanceof CylinderGeometry) {
            const radius = geometry.radiusBottom * scale.x;
            const halfHeight = (geometry.height * scale.y) / 2;
            if (geometry.radiusTop === geometry.radiusBottom) {
                return this.createCylinderShape(object3D, radius, halfHeight);
            }
            if (geometry.radiusTop <= 0.001) {
                return this.createConeShape(object3D, radius, halfHeight);
            }
            // Fallback: convex hull for truncated cones.
            return this.createConvexHullShape(object3D);
        }

        return this.createConvexHullShape(object3D);
    }

    /**
     * Convex-hull shape from raw vertices or an Object3D's mesh.
     */
    public static createConvexHullShape(object3D: Object3D, modelVertices?: Float32Array): RAPIER.ColliderDesc | null {
        const verts = modelVertices || this.getAllMeshVerticesAndIndices(object3D).vertices;
        const desc = RAPIER.ColliderDesc.convexHull(verts);
        if (desc) {
            const s = object3D.localScale;
            // Rapier's ColliderDesc has no setScale; scale must be baked into vertices.
            // For non-uniform scale, regenerate vertices below.
            if (s.x !== 1 || s.y !== 1 || s.z !== 1) {
                const scaled = new Float32Array(verts.length);
                for (let i = 0; i < verts.length; i += 3) {
                    scaled[i] = verts[i] * s.x;
                    scaled[i + 1] = verts[i + 1] * s.y;
                    scaled[i + 2] = verts[i + 2] * s.z;
                }
                return RAPIER.ColliderDesc.convexHull(scaled);
            }
        }
        return desc;
    }

    /**
     * Triangle-mesh shape from Object3D's mesh. Suitable for static geometry.
     * For dynamic bodies prefer `createConvexHullShape` or compounds.
     */
    public static createTrimeshShape(object3D: Object3D, modelVertices?: Float32Array, modelIndices?: Uint32Array): RAPIER.ColliderDesc {
        let verts: Float32Array;
        let indices: Uint32Array;
        if (modelVertices && modelIndices) {
            verts = modelVertices;
            indices = modelIndices;
        } else {
            const data = this.getAllMeshVerticesAndIndices(object3D, false);
            verts = data.vertices;
            indices = data.indices;
        }

        const s = object3D.localScale;
        if (s.x !== 1 || s.y !== 1 || s.z !== 1) {
            const scaled = new Float32Array(verts.length);
            for (let i = 0; i < verts.length; i += 3) {
                scaled[i] = verts[i] * s.x;
                scaled[i + 1] = verts[i + 1] * s.y;
                scaled[i + 2] = verts[i + 2] * s.z;
            }
            verts = scaled;
        }

        return RAPIER.ColliderDesc.trimesh(verts, indices);
    }

    /**
     * Heightfield from a `PlaneGeometry`'s vertex Y values. Mirrors the ammo
     * plugin's `createHeightfieldTerrainShape`.
     */
    public static createHeightfieldShape(object3D: Object3D): RAPIER.ColliderDesc {
        const geometry = object3D.getComponent(MeshRenderer)?.geometry;
        if (!(geometry instanceof PlaneGeometry)) {
            throw new Error('createHeightfieldShape: requires a MeshRenderer with PlaneGeometry');
        }

        const { width, height, segmentW, segmentH } = geometry;
        const posAttr = geometry.getAttribute(VertexAttributeName.position);
        const cols = segmentW + 1;
        const rows = segmentH + 1;
        const heights = new Float32Array(cols * rows);

        // PlaneGeometry vertex order is row-major in (segmentW+1) × (segmentH+1).
        for (let i = 0; i < cols * rows; i++) {
            heights[i] = posAttr.data[i * 3 + 1];
        }

        const scale = { x: width, y: 1, z: height };
        return RAPIER.ColliderDesc.heightfield(rows - 1, cols - 1, heights, scale);
    }

    /**
     * Get a flat (verts, indices) representation of an Object3D's meshes.
     * Mirrors the ammo plugin's helper, but widens indices to `Uint32Array`
     * (Rapier requires u32; engine geometry uses u16 typically).
     */
    public static getAllMeshVerticesAndIndices(object3D: Object3D, isTransformChildren: boolean = true) {
        const meshRenderers = object3D.getComponents(MeshRenderer);

        if (meshRenderers.length === 1 && !isTransformChildren) {
            const mr = meshRenderers[0];
            const verts = mr.geometry.getAttribute(VertexAttributeName.position).data as Float32Array;
            const idxRaw = mr.geometry.getAttribute(VertexAttributeName.indices).data;
            const indices = idxRaw instanceof Uint32Array ? idxRaw : new Uint32Array(idxRaw as ArrayLike<number>);
            return { vertices: verts, indices };
        }

        let totalVertexLength = 0;
        let totalIndexLength = 0;
        meshRenderers.forEach(r => {
            totalVertexLength += r.geometry.getAttribute(VertexAttributeName.position).data.length;
            totalIndexLength += r.geometry.getAttribute(VertexAttributeName.indices).data.length;
        });

        const vertices = new Float32Array(totalVertexLength);
        const indices = new Uint32Array(totalIndexLength);

        let vertexOffset = 0;
        let indexOffset = 0;
        let currentIndexBase = 0;

        let parentInverse: Matrix4;
        if (isTransformChildren) {
            parentInverse = object3D.transform.worldMatrix.clone();
            parentInverse.invert();
        }

        meshRenderers.forEach(r => {
            let vertexArray = r.geometry.getAttribute(VertexAttributeName.position).data as Float32Array;

            if (isTransformChildren) {
                const childWorld = r.object3D.transform.worldMatrix;
                const local = Matrix4.help_matrix_1;
                local.multiplyMatrices(parentInverse, childWorld);

                const transformed = new Float32Array(vertexArray.length);
                for (let i = 0; i < vertexArray.length / 3; i++) {
                    Vector3.HELP_0.set(vertexArray[i * 3], vertexArray[i * 3 + 1], vertexArray[i * 3 + 2]);
                    Vector3.HELP_0.applyMatrix4(local);
                    transformed[i * 3] = Vector3.HELP_0.x;
                    transformed[i * 3 + 1] = Vector3.HELP_0.y;
                    transformed[i * 3 + 2] = Vector3.HELP_0.z;
                }
                vertexArray = transformed;
            }

            vertices.set(vertexArray, vertexOffset);
            vertexOffset += vertexArray.length;

            const indexArray = r.geometry.getAttribute(VertexAttributeName.indices).data;
            for (let i = 0; i < indexArray.length; i++) {
                indices[indexOffset + i] = indexArray[i] + currentIndexBase;
            }
            indexOffset += indexArray.length;
            currentIndexBase += vertexArray.length / 3;
        });

        return { vertices, indices };
    }

    private static calculateLocalBoundingBox(object3D: Object3D): BoundingBox {
        if (object3D.renderNode && !object3D.numChildren) return object3D.renderNode.geometry.bounds;

        const original = object3D.localRotation.clone();
        object3D.localRotation = Vector3.ZERO;
        const bounds = BoundUtil.genMeshBounds(object3D);
        object3D.localRotation = original;
        return bounds;
    }
}
