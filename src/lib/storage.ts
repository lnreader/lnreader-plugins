class Storage {
  private db: Record<string, { created: Date; value: any; expires?: number }>;

  /**
   * Initializes a new instance of the Storage class.
   */
  constructor() {
    this.db = {};
  }

  /**
   * Sets a key-value pair in storage.
   *
   * @param {string} key - The key to set.
   * @param {any} value - The value to set.
   * @param {Date | number} [expires] - Optional expiry date or time in milliseconds.
   */
  set(key: string, value: any, expires?: Date | number): void {
    this.db[key] = {
      created: new Date(),
      value,
      expires: expires instanceof Date ? expires.getTime() : expires,
    };
  }

  /**
   * Retrieves the value for a given key from storage.
   *
   * @param {string} key - The key to retrieve the value for.
   * @param {boolean} [raw] - Optional flag to return the raw stored item.
   * @returns {any} The stored value or undefined if key is not found.
   */
  get(key: string, raw?: boolean): any {
    const item = this.db[key];
    if (item?.expires && Date.now() > item.expires) {
      this.delete(key);
      return undefined;
    }
    return raw ? item : item?.value;
  }

  /**
   * Retrieves all keys set by the `set` method.
   *
   * @returns {string[]} An array of keys.
   */
  getAllKeys(): string[] {
    return Object.keys(this.db);
  }

  /**
   * Deletes a key from the storage.
   *
   * @param key - The key to delete.
   */
  delete(key: string): void {
    delete this.db[key];
  }

  /**
   * Clears all stored items from storage.
   */
  clearAll(): void {
    this.db = {};
  }
}

// Export a singleton instance of the Storage class
export const storage = new Storage();

/*
These parameters cannot be implemented in `test-web`. 
They are generated in the browser when js-scripts are executed
Read more

https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage
*/

/**
 * Represents the structure of a storage object with string keys and values.
 */
type StorageObject = Record<string, any>;

/**
 * Represents a simplified version of the browser's localStorage.
 */
class LocalStorage {
  private db: StorageObject;

  constructor() {
    this.db = {};
  }

  get(): StorageObject | undefined {
    return this.db;
  }
}

// Export singleton instances of LocalStorage and sessionStorage
export const localStorage = new LocalStorage();
export const sessionStorage = new LocalStorage();
