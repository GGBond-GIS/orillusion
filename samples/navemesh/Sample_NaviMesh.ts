import {
	View3D, Engine3D, Scene3D, AtmosphericComponent, CameraUtil, webGPUContext, HoverCameraController,
	Vector3, Object3D, Navi3DPoint, Navi3DEdge, Navi3DMesh, DirectLight, KelvinUtil, Color, GeometryBase, Navi3DMergeVertex, LitMaterial, MeshRenderer, VertexAttributeName, Time, Object3DUtil, Transform,
	PlaneGeometry
} from "@orillusion/core";
import { GUIHelp } from "@orillusion/debug/GUIHelp";
import { Graphic3D } from "@orillusion/graphic";

export class Sample_NaviMesh {
	_naviMesh: Navi3DMesh;
	lightObj: Object3D;
	scene: Scene3D;

	from: MeshRenderer;
	to: MeshRenderer;

	AgentRadius: number = 0.1;
	dstMesh: GeometryBase;
	g: Graphic3D;

	async run() {
		await Engine3D.init({ renderLoop: () => { this.loop() } });

		this.scene = new Scene3D();
		this.scene.addChild(this.g = new Graphic3D());
		let sky = this.scene.addComponent(AtmosphericComponent);
		{
			this.lightObj = new Object3D();
			this.lightObj.rotationX = 15;
			this.lightObj.rotationY = 110;
			this.lightObj.rotationZ = 0;
			sky.relativeTransform = this.lightObj.transform;
			let lc = this.lightObj.addComponent(DirectLight);
			lc.lightColor = KelvinUtil.color_temperature_to_rgb(5355);
			lc.castShadow = true;
			lc.intensity = 20;
			this.scene.addChild(this.lightObj);
		}

		let mainCamera = CameraUtil.createCamera3DObject(this.scene, 'camera');
		mainCamera.perspective(60, webGPUContext.aspect, 1, 10000.0);
		let ctrl = mainCamera.object3D.addComponent(HoverCameraController);
		ctrl.setCamera(180, -45, 240);

		let view = new View3D();
		view.scene = this.scene;
		view.camera = mainCamera;
		Engine3D.startRenderView(view);

		let model = await Engine3D.res.loadGltf('gltfs/room/NaviMesh.gltf');
		this.scene.addChild(model);

		let renderer = model.getComponentsInChild(MeshRenderer)[0];
		renderer.material = new LitMaterial();

		let material = renderer.material as LitMaterial;
		material.baseColor = new Color(0.1, 0.2, 0.1, 1);
		this.makeAgent();


		this.dstMesh = renderer.geometry;// new PlaneGeometry(100, 100, 1, 1);
		this.createNaviMesh(this.dstMesh);
	}

	public renderTransform(transform: Transform, open: boolean = true, name?: string) {
		name ||= 'Transform';
		GUIHelp.addFolder(name);
		GUIHelp.add(transform, 'x', -100.0, 100.0, 0.01);
		GUIHelp.add(transform, 'z', -100.0, 100.0, 0.01);
		open && GUIHelp.open();
		GUIHelp.endFolder();
	}

	makeAgent() {
		GUIHelp.init();
		{
			let box = Object3DUtil.GetSingleSphere(2, 0, 1, 0);
			this.from = box.getComponent(MeshRenderer);
			this.scene.addChild(box);
			box.localPosition = new Vector3(17, 0, -50);
			this.renderTransform(this.from.transform, true, 'From');
		}

		{
			let box = Object3DUtil.GetSingleSphere(2, 1, 0, 0);
			this.to = box.getComponent(MeshRenderer);
			this.scene.addChild(box);

			box.localPosition = new Vector3(72, 0, -50);
			this.renderTransform(this.to.transform, true, 'To');
		}
		GUIHelp.add(this, 'AgentRadius', 0, 5, 0.01);
	}

	private createNaviMesh(geometry: GeometryBase): void {
		let parseData = new Navi3DMergeVertex().merge(geometry);

		let vertexIndexList = [];
		let indices = parseData.indices;
		for (let i = 0, c = indices.length / 3; i < c; i++) {
			vertexIndexList.push([indices[i * 3], indices[i * 3 + 1], indices[i * 3 + 2]])
		}
		this._naviMesh = new Navi3DMesh(parseData.vertex, vertexIndexList);
		this.g.drawMeshWireframe('mesh', this.dstMesh, this.scene.transform);
	}

	onFindPathClick() {
		this.findPathFromPoint(this.from.transform.worldPosition, this.to.transform.worldPosition);
		this.g.drawMeshWireframe('mesh', this.dstMesh, this.scene.transform);
	}

	private findPathFromPoint(f: Vector3, t: Vector3): void {
		var time: number = new Date().getTime();
		console.log(f.x, f.y, f.z, t.x, t.y, t.z);
		var success: boolean = this._naviMesh.findPath(f, t, this.AgentRadius);
		console.log("寻路耗时：", new Date().getTime() - time);

		let graphic3D = this.g;
		if (success) {
			graphic3D.ClearAll();
			graphic3D.drawLines('path', this._naviMesh.path, new Color(0, 1, 0, 1));
		}
	}

	private time: number = 0;
	public loop() {
		if (this._naviMesh) {
			this.time += Time.delta;
			if (this.time > 100) {
				this.onFindPathClick();
				this.time = 0;
			}
		}
	}
}
