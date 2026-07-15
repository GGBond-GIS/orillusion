/**
 * @internal
 */
export let WorldMatrixUniform: string = /*wgsl*/ `
    struct Uniforms {
        matrix : array<mat4x4<f32>>
    };

    @group(0) @binding(1)
    var<storage, read> models : Uniforms;

    struct DoubleWorldPosition {
        high: vec4<f32>,
        low: vec4<f32>,
    };

    fn GetDoubleWorldPosition(index: u32) -> DoubleWorldPosition {
        var result: DoubleWorldPosition;
        let m = models.matrix[globalUniform.maxModelsCount + index / 2];
        let i = index % 2 * 2;
        result.high = m[i + 0];
        result.low = m[i + 1];
        return result;
    }

    fn SubtractSplitDoubles(aH:vec3<f32>, aL:vec3<f32>, bH:vec3<f32>, bL:vec3<f32>) -> vec3<f32> {
        var hi = aH - bH;
        // fix iOS/Mac 
        if (length(hi) == 0.0) {
            hi = vec3f(0, 0, 0);
        }
        let low = aL - bL;
        return hi + low;
    }

    fn UpdateWorldMatrixToRTE(modelMatrixIndex: u32, pWorldMatrix: ptr<function, mat4x4<f32>>) {
        let modelWorldPosHL = GetDoubleWorldPosition(modelMatrixIndex);
        let rtePos = SubtractSplitDoubles(modelWorldPosHL.high.xyz, modelWorldPosHL.low.xyz, globalUniform.cameraPositionH, globalUniform.cameraPositionL);
        (*pWorldMatrix)[3] = vec4<f32>(rtePos, 1.0);
    }

    fn UpdateWorldMatrixToRTE_PrivatePtr(modelMatrixIndex: u32, pWorldMatrix: ptr<private, mat4x4<f32>>) {
        let modelWorldPosHL = GetDoubleWorldPosition(modelMatrixIndex);
        let rtePos = SubtractSplitDoubles(modelWorldPosHL.high.xyz, modelWorldPosHL.low.xyz, globalUniform.cameraPositionH, globalUniform.cameraPositionL);
        (*pWorldMatrix)[3] = vec4<f32>(rtePos, 1.0);
    }
`
