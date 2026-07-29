/**
 * Shared IndexedDB helpers for the AIWA games layer.
 *
 * Database: aiwa-games-db
 * Stores: game-sets, game-sessions, progress-outbox, learned-words
 */

const DB_NAME = 'aiwa-games-db';
const DB_VERSION = 1;
const STORES = ['game-sets', 'game-sessions', 'progress-outbox', 'learned-words'];

let _dbPromise = null;

/** Open (or reuse) the IndexedDB connection. */
export function openDB() {
    if (_dbPromise) return _dbPromise;
    if (typeof indexedDB === 'undefined') {
        return Promise.reject(new Error('IndexedDB is not available in this environment.'));
    }

    try {
        _dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);

            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                STORES.forEach((name) => {
                    if (!db.objectStoreNames.contains(name)) {
                        db.createObjectStore(name, { keyPath: 'key' });
                    }
                });
            };

            req.onsuccess = (e) => resolve(e.target.result);

            req.onerror = (e) => {
                const error = e.target.error;
                _dbPromise = null;
                reject(error);
            };
        });
    } catch (error) {
        _dbPromise = null;
        return Promise.reject(error);
    }

    return _dbPromise;
}

/** Retrieve a single record by key. Returns null on miss or error. */
export async function getRecord(storeName, key) {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(storeName, 'readonly');
            const req = tx.objectStore(storeName).get(key);
            req.onsuccess = () => resolve(req.result ?? null);
            req.onerror = () => resolve(null);
        });
    } catch {
        return null;
    }
}

/**
 * Write (insert or update) a record. The record must have a `key` property.
 *
 * @returns {Promise<boolean>} Resolves `true` on success, `false` if the write
 *   failed (e.g. quota exceeded or private-browsing mode).
 */
export async function putRecord(storeName, record) {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(storeName, 'readwrite');
            const req = tx.objectStore(storeName).put(record);
            req.onsuccess = () => resolve(true);
            req.onerror = () => resolve(false);
            tx.onerror = () => resolve(false);
            tx.onabort = () => resolve(false);
        });
    } catch {
        /* quota exceeded or private-browsing — degrade silently */
        return false;
    }
}

/** Retrieve all records from a store. Returns [] on error. */
export async function getAllRecords(storeName) {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(storeName, 'readonly');
            const req = tx.objectStore(storeName).getAll();
            req.onsuccess = () => resolve(req.result ?? []);
            req.onerror = () => resolve([]);
        });
    } catch {
        return [];
    }
}

/** Delete a single record by key. Silently ignored on error. */
export async function deleteRecord(storeName, key) {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(storeName, 'readwrite');
            tx.objectStore(storeName).delete(key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
    } catch {
        /* silently ignore */
    }
}
