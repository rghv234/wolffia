<!--
  Wolffia - SaveModal Component
  Centralized save modal that reads directly from appState
-->
<script lang="ts">
    import { onMount } from "svelte";
    import {
        appState,
        getActiveUntitledContent,
        closeUntitledAfterSave,
    } from "$lib/stores/app.svelte";
    import { encryptContent, hasEncryptionKey } from "$lib/crypto";
    import { notes as notesApi } from "$lib/api";

    // Modal state
    let isOpen = $state(false);
    let saveNoteName = $state("Untitled");
    let saveFormat = $state<"md" | "txt">("md");
    let dialogEl = $state<HTMLDialogElement | null>(null);
    let activeNoteId = $state<string | null>(null);
    let activeContent = $state("");

    // Listen for save modal event
    onMount(() => {
        const handleOpenSave = (e: Event) => {
            const customEvent = e as CustomEvent<{ format?: "md" | "txt" }>;
            const format = customEvent.detail?.format || "md";

            // Get content from centralized state function
            const data = getActiveUntitledContent();
            console.log("[SaveModal] Opening with data:", data);

            if (!data) {
                console.warn("[SaveModal] No active untitled note to save");
                return;
            }

            activeNoteId = data.noteId;
            activeContent = data.content;
            saveNoteName = data.title.replace(/\.(md|txt)$/, "") || "Untitled";
            saveFormat = format;
            isOpen = true;
            setTimeout(() => dialogEl?.showModal(), 0);
        };

        document.addEventListener("wolffia:open-save-modal", handleOpenSave);

        return () => {
            document.removeEventListener(
                "wolffia:open-save-modal",
                handleOpenSave,
            );
        };
    });

    async function confirmSave() {
        console.log(
            "[SaveModal] Confirming save, activeNoteId:",
            activeNoteId,
            "content length:",
            activeContent.length,
        );

        if (!activeContent.trim()) {
            console.warn("[SaveModal] Content is empty, aborting save");
            isOpen = false;
            dialogEl?.close();
            return;
        }

        try {
            // Encrypt content for storage
            let contentBlob: string;
            if (hasEncryptionKey()) {
                contentBlob = await encryptContent(activeContent);
            } else {
                // Fallback for development - store as base64
                contentBlob =
                    "__UNENCRYPTED__" +
                    btoa(unescape(encodeURIComponent(activeContent)));
            }

            // Build title with format extension
            const baseName = saveNoteName.trim() || "Untitled";
            const fullTitle = baseName.endsWith(`.${saveFormat}`)
                ? baseName
                : `${baseName}.${saveFormat}`;

            let newNote: {
                id: number | string;
                folder_id: number | null;
                title: string;
                content_blob: string;
                updated_at: string;
            };

            // Check if logged in - if not, save locally
            if (appState.token) {
                // Online mode: save to server
                const result = await notesApi.create({
                    title: fullTitle,
                    content_blob: contentBlob,
                    folder_id: undefined,
                });

                if (!result.data) {
                    throw new Error(result.error || "Failed to save note");
                }

                newNote = {
                    id: result.data.id,
                    folder_id: null,
                    title: fullTitle,
                    content_blob: contentBlob,
                    updated_at: new Date().toISOString(),
                };
            } else {
                // Offline mode: save to localStorage with local ID
                const localId = `local-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
                newNote = {
                    id: localId,
                    folder_id: null,
                    title: fullTitle,
                    content_blob: contentBlob,
                    updated_at: new Date().toISOString(),
                };
                console.log(
                    "[SaveModal] Saved locally (offline mode):",
                    localId,
                );
            }

            // Add to local state with spread for Svelte 5 reactivity
            appState.notes = [newNote, ...appState.notes];

            // Open the saved note (spread for Svelte 5 reactivity)
            appState.openTabs = [
                ...appState.openTabs,
                {
                    noteId: newNote.id,
                    title: newNote.title,
                    isDirty: false,
                    cursorPosition: 0,
                    scrollTop: 0,
                },
            ];
            appState.activeNoteId = newNote.id;

            // Close the untitled tab
            if (activeNoteId) {
                closeUntitledAfterSave(activeNoteId);
            }

            console.log("[SaveModal] Successfully saved note:", newNote.id);
        } catch (e) {
            console.error("[SaveModal] Failed to save:", e);
        }

        isOpen = false;
        dialogEl?.close();
    }

    function cancelSave() {
        isOpen = false;
        dialogEl?.close();
    }
</script>

<dialog bind:this={dialogEl} class="modal">
    {#if isOpen}
        <div class="modal-box max-w-sm">
            <h3 class="font-bold text-lg mb-4">Save to Notes</h3>

            <div class="form-control mb-4">
                <label class="label" for="save-note-name">
                    <span class="label-text">Note name</span>
                </label>
                <input
                    id="save-note-name"
                    type="text"
                    class="input input-bordered w-full"
                    bind:value={saveNoteName}
                    placeholder="Enter note name"
                />
            </div>

            <div class="form-control mb-4">
                <label class="label">
                    <span class="label-text">Format</span>
                </label>
                <div class="flex gap-4">
                    <label class="label cursor-pointer gap-2">
                        <input
                            type="radio"
                            name="save-format"
                            class="radio"
                            value="md"
                            bind:group={saveFormat}
                        />
                        <span class="label-text">.md (Markdown)</span>
                    </label>
                    <label class="label cursor-pointer gap-2">
                        <input
                            type="radio"
                            name="save-format"
                            class="radio"
                            value="txt"
                            bind:group={saveFormat}
                        />
                        <span class="label-text">.txt (Plain Text)</span>
                    </label>
                </div>
            </div>

            <div class="modal-action">
                <button class="btn btn-ghost" onclick={cancelSave}>
                    Cancel
                </button>
                <button class="btn btn-primary" onclick={confirmSave}>
                    Save
                </button>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button onclick={cancelSave}>close</button>
        </form>
    {/if}
</dialog>
