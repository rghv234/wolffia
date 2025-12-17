/**
 * Wolffia - E2EE Crypto Module
 * Web Crypto API implementation for PBKDF2 + AES-GCM
 */

// Configuration
const PBKDF2_ITERATIONS = 600000; // High iteration count for security (compensates for not using Argon2)
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH = 256;

// Stored encryption key (derived from password + salt_encryption)
let encryptionKey: CryptoKey | null = null;

/**
 * Generate random bytes
 */
export function generateRandomBytes(length: number): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(length));
}

/**
 * Generate a random salt as Base64
 */
export function generateSalt(): string {
    return btoa(String.fromCharCode(...generateRandomBytes(SALT_LENGTH)));
}

/**
 * Derive a key from password using PBKDF2
 */
export async function deriveKey(
    password: string,
    salt: string,
    usage: KeyUsage[]
): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const saltBytes = Uint8Array.from(atob(salt), c => c.charCodeAt(0));

    // Import password as key material
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    // Derive the actual key
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: saltBytes,
            iterations: PBKDF2_ITERATIONS,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: KEY_LENGTH },
        true, // extractable for export
        usage
    );
}

/**
 * Derive both authentication and encryption keys
 */
export async function deriveKeys(
    password: string,
    saltAuth: string,
    saltEncryption: string
): Promise<{ keyA: CryptoKey; keyB: CryptoKey }> {
    const [keyA, keyB] = await Promise.all([
        deriveKey(password, saltAuth, ['encrypt']), // Auth key (sent to server as hash)
        deriveKey(password, saltEncryption, ['encrypt', 'decrypt']) // Encryption key (never leaves client)
    ]);

    return { keyA, keyB };
}

/**
 * Export key as Base64 for transmission (auth key only)
 */
export async function exportKeyAsBase64(key: CryptoKey): Promise<string> {
    const exported = await crypto.subtle.exportKey('raw', key);
    return btoa(String.fromCharCode(...new Uint8Array(exported)));
}

const ENCRYPTED_KEY_STORAGE = 'wolffia_encryption_key';

/**
 * Set the active encryption key and cache it for offline use
 */
export async function setEncryptionKey(key: CryptoKey): Promise<void> {
    encryptionKey = key;

    // Export and cache the key for offline use
    try {
        const exported = await crypto.subtle.exportKey('raw', key);
        const keyBase64 = btoa(String.fromCharCode(...new Uint8Array(exported)));
        localStorage.setItem(ENCRYPTED_KEY_STORAGE, keyBase64);
        console.log('[Crypto] Encryption key cached for offline use');
    } catch (e) {
        console.warn('[Crypto] Failed to cache encryption key:', e);
    }
}

/**
 * Restore encryption key from cache (call on page load)
 */
export async function restoreEncryptionKey(): Promise<boolean> {
    if (encryptionKey) {
        console.log('[Crypto] Encryption key already set');
        return true;
    }

    const cached = localStorage.getItem(ENCRYPTED_KEY_STORAGE);
    if (!cached) {
        console.log('[Crypto] No cached encryption key found in localStorage');
        return false;
    }

    try {
        // Convert Base64 back to raw key bytes
        const keyBytes = Uint8Array.from(atob(cached), c => c.charCodeAt(0));

        // Import as AES-GCM key
        encryptionKey = await crypto.subtle.importKey(
            'raw',
            keyBytes,
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
        );

        console.log('[Crypto] Encryption key restored from cache');
        return true;
    } catch (e) {
        console.error('[Crypto] Failed to restore encryption key:', e);
        localStorage.removeItem(ENCRYPTED_KEY_STORAGE);
        return false;
    }
}

/**
 * Clear the encryption key (on logout)
 */
export function clearEncryptionKey() {
    encryptionKey = null;
    localStorage.removeItem(ENCRYPTED_KEY_STORAGE);
}

/**
 * Check if encryption key is available
 */
export function hasEncryptionKey(): boolean {
    return encryptionKey !== null;
}

/**
 * Encrypt content using AES-GCM
 */
export async function encryptContent(plaintext: string): Promise<string> {
    if (!encryptionKey) {
        throw new Error('Encryption key not set');
    }

    const encoder = new TextEncoder();
    const iv = generateRandomBytes(IV_LENGTH);

    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
        encryptionKey,
        encoder.encode(plaintext)
    );

    // Combine IV + ciphertext and encode as Base64
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt content using AES-GCM
 */
export async function decryptContent(ciphertext: string): Promise<string> {
    if (!ciphertext) {
        return '';
    }

    // Handle unencrypted fallback (development mode or offline saves)
    if (ciphertext.startsWith('__UNENCRYPTED__')) {
        const base64 = ciphertext.slice('__UNENCRYPTED__'.length);
        return decodeURIComponent(escape(atob(base64)));
    }

    if (!encryptionKey) {
        throw new Error('Encryption key not set');
    }

    try {
        const decoder = new TextDecoder();
        const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));

        // Extract IV and ciphertext
        const iv = combined.slice(0, IV_LENGTH);
        const encrypted = combined.slice(IV_LENGTH);

        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            encryptionKey,
            encrypted
        );

        return decoder.decode(decrypted);
    } catch (e) {
        console.error('Decryption failed:', e);
        throw new Error('Failed to decrypt content');
    }
}

/**
 * Generate recovery codes and encrypt the salt_encryption
 */
export async function generateRecoveryCodes(
    saltEncryption: string,
    count: number = 5
): Promise<{ codes: string[]; encryptedSalts: string[] }> {
    const codes: string[] = [];
    const encryptedSalts: string[] = [];

    for (let i = 0; i < count; i++) {
        // Generate 8-character recovery code
        const codeBytes = generateRandomBytes(6);
        const code = btoa(String.fromCharCode(...codeBytes))
            .slice(0, 8)
            .toUpperCase()
            .replace(/[/+]/g, 'X');

        codes.push(code);

        // Encrypt salt_encryption with this recovery code
        const recoveryKey = await deriveKey(code, code, ['encrypt']);
        const iv = generateRandomBytes(IV_LENGTH);
        const encoder = new TextEncoder();

        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
            recoveryKey,
            encoder.encode(saltEncryption)
        );

        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(encrypted), iv.length);

        encryptedSalts.push(btoa(String.fromCharCode(...combined)));
    }

    return { codes, encryptedSalts };
}

/**
 * Recover salt_encryption using a recovery code
 */
export async function recoverSaltWithCode(
    recoveryCode: string,
    encryptedSalt: string
): Promise<string> {
    const code = recoveryCode.toUpperCase();
    const recoveryKey = await deriveKey(code, code, ['decrypt']);

    const combined = Uint8Array.from(atob(encryptedSalt), c => c.charCodeAt(0));
    const iv = combined.slice(0, IV_LENGTH);
    const encrypted = combined.slice(IV_LENGTH);

    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        recoveryKey,
        encrypted
    );

    return new TextDecoder().decode(decrypted);
}
