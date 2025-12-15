/**
 * Wolffia - Sync Module
 * SSE client for real-time sync with optimistic updates
 */

import { appState, validatePersistedState, type Note, type Folder } from './stores/app.svelte';
import { notes as notesApi, folders as foldersApi, settings as settingsApi } from './api';
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
const saveTimers = new Map<number | string, ReturnType<typeof setTimeout>>();
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

    // Use same API URL as api.ts (env variable or fallback)
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3000';
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
            // New note from server - just add it (spread for Svelte 5 reactivity)
            const existingNote = appState.notes.find(n => n.id === event.data.id);
            if (!existingNote) {
                appState.notes = [...appState.notes, event.data as unknown as Note];
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
                // Note doesn't exist locally, add it (spread for Svelte 5 reactivity)
                appState.notes = [...appState.notes, event.data as unknown as Note];
            }
            break;

        case 'note_deleted':
            // Use filter for proper Svelte 5 reactivity
            appState.notes = appState.notes.filter(n => n.id !== event.data.id);
            break;

        case 'folder_created':
        case 'folder_updated':
            const folderIndex = appState.folders.findIndex(f => f.id === event.data.id);
            if (folderIndex >= 0) {
                Object.assign(appState.folders[folderIndex], event.data);
            } else {
                // Add new folder (spread for Svelte 5 reactivity)
                appState.folders = [...appState.folders, event.data as unknown as Folder];
            }
            break;

        case 'folder_deleted':
            // Use filter for proper Svelte 5 reactivity
            appState.folders = appState.folders.filter(f => f.id !== event.data.id);
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
            // Add to local state (spread for Svelte 5 reactivity)
            appState.notes = [...appState.notes, {
                id: result.data.id,
                folder_id: localNote.folder_id,
                title: conflictTitle,
                content_blob: localNote.content_blob,
                updated_at: now.toISOString(),
            }];

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

        // IMPORTANT: Clear stale localStorage data BEFORE fetching from server
        // This prevents stale notes from persisting when logged in
        // The server is the source of truth for authenticated users
        appState.notes = [];
        appState.folders = [];

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

        // Load user settings from server (theme, accent color, etc.)
        await loadSettings();

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
    noteId: number | string,
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

                // Send to server (only for server notes with numeric IDs)
                if (typeof noteId === 'number') {
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
                } else {
                    // Local note - already saved to state, just resolve
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

        // Add temp note with spread for Svelte 5 reactivity
        appState.notes = [tempNote, ...appState.notes];

        // Send to server
        const result = await notesApi.create({
            title,
            content_blob: encrypted,
            folder_id: folderId
        });

        if (result.error || !result.data) {
            // Remove temp note - use filter for proper Svelte 5 reactivity
            appState.notes = appState.notes.filter(n => n.id !== tempId);
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
 * Supports both server notes (number ID) and local notes (string ID)
 */
export async function deleteNote(noteId: number | string): Promise<boolean> {
    const backup = appState.notes.find(n => n.id === noteId);

    // Optimistic delete - use filter for proper Svelte 5 reactivity
    appState.notes = appState.notes.filter(n => n.id !== noteId);

    // Only call API for server notes (number IDs)
    if (typeof noteId === 'number') {
        const result = await notesApi.delete(noteId);

        if (result.error) {
            // Revert
            if (backup) {
                appState.notes = [...appState.notes, backup];
            }
            return false;
        }
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

        // Add temp folder with spread for Svelte 5 reactivity
        appState.folders = [...appState.folders, tempFolder];

        const result = await foldersApi.create({ name, parent_id: parentId || undefined, color });

        if (result.error || !result.data) {
            // Use filter for proper Svelte 5 reactivity
            appState.folders = appState.folders.filter(f => f.id !== tempId);
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

    const backup = appState.folders.find(f => f.id === folderId);

    // Use filter for proper Svelte 5 reactivity
    appState.folders = appState.folders.filter(f => f.id !== folderId);

    // Also remove notes in this folder from view
    const notesBackup = appState.notes.filter(n => n.folder_id === folderId);
    appState.notes = appState.notes.filter(n => n.folder_id !== folderId);

    const result = await foldersApi.delete(folderId);
    console.log('[Sync] Delete folder result:', result);

    if (result.error) {
        console.error('[Sync] Delete folder API error:', result.error);
        if (backup) {
            appState.folders = [...appState.folders, backup];
        }
        appState.notes = [...appState.notes, ...notesBackup];
        return false;
    }

    console.log('[Sync] Folder deleted successfully');
    return true;
}

/**
 * Sync local notes to server after login
 * Uploads notes with local-* IDs to server and updates their IDs
 */
export async function syncLocalNotesToServer(): Promise<{ synced: number; failed: number }> {
    const localNotes = appState.notes.filter(n => typeof n.id === 'string' && (n.id as string).startsWith('local-'));

    if (localNotes.length === 0) {
        console.log('[Sync] No local notes to sync');
        return { synced: 0, failed: 0 };
    }

    console.log(`[Sync] Syncing ${localNotes.length} local notes to server`);

    let synced = 0;
    let failed = 0;

    for (const localNote of localNotes) {
        try {
            // Create note on server
            const result = await notesApi.create({
                title: localNote.title,
                content_blob: localNote.content_blob,
                folder_id: localNote.folder_id || undefined,
            });

            if (result.error || !result.data) {
                console.error(`[Sync] Failed to sync local note ${localNote.id}:`, result.error);
                failed++;
                continue;
            }

            // Replace local note with server note
            const serverId = result.data.id;
            appState.notes = appState.notes.map(n =>
                n.id === localNote.id
                    ? { ...n, id: serverId }
                    : n
            );

            // Update any open tabs referencing this note
            appState.openTabs = appState.openTabs.map(t =>
                t.noteId === localNote.id
                    ? { ...t, noteId: serverId }
                    : t
            );

            // Update active note ID if needed
            if (appState.activeNoteId === localNote.id) {
                appState.activeNoteId = serverId;
            }

            console.log(`[Sync] Synced local note ${localNote.id} -> ${serverId}`);
            synced++;
        } catch (e) {
            console.error(`[Sync] Error syncing local note ${localNote.id}:`, e);
            failed++;
        }
    }

    console.log(`[Sync] Sync complete: ${synced} synced, ${failed} failed`);
    return { synced, failed };
}

/**
 * Load user settings from server
 */
export async function loadSettings(): Promise<void> {
    if (!appState.token || appState.token === 'offline_session') {
        console.log('[Sync] Skipping settings load - not authenticated');
        return;
    }

    try {
        const result = await settingsApi.get();
        if (result.data) {
            console.log('[Sync] Loaded settings from server:', result.data);
            appState.theme = result.data.theme;
            appState.darkModeIntensity = result.data.darkModeIntensity;
            appState.accentColor = result.data.accentColor;
            appState.editorFontSize = result.data.editorFontSize;
            appState.verticalTabsEnabled = result.data.verticalTabsEnabled;
        }
    } catch (e) {
        console.warn('[Sync] Failed to load settings:', e);
    }
}

// Debounce timer for settings save
let settingsSaveTimer: ReturnType<typeof setTimeout> | null = null;
const SETTINGS_DEBOUNCE_MS = 1000;

/**
 * Save user settings to server (debounced)
 */
export function saveSettings(): void {
    if (!appState.token || appState.token === 'offline_session') {
        return; // Don't sync settings when not logged in
    }

    // Clear existing timer
    if (settingsSaveTimer) {
        clearTimeout(settingsSaveTimer);
    }

    // Debounce the save
    settingsSaveTimer = setTimeout(async () => {
        try {
            const result = await settingsApi.update({
                theme: appState.theme,
                darkModeIntensity: appState.darkModeIntensity,
                accentColor: appState.accentColor,
                editorFontSize: appState.editorFontSize,
                verticalTabsEnabled: appState.verticalTabsEnabled
            });
            if (result.data) {
                console.log('[Sync] Settings saved to server');
            }
        } catch (e) {
            console.warn('[Sync] Failed to save settings:', e);
        }
    }, SETTINGS_DEBOUNCE_MS);
}
