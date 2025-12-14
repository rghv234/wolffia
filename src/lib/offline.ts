/**
 * Wolffia - Offline Storage Module
 * Handles local caching of credentials and notes for offline access
 */

// Keys for localStorage
const CACHED_AUTH_KEY = 'wolffia_cached_auth';
const OFFLINE_MODE_KEY = 'wolffia_offline_mode';

// IndexedDB database name
const DB_NAME = 'wolffia_offline';
const DB_VERSION = 1;

export interface CachedAuth {
    username: string;
    salt_auth: string;
    salt_encryption: string;
    user_id: number;
    // Hash of auth key for offline verification (NOT the actual key)
    auth_key_hash: string;
}

export interface CachedNote {
    id: number;
    folder_id: number | null;
    title: string;
    content_blob: string; // Encrypted
    icon?: string;
    color?: string;
    updated_at: string;
    // Local sync status
    synced: boolean;
    local_updated_at: string;
}

export interface CachedFolder {
    id: number;
    parent_id: number | null;
    name: string;
    icon?: string;
    color?: string;
    rank: number;
    synced: boolean;
}

// Browser check
const browser = typeof window !== 'undefined';

/**
 * Save credentials for offline login
 */
export function cacheCredentials(auth: CachedAuth): void {
    if (!browser) return;
    localStorage.setItem(CACHED_AUTH_KEY, JSON.stringify(auth));
}

/**
 * Get cached credentials
 */
export function getCachedCredentials(): CachedAuth | null {
    if (!browser) return null;

    const stored = localStorage.getItem(CACHED_AUTH_KEY);
    if (!stored) return null;

    try {
        return JSON.parse(stored) as CachedAuth;
    } catch {
        return null;
    }
}

/**
 * Clear cached credentials (logout)
 */
export function clearCachedCredentials(): void {
    if (!browser) return;
    localStorage.removeItem(CACHED_AUTH_KEY);
}

/**
 * Check if offline mode is available (credentials cached)
 */
export function isOfflineAvailable(): boolean {
    return getCachedCredentials() !== null;
}

/**
 * Set offline mode flag
 */
export function setOfflineMode(offline: boolean): void {
    if (!browser) return;
    localStorage.setItem(OFFLINE_MODE_KEY, JSON.stringify(offline));
}

/**
 * Check if currently in offline mode
 */
export function isOfflineMode(): boolean {
    if (!browser) return false;
    return localStorage.getItem(OFFLINE_MODE_KEY) === 'true';
}

// ============================================================
// IndexedDB for Notes and Folders
// ============================================================

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Open IndexedDB database
 */
function openDB(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        if (!browser) {
            reject(new Error('IndexedDB not available in SSR'));
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;

            // Notes store
            if (!db.objectStoreNames.contains('notes')) {
                const notesStore = db.createObjectStore('notes', { keyPath: 'id' });
                notesStore.createIndex('folder_id', 'folder_id', { unique: false });
                notesStore.createIndex('synced', 'synced', { unique: false });
            }

            // Folders store
            if (!db.objectStoreNames.contains('folders')) {
                const foldersStore = db.createObjectStore('folders', { keyPath: 'id' });
                foldersStore.createIndex('parent_id', 'parent_id', { unique: false });
                foldersStore.createIndex('synced', 'synced', { unique: false });
            }

            // Pending sync queue
            if (!db.objectStoreNames.contains('sync_queue')) {
                const syncStore = db.createObjectStore('sync_queue', {
                    keyPath: 'id',
                    autoIncrement: true
                });
                syncStore.createIndex('type', 'type', { unique: false });
            }
        };
    });

    return dbPromise;
}

/**
 * Cache a note locally
 */
export async function cacheNote(note: CachedNote): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('notes', 'readwrite');
        const store = tx.objectStore('notes');
        const request = store.put({
            ...note,
            synced: true,
            local_updated_at: new Date().toISOString()
        });

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

/**
 * Get all cached notes
 */
export async function getAllCachedNotes(): Promise<CachedNote[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('notes', 'readonly');
        const store = tx.objectStore('notes');
        const request = store.getAll();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}

/**
 * Get a single cached note
 */
export async function getCachedNote(id: number): Promise<CachedNote | null> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('notes', 'readonly');
        const store = tx.objectStore('notes');
        const request = store.get(id);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result || null);
    });
}

/**
 * Save a note locally (marks as unsynced)
 */
export async function saveNoteLocally(note: Partial<CachedNote> & { id: number }): Promise<void> {
    const db = await openDB();

    // Get existing note first
    const existing = await getCachedNote(note.id);

    return new Promise((resolve, reject) => {
        const tx = db.transaction('notes', 'readwrite');
        const store = tx.objectStore('notes');
        const request = store.put({
            ...existing,
            ...note,
            synced: false,
            local_updated_at: new Date().toISOString()
        });

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

/**
 * Delete a cached note
 */
export async function deleteCachedNote(id: number): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('notes', 'readwrite');
        const store = tx.objectStore('notes');
        const request = store.delete(id);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

/**
 * Cache a folder locally
 */
export async function cacheFolder(folder: CachedFolder): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('folders', 'readwrite');
        const store = tx.objectStore('folders');
        const request = store.put({ ...folder, synced: true });

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

/**
 * Get all cached folders
 */
export async function getAllCachedFolders(): Promise<CachedFolder[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('folders', 'readonly');
        const store = tx.objectStore('folders');
        const request = store.getAll();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}

/**
 * Get unsynced notes (for sync when back online)
 */
export async function getUnsyncedNotes(): Promise<CachedNote[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('notes', 'readonly');
        const store = tx.objectStore('notes');
        const index = store.index('synced');
        const request = index.getAll(IDBKeyRange.only(false));

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}

/**
 * Mark notes as synced
 */
export async function markNotesSynced(ids: number[]): Promise<void> {
    const db = await openDB();
    const tx = db.transaction('notes', 'readwrite');
    const store = tx.objectStore('notes');

    for (const id of ids) {
        const note = await getCachedNote(id);
        if (note) {
            store.put({ ...note, synced: true });
        }
    }
}

/**
 * Clear all cached data (for logout)
 */
export async function clearAllCachedData(): Promise<void> {
    const db = await openDB();

    await Promise.all([
        new Promise<void>((resolve, reject) => {
            const tx = db.transaction('notes', 'readwrite');
            const req = tx.objectStore('notes').clear();
            req.onerror = () => reject(req.error);
            req.onsuccess = () => resolve();
        }),
        new Promise<void>((resolve, reject) => {
            const tx = db.transaction('folders', 'readwrite');
            const req = tx.objectStore('folders').clear();
            req.onerror = () => reject(req.error);
            req.onsuccess = () => resolve();
        }),
        new Promise<void>((resolve, reject) => {
            const tx = db.transaction('sync_queue', 'readwrite');
            const req = tx.objectStore('sync_queue').clear();
            req.onerror = () => reject(req.error);
            req.onsuccess = () => resolve();
        })
    ]);

    clearCachedCredentials();
}

/**
 * Cache notes and folders from server response
 * Clears old cache first to ensure fresh data
 */
export async function cacheServerData(
    notes: CachedNote[],
    folders: CachedFolder[]
): Promise<void> {
    const db = await openDB();

    // Clear old cache first to prevent stale data
    await Promise.all([
        new Promise<void>((resolve, reject) => {
            const tx = db.transaction('notes', 'readwrite');
            const req = tx.objectStore('notes').clear();
            req.onerror = () => reject(req.error);
            req.onsuccess = () => resolve();
        }),
        new Promise<void>((resolve, reject) => {
            const tx = db.transaction('folders', 'readwrite');
            const req = tx.objectStore('folders').clear();
            req.onerror = () => reject(req.error);
            req.onsuccess = () => resolve();
        })
    ]);

    // Cache all notes
    for (const note of notes) {
        await cacheNote(note);
    }

    // Cache all folders
    for (const folder of folders) {
        await cacheFolder(folder);
    }

    console.log('[Offline] Cache refreshed with', notes.length, 'notes and', folders.length, 'folders');
}
