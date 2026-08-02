
/**
 * A simple generic object pool that recycles instances between an in-use
 * list and a free list to avoid repeated allocation.
 * @internal
 */
export class PoolNode<T> {
  private _use: T[];
  private _unUse: T[];

  constructor() {
    this._use = [];
    this._unUse = [];
  }

  /**
   * Return a used instance to the free list so it can be reused.
   * @param node the instance to recycle
   */
  public pushBack(node: T) {
    let index = this._use.indexOf(node);
    if (index != -1) {
      this._use.splice(index, 1);
      this._unUse.push(node);
    }
  }

  /**
   * Get the list of currently in-use instances.
   */
  public getUseList(): T[] {
    return this._use;
  }

  /**
   * Get a free instance from the pool, creating a new one if none are available.
   * @param instance constructor used to create a new instance when the pool is empty
   * @param param optional constructor argument
   */
  public getOne(instance: { new(arg?): T }, param?): T {
    let node: T;
    if (this._unUse.length > 0) {
      node = this._unUse[0];
      this._unUse.splice(0, 1);
      this._use.push(node);
      return node;
    } else {
      node = new instance(param);
      this._use.push(node);
    }

    return node;
  }

  /**
   * Whether the pool has any free instance available for reuse.
   */
  public hasFree(): boolean {
    return this._unUse.length > 0;
  }
}
