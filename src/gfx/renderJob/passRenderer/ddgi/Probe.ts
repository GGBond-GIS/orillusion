import { Object3D } from '../../../../core/entities/Object3D';
/**
 * @internal
 * Light probe Use Spherical
 */
export class Probe extends Object3D {
    public index: number = 0;
    public drawCallFrame = -1;
    constructor() {
        super();
    }
}
