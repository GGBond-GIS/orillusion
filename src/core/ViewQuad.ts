import { MeshRenderer } from '../components/renderer/MeshRenderer';
import { Texture } from '../gfx/graphics/webGpu/core/texture/Texture';
import { UniformNode } from '../gfx/graphics/webGpu/core/uniforms/UniformNode';
import { WebGPUDescriptorCreator } from '../gfx/graphics/webGpu/descriptor/WebGPUDescriptorCreator';
import { bindCtx, Context3D } from '../gfx/graphics/webGpu/Context3D';
import { RTFrame } from '../gfx/renderJob/frame/RTFrame';
import { PlaneGeometry } from '../shape/PlaneGeometry';
import { Object3D } from './entities/Object3D';
import { RendererPassState } from '../gfx/renderJob/passRenderer/state/RendererPassState';
import { PassType } from '../gfx/renderJob/passRenderer/state/PassType';
import { View3D } from './View3D';
import { Material } from '../materials/Material';
import { QuadShader } from '../loader/parser/prefab/mats/shader/QuadShader';
import { CResizeEvent } from '../event/CResizeEvent';
/**
 * @internal
 * @group Entity
 */
export class ViewQuad extends Object3D {
    width: number = 128;
    height: number = 128;
    quadRenderer: MeshRenderer;
    material: Material;
    // uniforms: { [key: string]: UniformNode };
    rendererPassState: RendererPassState;
    quadShader: QuadShader;
    public _boundCtx: Context3D | null = null;

    constructor(ctx: Context3D, vs: string = 'QuadGlsl_vs', fs: string = 'QuadGlsl_fs', rtFrame: RTFrame, multisample: number = 0, f: boolean = false) {
        super();

        let renderTexture = rtFrame ? rtFrame.renderTargets : [];

        this.material = new Material();
        this.quadShader = new QuadShader(ctx, vs, fs);
        this.material.shader = this.quadShader;

        this.quadRenderer = this.addComponent(MeshRenderer);
        this.quadRenderer.material = this.material;
        this.quadRenderer.castGI = false;
        this.quadRenderer.castShadow = false;
        this.quadRenderer.drawType = f ? 2 : 0;
        // this.quadRenderer.renderOrder = 99999;
        this.quadRenderer.geometry = new PlaneGeometry(100, 100, 1, 1);

        this.quadRenderer.material = this.material;
        this.quadRenderer[`__start`]();
        this.quadRenderer[`_enable`] = true;
        this.quadRenderer[`onEnable`]();
        bindCtx(this, ctx);
        this.rendererPassState = WebGPUDescriptorCreator.createRendererPassState(ctx, rtFrame, `load`);
        if (multisample > 0) {
            this.rendererPassState.multisample = this.quadShader.getDefaultColorShader().shaderState.multisample;
            this.rendererPassState.multiTexture = ctx.device.createTexture({
                size: {
                    width: ctx.presentationSize[0],
                    height: ctx.presentationSize[1],
                },
                sampleCount: multisample,
                format: renderTexture.length > 0 ? renderTexture[0].format : ctx.presentationFormat,
                usage: GPUTextureUsage.RENDER_ATTACHMENT,
            })
        }

        ctx.addEventListener(CResizeEvent.RESIZE, (e) => {
            this.rendererPassState = WebGPUDescriptorCreator.createRendererPassState(ctx, rtFrame, `load`);
            if (multisample > 0) {
                this.rendererPassState.multisample = this.quadShader.getDefaultColorShader().shaderState.multisample;
                this.rendererPassState.multiTexture = ctx.device.createTexture({
                    size: {
                        width: ctx.presentationSize[0],
                        height: ctx.presentationSize[1],
                    },
                    sampleCount: multisample,
                    format: renderTexture.length > 0 ? renderTexture[0].format : ctx.presentationFormat,
                    usage: GPUTextureUsage.RENDER_ATTACHMENT,
                })
            }
        }, this);
    }

    /**
     * By inputting a map to viewQuad and setting corresponding 
     * processing shaders, the corresponding results are output for off-screen rendering
     * Can also be directly used as the final display rendering result rendering canvas
     * @param viewQuad 
     * @see ViewQuad
     * @param scene3D 
     * @see Scene3D
     * @param command 
     */
    public renderTarget(view: View3D, viewQuad: ViewQuad, command: GPUCommandEncoder) {
        const gpu = view.engine3D.context3D.gpuContext;
        let camera = view.camera;
        let encoder = gpu.beginRenderPass(command, viewQuad.rendererPassState);
        gpu.bindCamera(encoder, camera);
        viewQuad.quadRenderer.nodeUpdate(view, PassType.COLOR, viewQuad.rendererPassState, null);
        viewQuad.quadRenderer.renderPass2(view, PassType.COLOR, viewQuad.rendererPassState, null, encoder);
        gpu.endPass(encoder);
    }

    /**
     * Output to screen through screen based shading
     * @param viewQuad 
     * @see ViewQuad
     * @param scene3D 
     * @see Scene3D
     * @param command 
     * @param colorTexture 
     */
    public renderToViewQuad(view: View3D, viewQuad: ViewQuad, command: GPUCommandEncoder, colorTexture: Texture) {
        const gpu = view.engine3D.context3D.gpuContext;
        let camera = view.camera;

        viewQuad.quadShader.setTexture('baseMap', colorTexture);
        let encoder = gpu.beginRenderPass(command, viewQuad.rendererPassState);
        gpu.bindCamera(encoder, camera);

        viewQuad.quadRenderer.nodeUpdate(view, PassType.COLOR, viewQuad.rendererPassState, null);
        viewQuad.quadRenderer.renderPass2(view, PassType.COLOR, viewQuad.rendererPassState, null, encoder);
        gpu.endPass(encoder);
    }
}
