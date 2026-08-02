import { LitMaterial, KeyCode, KeyEvent, MeshRenderer, Object3D, PlaneGeometry, Time, Vector3, VertexAttributeName, View3D, GeometryVertexType } from '@orillusion/core';
import { ClothSimulatorConfig } from "./ClothSimulatorConfig";
import { ClothSimulatorPipeline } from "./ClothSimulatorPipeline";

export class ClothSimulator extends MeshRenderer {
    protected mConfig: ClothSimulatorConfig;
    protected mClothGeometry: PlaneGeometry;
    protected mInteractionSphere: Object3D;
    protected mClothComputePipeline: ClothSimulatorPipeline;
    protected mKeyState: boolean[] = [false, false, false, false];

    constructor() {
        super();
        this.mConfig = {
            NUMPARTICLES: 0,
            NUMTSURFACES: 0,
            NUMTEDGES: 0,
            NUMTBENDS: 0,
            GRAVITY: -10,
            DELTATIME: 1 / 60,
            NUMSUBSTEPS: 15,
            STRETCHCOMPLIANCE: 0.0,
            BENDCOMPLIANCE: 0.0,
            SPHERERADIUS: 0.2,
            SPHERECENTREX: 0.0,
            SPHERECENTREY: 0.5,
            SPHERECENTREZ: 0.25,
            clothVertex: null,
            clothFaceTriIds: null,
            clothVertexBuffer: null,
        };
        this.mClothGeometry = new PlaneGeometry(1, 1, 20, 20, Vector3.Z_AXIS);
        this.mClothGeometry.geometryType = GeometryVertexType.compose;
        this.mConfig.clothVertex = this.mClothGeometry.getAttribute(VertexAttributeName.position).data as Float32Array;
        this.mConfig.clothFaceTriIds = this.mClothGeometry.getAttribute(VertexAttributeName.indices).data as Uint16Array;
        this.mConfig.NUMPARTICLES = this.mConfig.clothVertex.length / 3;
        this.mConfig.NUMTSURFACES = this.mConfig.clothFaceTriIds.length / 3;
    }

    protected updateKeyState(keyCode: number, state: boolean) {
        switch (keyCode) {
            case KeyCode.Key_W:
                this.mKeyState[0] = state;
                break;
            case KeyCode.Key_S:
                this.mKeyState[1] = state;
                break;
            case KeyCode.Key_A:
                this.mKeyState[2] = state;
                break;
            case KeyCode.Key_D:
                this.mKeyState[3] = state;
                break;
        }
    }

    public init(){
        super.init();
        this.alwaysRender = true;
        this.geometry = this.mClothGeometry;
        var mat = new LitMaterial();
        mat.roughness = 0.8;
        mat.doubleSide = true;
        this.material = mat;
    }

    public start() {
        const engine = (this.transform as any)?.view3D?.engine3D;
        (this.material as LitMaterial).baseMap = engine.res.redTexture;
        const input = engine?.inputSystem;
        input.addEventListener(KeyEvent.KEY_DOWN, (e: KeyEvent) => this.updateKeyState(e.keyCode, true), this);
        input.addEventListener(KeyEvent.KEY_UP, (e: KeyEvent) => this.updateKeyState(e.keyCode, false), this);
    }

    public SetInteractionSphere(sphere: Object3D) {
        this.mInteractionSphere = sphere;
    }

    private _tickTime = 0;

    public onCompute(view: View3D, command?: GPUCommandEncoder) {
        // The renderer (GeometryBase.generate) allocates/replaces the geometry's
        // GPU vertex buffer lazily at draw time, so the instance captured when the
        // pipeline was built can become stale — the compute would then keep writing
        // into an orphaned buffer while the renderer draws an untouched one. Re-read
        // the live buffer every frame and re-bind the final stage whenever it changes.
        const vertexBuffer = this.mClothGeometry.vertexBuffer.vertexGPUBuffer;
        if (!vertexBuffer)
            return; // geometry GPU buffer not built yet

        if (!this.mClothComputePipeline) {
            this.mConfig.clothVertexBuffer = vertexBuffer;
            this.mClothComputePipeline = new ClothSimulatorPipeline(this.mConfig);
        } else if (this.mConfig.clothVertexBuffer !== vertexBuffer) {
            this.mConfig.clothVertexBuffer = vertexBuffer;
            this.mClothComputePipeline.rebindVertexBuffer(vertexBuffer);
        }

        this._tickTime += Time.delta / 1000.0;
        if (this._tickTime >= this.mConfig.DELTATIME) {
            this._tickTime -= this.mConfig.DELTATIME;
            var pos = new Vector3();
            if (this.mInteractionSphere) {
                var transform = this.mInteractionSphere.transform;
                let dt = Time.delta / 1000.0;
                let speed = 0.5 * dt;
                // W S
                if (this.mKeyState[0]) {
                    transform.z -= speed
                } else if (this.mKeyState[1]) {
                    transform.z += speed
                }
                // A D
                if (this.mKeyState[2]) {
                    transform.x -= speed
                } else if (this.mKeyState[3]) {
                    transform.x += speed
                }
                pos.copy(this.mInteractionSphere.transform.worldPosition);
            }

            this.mClothComputePipeline.compute(command, pos);
        }
    }
}
