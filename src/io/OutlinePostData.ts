import { Color } from "../math/Color";

/**
 * One outline color slot: the list of entity indices it applies to and the
 * outline color shared by them.
 * @group IO
 */
export class OutlinePostSlot {
    /** Entity indices included in this slot, padded with -1. */
    public indexList: Float32Array;
    /** Outline color applied to every entity in this slot. */
    public color: Color;
    /** Number of valid entries in indexList. */
    public count: number;
}

/**
 * Holds the per-slot outline data consumed by the outline post-process,
 * grouping highlighted entities into a fixed set of colored slots.
 * @group IO
 */
export class OutlinePostData {
    //Supports up to 8 sets of colors
    /** Number of color slots (capped at 8). */
    public readonly SlotCount: number = 8;
    /** Maximum entities per slot. */
    public readonly MaxEntities: number = 16;
    /** Default outline color used when a slot is cleared. */
    public readonly defaultColor: Color = new Color(0.2, 1, 1, 1);
    private readonly slots: OutlinePostSlot[] = [];

    private dataDirty: boolean = true;

    constructor(groupCount: number = 8) {
        this.SlotCount = Math.max(1, Math.min(groupCount, this.SlotCount));
        for (let i = 0; i < this.SlotCount; i++) {
            let slot: OutlinePostSlot = (this.slots[i] = new OutlinePostSlot());
            slot.indexList = new Float32Array(this.MaxEntities);
            slot.color = this.defaultColor.clone();
            slot.count = 0;
        }
    }

    /** Reset every slot to the default color and empty its entity list. */
    public clear(): void {
        for (let i = 0; i < this.SlotCount; i++) {
            this.clearAt(i);
        }
    }

    /** Reset a single slot to the default color and empty its entity list. */
    public clearAt(slotIndex: number): this {
        this.dataDirty = true;
        let slot: OutlinePostSlot = this.slots[slotIndex];
        slot.color.copy(this.defaultColor);
        slot.indexList.fill(-1);
        slot.count = 0;
        return this;
    }

    /** Populate a slot with the given entity indices and outline color. */
    public fillDataAt(slot: number, indexList: number[], color: Color): this {
        this.dataDirty = true;
        let data = this.slots[slot];
        if (data) {
            data.indexList.fill(-1);
            for (let i = 0, c = indexList.length; i < c; i++) {
                data.indexList[i] = indexList[i];
            }
            data.count = indexList.length;
            data.color.copy(color);
        }
        return this;
    }

    /** Copy the dirty flag and slots into the target, then clear the dirty flag. */
    public fetchData(target: { dirty: boolean; slots: OutlinePostSlot[] }): this {
        target.dirty = this.dataDirty;
        target.slots = this.slots;
        this.dataDirty = false;
        return this;
    }
}

export let outlinePostData: OutlinePostData = new OutlinePostData();