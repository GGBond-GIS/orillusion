/**
 * Cluster grid dimensions for the Forward+ clustered lighting pass. The
 * view frustum is divided into clusterTileX × clusterTileY screen-space
 * tiles across clusterTileZ depth slices; each cluster holds the list of
 * lights affecting it.
 *
 * @group GFX
 */
export class ClusterConfig {
    /** Number of cluster tiles across the screen width. */
    public static clusterTileX = 16;
    /** Number of cluster tiles across the screen height. */
    public static clusterTileY = 16;
    /** Number of depth slices along the view direction. */
    public static clusterTileZ = 32;
}