import { AtmosphericScatteringSky_shader } from '../assets/shader/sky/AtmosphericScatteringSky_shader';
import { Context3D } from '../gfx/graphics/webGpu/Context3D';
import { UniformGPUBuffer } from '../gfx/graphics/webGpu/core/buffer/UniformGPUBuffer';
import { Texture } from '../gfx/graphics/webGpu/core/texture/Texture';
import { ComputeShader } from '../gfx/graphics/webGpu/shader/ComputeShader';
import { GPUTextureFormat } from '../gfx/graphics/webGpu/WebGPUConst';
import { Color } from '../math/Color';
import { LDRTextureCube } from './LDRTextureCube';
import { VirtualTexture } from './VirtualTexture';
/**
 * AtmosphericScattering Sky Setting
 * @group Texture
 */
export class AtmosphericScatteringSkySetting {
    /** Angular size of the sun disc. */
    public sunRadius: number = 500.0;
    /** Radiance (brightness) of the sun. */
    public sunRadiance: number = 11.0;
    /** Mie scattering anisotropy factor (forward-scattering bias). */
    public mieG: number = 0.76;
    /** Scale height of the Mie (aerosol) layer. */
    public mieHeight: number = 1200;
    /** Height of the viewer's eye above the planet surface. */
    public eyePos: number = 1500;
    /** Sun direction's horizontal (azimuth) parameter, in [0, 1]. */
    public sunX: number = 0.71;
    /** Sun direction's vertical (elevation) parameter, in [0, 1]. */
    public sunY: number = 0.56;
    /** Overall brightness multiplier applied to the sun. */
    public sunBrightness: number = 1.0;
    /** Whether the sun disc is drawn in the sky. */
    public displaySun: boolean = true;
    /** Default edge size of the generated sky cube texture. */
    public defaultTextureCubeSize: number = 512;
    /** Default width of the generated panorama 2D texture. */
    public defaultTexture2DSize: number = 1024;
    /** Tint color applied to the sky. */
    public skyColor: Color = new Color(1, 1, 1, 1);
}

/**
 * Atmospheric Scattering Sky Texture
 * @group Texture
 */
export class AtmosphericScatteringSky extends LDRTextureCube {
    private _internalTexture: AtmosphericTexture2D;
    private _cubeSize: number;
    /** The scattering parameters driving this sky's appearance. */
    public readonly setting: AtmosphericScatteringSkySetting;

    /**
     * @constructor
     * @param setting AtmosphericScatteringSkySetting
     * @returns
     */
    constructor(setting: AtmosphericScatteringSkySetting, ctx?: Context3D) {
        super();
        this.setting = setting;
        this._cubeSize = setting.defaultTextureCubeSize;
        this._internalTexture = new AtmosphericTexture2D(setting.defaultTexture2DSize, setting.defaultTexture2DSize * 0.5, ctx);
        this._internalTexture.update(this.setting);
        this.createFromTexture(this._cubeSize, this._internalTexture, ctx);

        return this;
    }

    /** Get the underlying panorama 2D texture used to build the sky cube. */
    public get texture2D(): Texture {
        return this._internalTexture;
    }

    /**
     * @internal
     * @returns
     */
    public apply(): this {
        this._internalTexture.update(this.setting);
        this._faceData.uploadErpTexture(this._internalTexture);
        return this;
    }
}

/**
 * @internal
 */
class AtmosphericTexture2D extends VirtualTexture {
    private _computeShader: ComputeShader;
    private _uniformBuffer: UniformGPUBuffer;

    constructor(width: number, height: number, ctx?: Context3D) {
        super(width, height, GPUTextureFormat.rgba16float, false, GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING, 1, 0, 1, ctx);
        this.initCompute(width, height);
    }

    private initCompute(w: number, h: number): void {
        this._uniformBuffer = new UniformGPUBuffer(16 * 4);
        this._uniformBuffer.apply();

        this._computeShader = new ComputeShader(AtmosphericScatteringSky_shader.cs);
        this._computeShader.setUniformBuffer('uniformBuffer', this._uniformBuffer);
        this._computeShader.setStorageTexture(`outTexture`, this);
        this._computeShader.workerSizeX = w / 8;
        this._computeShader.workerSizeY = h / 8;
    }

    public update(setting: AtmosphericScatteringSkySetting): this {
        this._uniformBuffer.setFloat('width', this.width);
        this._uniformBuffer.setFloat('height', this.height);
        this._uniformBuffer.setFloat('sunU', setting.sunX);
        this._uniformBuffer.setFloat('sunV', setting.sunY);
        this._uniformBuffer.setFloat('eyePos', setting.eyePos);
        this._uniformBuffer.setFloat('sunRadius', setting.sunRadius);
        this._uniformBuffer.setFloat('sunRadiance', setting.sunRadiance);
        this._uniformBuffer.setFloat('mieG', setting.mieG);
        this._uniformBuffer.setFloat('mieHeight', setting.mieHeight);
        this._uniformBuffer.setFloat('sunBrightness', setting.sunBrightness);
        this._uniformBuffer.setFloat('displaySun', setting.displaySun ? 1 : 0);
        this._uniformBuffer.setColor('skyColor', setting.skyColor);
        this._uniformBuffer.apply();

        let command = this._boundCtx!.gpuContext.beginCommandEncoder();
        this._boundCtx!.gpuContext.computeCommand(command, [this._computeShader]);
        this._boundCtx!.gpuContext.endCommandEncoder(command);
        return this;
    }
}
