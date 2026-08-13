# @orillusion/ray-pick

`@orillusion/ray-pick` provides injectable CPU ray picking for Orillusion scenes. It tests rays against mesh triangles and is distributed as a separate package, so `@orillusion/core` does not need to be modified.

## Features

- Explicit, reversible renderer injection with no import-time side effects.
- Isolated, pooled query contexts support independent and same-instance nested queries.
- Recursive scene or object picking, sorted from nearest to farthest.
- Indexed and non-indexed mesh geometry.
- World transforms, `near` / `far`, material culling, UVs, normals, face indices and barycentric coordinates.
- Built-in support for `MeshRenderer` and `SpriteRenderer`.
- Standard Orillusion `PICK_*` pointer events through `SceneRayPick`.
- Optional Graphic3D GPU-instance integration without a hard dependency on `@orillusion/graphic`.

## Installation

Install the package together with a compatible Orillusion core version:

```bash
pnpm add @orillusion/core @orillusion/ray-pick
```

When working in this repository, Vite resolves `@orillusion/ray-pick` directly from `packages/ray-pick`.

## Basic usage

Call `installRayPick()` once before casting rays. Importing the package alone does not change renderer prototypes.

```ts
import {
    CameraUtil,
    Engine3D,
    Object3DUtil,
    Scene3D,
    Vector3,
    View3D,
} from '@orillusion/core';
import { installRayPick, Raycaster } from '@orillusion/ray-pick';

installRayPick();

const engine = await Engine3D.init();
const scene = new Scene3D();
const camera = CameraUtil.createCamera3DObject(scene, 'camera');
camera.perspective(60, engine.aspect, 0.1, 1000);
camera.lookAt(new Vector3(0, 5, 10), Vector3.ZERO, Vector3.Y_AXIS);

const cube = Object3DUtil.GetSingleCube(2, 2, 2, 0.3, 0.6, 1);
scene.addChild(cube);

const view = new View3D();
view.scene = scene;
view.camera = camera;
engine.startRenderView(view);

const raycaster = new Raycaster();
raycaster.setFromCamera(
    engine.inputSystem.mouseX,
    engine.inputSystem.mouseY,
    camera,
);

const hits = raycaster.intersectScene(scene);
const nearest = hits[0];
if (nearest) {
    console.log(nearest.object.name, nearest.point, nearest.distance);
}
```

Screen coordinates passed to `setFromCamera()` are canvas pixel coordinates, matching `Camera3D.screenPointToRay()`.

## Object and scene queries

```ts
const raycaster = new Raycaster(ray, 0.1, 1000);

// One object, including descendants by default.
const objectHits = raycaster.intersectObject(object);

// Disable descendant traversal.
const directHits = raycaster.intersectObject(object, false);

// Multiple roots.
const groupHits = raycaster.intersectObjects([rootA, rootB]);

// Entire scene.
const sceneHits = raycaster.intersectScene(scene);
```

All returned arrays are sorted by ascending world-space distance. A ray may return multiple hits for one mesh because every intersected triangle is reported.

## Pointer picking events

`SceneRayPick` connects the package raycaster to Orillusion's input system. It dispatches `PICK_OVER`, `PICK_OUT`, `PICK_MOVE`, `PICK_DOWN`, `PICK_UP` and `PICK_CLICK` both from the controller and the hit `Object3D`.

The `View3D` must have been started before calling `SceneRayPick.start()`.

```ts
import { PointerEvent3D } from '@orillusion/core';
import { installRayPick, SceneRayPick } from '@orillusion/ray-pick';

installRayPick();

// engine.startRenderView(view) must already have been called.
const scenePicker = new SceneRayPick(view).start();

scenePicker.addEventListener(
    PointerEvent3D.PICK_CLICK,
    (event: PointerEvent3D) => {
        const data = event.data as any;
        console.log('object:', event.target);
        console.log('position:', data.worldPos);
        console.log('face:', data.faceIndex);
        console.log('uv:', data.uv);
    },
    null,
);

// Object-level events use the same event data.
cube.addEventListener(
    PointerEvent3D.PICK_OVER,
    () => console.log('pointer entered cube'),
    null,
);

// Temporarily stop listening while retaining PICK_* listeners.
scenePicker.stop();

// Permanently release input and PICK_* listeners.
scenePicker.destroy();
```

`SceneRayPick` processes input while `engine.setting.pick.mode` is `ray`. Because `ray` is supplied by this external package and older core versions only declare `pixel | bound`, configure it with a narrow cast:

```ts
const engine = await Engine3D.init({
    setting: {
        pick: {
            enable: true,
            mode: 'ray' as any,
        },
    },
});
```

If the application only calls `Raycaster` manually, the core pick setting is not required.

## Graphic3D instances

Graphic3D is optional. Pass its renderer constructor explicitly so this package remains independent of `@orillusion/graphic`:

```ts
import { Graphic3DMeshRenderer } from '@orillusion/graphic';
import {
    installGraphicRayPick,
    installRayPick,
} from '@orillusion/ray-pick';

installRayPick();
installGraphicRayPick(Graphic3DMeshRenderer);
```

Each result identifies the individual instance `Object3D`, not the shared renderer owner.

## Hit result

`RaycastHit` contains:

| Field | Description |
| --- | --- |
| `distance` | World-space distance from the ray origin. |
| `point` | World-space intersection point. |
| `object` | Intersected `Object3D`. |
| `faceIndex` | Intersected triangle index; sprites use `-1`. |
| `face` | Triangle vertex indices and geometric normal. |
| `uv`, `uv1` | Barycentrically interpolated texture coordinates when available. |
| `normal` | Interpolated normal in object space when available. |
| `worldNormal` | Interpolated normal transformed by the inverse-transpose world matrix. |
| `barycoord` | Barycentric weights corresponding to face vertices `(a, b, c)`. |

`RaycastHit.worldNormal` and the `worldNormal` emitted by `SceneRayPick` are in world space. The raw `normal` field remains in object space.

## Material culling

Ray picking follows the first material's `cullMode`:

- `back`: test front-facing triangles.
- `front`: reverse the tested winding.
- `none`: test both sides.

For multi-material meshes, each sub-geometry uses its corresponding material
slot and `face.materialIndex` identifies that slot. As in `RenderNode`, a
missing material or sub-geometry falls back to slot `0`.

Disabled renderers, disabled materials and sky renderers are ignored.

## Removing the injection

`uninstallRayPick()` restores every prototype changed by `installRayPick()` and `installGraphicRayPick()`:

```ts
import { uninstallRayPick } from '@orillusion/ray-pick';

scenePicker.stop();
uninstallRayPick();
```

Do not uninstall while another view still relies on injected ray picking.

## Complete sample and tests

- `samples/pick/Sample_RayPickPackage.ts` demonstrates the complete scene, pointer events, Graphic3D instances and debug hit visualization.
- `test/io/RayPickPackage.test.ts` covers injection, scene traversal, sorting, external instances and camera-based scene picking.
