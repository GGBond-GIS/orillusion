import { ComponentBase, Material, MeshRenderer, LitMaterial, Color, Interpolator } from "@orillusion/core";

export class MaterialStateComponent extends ComponentBase {
    private _materials: Material[];

    start() {
        let renderer = this.object3D.getComponent(MeshRenderer);
        if (renderer) {
            const engine = (this.transform as any)?.view3D?.engine3D;
            this._materials = renderer.materials;
            for (let i = 0; i < this._materials.length; i++) {
                if (this._materials[i] instanceof LitMaterial) {
                    const element = this._materials[i] as LitMaterial;
                    element.emissiveMap = engine.res.whiteTexture;
                    element.emissiveColor = new Color(0, 0, 0, 0);
                }
            }
        }
    }

    public changeColor(tartColor: Color, time: number) {
        for (let i = 0; i < this._materials.length; i++) {
            let material = this._materials[i] as LitMaterial;
            material.emissiveColor = tartColor;
            Interpolator.to(material, { emissiveIntensity: tartColor.a }, time);
        }
    }

}