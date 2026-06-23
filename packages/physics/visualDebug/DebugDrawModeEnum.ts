export type DebugDrawerOptions = Partial<{
    /**
     * Enabled state, default false
     */
    enable: boolean;
    /**
     * Sets the debug mode, default value is 1 (DrawWireframe: draws the wireframe of physics objects)
     */
    debugDrawMode: DebugDrawMode;
    /**
     * Update frequency, defaults to updating every 1 frame
     */
    updateFreq: number;
    /**
     * Maximum number of lines rendered, default 25,000 (exceeding 32,000 may cause errors as of V0.8.2)
     */
    maxLineCount: number;
}>;


export enum DebugDrawMode {
    /**
     * Do not display debug information
     */
    NoDebug = 0,
    /**
     * Draw the wireframe of physics objects
     */
    DrawWireframe = 1,
    /**
     * Draw the axis-aligned bounding box (AABB) of physics objects
     */
    DrawAabb = 2,
    /**
     * Draw feature point text
     */
    DrawFeaturesText = 4,
    /**
     * Draw contact points
     */
    DrawContactPoints = 8,
    /**
     * Disable deactivation
     */
    NoDeactivation = 16,
    /**
     * Do not display help text
     */
    NoHelpText = 32,
    /**
     * Draw text information
     */
    DrawText = 64,
    /**
     * Show performance timing information
     */
    ProfileTimings = 128,
    /**
     * Enable SAT comparison
     */
    EnableSatComparison = 256,
    /**
     * Disable Bullet's LCP algorithm
     */
    DisableBulletLCP = 512,
    /**
     * Enable continuous collision detection
     */
    EnableCCD = 1024,
    /**
     * Draw constraints
     */
    DrawConstraints = 2048,
    /**
     * Draw constraint limits
     */
    DrawConstraintLimits = 4096,
    /**
     * Draw the AABB of fast culling proxies
     */
    FastWireframe = 8192,
    /**
     * Draw the dynamic AABB tree
     */
    DrawAabbDynamic = 16384,
    /**
     * Draw soft body physics
     */
    DrawSoftBodies = 32768,
}