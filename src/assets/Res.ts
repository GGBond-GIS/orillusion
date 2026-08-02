
import { Object3D } from '../core/entities/Object3D';
import { Texture } from '../gfx/graphics/webGpu/core/texture/Texture';
import { FileLoader } from '../loader/FileLoader';
import { LoaderFunctions } from '../loader/LoaderFunctions';
import { GLBParser } from '../loader/parser/gltf/GLBParser';
import { GLTFParser } from '../loader/parser/gltf/GLTFParser';
import { OBJParser } from '../loader/parser/OBJParser';
import { BitmapTexture2D, TextureColorSpace } from '../textures/BitmapTexture2D';
import { BitmapTextureCube } from '../textures/BitmapTextureCube';
import { HDRTextureCube } from '../textures/HDRTextureCube';
import { B3DMParser } from '../loader/parser/B3DMParser';
import { I3DMParser } from "../loader/parser/I3DMParser";
import { GLTF_Info } from '../loader/parser/gltf/GLTFInfo';
import { HDRTexture } from '../textures/HDRTexture';
import { LDRTextureCube } from '../textures/LDRTextureCube';
import { BRDFLUTGenerate } from '../gfx/generate/BrdfLUTGenerate';
import { Uint8ArrayTexture } from '../textures/Uint8ArrayTexture';
import { AtlasParser } from '../loader/parser/AtlasParser';
import { Reference } from '../util/Reference';
import { Material } from '../materials/Material';
import { Parser } from '../util/Global';
import { ParserBase } from '../loader/parser/ParserBase';
import { GeometryBase } from '../core/geometry/GeometryBase';
import { LitMaterial } from '../materials/LitMaterial';
import { Context3D } from '../gfx/graphics/webGpu/Context3D';
import { TextureAtlas } from './TextureAtlas';

/**
 * Resource management classes for textures, materials, models, and preset bodies.
 * @group Assets
 */
export class Res {

    private _texturePool: Map<string, Texture>;
    private _materialPool: Map<string, Material>;
    private _prefabPool: Map<string, Object3D>;
    // private _prefabLoaderPool: Map<string, PrefabLoader>;
    private _gltfPool: Map<string, GLTF_Info>;
    private _geometryPool: Map<string, GeometryBase>;
    private _obj: Map<string, any>;
    /** Context this Res instance is bound to. Parsers launched via this Res
     *  thread this ctx through so their default-texture lookups resolve
     *  against the same device. */
    public readonly _ctx: Context3D | undefined;

    /**
     * @constructor
     */
    constructor(ctx?: Context3D) {
        this._ctx = ctx;
        this._texturePool = new Map<string, Texture>();
        this._materialPool = new Map<string, Material>();
        this._prefabPool = new Map<string, Object3D>();
        this._geometryPool = new Map<string, GeometryBase>();
        // this._prefabLoaderPool = new Map<string, PrefabLoader>;
        this._gltfPool = new Map<string, GLTF_Info>;
        this._obj = new Map<string, any>();
        // this.initDefault();
    }

    /**
     * get a parsed glTF info object by url
     * @param url file path
     * @returns the cached GLTF_Info, or undefined if not loaded
     */
    public getGltf(url: string): GLTF_Info {
        return this._gltfPool.get(url);
    }

    /**
   * add a obj with reference of url
   * @param url file path
   * @param texture source obj
   */
    public addObj(url: string, obj: any) {
        this._obj.set(url, obj);
    }

    /**
     * get obj by url
     * @param url file path
     * @returns
     */
    public getObj(url: string): any {
        return this._obj.get(url);
    }

    /**
     * add a texture with reference of url
     * @param url file path
     * @param texture source texture
     */
    public addTexture(url: string, texture: Texture) {
        this._texturePool.set(url, texture);
    }

    /**
     * get texture by url
     * @param url file path
     * @returns
     */
    public getTexture(url: string): Texture {
        return this._texturePool.get(url);
    }

    public addGeometry(url: string, geo: GeometryBase) {
        this._geometryPool.set(url, geo);
    }

    public getGeometry(url: string): GeometryBase {
        return this._geometryPool.get(url);
    }

    /**
     * add a material with reference of name
     * @param name material name
     * @param mat  target material
     */
    public addMat(name: string, mat: Material) {
        return this._materialPool.set(name, mat);
    }

    /**
     * get material by name
     * @param name material name
     * @returns
     */
    public getMat(name: string) {
        return this._materialPool.get(name);
    }

    /**
     * add prefab with reference name
     * @param name prefab name
     * @param rootScene root object of prefab
     */
    public addPrefab(name: string, rootScene: Object3D) {
        this._prefabPool.set(name, rootScene);
    }

    /**
     * get prefab by name
     * @param name prefab name
     * @returns
     */
    public getPrefab(name: string) {
        return this._prefabPool.get(name).instantiate();
    }


    /**
     * load a file with a custom parser and return its parsed data
     * @param url the url of file
     * @param c the parser class to use
     * @param loaderFunctions optional load callbacks
     * @returns the parser's data
     */
    public async load<T extends ParserBase>(url: string, c: Parser<T>, loaderFunctions?: LoaderFunctions) {
        let loader = new FileLoader(this._ctx);
        let parser = await loader.load(url, c, loaderFunctions);
        let ret = parser.data as T["data"];
        return ret;
    }

    /**
     * load a gltf file
     * @param url the url of file
     * @param loaderFunctions callback
     * @returns
     */
    public async loadGltf(url: string, loaderFunctions?: LoaderFunctions): Promise<Object3D> {
        if (this._prefabPool.has(url)) {
            return this._prefabPool.get(url) as Object3D;
        }

        let parser;
        let ext = url.substring(url.lastIndexOf('.')).toLowerCase();
        let loader = new FileLoader(this._ctx);
        if (ext == '.gltf') {
            parser = await loader.load(url, GLTFParser, loaderFunctions);

        } else {
            parser = await loader.load(url, GLBParser, loaderFunctions);
        }
        let obj = parser.data as Object3D;
        this._prefabPool.set(url, obj);
        this._gltfPool.set(url, parser.gltf);
        return obj;
        // return null;
    }

    /**
     * load obj file
     * @param url obj file path
     * @param loaderFunctions callback
     * @returns
     */
    public async loadObj(url: string, loaderFunctions?: LoaderFunctions): Promise<Object3D> {
        if (this._prefabPool.has(url)) {
            return this._prefabPool.get(url) as Object3D;
        }

        let parser;
        let ext = url.substring(url.lastIndexOf('.')).toLowerCase();
        let loader = new FileLoader(this._ctx);
        if (ext == ".obj") {
            parser = await loader.load(url, OBJParser, loaderFunctions);
        }
        let obj = parser.data as Object3D;
        this._prefabPool.set(url, obj);
        return obj;
        // return null;
    }

    /**
     * load b3dm file by url
     * @param url path of file
     * @param loaderFunctions callback
     * @returns
     */
    public async loadB3DM(url: string, loaderFunctions?: LoaderFunctions, userData?: any): Promise<Object3D> {
        if (this._prefabPool.has(url)) {
            return this._prefabPool.get(url) as Object3D;
        }
        let loader = new FileLoader(this._ctx);
        let parser = await loader.load(url, B3DMParser, loaderFunctions, userData);
        let obj = parser.data;
        this._prefabPool.set(url, obj);
        return obj;
    }

    /**
     * load i3dm file by url
     * @param url path of i3dm file
     * @param loaderFunctions callback
     * @returns
     */
    public async loadI3DM(url: string, loaderFunctions?: LoaderFunctions, userData?: any): Promise<Object3D> {
        if (this._prefabPool.has(url)) {
            return this._prefabPool.get(url) as Object3D;
        }
        let loader = new FileLoader(this._ctx);
        let parser = await loader.load(url, I3DMParser, loaderFunctions, userData);
        let obj = parser.data;
        this._prefabPool.set(url, obj);
        return obj;
    }

    /**
     * load texture by url
     * @param url texture path
     * @param loaderFunctions callback
     * @param flipY use flip y or not
     * @param colorSpace `'srgb'` to load as `rgba8unorm-srgb` (use
     *               for baseColor / emissive / decal maps that store
     *               sRGB-encoded color); `'linear'` (default) keeps
     *               legacy `rgba8unorm` behavior — required for
     *               normal maps, metallic-roughness packs, AO,
     *               masks, height / displacement, and any other
     *               non-color buffer. The default stays `'linear'`
     *               for back-compat until the sRGB pipeline
     *               migration is complete; pass `'srgb'` explicitly
     *               from glTF / sample call sites that load color.
     * @returns
     */
    public async loadTexture(
        url: string,
        loaderFunctions?: LoaderFunctions,
        flipY?: boolean,
        colorSpace: TextureColorSpace = 'linear',
    ) {
        // Pool key embeds the colorSpace so the same URL fetched
        // once as sRGB and once as linear materializes two distinct
        // GPU textures with the right format each time.
        const cacheKey = colorSpace === 'srgb' ? url + '#srgb' : url;
        if (this._texturePool.has(cacheKey)) {
            return this._texturePool.get(cacheKey);
        }
        let texture = new BitmapTexture2D(true, this._ctx, colorSpace);
        texture.flipY = flipY;
        await texture.load(url, loaderFunctions);
        this._texturePool.set(cacheKey, texture);
        return texture;
    }

    private async loadTextureCount(urls: string[], count: number, loaderFunctions?: LoaderFunctions, flipY?: boolean) {
        return new Promise<BitmapTexture2D[]>(
            async (suc, fail) => {
                let total = 0;
                let loadTexture = [];
                if (count == 0) {
                    suc(loadTexture);
                }
                for (let j = 0; j < count; j++) {
                    const url = urls.shift();
                    this.loadTexture(url, loaderFunctions, flipY).then((t) => {
                        loadTexture.push(t);
                        total++;
                        if (total == count) {
                            suc(loadTexture);
                        }
                    });
                }
            }
        );
    }

    public async loadBitmapTextures(urls: string[], count: number = 5, loaderFunctions?: LoaderFunctions, flipY?: boolean) {
        let loadTexture: BitmapTexture2D[] = [];
        let loadCount = Math.floor(urls.length / count) + 1;
        let last = Math.floor(urls.length % count)
        for (let i = 0; i < loadCount; i++) {
            let list = await this.loadTextureCount(urls, i == loadCount - 1 ? last : count, loaderFunctions, flipY);
            loadTexture.push(...list);
        }
        return loadTexture;
    }

    /**
     * load a hdr texture
     * @param url texture url
     * @param loaderFunctions callback
     * @returns
     */
    public async loadHDRTexture(url: string, loaderFunctions?: LoaderFunctions) {
        if (this._texturePool.has(url)) {
            return this._texturePool.get(url);
        }

        let hdrTexture = new HDRTexture();
        hdrTexture = await hdrTexture.load(url, loaderFunctions, this._ctx);
        this._texturePool.set(url, hdrTexture);
        return hdrTexture;
    }


    /**
     * load hdr cube texture
     * @param url file url
     * @param loaderFunctions callback
     * @returns
     */
    public async loadHDRTextureCube(url: string, loaderFunctions?: LoaderFunctions) {
        if (this._texturePool.has(url)) {
            return this._texturePool.get(url);
        }
        let hdrTexture = new HDRTextureCube();
        hdrTexture = await hdrTexture.load(url, loaderFunctions, this._ctx);
        this._texturePool.set(url, hdrTexture);
        return hdrTexture;
    }

    /**
     * load ldr cube texture
     * @param url file path
     * @param loaderFunctions callback
     * @returns
     */
    public async loadLDRTextureCube(url: string, loaderFunctions?: LoaderFunctions) {
        if (this._texturePool.has(url)) {
            return this._texturePool.get(url);
        }
        let ldrTextureCube = new LDRTextureCube();
        ldrTextureCube = await ldrTextureCube.load(url, loaderFunctions, this._ctx);
        this._texturePool.set(url, ldrTextureCube);
        return ldrTextureCube;
    }

    /**
     * load texture data from array of web url.
     * make sure there are six images in a group,
     * and the order is: [+X, -X, +Y, -Y, +Z, -Z]
     * @param urls 
     */
    public async loadTextureCubeMaps(urls: string[]) {
        let url = urls[0];
        if (this._texturePool.has(url)) {
            return this._texturePool.get(url);
        }

        let textureCube = new BitmapTextureCube();
        await textureCube.load(urls, this._ctx);
        this._texturePool.set(urls[0], textureCube);
        return textureCube;
    }

    /**
     * load texture data from url.
     * the image is assembled from six images into cross shaped image.
     * @param url the path of image
     */
    public async loadTextureCubeStd(url: string, loaderFunctions?: LoaderFunctions) {
        if (this._texturePool.has(url)) {
            return this._texturePool.get(url);
        }

        let cubeMap = new BitmapTextureCube();
        await cubeMap.loadStd(url, this._ctx);
        return cubeMap;
    }

    /**
     * load json data from url.
     * @param url the path of image
     */
    public async loadJSON(url: string, loaderFunctions?: LoaderFunctions) {
        return await new FileLoader(this._ctx)
            .loadJson(url, loaderFunctions)
            .then(async (ret) => {
                return ret;
            })
            .catch((e) => {
                console.error(e);
            });
    }


    /**
     * Load a texture atlas (PNG + JSON) by URL. Returns a {@link TextureAtlas}
     * whose `get(id)` yields `TextureAtlasRegion` instances — feed those
     * directly into `Sprite.texture = region` to render a sub-image.
     */
    public async loadAtlas(url: string, loaderFunctions?: LoaderFunctions): Promise<TextureAtlas> {
        let loader = new FileLoader(this._ctx);
        let parser = await loader.load(url, AtlasParser, loaderFunctions, url);
        return parser.data as any as TextureAtlas;
    }

    /** Default flat normal-map texture. */
    public normalTexture: Uint8ArrayTexture;
    /** Default mask texture. */
    public maskTexture: Uint8ArrayTexture;
    /** Default solid white texture. */
    public whiteTexture: Uint8ArrayTexture;
    /** Default solid black texture. */
    public blackTexture: Uint8ArrayTexture;
    /** Default solid red texture. */
    public redTexture: Uint8ArrayTexture;
    /** Default solid blue texture. */
    public blueTexture: Uint8ArrayTexture;
    /** Default solid green texture. */
    public greenTexture: Uint8ArrayTexture;
    /** Default solid yellow texture. */
    public yellowTexture: Uint8ArrayTexture;
    /** Default solid gray texture. */
    public grayTexture: Uint8ArrayTexture;

    /** Default sky cube texture. */
    public defaultSky: HDRTextureCube;

    /** Default lit material. */
    public defaultMaterial: LitMaterial;

    /**
     * create a texture
     * @param width width of texture
     * @param height height of texture
     * @param r component-red
     * @param g component-green
     * @param b component-blue
     * @param a component-alpha（0 for transparent，1 for opaque）
     * @param name name string
     * @returns
     */
    public createTexture(width: number, height: number, r: number, g: number, b: number, a: number, name?: string) {
        let w = 32;
        let h = 32;
        let textureData = new Uint8Array(w * h * 4);
        this.fillColor(textureData, width, height, r, g, b, a);
        let texture = new Uint8ArrayTexture();
        texture.name = name;
        texture.create(16, 16, textureData, true, this._ctx);
        if (name) {
            this.addTexture(name, texture);
        }
        return texture;
    }

    /**
     * fill slod color to this texture
     * @param array data of texture
     * @param w width of texture
     * @param h height of texture
     * @param r component-red
     * @param g component-green
     * @param b component-blue
     * @param a component-alpha（0 for transparent，1 for opaque）
     */
    public fillColor(array: any, w: number, h: number, r: number, g: number, b: number, a: number) {
        Res.fillColor(array, w, h, r, g, b, a);
    }

    /** Pure data fill — no GPU state, safe to call without a Res instance. */
    public static fillColor(array: any, w: number, h: number, r: number, g: number, b: number, a: number) {
        for (let i = 0; i < w; i++) {
            for (let j = 0; j < h; j++) {
                let pixelIndex = j * w + i;
                array[pixelIndex * 4 + 0] = r;
                array[pixelIndex * 4 + 1] = g;
                array[pixelIndex * 4 + 2] = b;
                array[pixelIndex * 4 + 3] = a;
            }
        }
    }

    /**
     * Initialize a common texture object. Provide a universal solid color texture object.
     * @param ctx Optional Context3D — when provided, default materials bind to it
     *            so the caller doesn't need `engine.use()`.
     */
    public initDefault(ctx?: import('../gfx/graphics/webGpu/Context3D').Context3D) {
        this.normalTexture = this.createTexture(32, 32, 255 * 0.5, 255 * 0.5, 255.0, 255.0, 'default-normalTexture');
        this.maskTexture = this.createTexture(32, 32, 255, 255 * 0.5, 255.0, 255.0, 'default-maskTexture');
        this.whiteTexture = this.createTexture(32, 32, 255, 255, 255, 255, 'default-whiteTexture');
        this.blackTexture = this.createTexture(32, 32, 0, 0, 0, 255.0, 'default-blackTexture');
        this.redTexture = this.createTexture(32, 32, 255, 0, 0, 255.0, 'default-redTexture');
        this.blueTexture = this.createTexture(32, 32, 0, 0, 255, 255.0, 'default-blueTexture');
        this.greenTexture = this.createTexture(32, 32, 0, 255, 0, 255, 'default-greenTexture');
        this.yellowTexture = this.createTexture(32, 32, 0, 255, 255, 255.0, 'default-yellowTexture');
        this.grayTexture = this.createTexture(32, 32, 128, 128, 128, 255.0, 'default-grayTexture');

        const boundCtx = ctx ?? this._ctx;
        let brdf = new BRDFLUTGenerate();
        let brdf_texture = brdf.generateBRDFLUTTexture(boundCtx);
        let BRDFLUT = brdf_texture.name = 'BRDFLUT';
        this.addTexture(BRDFLUT, brdf_texture);

        this.defaultSky = new HDRTextureCube();
        this.defaultSky.createFromTexture(128, this.blackTexture, boundCtx);

        Reference.getInstance().attached(this.defaultSky, this);
        Reference.getInstance().attached(brdf_texture, this);

        Reference.getInstance().attached(this.normalTexture, this);
        Reference.getInstance().attached(this.maskTexture, this);
        Reference.getInstance().attached(this.whiteTexture, this);
        Reference.getInstance().attached(this.blackTexture, this);
        Reference.getInstance().attached(this.redTexture, this);
        Reference.getInstance().attached(this.blueTexture, this);
        Reference.getInstance().attached(this.greenTexture, this);
        Reference.getInstance().attached(this.yellowTexture, this);
        Reference.getInstance().attached(this.grayTexture, this);

        this.defaultMaterial = new LitMaterial(ctx);
    }
}
