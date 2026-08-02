import { Context3D } from '../gfx/graphics/webGpu/Context3D';
import { BitmapTexture2D } from '../textures/BitmapTexture2D';

/**
 * Utility helpers for building sprite textures from Canvas2D output —
 * primarily `textToTexture` for rendering labels (name tags, HP text,
 * damage numbers) that live in the 3D world via `SpriteRenderer`.
 *
 * Designed for **static / low-frequency** updates (fewer than ~10 Hz,
 * fewer than ~50 simultaneous text elements). For high-frequency animated
 * text, build a dedicated atlas.
 *
 * @group Util
 */
export class UIUtil {
    /** Text rendering options. Missing fields fall back to sensible defaults. */
    public static readonly DEFAULT_TEXT_OPTS: Required<TextOptions> = {
        font: 'sans-serif',
        fontSize: 24,
        fontWeight: 'normal',
        color: '#ffffff',
        strokeColor: '',
        strokeWidth: 0,
        align: 'left',
        baseline: 'top',
        maxWidth: 0,
        lineHeight: 1.2,
        padding: 4,
        dpr: (typeof window !== 'undefined' && window.devicePixelRatio) || 1,
    };

    /** Measure the CSS-pixel size needed to render `text` with the given options. */
    public static measureText(text: string, opts?: TextOptions): { width: number; height: number } {
        const o = { ...UIUtil.DEFAULT_TEXT_OPTS, ...(opts || {}) };
        const lines = UIUtil._wrap(text, o);
        const ctx = UIUtil._measureCtx();
        UIUtil._applyFont(ctx, o);
        let maxW = 0;
        for (const line of lines) {
            const w = ctx.measureText(line).width;
            if (w > maxW) maxW = w;
        }
        const lineH = o.fontSize * o.lineHeight;
        return {
            width: Math.ceil(maxW) + o.padding * 2,
            height: Math.ceil(lineH * lines.length) + o.padding * 2,
        };
    }

    /**
     * Render `text` to a new GPU texture. Returns a BitmapTexture2D bound to
     * `ctx`. The texture format is `rgba8unorm` with premultiplied alpha —
     * suitable for `SpriteMaterial.baseMap`.
     */
    public static async textToTexture(text: string, ctx: Context3D, opts?: TextOptions): Promise<BitmapTexture2D> {
        const o = { ...UIUtil.DEFAULT_TEXT_OPTS, ...(opts || {}) };
        const { width, height } = UIUtil.measureText(text, o);
        const bitmap = await UIUtil._renderText(text, width, height, o);
        const texture = new BitmapTexture2D(true, ctx);
        (texture as any).source = bitmap;
        return texture;
    }

    /**
     * Re-render `text` into an existing texture's backing store. Requires the
     * texture's `width/height` to match the new size — if they differ, the
     * texture is recreated under the hood via the standard source setter.
     */
    public static async updateTextTexture(texture: BitmapTexture2D, text: string, opts?: TextOptions): Promise<void> {
        const o = { ...UIUtil.DEFAULT_TEXT_OPTS, ...(opts || {}) };
        const { width, height } = UIUtil.measureText(text, o);
        const bitmap = await UIUtil._renderText(text, width, height, o);
        (texture as any).source = bitmap;
    }

    // ---------- private helpers ----------

    private static _measureCanvas: OffscreenCanvas | null = null;
    private static _measureCtx(): OffscreenCanvasRenderingContext2D {
        if (!UIUtil._measureCanvas) UIUtil._measureCanvas = new OffscreenCanvas(4, 4);
        const ctx = UIUtil._measureCanvas.getContext('2d');
        if (!ctx) throw new Error('UIUtil: 2D context not available on OffscreenCanvas');
        return ctx;
    }

    private static _applyFont(ctx: OffscreenCanvasRenderingContext2D, o: Required<TextOptions>) {
        ctx.font = `${o.fontWeight} ${o.fontSize}px ${o.font}`;
        ctx.textAlign = o.align as CanvasTextAlign;
        ctx.textBaseline = o.baseline as CanvasTextBaseline;
    }

    private static _wrap(text: string, o: Required<TextOptions>): string[] {
        if (!o.maxWidth || o.maxWidth <= 0) return text.split('\n');
        const ctx = UIUtil._measureCtx();
        UIUtil._applyFont(ctx, o);
        const out: string[] = [];
        const rawLines = text.split('\n');
        for (const raw of rawLines) {
            const words = raw.split(/\s+/);
            let line = '';
            for (const word of words) {
                const probe = line.length === 0 ? word : line + ' ' + word;
                if (ctx.measureText(probe).width + o.padding * 2 > o.maxWidth) {
                    if (line) {
                        out.push(line);
                        line = word;
                    } else {
                        out.push(probe);
                        line = '';
                    }
                } else {
                    line = probe;
                }
            }
            if (line) out.push(line);
        }
        return out.length === 0 ? [''] : out;
    }

    private static async _renderText(text: string, width: number, height: number, o: Required<TextOptions>): Promise<ImageBitmap> {
        const dpr = Math.max(1, o.dpr);
        const cvs = new OffscreenCanvas(Math.max(32, Math.ceil(width * dpr)), Math.max(32, Math.ceil(height * dpr)));
        const ctx = cvs.getContext('2d');
        if (!ctx) throw new Error('UIUtil: 2D context not available on OffscreenCanvas');
        ctx.scale(dpr, dpr);
        UIUtil._applyFont(ctx, o);
        ctx.clearRect(0, 0, width, height);

        const lines = UIUtil._wrap(text, o);
        const lineH = o.fontSize * o.lineHeight;
        let x = o.padding;
        if (o.align === 'center') x = width / 2;
        else if (o.align === 'right') x = width - o.padding;
        let y = o.padding;
        if (o.baseline === 'middle') y = height / 2 - (lines.length - 1) * lineH / 2;
        else if (o.baseline === 'bottom') y = height - o.padding - (lines.length - 1) * lineH;

        ctx.fillStyle = o.color;
        if (o.strokeColor && o.strokeWidth > 0) {
            ctx.strokeStyle = o.strokeColor;
            ctx.lineWidth = o.strokeWidth;
        }
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const ly = y + i * lineH;
            if (o.strokeColor && o.strokeWidth > 0) ctx.strokeText(line, x, ly);
            ctx.fillText(line, x, ly);
        }

        return await createImageBitmap(cvs);
    }
}

/** Options for `UIUtil.textToTexture` / `measureText` / `updateTextTexture`. */
export type TextOptions = {
    font?: string;
    fontSize?: number;
    fontWeight?: string;
    color?: string;
    strokeColor?: string;
    strokeWidth?: number;
    align?: 'left' | 'center' | 'right';
    baseline?: 'top' | 'middle' | 'bottom';
    /** Wrap width in CSS pixels. 0 = no wrap. */
    maxWidth?: number;
    /** Line-height multiplier (1.2 = standard). */
    lineHeight?: number;
    padding?: number;
    dpr?: number;
};

