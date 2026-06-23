import { Object3D, BoundUtil, Vector3, MeshRenderer, VertexAttributeName, PlaneGeometry, Quaternion, Matrix4, BoundingBox, BoxGeometry, SphereGeometry, CylinderGeometry } from '@orillusion/core';
import { Physics, Ammo } from '../Physics';
import { TempPhyMath } from './TempPhyMath';

export interface ChildShape {
    shape: Ammo.btCollisionShape;
    position: Vector3;
    rotation: Quaternion;
}

/**
 * CollisionShapeUtil
 * Provides utilities for building various collision shapes.
 */
export class CollisionShapeUtil {
    /**
     * Creates a static plane collision shape, suitable for static infinite planes such as the ground or walls.
     * @param planeNormal - The plane normal vector. Defaults to Vector3.UP.
     * @param planeConstant - The plane constant, representing the distance from the plane to the origin. Defaults to 0.
     * @returns Ammo.btStaticPlaneShape - The static plane collision shape instance.
     */
    public static createStaticPlaneShape(planeNormal: Vector3 = Vector3.UP, planeConstant: number = 0) {
        const normal = TempPhyMath.toBtVec(planeNormal);
        const shape = new Ammo.btStaticPlaneShape(normal, planeConstant);

        return shape;
    }

    /**
     * Creates a box collision shape, suitable for box-shaped objects with well-defined dimensions.
     * If no size is specified, the bounding box size of the 3D object is used.
     * @param object3D - The 3D object used to create the collision shape.
     * @param size - Optional. The dimensions of the box collision shape.
     * @returns Ammo.btBoxShape - The box collision shape instance.
     */
    public static createBoxShape(object3D: Object3D, size?: Vector3) {
        size ||= this.calculateLocalBoundingBox(object3D).size;
        const halfExtents = TempPhyMath.setBtVec(size.x / 2, size.y / 2, size.z / 2);
        const shape = new Ammo.btBoxShape(halfExtents);

        return shape;
    }

    /**
     * Creates a sphere collision shape, suitable for spherical objects.
     * If no radius is specified, the bounding box radius `X` of the 3D object is used.
     * @param object3D - The 3D object used to create the collision shape.
     * @param radius - Optional. The radius of the sphere collision shape.
     * @returns Ammo.btSphereShape - The sphere collision shape instance.
     */
    public static createSphereShape(object3D: Object3D, radius?: number) {
        radius ||= this.calculateLocalBoundingBox(object3D).extents.x;
        const shape = new Ammo.btSphereShape(radius);

        return shape;
    }

    /**
     * Creates a capsule collision shape, suitable for capsule-shaped objects.
     * If no dimensions are specified, the bounding box radius `X` and height `Y` of the 3D object are used.
     * @param object3D - The 3D object used to create the collision shape.
     * @param radius - Optional. The radius of the capsule.
     * @param height - Optional. The height of the cylindrical middle section of the capsule.
     * @returns Ammo.btCapsuleShape - The capsule collision shape instance.
     */
    public static createCapsuleShape(object3D: Object3D, radius?: number, height?: number) {
        let boundSize: Vector3
        if (!radius || !height) boundSize = this.calculateLocalBoundingBox(object3D).size;

        radius ||= boundSize.x / 2;
        height ||= boundSize.y - radius * 2;
        const shape = new Ammo.btCapsuleShape(radius, height);

        return shape;
    }

    /**
     * Creates a cylinder collision shape, suitable for cylindrical objects.
     * If no dimensions are specified, the bounding box radius `X` and height `Y` of the 3D object are used.
     * @param object3D - The 3D object used to create the collision shape.
     * @param radius - Optional. The radius of the cylinder.
     * @param height - Optional. The full height of the cylinder.
     * @returns Ammo.btCylinderShape - The cylinder collision shape instance.
     */
    public static createCylinderShape(object3D: Object3D, radius?: number, height?: number) {
        let boundSize: Vector3
        if (!radius || !height) boundSize = this.calculateLocalBoundingBox(object3D).size;

        radius ||= boundSize.x / 2;
        height ||= boundSize.y;
        const halfExtents = TempPhyMath.setBtVec(radius, height / 2, radius);
        const shape = new Ammo.btCylinderShape(halfExtents);

        return shape;
    }

    /**
     * Creates a cone collision shape, suitable for cone-shaped objects.
     * If no dimensions are specified, the bounding box radius `X` and height `Y` of the 3D object are used.
     * @param object3D - The 3D object used to create the collision shape.
     * @param radius - Optional. The radius of the cone.
     * @param height - Optional. The height of the cone.
     * @returns Ammo.btConeShape - The cone collision shape instance.
     */
    public static createConeShape(object3D: Object3D, radius?: number, height?: number) {
        let boundSize: Vector3
        if (!radius || !height) boundSize = this.calculateLocalBoundingBox(object3D).size;

        radius ||= boundSize.x / 2;
        height ||= boundSize.y;
        const shape = new Ammo.btConeShape(radius, height);

        return shape;
    }

    /**
     * Creates a compound shape that combines multiple child shapes into a single shape.
     * @param childShapes - An array containing child shape instances along with their position and rotation properties.
     * @returns Ammo.btCompoundShape - The compound shape instance.
     */
    public static createCompoundShape(childShapes: ChildShape[]) {
        const compoundShape = new Ammo.btCompoundShape();
        const transform = Physics.TEMP_TRANSFORM;

        childShapes.forEach(desc => {
            transform.setIdentity();
            transform.setOrigin(TempPhyMath.toBtVec(desc.position));
            transform.setRotation(TempPhyMath.toBtQua(desc.rotation));

            compoundShape.addChildShape(transform, desc.shape);
        });

        return compoundShape;
    }

    /**
     * Creates a compound collision shape from an Object3D and its child objects.
     * @param object3D - The 3D object containing multiple child objects.
     * @param includeParent - Whether to include the parent object's geometry. Defaults to `true`.
     * @returns The compound collision shape.
     */
    public static createCompoundShapeFromObject(object3D: Object3D, includeParent: boolean = true) {

        const childShapes: ChildShape[] = [];

        // Process the parent object's geometry
        if (includeParent) {
            const shape = this.createShapeFromObject(object3D);
            if (shape) {
                const position = new Vector3();
                const rotation = new Quaternion();
                childShapes.push({ shape, position, rotation });
            }
        }

        // Compute the parent object's inverse matrix
        const parentMatrixInverse = object3D.transform.worldMatrix.clone();
        parentMatrixInverse.invert();

        // Iterate over and process child objects
        object3D.forChild((child: Object3D) => {
            const shape = this.createShapeFromObject(child);
            if (shape) {
                // Multiply matrices and decompose
                const childMatrix = child.transform.worldMatrix;
                const localMatrix = Matrix4.help_matrix_0;
                localMatrix.multiplyMatrices(parentMatrixInverse, childMatrix);

                const position = new Vector3();
                const rotation = new Quaternion();
                localMatrix.decompose('quaternion', [position, rotation as any, Vector3.HELP_0]);
                childShapes.push({ shape, position, rotation });
            }
        });

        // Create the compound collision shape
        const compoundShape = this.createCompoundShape(childShapes);
        return compoundShape;
    }

    /**
     * Creates a collision shape that matches the geometry type of the Object3D.
     *
     * Only Box, Sphere, Plane, and Cylinder geometries are supported. For any other geometry type, a btConvexHullShape (convex hull) is returned.
     * @param object3D
     * @returns Ammo.btCollisionShape
     */
    public static createShapeFromObject(object3D: Object3D): Ammo.btCollisionShape | null {

        const geometry = object3D.getComponent(MeshRenderer)?.geometry;
        if (!geometry) return null;

        let shape: Ammo.btCollisionShape;
        let scale = Vector3.HELP_0.copy(object3D.localScale);

        // Create the corresponding collision shape based on the geometry type
        switch (true) {
            case geometry instanceof BoxGeometry: {
                const { width, height, depth } = geometry;
                const size = new Vector3(width, height, depth).multiply(scale);
                shape = this.createBoxShape(object3D, size);
                break;
            }
            case geometry instanceof SphereGeometry: {
                const radius = geometry.radius * scale.x;
                shape = this.createSphereShape(object3D, radius);
                break;
            }
            case geometry instanceof PlaneGeometry: {
                const { width, height } = geometry;
                const size = new Vector3(width, 0, height).multiply(scale);
                shape = this.createBoxShape(object3D, size);
                break;
            }
            case geometry instanceof CylinderGeometry: {
                const radiusBottom = geometry.radiusBottom * scale.x
                const height = geometry.height * scale.y

                if (geometry.radiusTop === geometry.radiusBottom) {
                    shape = this.createCylinderShape(object3D, radiusBottom, height);
                } else if (geometry.radiusTop <= 0.1) {
                    shape = this.createConeShape(object3D, radiusBottom, height);
                } else {
                    shape = this.createConvexHullShape(object3D);
                }
                break;
            }
            default: {
                shape = this.createConvexHullShape(object3D);
                break;
            }
        }

        return shape;
    }

    /**
     * Creates a heightfield shape that simulates terrain based on plane vertex data.
     * @param object3D - The 3D object used to create the collision shape.
     * @param heightScale - The height scaling factor. Defaults to `1`.
     * @param upAxis - The up axis of the heightfield. Defaults to `1`.
     * @param hdt - The data type of the heightfield. Defaults to `Ammo.PHY_FLOAT`.
     * @param flipQuadEdges - Whether to flip the quad edges. Defaults to `false`.
     * @returns Ammo.btHeightfieldTerrainShape - The heightfield terrain shape instance.
     */
    public static createHeightfieldTerrainShape(
        object3D: Object3D,
        heightScale: number = 1,
        upAxis: number = 1,
        hdt: Ammo.PHY_ScalarType = 'PHY_FLOAT',
        flipQuadEdges: boolean = false,
    ) {
        let geometry = object3D.getComponent(MeshRenderer)?.geometry;

        if (!(geometry instanceof PlaneGeometry)) throw new Error("Wrong geometry type");

        const { width, height, segmentW, segmentH } = geometry;
        let posAttrData = geometry.getAttribute(VertexAttributeName.position);
        const heightData = new Float32Array(posAttrData.data.length / 3);
        let minHeight = Infinity, maxHeight = -Infinity;

        for (let i = 0, count = posAttrData.data.length / 3; i < count; i++) {
            let y = posAttrData.data[i * 3 + 1];
            heightData[i] = y;
            if (y < minHeight) minHeight = y;
            if (y > maxHeight) maxHeight = y;
        }

        let ammoHeightData = Ammo._malloc(heightData.length * 4);
        let ammoHeightDataF32 = new Float32Array(Ammo.HEAPF32.buffer, ammoHeightData, heightData.length);
        ammoHeightDataF32.set(heightData);

        let shape = new Ammo.btHeightfieldTerrainShape(
            segmentW + 1,
            segmentH + 1,
            ammoHeightData,
            heightScale,
            minHeight,
            maxHeight,
            upAxis,
            hdt,
            flipQuadEdges
        );

        let localScaling = TempPhyMath.setBtVec(width / segmentW, 1, height / segmentH);
        shape.setLocalScaling(localScaling);
        (shape as any).averageHeight = (minHeight + maxHeight) / 2;

        return shape;
    }

    /**
     * Creates a convex hull shape, suitable for models with filled-in concavities.
     * This shape is appropriate for dynamic objects and provides fast collision detection.
     * @param object3D - The 3D object used to create the collision shape.
     * @param modelVertices - Optional. Vertex data for the collision shape. Defaults to the 3D object's vertex data.
     * @returns Ammo.btConvexHullShape - The convex hull shape instance.
     */
    public static createConvexHullShape(object3D: Object3D, modelVertices?: Float32Array) {
        let vertices = modelVertices || this.getAllMeshVerticesAndIndices(object3D).vertices;

        let shape = new Ammo.btConvexHullShape();
        for (let i = 0, count = vertices.length / 3; i < count; i++) {
            let point = TempPhyMath.setBtVec(vertices[3 * i], vertices[3 * i + 1], vertices[3 * i + 2]);
            shape.addPoint(point, true);
        }

        let scaling = TempPhyMath.toBtVec(object3D.localScale);
        shape.setLocalScaling(scaling);

        return shape;
    }

    /**
     * Creates a convex triangle mesh shape, suitable for dynamic objects that require complex geometric representation.
     * This shape does not require a separate convex hull generation step and is suitable for convex triangle meshes.
     * @param object3D - The 3D object used to create the collision shape.
     * @param modelVertices - Optional. Vertex data for the collision shape.
     * @param modelIndices - Optional. Index data for the collision shape.
     * @returns Ammo.btConvexTriangleMeshShape - The convex triangle mesh shape instance.
     */
    public static createConvexTriangleMeshShape(object3D: Object3D, modelVertices?: Float32Array, modelIndices?: Uint16Array): Ammo.btBvhTriangleMeshShape {
        // Verify that modelVertices and modelIndices are either both provided or both omitted
        if ((modelVertices && !modelIndices) || (!modelVertices && modelIndices)) {
            console.warn('createConvexTriangleMeshShape: Both modelVertices and modelIndices must be provided or neither should be provided.');
        }

        const { vertices, indices } = (modelVertices && modelIndices)
            ? { vertices: modelVertices, indices: modelIndices }
            : this.getAllMeshVerticesAndIndices(object3D, false);

        const triangleMesh = this.buildTriangleMesh(vertices, indices);
        const shape = new Ammo.btConvexTriangleMeshShape(triangleMesh, true);

        const scaling = TempPhyMath.toBtVec(object3D.localScale);
        shape.setLocalScaling(scaling);

        return shape;
    }

    /**
     * Creates a bounding volume hierarchy (BVH) triangle mesh shape, suitable for static objects that require complex geometric representation.
     * This shape is well-suited for large-scale static meshes but is not appropriate for dynamic objects.
     * @param object3D - The 3D object used to create the collision shape.
     * @param modelVertices - Optional. Vertex data for the collision shape.
     * @param modelIndices - Optional. Index data for the collision shape.
     * @returns Ammo.btBvhTriangleMeshShape - The BVH triangle mesh shape instance.
     */
    public static createBvhTriangleMeshShape(object3D: Object3D, modelVertices?: Float32Array, modelIndices?: Uint16Array): Ammo.btBvhTriangleMeshShape {
        // Verify that modelVertices and modelIndices are either both provided or both omitted
        if ((modelVertices && !modelIndices) || (!modelVertices && modelIndices)) {
            console.warn('createBvhTriangleMeshShape: Both modelVertices and modelIndices must be provided or neither should be provided.');
        }

        const { vertices, indices } = (modelVertices && modelIndices)
            ? { vertices: modelVertices, indices: modelIndices }
            : this.getAllMeshVerticesAndIndices(object3D, false);

        const triangleMesh = this.buildTriangleMesh(vertices, indices);
        const shape = new Ammo.btBvhTriangleMeshShape(triangleMesh, true, true);

        const scaling = TempPhyMath.toBtVec(object3D.localScale);
        shape.setLocalScaling(scaling);

        return shape;
    }

    /**
     * Creates a GImpact mesh shape, suitable for dynamic objects that require complex geometric representation.
     * Based on the GIMPACT algorithm, it can be used for complex triangle mesh collision detection, including interactions between dynamic objects. This shape has a higher performance cost but provides more precise collision detection.
     * @param object3D - The 3D object used to create the collision shape.
     * @param modelVertices - Optional. Vertex data for the collision shape.
     * @param modelIndices - Optional. Index data for the collision shape.
     * @returns Ammo.btGImpactMeshShape - The GImpact mesh shape instance.
     */
    public static createGImpactMeshShape(object3D: Object3D, modelVertices?: Float32Array, modelIndices?: Uint16Array): Ammo.btGImpactMeshShape {
        // Verify that modelVertices and modelIndices are either both provided or both omitted
        if ((modelVertices && !modelIndices) || (!modelVertices && modelIndices)) {
            console.warn('createGImpactMeshShape: Both modelVertices and modelIndices must be provided or neither should be provided.');
        }

        const { vertices, indices } = (modelVertices && modelIndices)
            ? { vertices: modelVertices, indices: modelIndices }
            : this.getAllMeshVerticesAndIndices(object3D, false);

        const triangleMesh = this.buildTriangleMesh(vertices, indices);
        const shape = new Ammo.btGImpactMeshShape(triangleMesh);
        shape.updateBound();

        const scaling = TempPhyMath.toBtVec(object3D.localScale);
        shape.setLocalScaling(scaling);

        return shape;
    }

    /**
     * Builds a btTriangleMesh object used to create mesh shapes.
     * @param vertices - Vertex data laid out in xyz order.
     * @param indices - Index data defining the vertex indices of each triangle.
     * @returns Ammo.btTriangleMesh - The constructed triangle mesh.
     */
    public static buildTriangleMesh(vertices: Float32Array, indices: Uint16Array): Ammo.btTriangleMesh {
        let triangleMesh = new Ammo.btTriangleMesh();

        for (let i = 0; i < indices.length; i += 3) {
            const index0 = indices[i] * 3;
            const index1 = indices[i + 1] * 3;
            const index2 = indices[i + 2] * 3;

            const v0 = TempPhyMath.setBtVec(vertices[index0], vertices[index0 + 1], vertices[index0 + 2], TempPhyMath.tmpVecA);
            const v1 = TempPhyMath.setBtVec(vertices[index1], vertices[index1 + 1], vertices[index1 + 2], TempPhyMath.tmpVecB);
            const v2 = TempPhyMath.setBtVec(vertices[index2], vertices[index2 + 1], vertices[index2 + 2], TempPhyMath.tmpVecC);

            triangleMesh.addTriangle(v0, v1, v2, true);
        }

        return triangleMesh;
    }

    /**
     * Gets the vertices and indices of all meshes belonging to a 3D object.
     * @param object3D - The 3D object.
     * @param isTransformChildren - Whether to transform child object vertices into the parent object's local coordinate space. Defaults to `true`.
     * @returns The combined vertex data and index data.
     */
    public static getAllMeshVerticesAndIndices(object3D: Object3D, isTransformChildren: boolean = true) {
        let meshRenderers = object3D.getComponents(MeshRenderer);

        if (meshRenderers.length === 1 && !isTransformChildren) {
            return {
                vertices: meshRenderers[0].geometry.getAttribute(VertexAttributeName.position).data as Float32Array,
                indices: meshRenderers[0].geometry.getAttribute(VertexAttributeName.indices).data as Uint16Array
            };
        }

        let totalVertexLength = 0;
        let totalIndexLength = 0;

        meshRenderers.forEach(renderer => {
            totalVertexLength += renderer.geometry.getAttribute(VertexAttributeName.position).data.length;
            totalIndexLength += renderer.geometry.getAttribute(VertexAttributeName.indices).data.length;
        });

        let vertices = new Float32Array(totalVertexLength);
        let indices = new Uint16Array(totalIndexLength);

        let vertexOffset = 0;
        let indexOffset = 0;
        let currentIndexOffset = 0;

        let parentMatrixInverse: Matrix4;
        if (isTransformChildren) {
            // Compute the parent object's inverse matrix
            parentMatrixInverse = object3D.transform.worldMatrix.clone();
            parentMatrixInverse.invert();
        }

        meshRenderers.forEach(renderer => {
            let vertexArray = renderer.geometry.getAttribute(VertexAttributeName.position).data;

            if (isTransformChildren) {
                const childWorldMatrix = renderer.object3D.transform.worldMatrix;

                // Compute the child's local transform matrix relative to the parent
                let localMatrix = Matrix4.help_matrix_1;
                localMatrix.multiplyMatrices(parentMatrixInverse, childWorldMatrix);

                let transformedVertexArray = new Float32Array(vertexArray.length);

                for (let index = 0; index < vertexArray.length / 3; index++) {
                    Vector3.HELP_0.set(
                        vertexArray[index * 3],
                        vertexArray[index * 3 + 1],
                        vertexArray[index * 3 + 2]
                    );

                    Vector3.HELP_0.applyMatrix4(localMatrix);

                    transformedVertexArray[index * 3] = Vector3.HELP_0.x;
                    transformedVertexArray[index * 3 + 1] = Vector3.HELP_0.y;
                    transformedVertexArray[index * 3 + 2] = Vector3.HELP_0.z;
                }
                vertexArray = transformedVertexArray;
            }

            vertices.set(vertexArray, vertexOffset);
            vertexOffset += vertexArray.length;

            let indexArray = renderer.geometry.getAttribute(VertexAttributeName.indices).data;
            for (let i = 0; i < indexArray.length; i++) {
                indices[indexOffset + i] = indexArray[i] + currentIndexOffset;
            }
            indexOffset += indexArray.length;
            currentIndexOffset += vertexArray.length / 3;
        });

        return { vertices, indices };
    }

    /**
     * Computes the local bounding box of a 3D object.
     * @param object3D - The 3D object.
     * @returns The local bounding box.
     */
    private static calculateLocalBoundingBox(object3D: Object3D): BoundingBox {
        if (object3D.renderNode && !object3D.numChildren) {
            return object3D.renderNode.geometry.bounds;
        }

        let originalRotation = object3D.localRotation.clone();
        object3D.localRotation = Vector3.ZERO;
        let bounds = BoundUtil.genMeshBounds(object3D);
        object3D.localRotation = originalRotation;
        return bounds;
        // const { x, y, z } = object3D.localRotation;
        // object3D.localRotation.set(0, 0, 0);
        // let bounds = BoundUtil.genMeshBounds(object3D);
        // object3D.localRotation.set(x, y, z);
        // return bounds;
    }

}
