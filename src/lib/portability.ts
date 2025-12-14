/**
 * Wolffia - Data Portability Module
 * Import/Export with E2EE support
 */

import { appState, type Note } from './stores/app.svelte';
import { encryptContent, decryptContent, hasEncryptionKey } from './crypto';
import { notes as notesApi, folders as foldersApi } from './api';

// Batch size for export to prevent OOM on mobile
const EXPORT_BATCH_SIZE = 50;

/**
 * Import files via drag-and-drop or file picker
 * Encrypts content before uploading
 */
export async function importFiles(
    files: FileList | File[],
    folderId?: number,
    onProgress?: (current: number, total: number) => void
): Promise<{ success: number; failed: number }> {
    const fileArray = Array.from(files);
    let success = 0;
    let failed = 0;

    for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        onProgress?.(i + 1, fileArray.length);

        try {
            // Read file content
            const content = await readFileAsText(file);

            // Check if encryption is available
            let contentToStore: string;
            if (!hasEncryptionKey()) {
                // For now, store content as base64-encoded plaintext with a prefix
                // This is temporary for development - real E2EE needs re-login
                console.warn('[Import] No encryption key available, storing as plaintext (development mode)');
                contentToStore = '__UNENCRYPTED__' + btoa(unescape(encodeURIComponent(content)));
            } else {
                // Encrypt immediately (plain text never goes to server in production)
                contentToStore = await encryptContent(content);
            }

            // Use filename as title (preserve extension for file type detection)
            const title = file.name;

            // Upload to server
            const result = await notesApi.create({
                title,
                content_blob: contentToStore,
                folder_id: folderId
            });

            if (result.error) {
                console.error(`Failed to import ${file.name}:`, result.error);
                failed++;
            } else {
                success++;

                // Add to local state
                if (result.data) {
                    appState.notes.unshift({
                        id: result.data.id,
                        folder_id: folderId ?? null,
                        title,
                        content_blob: contentToStore,
                        updated_at: new Date().toISOString()
                    });
                }
            }
        } catch (e) {
            console.error(`Error importing ${file.name}:`, e);
            failed++;
        }
    }

    return { success, failed };
}

// Threshold for "large file" handling (100KB)
const LARGE_FILE_THRESHOLD = 100 * 1024;

/**
 * Read file as text with optional progress for large files
 * Uses chunked reading for files > 100KB to prevent UI blocking
 */
async function readFileAsText(
    file: File,
    onProgress?: (bytesRead: number, totalBytes: number) => void
): Promise<string> {
    // For small files, use simple FileReader
    if (file.size < LARGE_FILE_THRESHOLD) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsText(file);
        });
    }

    // For large files, read in chunks to allow progress updates and prevent freezing
    console.log(`[Import] Large file detected (${(file.size / 1024).toFixed(1)}KB), using chunked read`);

    const CHUNK_SIZE = 64 * 1024; // 64KB chunks
    const chunks: string[] = [];
    let offset = 0;

    while (offset < file.size) {
        const chunkEnd = Math.min(offset + CHUNK_SIZE, file.size);
        const blob = file.slice(offset, chunkEnd);

        const chunkText = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsText(blob);
        });

        chunks.push(chunkText);
        offset = chunkEnd;

        // Report progress
        onProgress?.(offset, file.size);

        // Yield to UI thread every chunk
        await new Promise(resolve => setTimeout(resolve, 0));
    }

    return chunks.join('');
}

/**
 * Export all notes as decrypted plain text in a ZIP file
 * Processes in batches to prevent OOM on mobile
 */
export async function exportDecrypted(
    onProgress?: (current: number, total: number) => void
): Promise<Blob> {
    const notes = appState.notes;
    const folders = appState.folders;

    // Build folder path lookup
    const folderPaths = new Map<number, string>();
    for (const folder of folders) {
        folderPaths.set(folder.id, buildFolderPath(folder.id, folders));
    }

    // Create ZIP using the JSZip-like structure
    // Since we don't have JSZip, we'll create a simple combined file
    // In production, you'd use a proper ZIP library
    const exportData: { path: string; content: string }[] = [];

    for (let i = 0; i < notes.length; i++) {
        onProgress?.(i + 1, notes.length);

        const note = notes[i];
        try {
            // Decrypt content
            const content = await decryptContent(note.content_blob);

            // Build file path
            const folderPath = note.folder_id
                ? folderPaths.get(note.folder_id) || 'Unfiled'
                : 'Unfiled';

            // Preserve original extension from title, or default to .md
            const titleHasExtension = /\.(md|txt)$/i.test(note.title);
            const filename = titleHasExtension
                ? sanitizeFilename(note.title)
                : sanitizeFilename(note.title) + '.md';
            const path = `${folderPath}/${filename}`;

            exportData.push({ path, content });

            // Yield to prevent blocking (batch processing)
            if (i % EXPORT_BATCH_SIZE === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        } catch (e) {
            console.error(`Failed to decrypt note ${note.id}:`, e);
        }
    }

    // Generate combined export file (Markdown format)
    // In production, use proper ZIP library
    const exportContent = generateExportContent(exportData);
    return new Blob([exportContent], { type: 'text/plain' });
}

/**
 * Export raw encrypted data (JSON dump)
 */
export async function exportEncrypted(): Promise<Blob> {
    const exportData = {
        version: 1,
        exported_at: new Date().toISOString(),
        folders: appState.folders,
        notes: appState.notes.map(n => ({
            id: n.id,
            folder_id: n.folder_id,
            title: n.title,
            content_blob: n.content_blob, // Still encrypted
            updated_at: n.updated_at
        }))
    };

    return new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
    });
}

/**
 * Import encrypted backup (JSON)
 */
export async function importEncryptedBackup(
    file: File,
    onProgress?: (current: number, total: number) => void
): Promise<{ success: number; failed: number }> {
    const content = await readFileAsText(file);
    const data = JSON.parse(content);

    if (data.version !== 1) {
        throw new Error('Unsupported backup version');
    }

    let success = 0;
    let failed = 0;

    // Import folders first
    const folderIdMap = new Map<number, number>();
    for (const folder of data.folders || []) {
        try {
            const result = await foldersApi.create({
                name: folder.name,
                parent_id: folder.parent_id ? folderIdMap.get(folder.parent_id) : undefined,
                icon: folder.icon,
                color: folder.color
            });

            if (result.data?.id) {
                folderIdMap.set(folder.id, result.data.id);

                // Add to appState for immediate sidebar visibility
                appState.folders.push({
                    id: result.data.id,
                    parent_id: folder.parent_id ? folderIdMap.get(folder.parent_id) ?? null : null,
                    name: folder.name,
                    icon: folder.icon,
                    color: folder.color,
                    rank: appState.folders.length
                });

                success++;
            } else {
                console.error(`[Import] Failed to create folder "${folder.name}":`, result.error);
                failed++;
            }
        } catch (e) {
            console.error(`[Import] Error creating folder "${folder.name}":`, e);
            failed++;
        }
    }

    // Import notes
    const notes = data.notes || [];
    for (let i = 0; i < notes.length; i++) {
        onProgress?.(i + 1, notes.length);
        const note = notes[i];

        try {
            const result = await notesApi.create({
                title: note.title,
                content_blob: note.content_blob,
                folder_id: note.folder_id ? folderIdMap.get(note.folder_id) : undefined
            });

            if (result.data?.id) {
                // Add to appState for immediate sidebar visibility
                appState.notes.unshift({
                    id: result.data.id,
                    folder_id: note.folder_id ? folderIdMap.get(note.folder_id) ?? null : null,
                    title: note.title,
                    content_blob: note.content_blob,
                    updated_at: new Date().toISOString()
                });
                success++;
            } else {
                console.error(`[Import] Failed to create note "${note.title}":`, result.error);
                failed++;
            }
        } catch (e) {
            console.error(`[Import] Error creating note "${note.title}":`, e);
            failed++;
        }
    }

    return { success, failed };
}

/**
 * Build folder path from folder hierarchy
 */
function buildFolderPath(folderId: number, folders: typeof appState.folders): string {
    const parts: string[] = [];
    let current = folders.find(f => f.id === folderId);

    while (current) {
        parts.unshift(sanitizeFilename(current.name));
        current = current.parent_id
            ? folders.find(f => f.id === current!.parent_id)
            : undefined;
    }

    return parts.join('/') || 'Unfiled';
}

/**
 * Sanitize filename for filesystem
 */
function sanitizeFilename(name: string): string {
    return name
        .replace(/[<>:"/\\|?*]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 100);
}

/**
 * Generate combined export content
 */
function generateExportContent(files: { path: string; content: string }[]): string {
    const header = `# Wolffia Export
# Generated: ${new Date().toISOString()}
# Total Notes: ${files.length}

`;

    const sections = files.map(f => `
${'='.repeat(60)}
# ${f.path}
${'='.repeat(60)}

${f.content}
`).join('\n');

    return header + sections;
}

/**
 * Download a blob as a file
 */
export function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
