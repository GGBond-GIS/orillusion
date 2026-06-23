import { Color } from "./Color";

/**
 * A color gradient that interpolates between an ordered array of colors.
 * @group Math
 */
export class ColorGradient {
    private colorArray: Color[];

    /** Creates a gradient from an ordered array of colors. */
    public constructor(array: Color[]) {
        this.colorArray = array;
    }

    /** Returns the interpolated color at the normalized position `p` (0 to 1). */
    public getColor(p: number) {
        let s = p * this.colorArray.length;
        let i = Math.floor(s);
        let k = Math.min(i + 1, this.colorArray.length - 1);

        let c1 = this.colorArray[i];
        let c2 = this.colorArray[k];

        return Color.lerp(s - i, c1, c2);
    }

}