/**
 * A map that additionally preserves insertion order of keys and/or values in parallel lists.
 * @group Math
 */
export class OrderMap<K, V> extends Map<K, V>{
    /** The values in insertion order; only populated when value recording is enabled. */
    public readonly valueList: V[];
    /** The keys in insertion order; only populated when key recording is enabled. */
    public readonly keyList: K[];
    /** Whether the map has changed since this flag was last reset. */
    public isChange: boolean = true;
    /** Creates an order-preserving map, optionally recording keys and/or values in parallel lists. */
    constructor(iterable?: Iterable<readonly [K, V]> | null, recordKey?: boolean, recordValue?: boolean) {
        super(iterable);
        if (recordKey) this.keyList = [];
        if (recordValue) this.valueList = [];

        if (iterable) {
            for (let item of iterable) {
                this.valueList?.push(item[1]);
                this.keyList?.push(item[0]);
            }
        }
    }

    /** Removes the entry for the given key, also updating the order lists; returns whether it existed. */
    delete(key: K): boolean {
        if (this.has(key)) {
            let value = this.get(key);
            this.valueList && this.deleteValue(value);

            this.keyList && this.deleteKey(key);

            this.isChange = true;
            return super.delete(key);
        }
        return false;
    }

    private deleteValue(value: V): this {
        let index = this.valueList.indexOf(value);
        if (index >= 0) {
            this.valueList.splice(index, 1);
        }
        return this;
    }

    private deleteKey(key: K): this {
        let index = this.keyList.indexOf(key);
        if (index >= 0) {
            this.keyList.splice(index, 1);
        }
        return this;
    }

    /** Sets the value for the given key, appending it to the end of the order lists. */
    set(key: K, value: V): this {
        this.delete(key);
        this.keyList?.push(key);
        this.valueList?.push(value);
        super.set(key, value);
        this.isChange = true;
        return this;
    }

    /** Removes all entries from the map and clears the order lists. */
    clear(): void {
        if (this.valueList) this.valueList.length = 0;
        if (this.keyList) this.keyList.length = 0;
        this.isChange = true;
        super.clear();
    }

}