import { Matrix4 } from '../../../math/Matrix4';
import { Quaternion } from '../../../math/Quaternion';
import { Vector3 } from '../../../math/Vector3';
/**
 * @internal
 */
export enum CubeMapFaceEnum {
    Left = 0,
    Right = 1,
    Bottom = 2,
    Top = 3,
    Back = 4,
    Front = 5,
}
/**
 * @internal
 */
export class TextureCubeUtils {
    public static getRotationToFace(face: number): Quaternion {
        let quaternion: Quaternion = Quaternion.identity().clone();
        let target: Vector3 = new Vector3();
        let matrix = new Matrix4().identity();
        let up: Vector3 = new Vector3();
        switch (face) {
            case CubeMapFaceEnum.Top:
                target.set(0, -1, 0);
                up.set(0, 0, -1);
                break;
            case CubeMapFaceEnum.Bottom:
                target.set(0, 1, 0);
                up.set(0, 0, 1);
                break;
            case CubeMapFaceEnum.Right:
                target.set(1, 0, 0);
                up.set(0, 1, 0);
                break;
            case CubeMapFaceEnum.Left:
                target.set(-1, 0, 0);
                up.set(0, 1, 0);
                break;
            case CubeMapFaceEnum.Back:
                target.set(0, 0, -1);
                up.set(0, 1, 0);
                break;
            case CubeMapFaceEnum.Front:
                // Early-return path still allocated `matrix` above — free it
                // before bailing, otherwise we leak 2 slots per env-map build.
                Matrix4.freeIndex(matrix);
                return Quaternion.identity();
        }
        matrix.lookAt(new Vector3(), target, up);
        quaternion.setFromRotationMatrix(matrix);
        // Hand the scratch slot back to the global Matrix4 table. Called
        // once per cube face at env-map build time, so without this each
        // engine reinit leaked 12 slots.
        Matrix4.freeIndex(matrix);
        return quaternion;
    }

}
