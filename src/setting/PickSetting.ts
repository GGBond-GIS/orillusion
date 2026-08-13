

/**
 * Pick setting
 * @group Setting
 */
export type PickSetting = {
    /**
     * enable
     */
    enable: boolean;
    /**
     * pick mode: use pixel mode, bound mode, or ray mode
     * - `pixel`: GPU picking against the GBuffer
     * - `bound`: CPU picking against collider bounding shapes
     * - `ray`: CPU picking against mesh geometry (three.js `Raycaster` style),
     *   returns per-triangle results with uv / faceIndex / barycoord / normal
     */
    mode: `pixel` | `bound` | `ray`;
    /**
     * @internal
     */
    detail: `mesh` | `mesh|pos` | `mesh|normal` | `mesh|pos|normal`;
};