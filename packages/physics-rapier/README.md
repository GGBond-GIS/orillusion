# @orillusion/physics-rapier

Rapier-backed physics plugin for Orillusion (WebGPU engine).

Independent of `@orillusion/physics` (which uses Bullet/ammo). Both packages
can coexist in one project — `physics-rapier` is the recommended path for new
work; `physics` remains supported for soft-body cases until a GPU XPBD plugin
ships.

## Why Rapier

| | `@orillusion/physics` (ammo) | `@orillusion/physics-rapier` |
|---|---|---|
| Backend | Bullet 2.x via Emscripten asm.js | Rapier (Rust → WASM) |
| Bundle size | ~1.95 MB | ~600 KB (compat) |
| TypeScript | Community .d.ts | Official .d.ts |
| Determinism | No | Yes |
| Public raycast / sweep / overlap | Missing | `PhysicsQuery.*` |
| Character controller | Missing | `CharacterController` |
| Vehicle | Bare `btRaycastVehicle` | `VehicleController` |
| Soft body | Yes (cloth, rope) | No (use ammo, or future XPBD) |
| Snapshots / replay | Partial | `Physics.snapshot/restore` |

## Quick start

```ts
import { Engine3D, Object3D, MeshRenderer, BoxGeometry, LitMaterial, Vector3 } from '@orillusion/core';
import { Physics, Rigidbody, BodyType, CollisionShapeUtil } from '@orillusion/physics-rapier';

await Physics.init();
const engine = await Engine3D.init({ renderLoop: () => Physics.update() });

const cube = new Object3D();
cube.y = 5;
const mr = cube.addComponent(MeshRenderer);
mr.geometry = new BoxGeometry(1, 1, 1);
mr.material = new LitMaterial();

const rb = cube.addComponent(Rigidbody);
rb.bodyType = BodyType.Dynamic;
rb.mass = 1;
rb.shape = CollisionShapeUtil.createBoxShape(cube, new Vector3(1, 1, 1));
```

## Module map

| Path | Class | Purpose |
|---|---|---|
| `Physics` | `Physics` (singleton) | World, step, snapshot, gravity |
| `rigidbody/Rigidbody` | `Rigidbody` | Dynamic/Static/Kinematic body component |
| `rigidbody/RigidbodyEnum` | `BodyType` | Body kind enum |
| `shape/CollisionShapeUtil` | `CollisionShapeUtil` | Box / Sphere / Capsule / Cylinder / Cone / Plane / ConvexHull / Trimesh / Heightfield / Compound |
| `joint/HingeJoint` | `HingeJoint` | 1 angular DOF (revolute) |
| `joint/SliderJoint` | `SliderJoint` | 1 linear DOF (prismatic) |
| `joint/FixedJoint` | `FixedJoint` | All 6 DOFs locked |
| `joint/SphericalJoint` | `SphericalJoint` | Ball-and-socket (replaces P2P + ConeTwist) |
| `joint/GenericJoint` | `GenericJoint` | 6-DOF, axis mask |
| `joint/RopeJoint` | `RopeJoint` | Max distance constraint |
| `joint/SpringJoint` | `SpringJoint` | Hooke's law spring |
| `character/CharacterController` | `CharacterController` | Kinematic character with slope/step/snap |
| `vehicle/VehicleController` | `VehicleController` | Raycast vehicle (chassis + N wheels) |
| `query/PhysicsQuery` | `PhysicsQuery` | `raycast / raycastAll / sweep / overlap / closestPoint` |
| `debug/PhysicsDebugDrawer` | `PhysicsDebugDrawer` | Live wireframe via `Graphic3D` |
| `utils/PhysicsDragger` | `PhysicsDragger` | Mouse drag for dynamic bodies |
| `utils/TempPhyMath` | `TempPhyMath` | `Vector3`/`Quaternion` ↔ Rapier POJO helpers |

## Triggers and events

```ts
const sensor = obj.addComponent(Rigidbody);
sensor.bodyType = BodyType.Static;
sensor.shape = CollisionShapeUtil.createBoxShape(obj, new Vector3(2, 2, 2));
sensor.isSensor = true;        // must be set before start()
sensor.enableEvents = true;    // must be set before start()
sensor.onTriggerEnter = (other) => console.log('entered', other.object3D.name);
sensor.onTriggerExit  = (other) => console.log('left',    other.object3D.name);

// On a dynamic body, the same flag plus contact callbacks:
const rb = body.addComponent(Rigidbody);
rb.enableEvents = true;
rb.onContactBegin = (other) => { /* one-shot */ };
rb.onContactStay  = (other) => { /* every frame while touching */ };
rb.onContactEnd   = (other) => { /* one-shot */ };
```

## Queries

```ts
import { PhysicsQuery } from '@orillusion/physics-rapier';

const hit = PhysicsQuery.raycast(origin, dir, { maxDistance: 100 });
if (hit) console.log(hit.rigidbody, hit.point, hit.normal);

const overlapping = PhysicsQuery.overlap(
    CollisionShapeUtil.createBoxShape(obj, new Vector3(2, 2, 2)),
    pos, rot, { excludeSensors: true },
);
```

## Snapshot / replay

```ts
const blob = Physics.snapshot();      // Uint8Array
// ... time passes ...
Physics.restore(blob);                // world rewound
// NOTE: engine-side Rigidbody bindings are not restored automatically.
// See samples/physics-rapier/Sample_RapierSnapshot.ts for the pattern.
```

## Migration from `@orillusion/physics` (ammo)

For most projects:

```ts
- import { Physics, Rigidbody, ColliderComponent, BoxColliderShape, ... } from '@orillusion/physics';
+ import { Physics, Rigidbody, BodyType, CollisionShapeUtil } from '@orillusion/physics-rapier';
```

Behavioral differences:

| ammo | physics-rapier |
|---|---|
| `rb.mass = 0` for static | `rb.bodyType = BodyType.Static` *(or `mass = 0`, both work)* |
| `ColliderComponent` + `BoxColliderShape` | `rb.shape = CollisionShapeUtil.createBoxShape(obj)` (no separate collider component) |
| `setCcdMotionThreshold(t) + setCcdSweptSphereRadius(r)` | `rb.enableCcd(true)` |
| `setLinearFactor(x, y, z)` | `rb.lockTranslations(x === 0, y === 0, z === 0)` |
| `Physics.world.rayTest(...)` (private) | `PhysicsQuery.raycast(origin, dir, { ... })` |
| `Ammo.btRaycastVehicle` raw API | `VehicleController` component |
| Soft body (`ClothSoftbody`, `RopeSoftbody`) | NOT SUPPORTED — keep using `@orillusion/physics` |
| Joints: `HingeConstraint`, `SliderConstraint`, ... | Renamed to `HingeJoint`, `SliderJoint`, ... |
| `PointToPointConstraint` + `ConeTwistConstraint` | Both replaced by `SphericalJoint` |
| `Generic6DofConstraint` + `Generic6DofSpringConstraint` | Replaced by `GenericJoint` (spring built-in) + `SpringJoint` |

## Escape hatches

When you need a Rapier-only feature that the engine wrapper doesn't expose:

```ts
import RAPIER from '@dimforge/rapier3d-compat';

const native = rb.native;             // Rapier RigidBody
native.setEnabledRotations(true, false, true, true);

const world = Physics.world;          // Rapier World
world.integrationParameters.numSolverIterations = 8;
```

Touching `.native` or `Physics.world` opts out of cross-backend portability.

## Roadmap

- **Done (P0–P2):** rigid bodies, 7 joints, character, vehicle, queries, events, debug, dragger, snapshot, deterministic flag.
- **Future:** Web Worker mode (`Physics.init({ worker: true })` is API-stable; landing pending COOP/COEP infrastructure).
- **Future:** GPU XPBD soft body / cloth / fluid as a separate `@orillusion/physics-xpbd` package.

## License

MIT
