import type { StateStorage } from 'zustand/middleware';

const DB_NAME = 'simple-time-tracker-db';
const STORE_NAME = 'keyval';

function getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            return reject(new Error('IndexedDB is not supported'));
        }

        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains(STORE_NAME)) {
                req.result.createObjectStore(STORE_NAME);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

/**
 * Robust IndexedDB storage adapter for Zustand with automatic localStorage migration
 * and safe localStorage fallback.
 */
export const idbStorage: StateStorage = {
    getItem: async (name: string): Promise<string | null> => {
        try {
            const db = await getDB();
            const val = await new Promise<string | null>((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readonly');
                const store = tx.objectStore(STORE_NAME);
                const req = store.get(name);
                req.onsuccess = () => resolve(req.result ?? null);
                req.onerror = () => reject(req.error);
            });

            // ── Auto-Migration: If not yet in IndexedDB, check localStorage ──
            if (val === null && typeof localStorage !== 'undefined') {
                const localVal = localStorage.getItem(name);
                if (localVal !== null) {
                    // Copy to IndexedDB for all future reads/writes
                    await idbStorage.setItem(name, localVal);
                    return localVal;
                }
            }

            return val;
        } catch {
            // Fallback to localStorage if IndexedDB fails
            return typeof localStorage !== 'undefined' ? localStorage.getItem(name) : null;
        }
    },

    setItem: async (name: string, value: string): Promise<void> => {
        try {
            const db = await getDB();
            await new Promise<void>((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                const req = store.put(value, name);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        } catch {
            // Fallback to localStorage
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(name, value);
            }
        }
    },

    removeItem: async (name: string): Promise<void> => {
        try {
            const db = await getDB();
            await new Promise<void>((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                const req = store.delete(name);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        } catch {
            if (typeof localStorage !== 'undefined') {
                localStorage.removeItem(name);
            }
        }
    },
};
