/**
 * RGBA Color Object
 * @group Math
 */
export class Color {

    /**
     * red color
     */
    public static COLOR_RED: Color = new Color(1, 0, 0, 1);

    /**
     * green color
     */
    public static COLOR_GREEN: Color = new Color(0, 1, 0, 1);

    /**
     * blue color
     */
    public static COLOR_BLUE: Color = new Color(0, 0, 1, 1);

    /**
     * white color
     */
    public static COLOR_WHITE: Color = new Color(1, 1, 1, 1);

    /**
     * cache 
     * @internal
     */
    public static COLOR_0: Color = new Color();
    /**
     * cache 
     * @internal
     */
    public static COLOR_1: Color = new Color();
    /**
     * cache 
     * @internal
     */
    public static COLOR_2: Color = new Color();

    /**
     * @internal
     */
    private static HEX_CHARACTERS = 'a-f\\d';

    /**
     * @internal
     */
    private static MATCH_3OR4_HEX = `#?[${Color.HEX_CHARACTERS}]{3}[${Color.HEX_CHARACTERS}]?`;
    /**
     * @internal
     */
    private static MATCH_6OR8_HEX = `#?[${Color.HEX_CHARACTERS}]{6}([${Color.HEX_CHARACTERS}]{2})?`;
    /**
     * @internal
     */
    private static NON_HEX_CHARS = new RegExp(`[^#${Color.HEX_CHARACTERS}]`, 'gi');
    /**
     * @internal
     */
    private static VALID_HEX_SIZE = new RegExp(`^${Color.MATCH_3OR4_HEX}$|^${Color.MATCH_6OR8_HEX}$`, 'i');

    /**
     * red channel
     */
    public r: number = 0;

    /**
     * green channel
     */
    public g: number = 0;

    /**
     * blue channel
     */
    public b: number = 0;

    /**
     * alpha channel
     */
    public a: number = 0;

    /**
     * create new color instance
     * @param r red channel
     * @param g green channel
     * @param b blue channel
     * @param a alpha channel
     */
    constructor(r: number = 1.0, g: number = 1.0, b: number = 1.0, a: number = 1.0) {
        this.setTo(r, g, b, a);
    }

    /***
     * convert to hdr color , channel a is intensity 
     */
    convertToHDRRGB(): Color {
        this.r = this.r * Math.pow(2.4, this.a);
        this.g = this.g * Math.pow(2.4, this.a);
        this.b = this.b * Math.pow(2.4, this.a);
        return this;
    }

    /**
     * unSerialized color by data
     * @param data 
     * @returns 
     */
    public unSerialized(data: any): this {
        this.r = data['r'];
        this.g = data['g'];
        this.b = data['b'];
        this.a = data['a'];
        return this;
    }

    /**
     * update this color rgb from hexadecimal no alpha
     * @param value 
     */
    public hexToRGB(value: number): Color {
        //this.a = ((value >> 24) & 0xff ) / 255;
        this.r = ((value >> 16) & 0xff) / 255;
        this.g = ((value >> 8) & 0xff) / 255;
        this.b = (value & 0xff) / 255;
        return this;
    }

    /**
     * update this color rgb from hexadecimal has alpha
     * @param value 
     */
    public hexToRGBA(value: number): Color {
        this.a = ((value >> 24) & 0xff) / 255;
        this.r = ((value >> 16) & 0xff) / 255;
        this.g = ((value >> 8) & 0xff) / 255;
        this.b = (value & 0xff) / 255;
        return this;
    }

    /**
     * random on color 
     * @returns 
     */
    public static random(base: number = 1.0): Color {
        let color = new Color();
        color.a = base;
        color.r = base * Math.random();
        color.g = base * Math.random();
        color.b = base * Math.random();
        return color;
    }

    /**
     * generate a random color from per-channel seeds and base values
     * @returns
     */
    public static randomRGB(seedR: number = 0.5, seedG: number = 0.5, seedB: number = 0.5, baseR: number = 0.5, baseG: number = 0.5, baseB: number = 0.5): Color {
        let color = new Color();
        color.a = 1.0;
        color.r = baseR + seedR * Math.random();
        color.g = baseG + seedG * Math.random();
        color.b = baseB + seedB * Math.random();
        return color;
    }


    /**
     * random on color 
     * @returns 
     */
    public static randomGray(base: number = 0.5, random: number = 0.5): Color {
        let seed = Math.random() * random + base;
        let color = new Color();
        color.a = 1.0;
        color.r = seed;
        color.g = seed;
        color.b = seed;
        return color;
    }

    /**
     * set rgba to this color
     * @param r red channel
     * @param g green channel
     * @param b blue channel
     * @param a alpha channel
     */
    public setTo(r: number, g: number, b: number, a: number): this {
        this.r = Math.max(r, 0.0);
        this.g = Math.max(g, 0.0);
        this.b = Math.max(b, 0.0);
        this.a = Math.max(a, 0.0);
        return this;
    }

    /**
     * update this color rgba from hexadecimal 
     * @param hex hex string.
     */
    public setHex(hex: string): this {
        if (typeof hex !== 'string' || Color.NON_HEX_CHARS.test(hex) || !Color.VALID_HEX_SIZE.test(hex)) {
            throw new TypeError('Expected a valid hex string');
        }
        hex = hex.replace(/^#/, '');
        let alphaFromHex = 1;

        if (hex.length === 8) {
            alphaFromHex = Number.parseInt(hex.slice(6, 8), 16) / 255;
            hex = hex.slice(0, 6);
        }

        if (hex.length === 4) {
            alphaFromHex = Number.parseInt(hex.slice(3, 4).repeat(2), 16) / 255;
            hex = hex.slice(0, 3);
        }

        if (hex.length === 3) {
            hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        }

        const number = Number.parseInt(hex, 16);
        const red = number >> 16;
        const green = (number >> 8) & 255;
        const blue = number & 255;
        const alpha = alphaFromHex;
        this.a = alpha;
        this.r = red / 255;
        this.g = green / 255;
        this.b = blue / 255;
        return this;
    }

    /**
     * convert this color to hex string code 
     * @returns 
     */
    public getHex(): string {
        let getHexStr = (n: number) => {
            n *= 255.0;
            let str = n.toString(16);
            if (str.length === 1) {
                str = '0' + str;
            }
            return str;
        };
        let hex = getHexStr(this.r) + getHexStr(this.g) + getHexStr(this.b) + getHexStr(this.a);
        return hex;
    }

    /**
     * get rgb to array
     */
    public get rgb(): number[] {
        return [(this.r * 255) >>> 0, (this.g * 255) >>> 0, (this.b * 255) >>> 0];
    }

    /**
     * set rgb by array
     */
    public set rgb(c: number[]) {
        this.setTo(c[0] / 255, c[1] / 255, c[2] / 255, this.a);
    }

    /**
     * get rgba to array
     */
    public get rgba(): number[] {
        return [(this.r * 255) >>> 0, (this.g * 255) >>> 0, (this.b * 255) >>> 0, (this.a * 255) >>> 0];
    }

    /**
     * set rgb by array
     */
    public set rgba(c: number[]) {
        this.setTo(c[0] / 255, c[1] / 255, c[2] / 255, c[3] / 255);
    }

    /**
     * clone this color
     * @returns 
     */
    public clone(): Color {
        return new Color().copy(this);
    }

    /**
     * copy color from source color
     * @returns
     */
    public copy(src: Color): this {
        this.r = src.r;
        this.g = src.g;
        this.b = src.b;
        this.a = src.a;
        return this;
    }

    /**
     * copy color from array
     * @param arr [ 255 , 255 , 255 , 255 ]
     * @param scalar 
     * @returns 
     */
    public copyFromArray(arr: number[], scalar: number = 255): this {
        this.r = arr[0] / scalar;
        this.g = arr[1] / scalar;
        this.b = arr[2] / scalar;
        this.a = arr[3] / scalar;
        return this;
    }


    /**
     * copy color from vector3 or vector4
     * @param value { x: number, y: number, z: number, w?: number }
     * @returns 
     */
    public copyFromVector(value: { x: number, y: number, z: number, w?: number }): this {
        this.r = value.x;
        this.g = value.y;
        this.b = value.z;
        this.a = value.w;
        return this;
    }

    /**
     * update this color rgb from hexadecimal no alpha
     * @param hexColor rgb color
     * @param dst ref out color
     */
    public static hexRGBColor(hexColor: number, dst: Color = null): Color {
        dst = dst || new Color();
        dst.hexToRGB(hexColor);
        return dst;
    }

    /**
     * lerp two color 
     * @param v 
     * @param c1 
     * @param c2 
     * @param target 
     * @returns 
     */
    public static lerp(v: number, c1: Color, c2: Color, target?: Color) {
        let ret = target ? target : new Color();
        ret.r = (c2.r - c1.r) * v + c1.r;
        ret.g = (c2.g - c1.g) * v + c1.g;
        ret.b = (c2.b - c1.b) * v + c1.b;
        ret.a = (c2.a - c1.a) * v + c1.a;
        return ret;
    }


    /** Preset color: primary. */
    public static PRIMARY = 0x3f51b5; //
    /** Preset color: primary dark. */
    public static PRIMARYDARK = 0x303f9f; //
    /** Preset color: accent. */
    public static ACCENT = 0xff4081; //

    /** Preset color: white. */
    public static WHITE = 0xffffff;
    /** Preset color: ivory. */
    public static IVORY = 0xfffff0;
    /** Preset color: light yellow. */
    public static LIGHTYELLOW = 0xffffe0;
    /** Preset color: yellow. */
    public static YELLOW = 0xffff00;
    /** Preset color: snow. */
    public static SNOW = 0xfffafa;
    /** Preset color: floral white. */
    public static FLORALWHITE = 0xfffaf0;
    /** Preset color: lemon chiffon. */
    public static LEMONCHIFFON = 0xfffacd;
    /** Preset color: cornsilk. */
    public static CORNSILK = 0xfff8dc;
    /** Preset color: seashell. */
    public static SEASHELL = 0xfff5ee;
    /** Preset color: lavender blush. */
    public static LAVENDERBLUSH = 0xfff0f5;
    /** Preset color: papaya whip. */
    public static PAPAYAWHIP = 0xffefd5;
    /** Preset color: blanched almond. */
    public static BLANCHEDALMOND = 0xffebcd;
    /** Preset color: misty rose. */
    public static MISTYROSE = 0xffe4e1;
    /** Preset color: bisque. */
    public static BISQUE = 0xffe4c4;
    /** Preset color: moccasin. */
    public static MOCCASIN = 0xffe4b5;
    /** Preset color: navajo white. */
    public static NAVAJOWHITE = 0xffdead;
    /** Preset color: peach puff. */
    public static PEACHPUFF = 0xffdab9;
    /** Preset color: gold. */
    public static GOLD = 0xffd700;
    /** Preset color: pink. */
    public static PINK = 0xffc0cb;
    /** Preset color: light pink. */
    public static LIGHTPINK = 0xffb6c1;
    /** Preset color: orange. */
    public static ORANGE = 0xffa500;
    /** Preset color: light salmon. */
    public static LIGHTSALMON = 0xffa07a;
    /** Preset color: dark orange. */
    public static DARKORANGE = 0xff8c00;
    /** Preset color: coral. */
    public static CORAL = 0xff7f50;
    /** Preset color: hot pink. */
    public static HOTPINK = 0xff69b4;
    /** Preset color: tomato. */
    public static TOMATO = 0xff6347;
    /** Preset color: orange red. */
    public static ORANGERED = 0xff4500;
    /** Preset color: deep pink. */
    public static DEEPPINK = 0xff1493;
    /** Preset color: fuchsia. */
    public static FUCHSIA = 0xff00ff;
    /** Preset color: magenta. */
    public static MAGENTA = 0xff00ff;
    /** Preset color: red. */
    public static RED = 0xff0000;
    /** Preset color: old lace. */
    public static OLDLACE = 0xfdf5e6;
    /** Preset color: light goldenrod yellow. */
    public static LIGHTGOLDENRODYELLOW = 0xfafad2;
    /** Preset color: linen. */
    public static LINEN = 0xfaf0e6;
    /** Preset color: antique white. */
    public static ANTIQUEWHITE = 0xfaebd7;
    /** Preset color: salmon. */
    public static SALMON = 0xfa8072;
    /** Preset color: ghost white. */
    public static GHOSTWHITE = 0xf8f8ff;
    /** Preset color: mint cream. */
    public static MINTCREAM = 0xf5fffa;
    /** Preset color: white smoke. */
    public static WHITESMOKE = 0xf5f5f5;
    /** Preset color: beige. */
    public static BEIGE = 0xf5f5dc;
    /** Preset color: wheat. */
    public static WHEAT = 0xf5deb3;
    /** Preset color: sandy brown. */
    public static SANDYBROWN = 0xf4a460;
    /** Preset color: azure. */
    public static AZURE = 0xf0ffff;
    /** Preset color: honeydew. */
    public static HONEYDEW = 0xf0fff0;
    /** Preset color: alice blue. */
    public static ALICEBLUE = 0xf0f8ff;
    /** Preset color: khaki. */
    public static KHAKI = 0xf0e68c;
    /** Preset color: light coral. */
    public static LIGHTCORAL = 0xf08080;
    /** Preset color: pale goldenrod. */
    public static PALEGOLDENROD = 0xeee8aa;
    /** Preset color: violet. */
    public static VIOLET = 0xee82ee;
    /** Preset color: dark salmon. */
    public static DARKSALMON = 0xe9967a;
    /** Preset color: lavender. */
    public static LAVENDER = 0xe6e6fa;
    /** Preset color: light cyan. */
    public static LIGHTCYAN = 0xe0ffff;
    /** Preset color: burlywood. */
    public static BURLYWOOD = 0xdeb887;
    /** Preset color: plum. */
    public static PLUM = 0xdda0dd;
    /** Preset color: gainsboro. */
    public static GAINSBORO = 0xdcdcdc;
    /** Preset color: crimson. */
    public static CRIMSON = 0xdc143c;
    /** Preset color: pale violet red. */
    public static PALEVIOLETRED = 0xdb7093;

    /** Preset color: goldenrod. */
    public static GOLDENROD = 0xdaa520;
    /** Preset color: orchid. */
    public static ORCHID = 0xda70d6;
    /** Preset color: thistle. */
    public static THISTLE = 0xd8bfd8;
    /** Preset color: light grey. */
    public static LIGHTGREY = 0xd3d3d3;
    /** Preset color: tan. */
    public static TAN = 0xd2b48c;
    /** Preset color: chocolate. */
    public static CHOCOLATE = 0xd2691e;
    /** Preset color: peru. */
    public static PERU = 0xcd853f;
    /** Preset color: indian red. */
    public static INDIANRED = 0xcd5c5c;
    /** Preset color: medium violet red. */
    public static MEDIUMVIOLETRED = 0xc71585;
    /** Preset color: silver. */
    public static SILVER = 0xc0c0c0;
    /** Preset color: dark khaki. */
    public static DARKKHAKI = 0xbdb76b;
    /** Preset color: rosy brown. */
    public static ROSYBROWN = 0xbc8f8f;
    /** Preset color: medium orchid. */
    public static MEDIUMORCHID = 0xba55d3;
    /** Preset color: dark goldenrod. */
    public static DARKGOLDENROD = 0xb8860b;
    /** Preset color: firebrick. */
    public static FIREBRICK = 0xb22222;
    /** Preset color: powder blue. */
    public static POWDERBLUE = 0xb0e0e6;
    /** Preset color: light steel blue. */
    public static LIGHTSTEELBLUE = 0xb0c4de;
    /** Preset color: pale turquoise. */
    public static PALETURQUOISE = 0xafeeee;
    /** Preset color: green yellow. */
    public static GREENYELLOW = 0xadff2f;
    /** Preset color: light blue. */
    public static LIGHTBLUE = 0xadd8e6;
    /** Preset color: dark gray. */
    public static DARKGRAY = 0xa9a9a9;
    /** Preset color: brown. */
    public static BROWN = 0xa52a2a;
    /** Preset color: sienna. */
    public static SIENNA = 0xa0522d;
    /** Preset color: dark orchid. */
    public static DARKORCHID = 0x9932cc;
    /** Preset color: pale green. */
    public static PALEGREEN = 0x98fb98;
    /** Preset color: dark violet. */
    public static DARKVIOLET = 0x9400d3;
    /** Preset color: medium purple. */
    public static MEDIUMPURPLE = 0x9370db;
    /** Preset color: light green. */
    public static LIGHTGREEN = 0x90ee90;
    /** Preset color: dark sea green. */
    public static DARKSEAGREEN = 0x8fbc8f;
    /** Preset color: saddle brown. */
    public static SADDLEBROWN = 0x8b4513;
    /** Preset color: dark magenta. */
    public static DARKMAGENTA = 0x8b008b;
    /** Preset color: dark red. */
    public static DARKRED = 0x8b0000;
    /** Preset color: blue violet. */
    public static BLUEVIOLET = 0x8a2be2;
    /** Preset color: light sky blue. */
    public static LIGHTSKYBLUE = 0x87cefa;
    /** Preset color: sky blue. */
    public static SKYBLUE = 0x87ceeb;
    /** Preset color: gray. */
    public static GRAY = 0x808080;
    /** Preset color: olive. */
    public static OLIVE = 0x808000;
    /** Preset color: purple. */
    public static PURPLE = 0x800080;
    /** Preset color: maroon. */
    public static MAROON = 0x800000;
    /** Preset color: aquamarine. */
    public static AQUAMARINE = 0x7fffd4;
    /** Preset color: chartreuse. */
    public static CHARTREUSE = 0x7fff00;
    /** Preset color: lawn green. */
    public static LAWNGREEN = 0x7cfc00;
    /** Preset color: medium slate blue. */
    public static MEDIUMSLATEBLUE = 0x7b68ee;
    /** Preset color: light slate gray. */
    public static LIGHTSLATEGRAY = 0x778899;
    /** Preset color: slate gray. */
    public static SLATEGRAY = 0x708090;
    /** Preset color: olive drab. */
    public static OLIVEDRAB = 0x6b8e23;
    /** Preset color: slate blue. */
    public static SLATEBLUE = 0x6a5acd;
    /** Preset color: dim gray. */
    public static DIMGRAY = 0x696969;
    /** Preset color: medium aquamarine. */
    public static MEDIUMAQUAMARINE = 0x66cdaa;
    /** Preset color: cornflower blue. */
    public static CORNFLOWERBLUE = 0x6495ed;
    /** Preset color: cadet blue. */
    public static CADETBLUE = 0x5f9ea0;
    /** Preset color: dark olive green. */
    public static DARKOLIVEGREEN = 0x556b2f;
    /** Preset color: indigo. */
    public static INDIGO = 0x4b0082;
    /** Preset color: medium turquoise. */
    public static MEDIUMTURQUOISE = 0x48d1cc;
    /** Preset color: dark slate blue. */
    public static DARKSLATEBLUE = 0x483d8b;
    /** Preset color: steel blue. */
    public static STEELBLUE = 0x4682b4;
    /** Preset color: royal blue. */
    public static ROYALBLUE = 0x4169e1;
    /** Preset color: turquoise. */
    public static TURQUOISE = 0x40e0d0;
    /** Preset color: medium sea green. */
    public static MEDIUMSEAGREEN = 0x3cb371;
    /** Preset color: lime green. */
    public static LIMEGREEN = 0x32cd32;
    /** Preset color: dark slate gray. */
    public static DARKSLATEGRAY = 0x2f4f4f;
    /** Preset color: sea green. */
    public static SEAGREEN = 0x2e8b57;
    /** Preset color: forest green. */
    public static FORESTGREEN = 0x228b22;
    /** Preset color: light sea green. */
    public static LIGHTSEAGREEN = 0x20b2aa;
    /** Preset color: dodger blue. */
    public static DODGERBLUE = 0x1e90ff;
    /** Preset color: midnight blue. */
    public static MIDNIGHTBLUE = 0x191970;
    /** Preset color: aqua. */
    public static AQUA = 0x00ffff;
    /** Preset color: cyan. */
    public static CYAN = 0x00ffff;
    /** Preset color: spring green. */
    public static SPRINGGREEN = 0x00ff7f;
    /** Preset color: lime. */
    public static LIME = 0x00ff00;
    /** Preset color: medium spring green. */
    public static MEDIUMSPRINGGREEN = 0x00fa9a;
    /** Preset color: dark turquoise. */
    public static DARKTURQUOISE = 0x00ced1;
    /** Preset color: deep sky blue. */
    public static DEEPSKYBLUE = 0x00bfff;
    /** Preset color: dark cyan. */
    public static DARKCYAN = 0x008b8b;
    /** Preset color: teal. */
    public static TEAL = 0x008080;
    /** Preset color: green. */
    public static GREEN = 0x008000;
    /** Preset color: dark green. */
    public static DARKGREEN = 0x006400;
    /** Preset color: blue. */
    public static BLUE = 0x0000ff;
    /** Preset color: medium blue. */
    public static MEDIUMBLUE = 0x0000cd;
    /** Preset color: dark blue. */
    public static DARKBLUE = 0x00008b;
    /** Preset color: navy. */
    public static NAVY = 0x000080;
    /** Preset color: black. */
    public static BLACK = 0x000000;
}