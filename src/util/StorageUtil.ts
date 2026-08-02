/**
 * Thin wrapper over `localStorage` for persisting and retrieving JSON data tables.
 * @group Util
 */
export class StorageUtil {

    /** The most recently loaded data table. */
    public static localData: any;
    /**
     * Load a JSON data table from local storage, creating an empty one if absent.
     * @param dataTable storage key
     * @returns the parsed data, typed as T
     */
    public static load<T>(dataTable: string): T {
        let jsonData = localStorage.getItem(dataTable);
        if (jsonData) {
            this.localData = JSON.parse(jsonData);
        } else {
            this.localData = {};
            StorageUtil.save(dataTable, this.localData);
        }
        return this.localData as T;
    }

    /**
     * Serialize and persist a data table to local storage.
     * @param table storage key
     * @param data value to persist
     */
    public static save<T>(table: string, data: T) {
        let json = JSON.stringify(data)
        localStorage.setItem(table, json);
    }
} 