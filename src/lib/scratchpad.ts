/**
 * Wolffia - Scratchpad Logic
 * Temporary note that persists locally but not to server
 */

// Browser detection (works in .ts files)
const browser = typeof window !== 'undefined';

const SCRATCHPAD_KEY = 'wolffia_scratchpad';

interface ScratchpadState {
    content: string;
    cursorPosition: number;
    scrollTop: number;
    lastModified: string;
}

// Scratchpad state
let scratchpadContent = $state('');
let scratchpadCursor = $state(0);
let scratchpadScroll = $state(0);

/**
 * Load scratchpad from localStorage
 */
export function loadScratchpad(): ScratchpadState {
    if (!browser) {
        return { content: '', cursorPosition: 0, scrollTop: 0, lastModified: '' };
    }

    try {
        const stored = localStorage.getItem(SCRATCHPAD_KEY);
        if (stored) {
            const state = JSON.parse(stored) as ScratchpadState;
            scratchpadContent = state.content;
            scratchpadCursor = state.cursorPosition;
            scratchpadScroll = state.scrollTop;
            return state;
        }
    } catch (e) {
        console.warn('Failed to load scratchpad:', e);
    }

    return { content: '', cursorPosition: 0, scrollTop: 0, lastModified: '' };
}

/**
 * Save scratchpad to localStorage
 */
export function saveScratchpad(content: string, cursorPosition: number = 0, scrollTop: number = 0) {
    if (!browser) return;

    scratchpadContent = content;
    scratchpadCursor = cursorPosition;
    scratchpadScroll = scrollTop;

    const state: ScratchpadState = {
        content,
        cursorPosition,
        scrollTop,
        lastModified: new Date().toISOString()
    };

    try {
        localStorage.setItem(SCRATCHPAD_KEY, JSON.stringify(state));
    } catch (e) {
        console.warn('Failed to save scratchpad:', e);
    }
}

/**
 * Clear scratchpad
 */
export function clearScratchpad() {
    scratchpadContent = '';
    scratchpadCursor = 0;
    scratchpadScroll = 0;

    if (browser) {
        localStorage.removeItem(SCRATCHPAD_KEY);
    }
}

/**
 * Get current scratchpad content
 */
export function getScratchpadContent(): string {
    return scratchpadContent;
}

/**
 * Get scratchpad cursor position
 */
export function getScratchpadCursor(): number {
    return scratchpadCursor;
}

/**
 * Get scratchpad scroll position
 */
export function getScratchpadScroll(): number {
    return scratchpadScroll;
}

/**
 * Check if scratchpad has content
 */
export function hasScratchpadContent(): boolean {
    return scratchpadContent.trim().length > 0;
}

/**
 * Promote scratchpad to a real note
 * Returns the content and clears the scratchpad
 */
export function promoteScratchpad(): string {
    const content = scratchpadContent;
    clearScratchpad();
    return content;
}
