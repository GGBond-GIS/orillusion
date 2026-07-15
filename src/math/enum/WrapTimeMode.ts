/**
 * Time wrap mode applied when sampling beyond the time range.
 * - PingPong: value oscillates min -> max -> min.
 * - Repeat: value = value % repeatSpace.
 * - Clamp: value = max(min(value, 1), 0).
 * @group Math
 */
export enum WrapTimeMode {
    PingPong = 0,
    Repeat = 1,
    Clamp = 2,
}