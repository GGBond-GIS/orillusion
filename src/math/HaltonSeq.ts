/**
 * https://en.wikipedia.org/wiki/Halton_sequence
 * https://baike.baidu.com/item/Halton%20sequence/16697800
 * Class for generating the Halton low-discrepancy series for Quasi Monte Carlo integration.
 * @group Math
 */
export class HaltonSeq {
    private value = 0;
    private inv_base = 0;

    /** Computes the Halton sequence value at the given index for the given radix (base). */
    public static get(index: number, radix: number): number {
        let result = 0;
        let fraction = 1 / radix;

        while (index > 0) {
            result += (index % radix) * fraction;

            index /= radix;
            fraction /= radix;
        }

        return result;
    }

    /** Computes the Halton value at the given index for the given base and stores it as the current value. */
    public getBase(index: number, base: number) {
        let f = (this.inv_base = 1.0 / base);

        while (index > 0) {
            this.value += f * (index % base);
            index /= base;
            f *= this.inv_base;
        }
    }

    /** Advances the sequence to the next value incrementally. */
    public next() {
        let r = 1.0 - this.value - 0.0000001;
        if (this.inv_base < r) this.value += this.inv_base;
        else {
            let h = this.inv_base,
                hh;
            do {
                hh = h;
                h *= this.inv_base;
            } while (h >= r);
            this.value += hh + h - 1.0;
        }
    }

    /** Returns the current value of the sequence. */
    public get() {
        return this.value;
    }
}
