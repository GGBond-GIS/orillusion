/**
 * Constants describing how a point or geometry is classified relative to a plane.
 * @group Math
 */
export class PlaneClassification {
    /**
    * @language en_US
    * Back side
    * @platform Web,Native
    */
    public static BACK: number = 0;

    /**
    * @language en_US
    * Front side
    * @platform Web,Native
    */
    public static FRONT: number = 1;

    /**
    * @language en_US
    * The side that the normal points toward
    * @platform Web,Native
    */
    public static IN: number = 0;

    /**
    * @language en_US
    * The side opposite the normal direction
    * @platform Web,Native
    */
    public static OUT: number = 1;

    /**
    * @language en_US
    * Intersecting
    * @platform Web,Native
    */
    public static INTERSECT: number = 2;
}
