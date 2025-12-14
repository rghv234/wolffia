/**
 * Wolffia - Sync Module
 * SSE client for real-time sync with optimistic updates
 */

import { appState, validatePersistedState, type Note, type Folder } from './stores/app.svelte';
import { notes as notesApi, folders as foldersApi } from './api';
import { decryptContent, encryptContent } from './crypto';

// SSE Event Types
type SyncEventType = 'note_created' | 'note_updated' | 'note_deleted' |
    'folder_created' | 'folder_updated' | 'folder_deleted';

interface SyncEvent {
    type: SyncEventType;
    data: {
        id: number;
        [key: string]: unknown;
    };
    timestamp: string;
}

// Sync state
let eventSource: EventSource | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 3000;

// Debounce timers for save operations
const saveTimers = new Map<number, ReturnType<typeof setTimeout>>();
const DEBOUNCE_MS = 500;

/**
 * Connect to SSE endpoint for real-time sync
 */
export function connectSync() {
    if (!appState.token || appState.token === 'offline_session') {
        console.warn('Cannot connect sync: no valid auth token');
        return;
    }

    if (eventSource) {
        eventSource.close();
    }

    // Use same hardcoded URL as api.ts
    const apiBase = 'http://localhost:3000';
    eventSource = new EventSource(`${apiBase}/events?token=${encodeURIComponent(appState.token)}`);

    eventSource.onopen = () => {
        console.log('Sync connected');
        reconnectAttempts = 0;
    };

    eventSource.onmessage = (event) => {
        try {
            const syncEvent: SyncEvent = JSON.parse(event.data);
            handleSyncEvent(syncEvent);
        } catch (e) {
            console.error('Failed to parse sync event:', e);
        }
    };

    eventSource.addEventListener('connected', (event) => {
        console.log('SSE connected:', event.data);
    });

    eventSource.addEventListener('heartbeat', () => {
        // Keep-alive, no action needed
    });

    eventSource.onerror = (error) => {
        console.error('Sync error:', error);
        eventSource?.close();
        eventSource = null;

        // Attempt reconnection (limited)
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            reconnectTimeout = setTimeout(() => {
                console.log(`Reconnecting sync (attempt ${reconnectAttempts})...`);
                connectSync();
            }, RECONNECT_DELAY * reconnectAttempts);
        } else {
            console.warn('SSE sync: max reconnect attempts reached. Working offline. Reload to retry.');
        }
    };
}

/**
 * Disconnect from SSE
 */
export function disconnectSync() {
    if (eventSource) {
        eventSource.close();
        eventSource = null;
    }
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }
}

/**
 * Handle incoming sync events with conflict detection
 */
async function handleSyncEvent(event: SyncEvent) {
    switch (event.type) {
        case 'note_created':
            // New note from server - just add it
            const existingNote = appState.notes.find(n => n.id === event.data.id);
            if (!existingNote) {
                appState.notes.push(event.data as unknown as Note);
            }
            break;

        case 'note_updated':
            // Check for conflicts before updating
            const noteIndex = appState.notes.findIndex(n => n.id === event.data.id);
            if (noteIndex >= 0) {
                const localNote = appState.notes[noteIndex];
                const serverNote = event.data as unknown as Note;

                // Conflict detection: server is newer AND content differs
                const serverTime = new Date(serverNote.updated_at).getTime();
                const localTime = new Date(localNote.updated_at).getTime();
                const contentDiffers = localNote.content_blob !== serverNote.content_blob;

                if (serverTime > localTime && contentDiffers && localNote.content_blob) {
                    // CONFLICT: Create conflict copy of local version
                    console.log('[Sync] Conflict detected for note:', localNote.id);
                    await createConflictCopy(localNote);
                }

                // Apply server version
                Object.assign(appState.notes[noteIndex], serverNote);
            } else {
                // Note doesn't exist locally, add it
                appState.notes.push(event.data as unknown as Note);
            }
            break;

        case 'note_deleted':
            const deleteNoteIndex = appState.notes.findIndex(n => n.id === event.data.id);
            if (deleteNoteIndex >= 0) {
                appState.notes.splice(deleteNoteIndex, 1);
            }
            break;

        case 'folder_created':
        case 'folder_updated':
            const folderIndex = appState.folders.findIndex(f => f.id === event.data.id);
            if (folderIndex >= 0) {
                Object.assign(appState.folders[folderIndex], event.data);
            } else {
                appState.folders.push(event.data as unknown as Folder);
            }
            break;

        case 'folder_deleted':
            const deleteFolderIndex = appState.folders.findIndex(f => f.id === event.data.id);
            if (deleteFolderIndex >= 0) {
                appState.folders.splice(deleteFolderIndex, 1);
            }
            break;
    }
}

/**
 * Create a conflict copy of a note
 */
async function createConflictCopy(localNote: Note) {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const baseName = localNote.title.replace(/\.(md|txt)$/, '');
    const ext = localNote.title.match(/\.(md|txt)$/)?.[1] || 'md';
    const conflictTitle = `${baseName} (Conflict ${timestamp}).${ext}`;

    try {
        // Create conflict copy via API
        const result = await notesApi.create({
            title: conflictTitle,
            content_blob: localNote.content_blob,
            folder_id: localNote.folder_id ?? undefined,
        });

        if (result.data) {
            // Add to local state
            appState.notes.push({
                id: result.data.id,
                folder_id: localNote.folder_id,
                title: conflictTitle,
                content_blob: localNote.content_blob,
                updated_at: now.toISOString(),
            });

            console.log('[Sync] Created conflict copy:', conflictTitle);
        }
    } catch (e) {
        console.error('[Sync] Failed to create conflict copy:', e);
    }
}

/**
 * Load all data from server (with offline fallback)
 */
export async function loadAllData() {
    // Import offline storage functions
    const {
        cacheServerData,
        getAllCachedNotes,
        getAllCachedFolders,
        isOfflineMode,
        setOfflineMode
    } = await import('./offline');

    try {
        // Try to load from server
        console.log('[Sync] Fetching data from server...');
        const [foldersResult, notesResult] = await Promise.all([
            foldersApi.list(),
            notesApi.list()
        ]);

        // Ensure we have arrays (API might return object wrapper)
        const foldersData = Array.isArray(foldersResult.data)
            ? foldersResult.data
            : [];
        const notesData = Array.isArray(notesResult.data)
            ? notesResult.data
            : [];

        console.log('[Sync] Server data:', notesData.length, 'notes,', foldersData.length, 'folders');

        appState.folders = foldersData;
        appState.notes = notesData;

        // ALWAYS cache server data (even if empty) to clear stale cache
        await cacheServerData(notesData as any[], foldersData as any[]);

        // Validate tabs and clean up stale references
        validatePersistedState();
        console.log('[Sync] Validated state - tabs:', appState.openTabs.length);

        setOfflineMode(false);
        console.log('[Sync] Data loaded from server successfully');
    } catch (e) {
        console.warn('[Sync] Server unavailable, loading from cache:', e);

        // Fall back to cached data
        const [cachedNotes, cachedFolders] = await Promise.all([
            getAllCachedNotes(),
            getAllCachedFolders()
        ]);

        console.log('[Sync] Cache data:',
            Array.isArray(cachedNotes) ? cachedNotes.length : 0, 'notes,',
            Array.isArray(cachedFolders) ? cachedFolders.length : 0, 'folders');

        appState.notes = Array.isArray(cachedNotes) ? cachedNotes as Note[] : [];
        appState.folders = Array.isArray(cachedFolders) ? cachedFolders as Folder[] : [];
        setOfflineMode(true);
    }
}

/**
 * Save note with debouncing and optimistic update
 */
export async function saveNote(
    noteId: number,
    content: string,
    title?: string
): Promise<boolean> {
    // Cancel previous debounce
    const existingTimer = saveTimers.get(noteId);
    if (existingTimer) {
        clearTimeout(existingTimer);
    }

    return new Promise((resolve) => {
        saveTimers.set(noteId, setTimeout(async () => {
            saveTimers.delete(noteId);

            try {
                // Encrypt content
                const encrypted = await encryptContent(content);

                // Optimistic update
                const noteIndex = appState.notes.findIndex(n => n.id === noteId);
                if (noteIndex >= 0) {
                    appState.notes[noteIndex].content_blob = encrypted;
                    appState.notes[noteIndex].updated_at = new Date().toISOString();
                    if (title) {
                        appState.notes[noteIndex].title = title;
                    }
                }

                // Send to server
                const result = await notesApi.update(noteId, {
                    content_blob: encrypted,
                    ...(title && { title })
                });

                if (result.error) {
                    console.error('Failed to save note:', result.error);
                    // Revert optimistic update on failure
                    await loadAllData();
                    resolve(false);
                } else {
                    resolve(true);
                }
            } catch (e) {
                console.error('Save error:', e);
                resolve(false);
            }
        }, DEBOUNCE_MS));
    });
}

/**
 * Create a new note with optimistic update
 */
export async function createNote(
    title: string,
    content: string = '',
    folderId?: number
): Promise<Note | null> {
    try {
        const encrypted = content ? await encryptContent(content) : '';

        // Create optimistic note
        const tempId = -Date.now(); // Negative temp ID
        const tempNote: Note = {
            id: tempId,
            folder_id: folderId ?? null,
            title,
            content_blob: encrypted,
            updated_at: new Date().toISOString()
        };

        appState.notes.unshift(tempNote);

        // Send to server
        const result = await notesApi.create({
            title,
            content_blob: encrypted,
            folder_id: folderId
        });

        if (result.error || !result.data) {
            // Remove temp note
            const tempIndex = appState.notes.findIndex(n => n.id === tempId);
            if (tempIndex >= 0) {
                appState.notes.splice(tempIndex, 1);
            }
            return null;
        }

        // Replace temp note with real one
        const tempIndex = appState.notes.findIndex(n => n.id === tempId);
        if (tempIndex >= 0) {
            appState.notes[tempIndex] = { ...tempNote, id: result.data.id };
        }

        return appState.notes.find(n => n.id === result.data!.id) ?? null;
    } catch (e) {
        console.error('Create note error:', e);
        return null;
    }
}

/**
 * Delete note with optimistic update
 */
export async function deleteNote(noteId: number): Promise<boolean> {
    const noteIndex = appState.notes.findIndex(n => n.id === noteId);
    const backup = noteIndex >= 0 ? { ...appState.notes[noteIndex] } : null;

    // Optimistic delete
    if (noteIndex >= 0) {
        appState.notes.splice(noteIndex, 1);
    }

    const result = await notesApi.delete(noteId);

    if (result.error) {
        // Revert
        if (backup) {
            appState.notes.push(backup);
        }
        return false;
    }

    return true;
}

/**
 * Create folder with optimistic update
 */
export async function createFolder(
    name: string,
    parentId?: number | null,
    color?: string
): Promise<Folder | null> {
    try {
        const tempId = -Date.now();
        const tempFolder: Folder = {
            id: tempId,
            parent_id: parentId ?? null,
            name,
            color: color,
            rank: 0
        };

        appState.folders.push(tempFolder);

        const result = await foldersApi.create({ name, parent_id: parentId || undefined, color });

        if (result.error || !result.data) {
            const tempIndex = appState.folders.findIndex(f => f.id === tempId);
            if (tempIndex >= 0) {
                appState.folders.splice(tempIndex, 1);
            }
            return null;
        }

        const tempIndex = appState.folders.findIndex(f => f.id === tempId);
        if (tempIndex >= 0) {
            appState.folders[tempIndex] = { ...tempFolder, id: result.data.id };
        }

        return appState.folders.find(f => f.id === result.data!.id) ?? null;
    } catch (e) {
        console.error('Create folder error:', e);
        return null;
    }
}

/**
 * Delete folder with optimistic update
 */
export async function deleteFolder(folderId: number): Promise<boolean> {
    console.log('[Sync] Deleting folder:', folderId);

    const folderIndex = appState.folders.findIndex(f => f.id === folderId);
    const backup = folderIndex >= 0 ? { ...appState.folders[folderIndex] } : null;

    if (folderIndex >= 0) {
        appState.folders.splice(folderIndex, 1);
    }

    // Also remove notes in this folder from view
    const notesBackup = appState.notes.filter(n => n.folder_id === folderId);
    appState.notes = appState.notes.filter(n => n.folder_id !== folderId);

    const result = await foldersApi.delete(folderId);
    console.log('[Sync] Delete folder result:', result);

    if (result.error) {
        console.error('[Sync] Delete folder API error:', result.error);
        if (backup) {
            appState.folders.push(backup);
        }
        appState.notes.push(...notesBackup);
        return false;
    }

    console.log('[Sync] Folder deleted successfully');
    return true;
}
