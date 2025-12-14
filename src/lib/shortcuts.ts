/**
 * Wolffia - Keyboard Shortcuts
 * Global shortcut handler with Notepad parity
 */

// Browser detection (works in .ts files)
const browser = typeof window !== 'undefined';
import { appState, closeTab } from './stores/app.svelte';
import { createNote, saveNote } from './sync';

// Shortcut definitions
export interface Shortcut {
    key: string;
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;
    action: () => void;
    description: string;
}

// State for UI visibility (plain variables, not runes since this is .ts not .svelte.ts)
let findVisible = false;
let replaceVisible = false;

export function getFindVisible() { return findVisible; }
export function setFindVisible(v: boolean) { findVisible = v; }
export function getReplaceVisible() { return replaceVisible; }
export function setReplaceVisible(v: boolean) { replaceVisible = v; }

// Default shortcuts (can be overridden by user)
export interface ShortcutDefinition {
    id: string;
    defaultKey: string;
    defaultCtrl?: boolean;
    defaultShift?: boolean;
    defaultAlt?: boolean;
    action: () => void;
    description: string;
}

// Shortcut registry with IDs for customization
const defaultShortcuts: ShortcutDefinition[] = [
    {
        id: 'newNote',
        defaultKey: 'n',
        defaultCtrl: true,
        action: () => handleNewNote(),
        description: 'New Note'
    },
    {
        id: 'save',
        defaultKey: 's',
        defaultCtrl: true,
        action: () => handleSave(),
        description: 'Save'
    },
    {
        id: 'saveAs',
        defaultKey: 's',
        defaultCtrl: true,
        defaultShift: true,
        action: () => handleSaveAs(),
        description: 'Save As / Export'
    },
    {
        id: 'closeTab',
        defaultKey: 'w',
        defaultCtrl: true,
        action: () => handleCloseTab(),
        description: 'Close Tab'
    },
    {
        id: 'find',
        defaultKey: 'f',
        defaultCtrl: true,
        action: () => handleFind(),
        description: 'Find'
    },
    {
        id: 'replace',
        defaultKey: 'h',
        defaultCtrl: true,
        action: () => handleReplace(),
        description: 'Find and Replace'
    },
    {
        id: 'nextTab',
        defaultKey: 'Tab',
        defaultCtrl: true,
        action: () => handleNextTab(),
        description: 'Next Tab'
    },
    {
        id: 'prevTab',
        defaultKey: 'Tab',
        defaultCtrl: true,
        defaultShift: true,
        action: () => handlePrevTab(),
        description: 'Previous Tab'
    },
    {
        id: 'zoomIn',
        defaultKey: '=',
        defaultCtrl: true,
        action: () => handleZoomIn(),
        description: 'Zoom In'
    },
    {
        id: 'zoomOut',
        defaultKey: '-',
        defaultCtrl: true,
        action: () => handleZoomOut(),
        description: 'Zoom Out'
    },
    {
        id: 'zoomReset',
        defaultKey: '0',
        defaultCtrl: true,
        action: () => handleZoomReset(),
        description: 'Reset Zoom'
    }
];

/**
 * Get effective shortcut binding (custom or default)
 */
function getEffectiveBinding(def: ShortcutDefinition): Shortcut {
    const custom = appState.customShortcuts?.[def.id];
    return {
        key: custom?.key ?? def.defaultKey,
        ctrl: custom?.ctrl ?? def.defaultCtrl,
        shift: custom?.shift ?? def.defaultShift,
        alt: custom?.alt ?? def.defaultAlt,
        action: def.action,
        description: def.description
    };
}

/**
 * Get all shortcuts with effective bindings
 */
export function getShortcuts(): Shortcut[] {
    return defaultShortcuts.map(getEffectiveBinding);
}

/**
 * Get default shortcut definitions for settings UI
 */
export function getShortcutDefinitions(): ShortcutDefinition[] {
    return defaultShortcuts;
}

// Action handlers
function handleNewNote() {
    // Import dynamically to avoid circular dependency issues
    // Creates a NEW untitled tab (like Ctrl+N in real text editors)
    import('./stores/app.svelte').then(({ createUntitledNote }) => {
        createUntitledNote();
    });
}

async function handleSave() {
    const activeId = appState.activeNoteId;

    // For untitled notes, open the save modal
    if (typeof activeId === 'string' && activeId.startsWith('untitled-')) {
        document.dispatchEvent(new CustomEvent('wolffia:open-save-modal'));
        return;
    }

    // Legacy scratchpad support
    if (activeId === 'scratchpad' && appState.scratchpadNote) {
        document.dispatchEvent(new CustomEvent('wolffia:open-save-modal'));
        return;
    }

    // For existing notes, trigger save event
    const activeNote = appState.notes.find(n => n.id === appState.activeNoteId);
    if (activeNote) {
        document.dispatchEvent(new CustomEvent('wolffia:save'));
    }
}

function handleSaveAs() {
    // Open export modal
    document.dispatchEvent(new CustomEvent('wolffia:export'));
}

function handleCloseTab() {
    if (appState.activeNoteId) {
        const activeId = appState.activeNoteId;

        if (typeof activeId === 'string' && activeId.startsWith('untitled-')) {
            // Close untitled note
            delete appState.untitledNotes[activeId];
            appState.openTabs = appState.openTabs.filter(t => t.noteId !== activeId);
            appState.activeNoteId = appState.openTabs[0]?.noteId ?? null;
        } else if (activeId === 'scratchpad') {
            // Legacy scratchpad
            appState.scratchpadNote = null;
            appState.openTabs = appState.openTabs.filter(t => t.noteId !== 'scratchpad');
            appState.activeNoteId = appState.openTabs[0]?.noteId ?? null;
        } else if (typeof activeId === 'number') {
            closeTab(activeId);
        }
    }
}

function handleFind() {
    findVisible = true;
    replaceVisible = false;
    document.dispatchEvent(new CustomEvent('wolffia:find'));
}

function handleReplace() {
    findVisible = true;
    replaceVisible = true;
    document.dispatchEvent(new CustomEvent('wolffia:replace'));
}

function handleNextTab() {
    if (appState.openTabs.length <= 1) return;

    const currentIndex = appState.openTabs.findIndex(t => t.noteId === appState.activeNoteId);
    const nextIndex = (currentIndex + 1) % appState.openTabs.length;
    appState.activeNoteId = appState.openTabs[nextIndex].noteId;
}

function handlePrevTab() {
    if (appState.openTabs.length <= 1) return;

    const currentIndex = appState.openTabs.findIndex(t => t.noteId === appState.activeNoteId);
    const prevIndex = (currentIndex - 1 + appState.openTabs.length) % appState.openTabs.length;
    appState.activeNoteId = appState.openTabs[prevIndex].noteId;
}

function handleZoomIn() {
    appState.editorFontSize = Math.min(appState.editorFontSize + 2, 32);
    updateEditorZoom();
}

function handleZoomOut() {
    appState.editorFontSize = Math.max(appState.editorFontSize - 2, 8);
    updateEditorZoom();
}

function handleZoomReset() {
    appState.editorFontSize = 14;
    updateEditorZoom();
}

function updateEditorZoom() {
    if (browser) {
        document.documentElement.style.setProperty('--editor-font-size', `${appState.editorFontSize}px`);
    }
}

/**
 * Check if event matches shortcut
 */
function matchesShortcut(e: KeyboardEvent, shortcut: Shortcut): boolean {
    const ctrlMatch = !!shortcut.ctrl === (e.ctrlKey || e.metaKey);
    const shiftMatch = !!shortcut.shift === e.shiftKey;
    const altMatch = !!shortcut.alt === e.altKey;
    const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();

    return ctrlMatch && shiftMatch && altMatch && keyMatch;
}

/**
 * Global keyboard event handler
 */
export function handleGlobalKeydown(e: KeyboardEvent) {
    // Only process shortcuts when Ctrl/Cmd is pressed
    if (!e.ctrlKey && !e.metaKey) return;

    console.log('[Shortcuts] Key event:', e.key, 'ctrl:', e.ctrlKey, 'shift:', e.shiftKey);

    const shortcuts = getShortcuts();
    for (const shortcut of shortcuts) {
        if (matchesShortcut(e, shortcut)) {
            console.log('[Shortcuts] Matched:', shortcut.description);
            e.preventDefault();
            e.stopPropagation();
            shortcut.action();
            return;
        }
    }
}

/**
 * Initialize keyboard shortcuts
 */
export function initKeyboardShortcuts() {
    if (!browser) return;

    window.addEventListener('keydown', handleGlobalKeydown);

    // Cleanup function
    return () => {
        window.removeEventListener('keydown', handleGlobalKeydown);
    };
}

/**
 * Format shortcut for display
 */
export function formatShortcut(shortcut: Shortcut): string {
    const parts: string[] = [];
    if (shortcut.ctrl) parts.push('Ctrl');
    if (shortcut.shift) parts.push('Shift');
    if (shortcut.alt) parts.push('Alt');
    parts.push(shortcut.key.toUpperCase());
    return parts.join('+');
}
