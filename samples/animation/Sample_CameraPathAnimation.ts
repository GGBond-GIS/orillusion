import { Engine3D, Scene3D, View3D, Object3D, Color, Vector3, AtmosphericComponent, CameraUtil, HoverCameraController, DirectLight, KelvinUtil, Time, Object3DUtil, lerpVector3, Camera3D, AxisObject, ColliderComponent, PointerEvent3D, ComponentBase, Plane } from '@orillusion/core';
import { Stats } from '@orillusion/stats';
import { Graphic3D } from '@orillusion/graphic';
import * as dat from 'dat.gui';

interface PathInfo {
    name: string, // curve name
    color: Color | Color[], // line segment color
    basePoints: Vector3[]; // curve base points
    curvePoints: Vector3[]; // all points contained in the curve
}

enum CameraModes {
    DualOrbit = 'DualOrbit', // camera and target each move along their own path
    FixedCamera = 'FixedCamera', // camera position is fixed, target moves along its path
    FixedTarget = 'FixedTarget', // target position is fixed, camera moves along its path
    FreeCamera = 'FreeCamera'// free camera: a proxy object moves along the path while facing the target
}

class Sample_CameraPathAnimation {
    engine: Engine3D;
    view: View3D;
    camera: Camera3D;
    graphic3D: Graphic3D;

    cameraMode = CameraModes.DualOrbit;
    guiControl: dat.GUIController<object>;

    // path info for the camera and the target
    cameraPathInfo: PathInfo = {
        name: 'cameraCurve',
        color: Color.hexRGBColor(Color.YELLOW),
        basePoints: [],
        curvePoints: [],
    };
    targetPathInfo: PathInfo = {
        name: 'targetCurve',
        color: Color.hexRGBColor(Color.DEEPPINK),
        basePoints: [],
        curvePoints: []
    };

    // moving objects
    targetSphere: Object3D; // sphere that follows the target path
    cameraBox: Object3D; // box that follows the camera path

    // transition start time and duration
    startTime: number = 0;
    duration: number = 60; // SECS

    isMove: boolean = false;
    _tmpVecA = new Vector3();
    lookAtUp = new Vector3(0.03, 1, 0.03);

    async run() {
        const engine = this.engine = await Engine3D.init({
            renderLoop: () => this.loop(),
            setting: {
                pick: {
                    enable: true,
                    mode: `pixel`,
                },
            },
        });

        let scene = new Scene3D();
        scene.addComponent(Stats);

        let camera = CameraUtil.createCamera3DObject(scene);
        camera.perspective(60, engine.aspect, 1, 1000.0);
        camera.transform.rotationX = 90;

        let hoverCtrl = camera.object3D.addComponent(HoverCameraController);
        hoverCtrl.setCamera(-40, -25, 250);
        hoverCtrl.dragSmooth = 4;
        hoverCtrl.enable = false

        // create direction light
        let lightObj3D = new Object3D()
        lightObj3D.localPosition = new Vector3(0, 30, -40)
        lightObj3D.localRotation = new Vector3(20, 160, 0)

        let light = lightObj3D.addComponent(DirectLight)
        light.lightColor = KelvinUtil.color_temperature_to_rgb(5355)
        light.castShadow = true
        light.intensity = 10;
        scene.addChild(light.object3D)

        // init sky 
        let atmosphericSky = scene.addComponent(AtmosphericComponent);
        atmosphericSky.relativeTransform = light.transform;
        atmosphericSky.displaySun = false;
        atmosphericSky.sunRadiance = 1;

        let view = this.view = new View3D();
        view.camera = this.camera = camera;
        view.scene = scene;

        // init Graphic3D to draw lines
        this.graphic3D = new Graphic3D()
        scene.addChild(this.graphic3D)

        engine.startRenderView(view);

        await this.initScene(scene, hoverCtrl);
        hoverCtrl.enable = true;
    }

    private async initScene(scene: Scene3D, hoverCtrl: HoverCameraController) {
        // add target objects
        this.targetSphere = Object3DUtil.GetSingleSphere(4.5, 1, 1, 1);
        this.cameraBox = Object3DUtil.GetSingleCube(2, 2, 8, 0.5, 0.5, 0.5);
        scene.addChild(this.targetSphere);
        scene.addChild(this.cameraBox);

        // base (control) points for both curves, used to build the splines
        const { cameraBasePoints, targetBasePoints } = this.getBasePoints()
        this.cameraPathInfo.basePoints = cameraBasePoints;
        this.targetPathInfo.basePoints = targetBasePoints;

        // create a 3D object for each base point and add it to the control group
        let controlPointsGroup = new Object3D();
        this.createAndAddControlBoxes(this.cameraPathInfo, controlPointsGroup);
        this.createAndAddControlBoxes(this.targetPathInfo, controlPointsGroup);
        scene.addChild(controlPointsGroup);

        // build the lines
        this.refreshLine(this.cameraPathInfo);
        this.refreshLine(this.targetPathInfo);

        // add the axis-gizmo component
        let axisControl = scene.addComponent(AxisController);
        axisControl.view = this.view;
        axisControl.cameraCtrl = hoverCtrl;
        axisControl.setControlGroup(controlPointsGroup);
        axisControl.onMoveEvent((target) => this.modifyBasePoints(target));

        // load the scene model (loading it before starting the render view degrades axis-gizmo pick accuracy)
        // https://cdn.orillusion.com/gltfs/glb/BuildingWithCharacters/scene.glb
        let model = await this.engine.res.loadGltf('gltfs/glb/BuildingWithCharacters.glb');
        model.scaleX = model.scaleY = model.scaleZ = 0.3;
        scene.addChild(model);

        this.initGui(controlPointsGroup, axisControl, hoverCtrl, model);
    }

    private getBasePoints() {
        let cameraBasePoints = [
            new Vector3(-100.1243, 13.8724, 116.2651),
            new Vector3(-22.9729, 13.8724, 135.2939),
            new Vector3(-21.9837, 104.3755, 117.4502),
            new Vector3(-17.1684, 77.5601, 46.0082),
            new Vector3(-28.4011, 83.2710, -97.7831),
            new Vector3(-122.0379, 142.4560, -89.7829),
            new Vector3(0.9048, 183.4332, 1.6006),
            new Vector3(122.3487, 36.6475, 23.2021),
            new Vector3(18.2206, 6.7467, 105.1357),
            new Vector3(-28.6247, 15.8723, 39.2853),
            new Vector3(-77.3121, 9.8309, 33.5839),
            new Vector3(-115.7828, 78.2913, 19.2395),
            new Vector3(-48.5328, 79.0903, -62.0619),
            new Vector3(-14.7059, 79.4859, -18.5764),
            new Vector3(-12.2206, 86.5313, 63.0162),
            new Vector3(-39.3602, 50.7533, 38.1593),
            new Vector3(-183.4780, 137.8206, -99.2229)
        ];

        let targetBasePoints = [
            new Vector3(100.2351, 50.2681, -131.0346),
            new Vector3(-24.4349, 93.0914, -131.0346),
            new Vector3(-21.1782, 20.2790, -131.0346),
            new Vector3(-21.9568, 60.1899, -72.9576),
            new Vector3(-51.7717, 63.6999, 33.4793),
            new Vector3(13.0265, 109.2561, 10.8372),
            new Vector3(-35.5919, 3.8006, 52.0907),
            new Vector3(-80.0583, 16.5457, 1.3015),
            new Vector3(-70.4104, -23.8815, -28.1115),
            new Vector3(-24.7756, 5.9985, -64.5841),
            new Vector3(-63.4902, 41.5661, -44.0699),
            new Vector3(-42.4930, 81.2731, -31.3227),
            new Vector3(-2.1510, 72.4425, 4.9373),
            new Vector3(-29.0113, 36.8627, 134.4743),
            new Vector3(-71.4757, 22.3481, 21.2798),
            new Vector3(-14.7888, 41.8757, 23.3403),
            new Vector3(-54.8118, 51.4163, -20.6089)
        ];

        return { cameraBasePoints, targetBasePoints };
    }

    private createAndAddControlBoxes(pathInfo: PathInfo, controlPointsGroup: Object3D) {
        pathInfo.basePoints.forEach((position, index) => {
            let box = Object3DUtil.GetSingleCube(2, 2, 2, Math.random(), Math.random(), Math.random());

            // associate each control box with its curve's path info and its index, so the curve can be updated when its position changes
            box.data = { pathInfo, index };
            box.localPosition = position;
            controlPointsGroup.addChild(box);
        })
    }

    private refreshLine(pathInfo: PathInfo, index?: number) {
        const basePoints = pathInfo.basePoints;
        const samples = 20; // sample count per base point

        if (index === undefined) {
            pathInfo.curvePoints = this.generateOrUpdateCurve(basePoints, samples, 0.5);
        } else {

            // recompute curve segments around the selected base point and its neighbors, defining the index range of points to recompute
            const start = Math.max(0, index - 2);
            const end = Math.min(basePoints.length - 1, index + 1);
            const indicesToCalculate = Array.from({ length: end - start + 1 }, (_, i) => start + i);

            // compute the affected curve segments
            const curveSegmentPoints = this.generateOrUpdateCurve(basePoints, samples, 0.5, indicesToCalculate);

            // derive the replacement start index from the updated range
            const dataStartIndex = (start * (samples + 1)); // includes the sample points plus their start point

            // splice the new segment into the existing curve points
            pathInfo.curvePoints.splice(dataStartIndex, curveSegmentPoints.length, ...curveSegmentPoints);
        }

        this.graphic3D.Clear(pathInfo.name);
        this.graphic3D.drawLines(pathInfo.name, pathInfo.curvePoints, pathInfo.color);
    }

    public generateOrUpdateCurve(points: Vector3[], samples: number = 20, tension: number = 0.5, indicesToUpdate?: number[]): Vector3[] {
        let curveData: Vector3[] = [];
        let u = new Vector3(), v = new Vector3();
        for (let i = 0; i < points.length - 1; ++i) {
            if (!indicesToUpdate || indicesToUpdate.includes(i)) {
                const p0 = points[Math.max(i - 1, 0)];
                const p1 = points[i];
                const p2 = points[i + 1];
                const p3 = points[Math.min(i + 2, points.length - 1)];

                Vector3.sub(p2, p0, u);
                u.multiplyScalar(tension / 3.0);
                Vector3.add(u, p1, u);
                Vector3.sub(p1, p3, v);
                v.multiplyScalar(tension / 3.0);
                Vector3.add(v, p2, v);

                curveData.push(p1);
                curveData.push(...this.calculateBezierCurve(p1, u, v, p2, samples));
            }
        }

        if (!indicesToUpdate || indicesToUpdate.includes(points.length - 1)) {
            curveData.push(points[points.length - 1]);
        }

        return curveData;
    }

    protected calculateBezierCurve(p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3, samples: number): Vector3[] {
        var result = new Array<Vector3>(samples);
        for (let i = 0; i < samples; ++i) {
            let t = (i + 1) / (samples + 1.0);
            let _1t = 1 - t;
            let v0 = p0.clone().multiplyScalar(_1t * _1t * _1t);
            let v1 = p1.clone().multiplyScalar(3 * t * _1t * _1t);
            let v2 = p2.clone().multiplyScalar(3 * t * t * _1t);
            let v3 = p3.clone().multiplyScalar(t * t * t);
            result[i] = v0.add(v1).add(v2).add(v3);
        }
        return result;
    }

    private modifyBasePoints(target: Object3D) {
        let { pathInfo, index }: { pathInfo: PathInfo, index: number } = target.data;
        if (!pathInfo.basePoints[index].equals(target.localPosition)) {
            pathInfo.basePoints[index].copy(target.localPosition);
            this.refreshLine(pathInfo, index);
        }
    }

    private initGui(controlPointsGroup: Object3D, axisControl: AxisController, hoverCtrl: HoverCameraController, model: Object3D) {
        let data = { duration: this.duration, changeLine: true };
        let gui = new dat.GUI();
        let f = gui.addFolder('CameraPathAnimation');

        f.add({ CameraModes: this.cameraMode }, 'CameraModes', CameraModes).onChange((value) => changeCameraMode(value));
        this.guiControl = f.add(this, 'isMove').name('Run').onChange((value) => run(value));
        f.add(data, 'changeLine').name('Show Lines').onChange((value) => changeLine(value));
        f.add(controlPointsGroup.transform, 'enable').name('Show Boxs');
        f.add(this.targetSphere.transform, 'enable').name('Show Target').onChange((value) => this.cameraBox.transform.enable = value);
        f.add(model.transform, 'enable').name('Show Model');
        f.add(data, 'duration', 10, 120, 1).name('Duration (SECS)').onFinishChange((value) => {
            this.duration = value;
            this.startTime = Time.time;
        });
        f.add({ Reset: () => { location.reload(); } }, 'Reset');
        f.add({ 'Click Box': 'Click box to show axis' }, 'Click Box');
        f.add({ 'Drag Axis': 'Drag the axis for move' }, 'Drag Axis');
        f.open();

        const changeCameraMode = (value: CameraModes) => {
            this.cameraMode = value;
            if (this.isMove) hoverCtrl.enable = axisControl.enable = value === CameraModes.FreeCamera;

            switch (this.cameraMode) {
                case CameraModes.FixedCamera:
                    this.cameraBox.localPosition = new Vector3(-130, 110, 100)
                    break;
                case CameraModes.FixedTarget:
                    this.targetSphere.localPosition = new Vector3(-75, 36, 50)
                    break;
                case CameraModes.FreeCamera:
                    hoverCtrl.setCamera(-40, -25, 250, Vector3.ZERO);
                    break;
            }
        }

        const run = (status: boolean) => {
            hoverCtrl.enable = axisControl.enable = this.cameraMode === CameraModes.FreeCamera || !status;

            if (status) this.startTime = Time.time;
            else if (this.cameraMode !== CameraModes.FreeCamera) {
                hoverCtrl.setCamera(-40, -25, 250, Vector3.ZERO);
            }
        }

        const changeLine = (show: boolean) => {
            if (show) {
                this.graphic3D.drawLines(this.cameraPathInfo.name, this.cameraPathInfo.curvePoints, this.cameraPathInfo.color);
                this.graphic3D.drawLines(this.targetPathInfo.name, this.targetPathInfo.curvePoints, this.targetPathInfo.color);
                console.log('camerabasePoints', this.cameraPathInfo.basePoints);
                console.log('targetbasePoints', this.targetPathInfo.basePoints);
            } else {
                this.graphic3D.Clear(this.cameraPathInfo.name);
                this.graphic3D.Clear(this.targetPathInfo.name);
            }
        }
    }

    protected easeInOutCubic(t: number): number {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    loop() {
        if (!this.isMove) return;

        let timeElapsed = Time.time - this.startTime;
        let progress = this.easeInOutCubic(timeElapsed / (this.duration * 1000));

        if (progress >= 1) return this.guiControl.setValue(!this.isMove);

        const cameraCurvePoints = this.cameraPathInfo.curvePoints;
        const targetCurvePoints = this.targetPathInfo.curvePoints;

        // compute progress within the curve segments
        let lastIndex = cameraCurvePoints.length - 1;
        let currentIndex = Math.floor(progress * lastIndex);
        let nextIndex = Math.min(currentIndex + 1, lastIndex);
        let segmentProgress = (progress * lastIndex) - currentIndex;

        // compute the position between the two curve points at the current progress; using lerp instead of lerpVector3 avoids allocating a Vector3
        let cameraNextPos = lerpVector3(cameraCurvePoints[currentIndex], cameraCurvePoints[nextIndex], segmentProgress);
        let targetNextPos = lerpVector3(targetCurvePoints[currentIndex], targetCurvePoints[nextIndex], segmentProgress);

        switch (this.cameraMode) {
            case CameraModes.DualOrbit: // camera and target each move along their own path
                this.targetSphere.localPosition = targetNextPos;
                this._tmpVecA = lerpVector3(this._tmpVecA, this.targetSphere.localPosition, 0.008);
                // this.camera.transform.lookAt(cameraNextPos, this._tmpVecA, this.lookAtUp);
                let cameraPos = lerpVector3(this.camera.transform.localPosition, cameraNextPos, 0.08)
                this.camera.transform.lookAt(cameraPos, this._tmpVecA, this.lookAtUp)
                break;
            case CameraModes.FixedCamera: // camera position is fixed, target moves along its path
                this.targetSphere.localPosition = targetNextPos;
                this.camera.transform.lookAt(this.cameraBox.localPosition, targetNextPos);
                break;
            case CameraModes.FixedTarget: // target position is fixed, camera moves along its path
                this.camera.transform.lookAt(cameraNextPos, this.targetSphere.localPosition, this.lookAtUp);
                break;
            case CameraModes.FreeCamera: // free camera: a proxy object moves along the path while facing the target
                this.targetSphere.localPosition = targetNextPos;
                // this.cameraBox.transform.lookAt(cameraNextPos, this.targetSphere.localPosition);
                let cameraBoxNextPos = lerpVector3(this.cameraBox.localPosition, cameraNextPos, 0.08)
                this.cameraBox.transform.lookAt(cameraBoxNextPos, this.targetSphere.localPosition);
                break;
        }
    }

}

/* Axis gizmo controller */
class AxisController extends ComponentBase {
    public view: View3D;
    public cameraCtrl: { enable: boolean } | undefined;

    // axis gizmo object
    private axisObject: Object3D;

    // currently selected target object and axis
    private selectedTarget: Object3D;
    private selectedAxis: 'x' | 'y' | 'z';

    // offset between the ray-plane intersection and the axis object's position
    private offsetDistance: number = 0;

    private _tmpVecA: Vector3 = new Vector3()
    private _tmpVecB: Vector3 = new Vector3()

    // register the event handler
    private moveEvent?: ((target: Object3D) => void) | undefined;
    public onMoveEvent(callback: (target: Object3D) => void): void {
        this.moveEvent = callback;
    }

    // controllable object group; for convenience all controllable objects are contained within a single 3D object
    public setControlGroup(target: Object3D) {
        target.forChild((node: Object3D) => {
            node.addComponent(ColliderComponent);
            node.addEventListener(PointerEvent3D.PICK_CLICK, this.onPickClick, this);
        })
    }

    public start() {
        // register click events on the X/Y/Z axis objects
        this.axisObject = new AxisObject(10, 0.5)
        this.axisObject.forChild((node: Object3D) => {
            node.data = { axis: node.x !== 0 ? 'x' : node.y !== 0 ? 'y' : 'z' }; // tag each axis with its identifier
            node.addComponent(ColliderComponent);
            node.addEventListener(PointerEvent3D.PICK_DOWN, this.onPickDown, this);
        })
        this.axisObject.transform.enable = false;
        this.view.scene.addChild(this.axisObject);

        this.view.engine3D.inputSystem.addEventListener(PointerEvent3D.POINTER_MOVE, this.onPointerMove, this);
        this.view.engine3D.inputSystem.addEventListener(PointerEvent3D.POINTER_UP, this.onPointerUp, this);
    }

    private onPickClick(e: PointerEvent3D) {
        if (!this.enable) return;

        let target = e.currentTarget.current as Object3D;
        if (this.selectedTarget !== target) {
            this.selectedTarget = target;
            this.axisObject.localPosition = target.localPosition;
        } else {
            this.selectedTarget = null;
        }
        this.axisObject.transform.enable = !!this.selectedTarget;
    }

    private onPickDown(e: PointerEvent3D) {
        if (!this.enable) return;
        const axis = e.currentTarget.current.data?.axis as 'x' | 'y' | 'z';
        if (axis !== 'x' && axis !== 'y' && axis !== 'z') return console.error('Invalid axis value');

        this.selectedAxis = axis;
        this.cameraCtrl.enable = false;

        let targetPos = this.selectedTarget.localPosition;

        // use two helper vectors to define the reference line's start and end points
        Vector3.HELP_0.copy(targetPos)[axis] -= 10000;
        Vector3.HELP_1.copy(targetPos)[axis] += 10000;

        // const color = { 'x': Color.COLOR_RED, 'y': Color.COLOR_GREEN, 'z': Color.COLOR_BLUE }[axis]
        (this.view as any).graphic3D?.drawLines('referenceLine', [Vector3.HELP_0, Vector3.HELP_1]); //  draw a reference line

        // compute the offset between the axis object's current position and the intersection, so the position can be corrected during subsequent dragging
        let intersection = this.calculateIntersectionPoint(this.view.camera, targetPos);
        if (intersection) {
            this.offsetDistance = targetPos[axis] - intersection[axis];
        }
    }

    private onPointerUp(e: PointerEvent3D) {
        if (!this.selectedAxis || !this.selectedTarget || !this.enable) return;
        this.selectedAxis = null;
        this.cameraCtrl.enable = true;
        (this.view as any).graphic3D?.Clear('referenceLine');
    }

    private onPointerMove(e: PointerEvent3D) {
        if (!this.selectedAxis || !this.selectedTarget || !this.enable) return;

        const axis = this.selectedAxis;
        let targetTransform = this.selectedTarget.transform;
        let intersection = this.calculateIntersectionPoint(this.view.camera, targetTransform.localPosition);

        if (intersection) {
            // update the position
            targetTransform[axis] = intersection[axis] + this.offsetDistance;
            this.axisObject.transform[axis] = targetTransform[axis];
        }

        this.moveEvent(this.selectedTarget); // fire the registered event
    }

    private calculateIntersectionPoint(camera: Camera3D, targetPos: Vector3): Vector3 | null {
        // view direction vector
        let cameraDirection = camera.getWorldDirection(this._tmpVecA);

        // construct a plane perpendicular to the camera's view direction
        let p1 = new Plane(targetPos, cameraDirection);

        // test whether the plane intersects the ray and compute the intersection point
        let ray = camera.screenPointToRay(this.view.engine3D.inputSystem.mouseX, this.view.engine3D.inputSystem.mouseY);
        let intersection = this._tmpVecB;
        let hasIntersection = p1.intersectsRay(ray, intersection);

        return hasIntersection ? intersection : null;
    }

}

new Sample_CameraPathAnimation().run();