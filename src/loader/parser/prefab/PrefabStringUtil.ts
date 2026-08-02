import { Quaternion } from "../../..";

/**
 * String parsing helpers for the prefab text format. Converts raw string
 * fields into numbers, booleans and numeric/string arrays.
 * @group Loader
 */
export class PrefabStringUtil {

    /**
     * Parse a string as a floating-point number.
     * @param st the source string.
     */
    public static getNumber(st: string) {
        let v = parseFloat(st);
        return v;
    }

    /**
     * Parse a string as an integer.
     * @param st the source string.
     */
    public static getInt(st: string) {
        let v = parseInt(st);
        return v;
    }

    /**
     * Parse a string as a boolean (`"true"` maps to true, anything else false).
     * @param st the source string.
     */
    public static getBoolean(st: string) {
        let v = st == "true" ? true : false;
        return v;
    }

    /**
     * Parse a bracketed, comma-separated string into a list of numbers.
     * @param st the source string, e.g. `"[1,2,3]"`.
     */
    public static getNumberArray(st: string) {
        let v = st.replaceAll("[", "");
        v = v.replaceAll("]", "");
        let list = v.split(",");
        let ret: number[] = [];
        for (let i = 0; i < list.length; i++) {
            const element = parseFloat(list[i]);
            ret.push(element);
        }
        return v;
    }

    /**
     * Parse a bracketed, comma-separated string into a list of strings.
     * @param st the source string, e.g. `"[a,b,c]"`.
     */
    public static getStringArray(st: string) {
        let v = st.replaceAll("[", "");
        v = v.replaceAll("]", "");
        let list = v.split(",");
        let ret: string[] = [];
        for (let i = 0; i < list.length; i++) {
            const element = (list[i]);
            ret.push(element);
        }
        return ret;
    }

    /**
     * Parse a string into a {@link Vector2}. (Reserved; not yet implemented.)
     * @param st the source string.
     */
    public static getVector2(st: string) {

    }

    /**
     * Parse a string into a {@link Vector3}. (Reserved; not yet implemented.)
     * @param st the source string.
     */
    public static getVector3(st: string) {

    }

    /**
     * Parse a string into a {@link Vector4}. (Reserved; not yet implemented.)
     * @param st the source string.
     */
    public static getVector4(st: string) {

    }

    /**
     * Parse a string into a {@link Quaternion}. (Reserved; not yet implemented.)
     * @param st the source string.
     */
    public static getQuaternion(st: string) {

    }

    /**
     * Parse a string into a {@link Color}. (Reserved; not yet implemented.)
     * @param st the source string.
     */
    public static getColor(st: string) {

    }
}