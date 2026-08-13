import {
    EarthAtmRenderer,
    EarthSkyRenderer,
    GeometryBase,
    GeometryVertexType,
    Matrix4,
    MeshRenderer,
    Object3D,
    SkyRenderer,
    SpriteRenderer,
    Vector2,
    Vector3,
    VertexAttributeData,
    VertexAttributeName,
} from '@orillusion/core';
import { Raycaster } from './Raycaster';
import type { RaycastHit } from './RaycastHit';

type RaycastMethod = (raycaster: Raycaster, intersects: RaycastHit[]) => void;
type RaycastPrototype = { raycast?: RaycastMethod };
type Constructor<T = object> = { prototype: T };

const installed = new Map<object, Map<PropertyKey, PropertyDescriptor | undefined>>();

function injectProperty(ctor: Constructor, property: PropertyKey, value: unknown): void {
    const prototype = ctor.prototype;
    let properties = installed.get(prototype);
    if (!properties) {
        properties = new Map();
        installed.set(prototype, properties);
    }
    if (properties.has(property)) return;
    properties.set(property, Object.getOwnPropertyDescriptor(prototype, property));
    Object.defineProperty(prototype, property, {
        configurable: true,
        writable: true,
        value,
    });
}

function inject(ctor: Constructor, method: RaycastMethod): void {
    injectProperty(ctor, 'raycast', method);
}

function raycastMesh(
    renderer: MeshRenderer,
    object: Object3D,
    geometry: GeometryBase,
    raycaster: Raycaster,
    intersects: RaycastHit[],
): void {
    const material = renderer.materials[0];
    if (!renderer.enable || !geometry || !material) return;

    Raycaster._initScratch();
    Raycaster._matrix.copy(object.transform.worldMatrix).invert();
    Raycaster._localRay.copy(raycaster.ray).applyMatrix(Raycaster._matrix);
    Raycaster._localRay.direction.normalize();

    let positionData;
    let positionStride: number;
    if (geometry.geometryType === GeometryVertexType.compose_bin) {
        const all = geometry.getAttribute(VertexAttributeName.all);
        if (!all) return;
        positionData = all.data;
        positionStride = geometry.vertexDim;
    } else {
        const position = geometry.getAttribute(VertexAttributeName.position);
        if (!position) return;
        positionData = position.data;
        positionStride = 3;
    }

    const uvAttr: VertexAttributeData = geometry.getAttribute(VertexAttributeName.uv);
    const uv1Attr: VertexAttributeData = geometry.getAttribute(VertexAttributeName.TEXCOORD_1);
    const normalAttr: VertexAttributeData = geometry.getAttribute(VertexAttributeName.normal);
    const backfaceCulling = material.cullMode !== 'none';
    const reversed = material.cullMode === 'front';
    const indexAttr = geometry.getAttribute(VertexAttributeName.indices);

    if (indexAttr?.data?.length) {
        const indices = indexAttr.data;
        for (let faceIndex = 0; faceIndex < indices.length / 3; faceIndex++) {
            const a = indices[faceIndex * 3];
            const b = indices[faceIndex * 3 + 1];
            const c = indices[faceIndex * 3 + 2];
            const hit = Raycaster._checkTriangle(
                raycaster, object, a, b, c, positionData, positionStride,
                uvAttr, uv1Attr, normalAttr, backfaceCulling, reversed,
            );
            if (hit) {
                hit.faceIndex = faceIndex;
                intersects.push(hit);
            }
        }
        return;
    }

    for (let i = 0; i < positionData.length / positionStride; i += 3) {
        const hit = Raycaster._checkTriangle(
            raycaster, object, i, i + 1, i + 2, positionData, positionStride,
            uvAttr, uv1Attr, normalAttr, backfaceCulling, reversed,
        );
        if (hit) {
            hit.faceIndex = Math.floor(i / 3);
            intersects.push(hit);
        }
    }
}

function meshRaycast(this: MeshRenderer, raycaster: Raycaster, intersects: RaycastHit[]): void {
    raycastMesh(this, this.object3D, this.geometry, raycaster, intersects);
}

function spriteRaycast(this: SpriteRenderer, raycaster: Raycaster, intersects: RaycastHit[]): void {
    if (!this.enable || !this.geometry || !this.materials[0]) return;

    Raycaster._initScratch();
    Raycaster._matrix.copy(this.transform.worldMatrix).invert();
    Raycaster._localRay.copy(raycaster.ray).applyMatrix(Raycaster._matrix);
    Raycaster._localRay.direction.normalize();

    const directionZ = Raycaster._localRay.direction.z;
    if (Math.abs(directionZ) < 1e-8) return;
    const t = -Raycaster._localRay.origin.z / directionZ;
    if (t < 0) return;

    const localX = Raycaster._localRay.origin.x + Raycaster._localRay.direction.x * t;
    const localY = Raycaster._localRay.origin.y + Raycaster._localRay.direction.y * t;
    const pivot = this.pivot;
    const size = this.size.clone();
    if (this.distanceInvariantSize) {
        const cameraDistance = Vector3.distance(raycaster.ray.origin, this.transform.worldPosition);
        size.multiplyScalar(cameraDistance / 10);
    }
    const centerX = (0.5 - pivot.x) * size.x;
    const centerY = (0.5 - pivot.y) * size.y;
    const halfWidth = size.x / 2;
    const halfHeight = size.y / 2;
    if (
        localX < centerX - halfWidth || localX > centerX + halfWidth ||
        localY < centerY - halfHeight || localY > centerY + halfHeight
    ) return;

    const point = Raycaster._pointWorld.copy(Raycaster._localRay.origin)
        .addScaledVector(Raycaster._localRay.direction, t);
    Matrix4.transformPoint(this.transform.worldMatrix, point, point);
    const distance = Vector3.distance(raycaster.ray.origin, point);
    if (distance < raycaster.near || distance > raycaster.far) return;

    const normal = Matrix4.transformVector(
        this.transform.worldMatrix,
        new Vector3(0, 0, 1),
        new Vector3(),
    ).normalize();
    intersects.push({
        distance,
        point: point.clone(),
        object: this.object3D,
        faceIndex: -1,
        uv: new Vector2(
            (localX - (centerX - halfWidth)) / size.x,
            (localY - (centerY - halfHeight)) / size.y,
        ),
        normal,
    });
}

function ignoreRaycast(): void {}

/** Inject CPU ray-picking support into Orillusion's built-in renderers. */
export function installRayPick(): void {
    inject(MeshRenderer, meshRaycast);
    inject(SpriteRenderer, spriteRaycast);
    inject(SkyRenderer, ignoreRaycast);
    inject(EarthSkyRenderer, ignoreRaycast);
    inject(EarthAtmRenderer, ignoreRaycast);
}

/**
 * Inject support for an external GPU-instanced renderer such as
 * `Graphic3DMeshRenderer`, without making this package depend on it.
 */
export function installGraphicRayPick<T extends MeshRenderer>(
    rendererType: Constructor<T & {
        sourceGeometry: GeometryBase;
        object3Ds: Object3D[];
        create(source: GeometryBase, ...args: unknown[]): unknown;
    }>,
): void {
    const prototype = rendererType.prototype;
    const originalCreate = prototype.create;
    injectProperty(rendererType, 'create', function (this: typeof prototype, source: GeometryBase, ...args: unknown[]) {
        this.sourceGeometry = source;
        return originalCreate.call(this, source, ...args);
    });
    inject(rendererType, function (this: typeof prototype, raycaster, intersects) {
        if (!this.enable || !this.sourceGeometry || !this.materials[0]) return;
        for (const object of this.object3Ds) {
            raycastMesh(this, object, this.sourceGeometry, raycaster, intersects);
        }
    });
}

/** Restore renderer prototypes to their state before installation. */
export function uninstallRayPick(): void {
    for (const [prototype, properties] of installed) {
        for (const [property, descriptor] of properties) {
            if (descriptor) Object.defineProperty(prototype, property, descriptor);
            else delete (prototype as Record<PropertyKey, unknown>)[property];
        }
    }
    installed.clear();
}
