/**
 * Wolffia - Application State (Svelte 5 Runes)
 * Reactive state management with localStorage persistence
 */

// Browser detection
const browser = typeof window !== 'undefined';

// Types
export interface Note {
    id: number;
    folder_id: number | null;
    title: string;
    content_blob: string; // Encrypted
    icon?: string;
    color?: string;
    updated_at: string;
}

export interface Folder {
    id: number;
    parent_id: number | null;
    name: string;
    icon?: string;
    color?: string;
    rank: number;
}

// Tab representation for open notes
export interface Tab {
    noteId: number | string; // number for saved notes, string for untitled (e.g., 'untitled-1')
    title: string;
    isDirty: boolean;
    cursorPosition: number;
    scrollTop: number;
}

// Scratchpad note (transient, not saved to DB per Spec Section J)
export interface ScratchpadNote {
    title: string;
    content: string; // Plain text (encrypted on save)
    cursorPosition: number;
    scrollTop: number;
}

interface AppState {
    // Authentication
    token: string | null;
    userId: number | null;
    username: string | null;

    // Tabs
    openTabs: Tab[];
    activeNoteId: number | string | null; // number for saved notes, string for untitled

    // Sidebar
    expandedFolderIds: Set<number>;

    // Data
    folders: Folder[];
    notes: Note[];

    // Untitled notes (transient, not saved to DB) - multiple allowed like real text editors
    untitledNotes: Record<string, ScratchpadNote>; // keyed by 'untitled-1', 'untitled-2', etc.
    untitledCounter: number; // for generating unique untitled IDs

    // Legacy scratchpad (for backward compat, will be migrated)
    scratchpadNote: ScratchpadNote | null;

    // UI
    theme: 'light' | 'dark' | 'system';
    darkModeIntensity: 'normal' | 'dim' | 'oled'; // OLED uses pure black #000000
    editorFontSize: number;
    sidebarVisible: boolean;
    statusBarVisible: boolean;
    accentColor: string; // Hex color for primary accent

    // Vertical Tabs Mode
    verticalTabsEnabled: boolean;
    verticalTabsExpanded: boolean; // Mobile: is panel open

    // Split Screen
    selectedTabs: Set<number | string>; // Multi-selection for splitting
    splitView: {
        enabled: boolean;
        leftNoteId: number | string | null;
        rightNoteId: number | string | null;
        splitRatio: number; // 0.5 = 50/50 split
        activePaneNoteId: number | string | null; // Track which pane has focus
    } | null;

    // Keyboard shortcuts customization
    customShortcuts: Record<string, CustomShortcut>;

    // Tab highlighting colors (noteId -> color hex)
    tabColors: Record<string | number, string>;

    // Scratchpad version counter (incremented on each new scratchpad for re-render)
    scratchpadVersion: number;

    // Editor cursor position (for status bar)
    cursorLine: number;
    cursorCol: number;
    charCount: number;
}

// Custom shortcut definition
export interface CustomShortcut {
    key: string;
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;
}

// Persistence keys
const STORAGE_KEY = 'wolffia_state';

// Load persisted state
function loadPersistedState(): Partial<AppState> {
    if (!browser) return {};

    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            // Convert expandedFolderIds array back to Set
            if (parsed.expandedFolderIds) {
                parsed.expandedFolderIds = new Set(parsed.expandedFolderIds);
            }
            return parsed;
        }
    } catch (e) {
        console.warn('Failed to load persisted state:', e);
    }
    return {};
}

// Create initial state
function createInitialState(): AppState {
    const persisted = loadPersistedState();

    return {
        token: persisted.token ?? null,
        userId: persisted.userId ?? null,
        username: persisted.username ?? null,
        openTabs: persisted.openTabs ?? [],
        activeNoteId: persisted.activeNoteId ?? null,
        expandedFolderIds: persisted.expandedFolderIds ?? new Set(),
        folders: [],
        notes: [],
        untitledNotes: {}, // Map of untitled notes keyed by 'untitled-1', etc.
        untitledCounter: persisted.untitledCounter ?? 0, // For unique untitled IDs
        scratchpadNote: null, // Legacy, kept for backward compat
        theme: persisted.theme ?? 'system',
        darkModeIntensity: persisted.darkModeIntensity ?? 'normal',
        editorFontSize: persisted.editorFontSize ?? 14,
        sidebarVisible: persisted.sidebarVisible ?? true,
        statusBarVisible: persisted.statusBarVisible ?? true,
        accentColor: persisted.accentColor ?? '#ec4899', // Default pink

        // Vertical Tabs Mode (persisted)
        verticalTabsEnabled: persisted.verticalTabsEnabled ?? false,
        verticalTabsExpanded: false, // Always collapsed on start (mobile)

        // Split Screen (persisted)
        selectedTabs: new Set(), // Always empty on start
        splitView: persisted.splitView ?? null,

        customShortcuts: persisted.customShortcuts ?? {}, // User-defined shortcuts override defaults
        tabColors: persisted.tabColors ?? {}, // Tab highlight colors keyed by noteId
        scratchpadVersion: 0, // Legacy
        cursorLine: 1,
        cursorCol: 1,
        charCount: 0
    };
}

// Reactive state using Svelte 5 $state
export const appState = $state<AppState>(createInitialState());

// Persist state on changes
$effect.root(() => {
    $effect(() => {
        if (!browser) return;

        // Serialize state for localStorage
        const toStore = {
            token: appState.token,
            userId: appState.userId,
            username: appState.username,
            openTabs: appState.openTabs,
            activeNoteId: appState.activeNoteId,
            expandedFolderIds: Array.from(appState.expandedFolderIds),
            theme: appState.theme,
            darkModeIntensity: appState.darkModeIntensity,
            editorFontSize: appState.editorFontSize,
            sidebarVisible: appState.sidebarVisible,
            statusBarVisible: appState.statusBarVisible,
            accentColor: appState.accentColor,
            verticalTabsEnabled: appState.verticalTabsEnabled,
            splitView: appState.splitView,
            untitledCounter: appState.untitledCounter,
            tabColors: appState.tabColors,
        };

        localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
    });
});

// Actions
export function openNote(note: Note) {
    const existingTab = appState.openTabs.find(t => t.noteId === note.id);

    if (!existingTab) {
        appState.openTabs.push({
            noteId: note.id,
            title: note.title,
            isDirty: false,
            cursorPosition: 0,
            scrollTop: 0
        });
    }

    appState.activeNoteId = note.id;
}

export function closeTab(noteId: number | string) {
    const index = appState.openTabs.findIndex(t => t.noteId === noteId);
    if (index === -1) return;

    appState.openTabs.splice(index, 1);

    // If this tab was part of split view, disable split mode
    if (appState.splitView?.enabled) {
        if (appState.splitView.leftNoteId === noteId || appState.splitView.rightNoteId === noteId) {
            appState.splitView = null;
            appState.selectedTabs.clear();
        }
    }

    // If closing active tab, switch to adjacent tab
    if (appState.activeNoteId === noteId) {
        if (appState.openTabs.length > 0) {
            const newIndex = Math.min(index, appState.openTabs.length - 1);
            appState.activeNoteId = appState.openTabs[newIndex].noteId;
        } else {
            appState.activeNoteId = null;
            // Clear split view when no tabs remain
            appState.splitView = null;
            appState.selectedTabs.clear();
        }
    }

    // Always clear split view if fewer than 2 tabs remain
    if (appState.openTabs.length < 2) {
        appState.splitView = null;
        appState.selectedTabs.clear();
    }
}

export function toggleFolder(folderId: number) {
    if (appState.expandedFolderIds.has(folderId)) {
        appState.expandedFolderIds.delete(folderId);
    } else {
        appState.expandedFolderIds.add(folderId);
    }
}

export function setTheme(theme: 'light' | 'dark' | 'system') {
    appState.theme = theme;

    if (browser) {
        const html = document.documentElement;

        // Map our theme values to daisyUI theme names
        if (theme === 'system') {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            html.dataset.theme = prefersDark ? 'dracula' : 'emerald';
            localStorage.setItem('wolffia_theme', 'system');
        } else if (theme === 'light') {
            html.dataset.theme = 'emerald';
            localStorage.setItem('wolffia_theme', 'emerald');
        } else {
            html.dataset.theme = 'dracula';
            localStorage.setItem('wolffia_theme', 'dracula');
        }
    }
}

export function setAccentColor(color: string) {
    appState.accentColor = color;

    if (browser) {
        // Update CSS custom property for slider and other elements
        document.documentElement.style.setProperty('--accent-color', color);

        // daisyUI themes use oklch, but we can override with direct hex
        // Create a style element to inject custom accent styles
        let styleEl = document.getElementById('wolffia-accent-styles');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'wolffia-accent-styles';
            document.head.appendChild(styleEl);
        }

        // Calculate contrasting text color
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        const textColor = luminance > 0.5 ? '#000000' : '#ffffff';

        // Override daisyUI primary with custom accent
        styleEl.textContent = `
            .btn-primary { background-color: ${color} !important; border-color: ${color} !important; color: ${textColor} !important; }
            .btn-primary:hover { background-color: ${color} !important; filter: brightness(0.9); }
            .toggle-primary:checked { background-color: ${color} !important; border-color: ${color} !important; }
            .toggle-primary:checked::before { background-color: ${textColor} !important; }
            .range-primary::-webkit-slider-thumb { background-color: ${color} !important; }
            .range-primary::-moz-range-thumb { background-color: ${color} !important; }
            .text-primary { color: ${color} !important; }
            .bg-primary { background-color: ${color} !important; }
            .border-primary { border-color: ${color} !important; }
            .ring-primary { --tw-ring-color: ${color} !important; }
            .tab-active { color: ${color} !important; border-color: ${color} !important; }
            .checkbox-primary:checked { background-color: ${color} !important; border-color: ${color} !important; }
            .radio-primary:checked { background-color: ${color} !important; border-color: ${color} !important; }
            .link-primary { color: ${color} !important; }
            .progress-primary::-webkit-progress-value { background-color: ${color} !important; }
            .progress-primary::-moz-progress-bar { background-color: ${color} !important; }
        `;

        console.log('[Accent] Applied accent color:', color);
    }
}

export function setDarkModeIntensity(intensity: 'normal' | 'dim' | 'oled') {
    appState.darkModeIntensity = intensity;

    if (browser) {
        // Clear all dark mode attributes
        document.documentElement.removeAttribute('data-oled');
        document.documentElement.removeAttribute('data-dim');

        // Apply appropriate attribute based on intensity
        if (intensity === 'oled') {
            document.documentElement.setAttribute('data-oled', 'true');
        } else if (intensity === 'dim') {
            document.documentElement.setAttribute('data-dim', 'true');
        }
        // 'normal' uses default dracula theme with no overrides

        console.log('[Theme] Dark mode intensity:', intensity);
    }
}

export function updateTabState(noteId: number, updates: Partial<Tab>) {
    const tab = appState.openTabs.find(t => t.noteId === noteId);
    if (tab) {
        Object.assign(tab, updates);
    }
}

export function logout() {
    appState.token = null;
    appState.userId = null;
    appState.username = null;
    appState.openTabs = [];
    appState.activeNoteId = null;
    appState.folders = [];
    appState.notes = [];
    appState.scratchpadNote = null;
}

// Create new untitled note - like Ctrl+N in real text editors
// Each call creates a NEW separate tab (Untitled-1, Untitled-2, etc.)
export function createUntitledNote(): string {
    // Increment counter and generate unique ID
    appState.untitledCounter++;
    const untitledId = `untitled-${appState.untitledCounter}`;
    const title = `Untitled-${appState.untitledCounter}`;

    // Create the untitled note content
    appState.untitledNotes[untitledId] = {
        title,
        content: '',
        cursorPosition: 0,
        scrollTop: 0
    };

    // Add new tab for this untitled note
    appState.openTabs.push({
        noteId: untitledId,
        title,
        isDirty: false,
        cursorPosition: 0,
        scrollTop: 0
    });

    // Make it the active note
    appState.activeNoteId = untitledId;

    return untitledId;
}

// Legacy function - redirects to new system
export function createScratchpadNote() {
    createUntitledNote();
}

export function openScratchpad() {
    if (appState.scratchpadNote) {
        appState.activeNoteId = 'scratchpad';
    }
}

export function updateScratchpad(updates: Partial<ScratchpadNote>) {
    if (appState.scratchpadNote) {
        Object.assign(appState.scratchpadNote, updates);
        // Update tab title if title changed
        if (updates.title) {
            const tab = appState.openTabs.find(t => t.noteId === 'scratchpad');
            if (tab) tab.title = updates.title;
        }
    }
}

export function clearScratchpad() {
    appState.scratchpadNote = null;
    // Remove from tabs
    appState.openTabs = appState.openTabs.filter(t => t.noteId !== 'scratchpad');
    if (appState.activeNoteId === 'scratchpad') {
        appState.activeNoteId = appState.openTabs[0]?.noteId ?? null;
    }
}

// Validate persisted IDs on hydration
export function validatePersistedState() {
    // Remove tabs for notes that no longer exist
    const noteIds = new Set(appState.notes.map(n => n.id));
    appState.openTabs = appState.openTabs.filter(t => {
        // Keep scratchpad tab if scratchpad exists
        if (t.noteId === 'scratchpad') return !!appState.scratchpadNote;
        // Keep regular note tabs if note exists
        return noteIds.has(t.noteId as number);
    });

    // Clear activeNoteId if note doesn't exist
    if (appState.activeNoteId && appState.activeNoteId !== 'scratchpad') {
        if (!noteIds.has(appState.activeNoteId as number)) {
            appState.activeNoteId = appState.openTabs[0]?.noteId ?? null;
        }
    }

    // Remove expanded folder IDs that don't exist
    const folderIds = new Set(appState.folders.map(f => f.id));
    for (const id of appState.expandedFolderIds) {
        if (!folderIds.has(id)) {
            appState.expandedFolderIds.delete(id);
        }
    }
}

// ==================== Vertical Tabs Functions ====================

export function toggleVerticalTabs() {
    appState.verticalTabsEnabled = !appState.verticalTabsEnabled;
}

export function toggleVerticalTabsExpanded() {
    appState.verticalTabsExpanded = !appState.verticalTabsExpanded;
}

// ==================== Tab Selection Functions ====================

export function toggleTabSelection(noteId: number | string) {
    if (appState.selectedTabs.has(noteId)) {
        appState.selectedTabs.delete(noteId);
    } else {
        // Max 2 tabs for split view
        if (appState.selectedTabs.size >= 2) {
            // Remove the oldest selection
            const [first] = appState.selectedTabs;
            appState.selectedTabs.delete(first);
        }
        appState.selectedTabs.add(noteId);
    }
    // Force reactivity by reassigning
    appState.selectedTabs = new Set(appState.selectedTabs);
}

export function clearTabSelection() {
    appState.selectedTabs = new Set();
}

// ==================== Split View Functions ====================

export function enableSplitView() {
    if (appState.selectedTabs.size === 2) {
        const [left, right] = Array.from(appState.selectedTabs);
        appState.splitView = {
            enabled: true,
            leftNoteId: left,
            rightNoteId: right,
            splitRatio: 0.5,
            activePaneNoteId: left // Default to left pane
        };
        clearTabSelection();
    }
}

export function disableSplitView() {
    appState.splitView = null;
}

export function setActivePaneNoteId(noteId: number | string | null) {
    if (appState.splitView?.enabled) {
        appState.splitView.activePaneNoteId = noteId;
    }
}

export function toggleSplitView() {
    if (appState.splitView?.enabled) {
        disableSplitView();
    } else if (appState.selectedTabs.size === 2) {
        enableSplitView();
    }
}

export function setSplitRatio(ratio: number) {
    if (appState.splitView) {
        appState.splitView.splitRatio = Math.min(0.8, Math.max(0.2, ratio));
    }
}

// ==================== Tab Coloring Functions ====================

export function setTabColor(noteId: number | string, color: string) {
    appState.tabColors[noteId] = color;
}

export function clearTabColor(noteId: number | string) {
    delete appState.tabColors[noteId];
}

// ==================== Centralized Save Function ====================

/**
 * Get the active untitled note ID based on current state
 */
export function getActiveUntitledNoteId(): string | null {
    // Determine active pane in split view or regular mode
    const activeId = appState.splitView?.enabled
        ? appState.splitView.activePaneNoteId
        : appState.activeNoteId;

    // Check if it's an untitled note
    if (typeof activeId === 'string' && activeId.startsWith('untitled-')) {
        return activeId;
    }

    // Legacy scratchpad check
    if (activeId === 'scratchpad') {
        return 'scratchpad';
    }

    return null;
}

/**
 * Get the content of the active untitled note directly from state
 */
export function getActiveUntitledContent(): { noteId: string; content: string; title: string } | null {
    const noteId = getActiveUntitledNoteId();
    console.log("[getActiveUntitledContent] noteId:", noteId);
    console.log("[getActiveUntitledContent] activeNoteId:", appState.activeNoteId);
    console.log("[getActiveUntitledContent] splitView:", appState.splitView);
    console.log("[getActiveUntitledContent] untitledNotes keys:", Object.keys(appState.untitledNotes));

    if (!noteId) {
        console.warn("[getActiveUntitledContent] No active untitled note ID");
        return null;
    }

    if (noteId === 'scratchpad') {
        console.log("[getActiveUntitledContent] Using scratchpad");
        return appState.scratchpadNote
            ? { noteId, content: appState.scratchpadNote.content, title: appState.scratchpadNote.title }
            : null;
    }

    const untitled = appState.untitledNotes[noteId];
    console.log("[getActiveUntitledContent] Found untitled entry:", untitled ? "yes" : "no");
    if (untitled) {
        console.log("[getActiveUntitledContent] Content length:", untitled.content.length);
    }

    if (!untitled) {
        console.warn("[getActiveUntitledContent] No untitled note found for:", noteId);
        return null;
    }

    return { noteId, content: untitled.content, title: untitled.title };
}

/**
 * Close an untitled tab after it has been saved
 */
export function closeUntitledAfterSave(noteId: string) {
    if (noteId === 'scratchpad') {
        appState.scratchpadNote = null;
        appState.openTabs = appState.openTabs.filter(t => t.noteId !== 'scratchpad');
    } else {
        delete appState.untitledNotes[noteId];
        appState.openTabs = appState.openTabs.filter(t => t.noteId !== noteId);
    }
}
