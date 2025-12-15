<!--
  Wolffia - Sidebar Component
  Folder tree with notes, context menus, and color support
-->
<script lang="ts">
    import {
        Folder,
        File,
        ChevronRight,
        Plus,
        Settings,
        Upload,
        FolderPlus,
        MoreVertical,
        Trash2,
        Edit,
        FolderInput,
    } from "@lucide/svelte";
    import {
        appState,
        openNote,
        toggleFolder,
        createUntitledNote,
        type Folder as FolderType,
        type Note,
    } from "$lib/stores/app.svelte";
    import { createFolder, deleteFolder } from "$lib/sync";
    import { notes as notesApi, folders } from "$lib/api";
    import ThemeController from "./ThemeController.svelte";
    import FolderModal from "./FolderModal.svelte";

    let { onSettingsClick = () => {}, onImportExportClick = () => {} } =
        $props<{
            onSettingsClick?: () => void;
            onImportExportClick?: () => void;
        }>();

    // Folder modal state
    let showFolderModal = $state(false);
    let editingFolder = $state<FolderType | null>(null);

    // Context menu state
    let contextMenu = $state<{
        x: number;
        y: number;
        type: "folder" | "note";
        item: FolderType | Note;
    } | null>(null);

    // Drag and drop state
    let draggedNoteId = $state<number | null>(null);
    let dragOverFolderId = $state<number | null>(null);

    // Rename/Delete modal state
    let showRenameModal = $state(false);
    let showDeleteModal = $state(false);
    let pendingNote = $state<Note | null>(null);
    let newNoteName = $state("");
    let renameDialogEl = $state<HTMLDialogElement | null>(null);
    let deleteDialogEl = $state<HTMLDialogElement | null>(null);

    // Modal handlers
    function openRenameModal(note: Note) {
        pendingNote = note;
        newNoteName = note.title;
        showRenameModal = true;
        closeContextMenu();
        setTimeout(() => renameDialogEl?.showModal(), 0);
    }

    function openDeleteModal(note: Note) {
        pendingNote = note;
        showDeleteModal = true;
        closeContextMenu();
        setTimeout(() => deleteDialogEl?.showModal(), 0);
    }

    async function confirmRename() {
        if (pendingNote && newNoteName.trim()) {
            try {
                await notesApi.update(pendingNote.id, {
                    title: newNoteName.trim(),
                });
                const noteIndex = appState.notes.findIndex(
                    (n) => n.id === pendingNote!.id,
                );
                if (noteIndex >= 0) {
                    appState.notes[noteIndex].title = newNoteName.trim();
                }
            } catch (e) {
                console.error("Rename failed:", e);
            }
        }
        showRenameModal = false;
        renameDialogEl?.close();
        pendingNote = null;
    }

    async function confirmDelete() {
        if (pendingNote) {
            try {
                console.log("[Sidebar] Deleting note:", pendingNote.id);
                const result = await notesApi.delete(pendingNote.id);
                console.log("[Sidebar] Delete result:", result);

                if (result.error) {
                    console.error("[Sidebar] Delete API error:", result.error);
                    alert("Failed to delete note: " + result.error);
                    return;
                }

                // Use filter instead of splice for proper Svelte 5 reactivity
                const deletedNoteId = pendingNote!.id;
                appState.notes = appState.notes.filter(
                    (n) => n.id !== deletedNoteId,
                );

                // Close tab if open
                appState.openTabs = appState.openTabs.filter(
                    (t) => t.noteId !== deletedNoteId,
                );
                if (appState.activeNoteId === deletedNoteId) {
                    appState.activeNoteId =
                        appState.openTabs[0]?.noteId ?? null;
                }
                console.log("[Sidebar] Note deleted successfully");
            } catch (e) {
                console.error("[Sidebar] Delete exception:", e);
                alert(
                    "Delete failed: " +
                        (e instanceof Error ? e.message : "Unknown error"),
                );
            }
        }
        showDeleteModal = false;
        deleteDialogEl?.close();
        pendingNote = null;
    }

    function cancelRename() {
        showRenameModal = false;
        renameDialogEl?.close();
        pendingNote = null;
    }

    function cancelDelete() {
        showDeleteModal = false;
        deleteDialogEl?.close();
        pendingNote = null;
    }

    // Drag handlers
    function handleNoteDragStart(e: DragEvent, noteId: number) {
        draggedNoteId = noteId;
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", String(noteId));
        }
    }

    function handleNoteDragEnd() {
        draggedNoteId = null;
        dragOverFolderId = null;
    }

    function handleFolderDragOver(e: DragEvent, folderId: number | null) {
        e.preventDefault();
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = "move";
        }
        dragOverFolderId = folderId;
    }

    function handleFolderDragLeave() {
        dragOverFolderId = null;
    }

    async function handleFolderDrop(e: DragEvent, folderId: number | null) {
        e.preventDefault();
        if (draggedNoteId !== null) {
            await moveNoteToFolder(draggedNoteId, folderId);
        }
        draggedNoteId = null;
        dragOverFolderId = null;
    }

    // Computed: Build folder tree
    let folderTree = $derived.by(() => {
        const folders = Array.isArray(appState.folders) ? appState.folders : [];
        const rootFolders = folders.filter((f) => f.parent_id === null);
        return rootFolders.sort(
            (a, b) => a.rank - b.rank || a.name.localeCompare(b.name),
        );
    });

    // Computed: Root-level notes (no folder)
    let rootNotes = $derived.by(() => {
        const notes = Array.isArray(appState.notes) ? appState.notes : [];
        return notes
            .filter((n) => n.folder_id === null)
            .sort(
                (a, b) =>
                    new Date(b.updated_at).getTime() -
                    new Date(a.updated_at).getTime(),
            );
    });

    // Get child folders
    function getChildFolders(parentId: number) {
        const folders = Array.isArray(appState.folders) ? appState.folders : [];
        return folders
            .filter((f) => f.parent_id === parentId)
            .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
    }

    // Get notes in folder
    function getFolderNotes(folderId: number) {
        const notes = Array.isArray(appState.notes) ? appState.notes : [];
        return notes
            .filter((n) => n.folder_id === folderId)
            .sort(
                (a, b) =>
                    new Date(b.updated_at).getTime() -
                    new Date(a.updated_at).getTime(),
            );
    }

    function handleNewNote() {
        createUntitledNote();
    }

    async function handleCreateFolder(name: string, color: string) {
        if (editingFolder) {
            // Update existing folder via API
            try {
                const result = await folders.update(editingFolder.id, {
                    name,
                    color,
                });
                if (result.data) {
                    // Update local state
                    const folderIndex = appState.folders.findIndex(
                        (f) => f.id === editingFolder!.id,
                    );
                    if (folderIndex >= 0) {
                        appState.folders[folderIndex].name = name;
                        appState.folders[folderIndex].color = color;
                    }
                }
            } catch (e) {
                console.error("Failed to update folder:", e);
            }
        } else {
            await createFolder(name, undefined, color);
        }
        editingFolder = null;
    }

    async function handleDeleteFolder() {
        if (editingFolder) {
            await deleteFolder(editingFolder.id);
            editingFolder = null;
        }
    }

    function handleOpenScratchpad() {
        createUntitledNote();
    }

    // Right-click and long-press context menu
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;

    function handleFolderContextMenu(e: MouseEvent, folder: FolderType) {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, "folder", folder);
    }

    function handleNoteContextMenu(e: MouseEvent, note: Note) {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, "note", note);
    }

    // Long-press for mobile
    function handleTouchStart(
        type: "folder" | "note",
        item: FolderType | Note,
        e: TouchEvent,
    ) {
        const touch = e.touches[0];
        longPressTimer = setTimeout(() => {
            showContextMenu(touch.clientX, touch.clientY, type, item);
        }, 500);
    }

    function handleTouchEnd() {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    }

    function showContextMenu(
        x: number,
        y: number,
        type: "folder" | "note",
        item: FolderType | Note,
    ) {
        contextMenu = { x, y, type, item };
    }

    function closeContextMenu() {
        contextMenu = null;
    }

    async function moveNoteToFolder(noteId: number, folderId: number | null) {
        // Update note's folder_id (convert null to undefined for API)
        await notesApi.update(noteId, { folder_id: folderId ?? undefined });
        // Reload data
        const noteIndex = appState.notes.findIndex((n) => n.id === noteId);
        if (noteIndex >= 0) {
            appState.notes[noteIndex].folder_id = folderId;
        }
        closeContextMenu();
    }
</script>

<svelte:window onclick={closeContextMenu} />

<aside class="sidebar bg-base-200 w-80 min-h-full flex flex-col">
    <!-- Sidebar Header -->
    <div class="p-4 border-b border-base-300 flex items-center justify-between">
        <span class="text-xl font-bold text-primary">Wolffia</span>
        <div class="flex items-center gap-1">
            <ThemeController class="hidden lg:flex" />
            <button
                class="btn btn-ghost btn-sm btn-square"
                aria-label="Import/Export"
                onclick={onImportExportClick}
            >
                <Upload size={18} />
            </button>
            <button
                class="btn btn-ghost btn-sm btn-square"
                aria-label="Settings"
                onclick={onSettingsClick}
            >
                <Settings size={18} />
            </button>
            <!-- Desktop collapse button -->
            <button
                class="btn btn-ghost btn-sm btn-square hidden lg:flex"
                aria-label="Collapse sidebar"
                onclick={() => (appState.sidebarVisible = false)}
                title="Collapse sidebar"
            >
                <ChevronRight size={18} class="rotate-180" />
            </button>
        </div>
    </div>

    <!-- Action Buttons -->
    <div class="p-2 flex gap-2">
        <!-- New Note button hidden on mobile (FAB handles it) -->
        <button
            class="btn btn-primary btn-sm flex-1 gap-2 hidden sm:flex"
            onclick={handleNewNote}
        >
            <Plus size={16} />
            New Note
        </button>
        <!-- New Folder button - expands to full width on mobile when New Note is hidden -->
        <button
            class="btn btn-ghost btn-sm gap-2 sm:btn-square flex-1 sm:flex-none"
            aria-label="New Folder"
            onclick={() => {
                editingFolder = null;
                showFolderModal = true;
            }}
        >
            <FolderPlus size={16} />
            <span class="sm:hidden">New Folder</span>
        </button>
    </div>

    <!-- Folder Tree -->
    <nav class="flex-1 overflow-y-auto p-2 folder-tree">
        <!-- Unsaved notes section (all untitled notes) -->
        {#if Object.keys(appState.untitledNotes).length > 0}
            <div class="mb-2 pb-2 border-b border-base-300">
                <p class="px-3 py-1 text-xs text-base-content/50 uppercase">
                    Unsaved
                </p>
                {#each Object.entries(appState.untitledNotes) as [id, note] (id)}
                    <button
                        class="w-full py-2 px-3 flex items-center gap-2 hover:bg-base-300 rounded-lg text-left {appState.activeNoteId ===
                        id
                            ? 'bg-primary/10 text-primary'
                            : ''}"
                        onclick={() => {
                            appState.activeNoteId = id;
                        }}
                    >
                        <File size={16} class="text-warning" />
                        <span class="text-sm truncate italic"
                            >{note.title || "Untitled"}</span
                        >
                        <span class="badge badge-xs badge-warning ml-auto"
                            >unsaved</span
                        >
                    </button>
                {/each}
            </div>
        {/if}

        <!-- Root Folders -->
        {#each folderTree as folder (folder.id)}
            {@const children = getChildFolders(folder.id)}
            {@const notes = getFolderNotes(folder.id)}
            {@const isExpanded = appState.expandedFolderIds.has(folder.id)}

            <details open={isExpanded} class="collapse">
                <summary
                    class="collapse-title min-h-0 py-2 px-3 flex items-center gap-2 hover:bg-base-300 rounded-lg cursor-pointer group {dragOverFolderId ===
                    folder.id
                        ? 'bg-primary/20 ring-2 ring-primary'
                        : ''}"
                    onclick={() => toggleFolder(folder.id)}
                    oncontextmenu={(e) => handleFolderContextMenu(e, folder)}
                    ontouchstart={(e) => handleTouchStart("folder", folder, e)}
                    ontouchend={handleTouchEnd}
                    ontouchmove={handleTouchEnd}
                    ondragover={(e) => handleFolderDragOver(e, folder.id)}
                    ondragleave={handleFolderDragLeave}
                    ondrop={(e) => handleFolderDrop(e, folder.id)}
                >
                    <ChevronRight
                        size={14}
                        class="folder-chevron transition-transform shrink-0 {isExpanded
                            ? 'rotate-90'
                            : ''}"
                    />
                    <Folder
                        size={16}
                        class="shrink-0"
                        style="color: {folder.color || '#fbbf24'}"
                    />
                    <span class="flex-1 truncate text-sm">{folder.name}</span>
                    {#if notes.length > 0}
                        <span class="badge badge-sm badge-ghost shrink-0"
                            >{notes.length}</span
                        >
                    {/if}
                    <button
                        class="btn btn-ghost btn-xs btn-square opacity-0 group-hover:opacity-100 shrink-0 ml-auto"
                        title="Edit folder"
                        onclick={(e) => {
                            e.stopPropagation();
                            editingFolder = folder;
                            showFolderModal = true;
                        }}
                    >
                        <Edit size={12} />
                    </button>
                </summary>

                <div class="collapse-content pl-6">
                    <!-- Child folders -->
                    {#each children as child (child.id)}
                        <div
                            class="py-1 px-3 flex items-center gap-2 hover:bg-base-300 rounded-lg cursor-pointer"
                            oncontextmenu={(e) =>
                                handleFolderContextMenu(e, child)}
                        >
                            <Folder
                                size={14}
                                style="color: {child.color || '#fbbf24'}"
                            />
                            <span class="text-sm truncate">{child.name}</span>
                        </div>
                    {/each}

                    <!-- Notes in folder -->
                    {#each notes as note (note.id)}
                        <button
                            class="w-full py-1 px-3 flex items-center gap-2 hover:bg-base-300 rounded-lg text-left {appState.activeNoteId ===
                            note.id
                                ? 'bg-primary/10 text-primary'
                                : ''} {draggedNoteId === note.id
                                ? 'opacity-50'
                                : ''}"
                            onclick={() => openNote(note)}
                            oncontextmenu={(e) =>
                                handleNoteContextMenu(e, note)}
                            ontouchstart={(e) =>
                                handleTouchStart("note", note, e)}
                            ontouchend={handleTouchEnd}
                            ontouchmove={handleTouchEnd}
                            draggable="true"
                            ondragstart={(e) => handleNoteDragStart(e, note.id)}
                            ondragend={handleNoteDragEnd}
                        >
                            <File size={14} />
                            <span class="text-sm truncate">{note.title}</span>
                        </button>
                    {/each}
                </div>
            </details>
        {/each}

        <!-- Root-level notes (saved, no folder) -->
        {#each [rootNotes] as unfiled}
            {#if unfiled.length > 0}
                <div class="mt-2 pt-2 border-t border-base-300">
                    <p class="px-3 py-1 text-xs text-base-content/50 uppercase">
                        Unfiled
                    </p>
                    {#each unfiled as note (note.id)}
                        <button
                            class="w-full py-2 px-3 flex items-center gap-2 hover:bg-base-300 rounded-lg text-left {appState.activeNoteId ===
                            note.id
                                ? 'bg-primary/10 text-primary'
                                : ''}"
                            onclick={() => openNote(note)}
                            oncontextmenu={(e) =>
                                handleNoteContextMenu(e, note)}
                        >
                            <File size={16} />
                            <span class="text-sm truncate">{note.title}</span>
                        </button>
                    {/each}
                </div>
            {/if}
        {/each}
    </nav>

    <!-- Sidebar Footer -->
    <div class="p-4 border-t border-base-300">
        <p class="text-xs text-base-content/50">
            {Array.isArray(appState.notes) ? appState.notes.length : 0} notes · {Array.isArray(
                appState.folders,
            )
                ? appState.folders.length
                : 0} folders
        </p>
    </div>
</aside>

<!-- Context Menu -->
{#if contextMenu}
    <div
        class="fixed z-50 bg-base-100 shadow-lg border border-base-300 rounded-lg py-1 min-w-48"
        style="left: {contextMenu.x}px; top: {contextMenu.y}px"
    >
        {#if contextMenu.type === "note"}
            {@const note = contextMenu.item as Note}
            <!-- Rename -->
            <button
                class="w-full px-3 py-2 text-left hover:bg-base-200 flex items-center gap-2"
                onclick={() => openRenameModal(note)}
            >
                <Edit size={14} />
                <span class="text-sm">Rename</span>
            </button>

            <!-- Delete -->
            <button
                class="w-full px-3 py-2 text-left hover:bg-base-200 flex items-center gap-2 text-error"
                onclick={() => openDeleteModal(note)}
            >
                <Trash2 size={14} />
                <span class="text-sm">Delete</span>
            </button>

            <div class="divider my-1"></div>

            <p class="px-3 py-1 text-xs text-base-content/50">
                Move to folder:
            </p>
            <button
                class="w-full px-3 py-2 text-left hover:bg-base-200 flex items-center gap-2"
                onclick={() => moveNoteToFolder(note.id, null)}
            >
                <FolderInput size={14} />
                <span class="text-sm">Unfiled</span>
            </button>
            {#each folderTree as folder}
                <button
                    class="w-full px-3 py-2 text-left hover:bg-base-200 flex items-center gap-2"
                    onclick={() => moveNoteToFolder(note.id, folder.id)}
                >
                    <Folder
                        size={14}
                        style="color: {folder.color || '#fbbf24'}"
                    />
                    <span class="text-sm">{folder.name}</span>
                </button>
            {/each}
        {:else if contextMenu.type === "folder"}
            {@const folder = contextMenu.item as FolderType}
            <button
                class="w-full px-3 py-2 text-left hover:bg-base-200 flex items-center gap-2"
                onclick={() => {
                    editingFolder = folder;
                    showFolderModal = true;
                    closeContextMenu();
                }}
            >
                <Edit size={14} />
                <span class="text-sm">Edit Folder</span>
            </button>
            <button
                class="w-full px-3 py-2 text-left hover:bg-base-200 flex items-center gap-2 text-error"
                onclick={async () => {
                    await deleteFolder(folder.id);
                    closeContextMenu();
                }}
            >
                <Trash2 size={14} />
                <span class="text-sm">Delete Folder</span>
            </button>
        {/if}
    </div>
{/if}

<!-- Folder Modal -->
<FolderModal
    isOpen={showFolderModal}
    {editingFolder}
    onClose={() => {
        showFolderModal = false;
        editingFolder = null;
    }}
    onCreate={handleCreateFolder}
    onDelete={handleDeleteFolder}
/>

<!-- Rename Note Modal -->
<dialog bind:this={renameDialogEl} class="modal" onclose={cancelRename}>
    <div class="modal-box">
        <h3 class="font-bold text-lg mb-4">Rename Note</h3>
        <input
            type="text"
            class="input input-bordered w-full"
            placeholder="Note name"
            bind:value={newNoteName}
            onkeydown={(e) => e.key === "Enter" && confirmRename()}
        />
        <div class="modal-action">
            <button class="btn" onclick={cancelRename}>Cancel</button>
            <button class="btn btn-primary" onclick={confirmRename}
                >Rename</button
            >
        </div>
    </div>
    <form method="dialog" class="modal-backdrop">
        <button>close</button>
    </form>
</dialog>

<!-- Delete Note Modal -->
<dialog bind:this={deleteDialogEl} class="modal" onclose={cancelDelete}>
    <div class="modal-box">
        <h3 class="font-bold text-lg mb-4">Delete Note</h3>
        <p class="mb-4">
            Are you sure you want to delete "{pendingNote?.title}"?
        </p>
        <p class="text-sm text-base-content/70">
            This action cannot be undone.
        </p>
        <div class="modal-action">
            <button class="btn" onclick={cancelDelete}>Cancel</button>
            <button class="btn btn-error" onclick={confirmDelete}>Delete</button
            >
        </div>
    </div>
    <form method="dialog" class="modal-backdrop">
        <button>close</button>
    </form>
</dialog>
