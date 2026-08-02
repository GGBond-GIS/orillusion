/**
 * instance reference statistics module
 * apply any instance , used full destroy
 *
 * Outer map is a WeakMap so a resource (ref) doesn't stay alive merely
 * because Reference knows about it — its `_boundCtx` back-ref would
 * otherwise pin the owning Context3D forever across engine reinits.
 * Inner map retains parents strongly (that's the whole point of the
 * tracker), but it evaporates with the ref once nothing else holds it.
 * @group Util
 */
export class Reference {
    protected reference: WeakMap<any, Map<any, any>>;

    private static _ins: Reference;

    /** Get the shared Reference singleton, creating it on first use. */
    public static getInstance(): Reference {
        this._ins ||= new Reference();
        return this._ins;
    }

    /**
     * current instance attached from parent instance
     * @param ref reference current 
     * @param target reference parent
     */
    public attached(ref: any, target: any) {
        this.reference ||= new WeakMap<any, Map<any, any>>();

        let refMap = this.reference.get(ref);
        refMap ||= new Map<any, any>();
        refMap.set(target, ref);

        this.reference.set(ref, refMap);
    }

    /**
     * current instance detached from parent instance
     * @param ref reference current 
     * @param target reference parent
     */
    public detached(ref: any, target: any) {
        let refMap = this.reference.get(ref);
        if (refMap) {
            refMap.delete(target);
            // Drop the outer-map entry once the last parent is gone —
            // without this, every resource that ever called attached()
            // remains a strong key in `reference`, keeping its
            // `_boundCtx` (and therefore the owning Context3D) alive
            // across engine reinit cycles.
            if (refMap.size === 0) this.reference.delete(ref);
        }
    }

    /**
     * current instance has reference 
     */
    public hasReference(ref: any): boolean {
        let refMap = this.reference.get(ref);
        if (refMap) {
            return refMap.size > 0;
        }
        return false;
    }

    /**
     * get current instance reference count
     * @param ref 
     * @returns 
     */
    public getReferenceCount(ref: any): number {
        let refMap = this.reference.get(ref);
        if (refMap) {
            return refMap.size;
        }
        return 0;
    }

    /**
    * get current instance reference from where
    * @param ref 
    * @returns 
    */
    public getReference(ref: any): Map<any, any> {
        let refMap = this.reference.get(ref);
        if (refMap) {
            return refMap;
        }
        return null;
    }

}