import { Color } from "../../math/Color";

/**
 * Skyline Setting
 * @group Setting
 */
export type SkylineSetting = {
    /**
     * Enable skyline post effect
     */
    enable: boolean;
    /**
     * Skyline color
     */
    lineColor: Color;
    /**
     * Skyline pixel width
     */
    lineWidth: number;
    /**
     * Depth threshold for edge detection
     */
    depthThreshold: number;
    /**
     * Strength of the skyline effect
     */
    strength: number;
};
