import { Matrix4 } from '../../../math/Matrix4';

/**
 * @internal
 * Internal pose record for a single skeleton joint: its matrix-table
 * index plus the world matrix used during skeletal animation.
 */
export class JointPose {
  public index: number;
  public worldMatrix: Matrix4;
  constructor(index: number, useGlobalMatrix: boolean = false) {
    this.index = index;
    this.worldMatrix = new Matrix4(!useGlobalMatrix);
  }
}
