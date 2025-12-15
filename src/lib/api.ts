/**
 * Wolffia - API Client
 * HTTP client for Lapis backend with authentication
 */

import { appState } from './stores/app.svelte';

// Use env variable or fallback to localhost:3000
// Set VITE_API_URL to your Fly.io backend URL in production
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Debug: log API base on module load
console.log('[API] Base URL:', API_BASE);

interface ApiResponse<T> {
    data?: T;
    error?: string;
}

/**
 * Make an authenticated API request
 */
async function request<T>(
    method: string,
    path: string,
    body?: unknown
): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json'
    };

    if (appState.token) {
        headers['Authorization'] = `Bearer ${appState.token}`;
    }

    const url = `${API_BASE}${path}`;
    console.log('[API] Request:', method, url);

    try {
        const response = await fetch(url, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined
        });

        const text = await response.text();

        // Try to parse as JSON
        let data;
        try {
            data = JSON.parse(text);
        } catch (parseError) {
            console.error('[API] Response is not JSON:', text.substring(0, 200));
            return { error: `Server returned non-JSON response: ${text.substring(0, 100)}` };
        }

        if (!response.ok) {
            return { error: data.error || `HTTP ${response.status}` };
        }

        return { data };
    } catch (e) {
        console.error('[API] Network error:', e);
        return { error: e instanceof Error ? e.message : 'Network error' };
    }
}

// Auth API
export const auth = {
    async getParams(username: string) {
        return request<{ salt_auth: string; salt_encryption: string }>(
            'GET',
            `/auth/params?username=${encodeURIComponent(username)}`
        );
    },

    async register(data: {
        username: string;
        password_hash: string;
        salt_auth: string;
        salt_encryption: string;
    }) {
        return request<{ id: number; username: string }>('POST', '/auth/register', data);
    },

    async login(data: { username: string; password_hash: string }) {
        return request<{
            token: string;
            expires_at: string;
            user: { id: number; username: string };
        }>('POST', '/auth/login', data);
    },

    async logout() {
        return request<{ message: string }>('POST', '/auth/logout');
    },

    async getRecoveryStatus() {
        return request<{ setup_complete: boolean; unused_codes: number }>(
            'GET',
            '/auth/recovery/status'
        );
    },

    async generateRecoveryCodes(encrypted_salt: string) {
        return request<{ codes: string[]; message: string }>(
            'POST',
            '/auth/recovery/generate',
            { encrypted_salt }
        );
    },

    async verifyRecoveryCode(username: string, recovery_code: string) {
        return request<{
            encrypted_salt: string;
            salt_auth: string;
            remaining_codes: number;
        }>('POST', '/auth/recovery/verify', { username, recovery_code });
    }
};

// Folders API
export const folders = {
    async list() {
        return request<Array<{
            id: number;
            parent_id: number | null;
            name: string;
            icon?: string;
            color?: string;
            rank: number;
        }>>('GET', '/api/folders');
    },

    async create(data: { name: string; parent_id?: number; icon?: string; color?: string }) {
        return request<{ id: number }>('POST', '/api/folders', data);
    },

    async update(id: number, data: Partial<{ name: string; parent_id: number; icon: string; color: string; rank: number }>) {
        return request<{ id: number }>('PUT', `/api/folders/${id}`, data);
    },

    async delete(id: number) {
        return request<{ message: string }>('DELETE', `/api/folders/${id}`);
    }
};

// Notes API
export const notes = {
    async list(folderId?: number) {
        const query = folderId ? `?folder_id=${folderId}` : '';
        return request<Array<{
            id: number;
            folder_id: number | null;
            title: string;
            content_blob: string;
            icon?: string;
            color?: string;
            updated_at: string;
        }>>('GET', `/api/notes${query}`);
    },

    async get(id: number) {
        return request<{
            id: number;
            folder_id: number | null;
            title: string;
            content_blob: string;
            icon?: string;
            color?: string;
            updated_at: string;
        }>('GET', `/api/notes/${id}`);
    },

    async create(data: { title: string; folder_id?: number; content_blob: string }) {
        return request<{ id: number }>('POST', '/api/notes', data);
    },

    async update(id: number, data: Partial<{ title: string; folder_id: number; content_blob: string; icon: string; color: string }>) {
        return request<{ id: number }>('PUT', `/api/notes/${id}`, data);
    },

    async delete(id: number) {
        return request<{ message: string }>('DELETE', `/api/notes/${id}`);
    }
};

// SSE for real-time sync
export function createEventSource(onMessage: (event: MessageEvent) => void): EventSource | null {
    if (!appState.token) return null;

    const eventSource = new EventSource(`${API_BASE}/events?token=${appState.token}`);

    eventSource.onmessage = onMessage;
    eventSource.onerror = (e) => {
        console.error('SSE error:', e);
    };

    return eventSource;
}

// Settings types
export interface UserSettings {
    theme: 'light' | 'dark' | 'system';
    darkModeIntensity: 'normal' | 'dim' | 'oled';
    accentColor: string;
    editorFontSize: number;
    verticalTabsEnabled: boolean;
}

// Settings API
export const settings = {
    async get() {
        return request<UserSettings>('GET', '/settings');
    },

    async update(data: Partial<UserSettings>) {
        return request<UserSettings>('PUT', '/settings', data);
    }
};
