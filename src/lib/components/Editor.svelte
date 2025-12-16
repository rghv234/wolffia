<!--
  Wolffia - Editor Component
  Markdown-first textarea with formatting toolbar
-->
<script lang="ts">
    import { onMount } from "svelte";
    import {
        Heading1,
        Heading2,
        List,
        ListOrdered,
        Bold,
        Italic,
        Link,
        RemoveFormatting,
        ChevronDown,
        Save,
        Type,
    } from "@lucide/svelte";
    import {
        appState,
        updateTabState,
        updateScratchpad,
        setActivePaneNoteId,
        type Note,
    } from "$lib/stores/app.svelte";
    import {
        decryptContent,
        encryptContent,
        hasEncryptionKey,
    } from "$lib/crypto";
    import { saveNote, createNote } from "$lib/sync";
    import { notes as notesApi } from "$lib/api";
    import VirtualTextEditor from "./VirtualTextEditor.svelte";

    let { noteId } = $props<{ noteId: number | string }>();

    // State
    let content = $state("");
    let isLoading = $state(true);
    let isSaving = $state(false);
    let lastSaved = $state<Date | null>(null);
    let textareaEl = $state<HTMLTextAreaElement | null>(null);
    let showHeadingMenu = $state(false);
    let showListMenu = $state(false);

    // Link modal state
    let showLinkModal = $state(false);
    let linkText = $state("");
    let linkUrl = $state("https://");
    let linkDialogEl = $state<HTMLDialogElement | null>(null);

    // Find/Replace bar state
    let showFindBar = $state(false);
    let showReplaceBar = $state(false);
    let findQuery = $state("");
    let replaceText = $state("");
    let findResultCount = $state(0);
    let currentFindIndex = $state(0);

    // Derived: Check if this is an untitled note (e.g., 'untitled-1', 'untitled-2')
    let isUntitled = $derived(
        typeof noteId === "string" && noteId.startsWith("untitled-"),
    );
    // Legacy scratchpad check
    let isScratchpad = $derived(noteId === "scratchpad");

    // Derived: Get note from state (only for saved notes with numeric IDs)
    let note = $derived(
        typeof noteId === "number"
            ? appState.notes.find((n) => n.id === noteId)
            : null,
    );
    let tab = $derived(appState.openTabs.find((t) => t.noteId === noteId));

    // Debounced save timer
    let saveTimeout: ReturnType<typeof setTimeout> | null = null;

    // Listen for mobile FAB Save button event and load content on mount
    onMount(() => {
        console.log(
            "[Editor] Component mounted, noteId:",
            noteId,
            "loading content...",
        );
        loadContent();

        // Listen for Find (Ctrl+F) event
        const handleFind = () => {
            showFindBar = true;
            showReplaceBar = false;
            setTimeout(() => {
                const findInput = document.getElementById(
                    "find-input",
                ) as HTMLInputElement;
                findInput?.focus();
                findInput?.select();
            }, 50);
        };

        // Listen for Replace (Ctrl+H) event
        const handleReplace = () => {
            showFindBar = true;
            showReplaceBar = true;
            setTimeout(() => {
                const findInput = document.getElementById(
                    "find-input",
                ) as HTMLInputElement;
                findInput?.focus();
                findInput?.select();
            }, 50);
        };

        // Note: save-modal event is now handled centrally by SaveModal.svelte
        document.addEventListener("wolffia:find", handleFind);
        document.addEventListener("wolffia:replace", handleReplace);

        return () => {
            document.removeEventListener("wolffia:find", handleFind);
            document.removeEventListener("wolffia:replace", handleReplace);
        };
    }); // Large file threshold (100KB)
    const LARGE_FILE_THRESHOLD = 100 * 1024;
    let isLargeFile = $state(false);
    let contentSizeKB = $state(0);

    // Use virtual editor for very large files (>100KB)
    let useVirtualEditor = $state(false);

    // Load content based on note type
    async function loadContent() {
        isLoading = true;
        isLargeFile = false;
        console.log(
            "[Editor] loadContent called, noteId:",
            noteId,
            "isUntitled:",
            isUntitled,
        );
        try {
            if (isUntitled && typeof noteId === "string") {
                // Load from untitledNotes map
                content = appState.untitledNotes[noteId]?.content || "";
            } else if (isScratchpad) {
                // Legacy scratchpad support
                content = appState.scratchpadNote?.content || "";
            } else if (note) {
                // Saved note - decrypt content
                if (note.content_blob) {
                    const decrypted = await decryptContent(note.content_blob);
                    content = decrypted;
                } else {
                    content = "";
                }
            } else {
                content = "";
            }

            // Detect large files and log size
            const size = new Blob([content]).size;
            contentSizeKB = Math.round(size / 1024);
            isLargeFile = size > LARGE_FILE_THRESHOLD;

            // Enable virtual editor for large files
            useVirtualEditor = isLargeFile;

            if (isLargeFile) {
                console.log(
                    `[Editor] Large file detected: ${contentSizeKB}KB - switching to virtual editor`,
                );
            }
        } catch (e) {
            console.error("Failed to load note:", e);
            content = "";
        } finally {
            isLoading = false;
        }
    }

    // Save content with debouncing
    async function saveContent() {
        if (isSaving) return;

        console.log("[Editor] saveContent called:", {
            noteId,
            noteIdType: typeof noteId,
            isUntitled,
            isScratchpad,
            hasNote: !!note,
            noteObj: note,
        });

        isSaving = true;
        try {
            if (isUntitled && typeof noteId === "string") {
                // Save to untitledNotes map
                if (appState.untitledNotes[noteId]) {
                    appState.untitledNotes[noteId].content = content;
                }
                lastSaved = new Date();
            } else if (isScratchpad) {
                // Legacy scratchpad
                updateScratchpad({ content });
                lastSaved = new Date();
            } else if (note) {
                console.log(
                    "[Editor] Calling saveNote for existing note:",
                    note.id,
                );
                const success = await saveNote(note.id, content, note.title);
                if (success) {
                    lastSaved = new Date();
                    if (tab) {
                        updateTabState(noteId as number, { isDirty: false });
                    }
                }
            }
        } catch (e) {
            console.error("Save error:", e);
        } finally {
            isSaving = false;
        }
    }

    // Update cursor position in appState for status bar
    function updateCursorInfo(textarea: HTMLTextAreaElement) {
        const pos = textarea.selectionStart;
        const text = textarea.value.substring(0, pos);
        const lines = text.split("\n");
        const line = lines.length;
        const col = lines[lines.length - 1].length + 1;

        appState.cursorLine = line;
        appState.cursorCol = col;
        appState.charCount = textarea.value.length;
    }

    // Handle input with debounced save and dirty tracking
    function handleInput(e: Event) {
        const target = e.target as HTMLTextAreaElement;
        content = target.value;

        // Update cursor position in appState for status bar
        updateCursorInfo(target);

        // Mark as dirty
        if (tab && !isScratchpad) {
            updateTabState(noteId as number, {
                isDirty: true,
                cursorPosition: target.selectionStart,
            });
        } else if (isScratchpad) {
            updateScratchpad({
                content,
                cursorPosition: target.selectionStart,
            });
        }

        // Debounced save
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            saveContent();
        }, 2000);
    }

    // Save position on blur
    function handleBlur(e: Event) {
        const target = e.target as HTMLTextAreaElement;
        if (tab && !isScratchpad) {
            updateTabState(noteId as number, {
                cursorPosition: target.selectionStart,
                scrollTop: target.scrollTop,
            });
        }
    }

    // Save scratchpad as a real note to database
    let showSaveModal = $state(false);
    let saveNoteName = $state("Untitled");
    let saveFormat = $state<"md" | "txt">("md");
    let saveDialogEl = $state<HTMLDialogElement | null>(null);

    function openSaveModal(format?: "md" | "txt") {
        // Get title from the correct source based on note type
        if (isUntitled && typeof noteId === "string") {
            saveNoteName = appState.untitledNotes[noteId]?.title || "Untitled";
        } else if (isScratchpad) {
            saveNoteName = appState.scratchpadNote?.title || "Untitled";
        } else {
            saveNoteName = "Untitled";
        }
        // Remove any existing extension
        saveNoteName = saveNoteName.replace(/\.(md|txt)$/, "");
        saveFormat = format || "md";
        showSaveModal = true;
        setTimeout(() => saveDialogEl?.showModal(), 0);
    }

    async function confirmSaveToNotes() {
        // CRITICAL: Get the actual content from state, not the local variable which may be stale
        let actualContent = content;

        if (isUntitled && typeof noteId === "string") {
            actualContent = appState.untitledNotes[noteId]?.content ?? content;
        } else if (isScratchpad) {
            actualContent = appState.scratchpadNote?.content ?? content;
        }

        console.log(
            "[Editor] confirmSaveToNotes - noteId:",
            noteId,
            "actualContent length:",
            actualContent.length,
        );

        if (!actualContent.trim()) {
            console.warn("[Editor] confirmSaveToNotes - content is empty!");
            showSaveModal = false;
            saveDialogEl?.close();
            return;
        }

        try {
            // Encrypt content for storage
            let contentBlob: string;
            if (hasEncryptionKey()) {
                contentBlob = await encryptContent(actualContent);
            } else {
                // Fallback for development - store as base64
                contentBlob =
                    "__UNENCRYPTED__" +
                    btoa(unescape(encodeURIComponent(actualContent)));
            }

            // Build title with format extension
            const baseName = saveNoteName.trim() || "Untitled";
            const fullTitle = baseName.endsWith(`.${saveFormat}`)
                ? baseName
                : `${baseName}.${saveFormat}`;

            // Create note in database
            const result = await notesApi.create({
                title: fullTitle,
                content_blob: contentBlob,
                folder_id: undefined,
            });

            if (result.data) {
                // Add to local state
                const newNote = {
                    id: result.data.id,
                    folder_id: null,
                    title: fullTitle,
                    content_blob: contentBlob,
                    updated_at: new Date().toISOString(),
                };
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

                // Close the untitled/scratchpad tab that was just saved
                if (
                    typeof noteId === "string" &&
                    noteId.startsWith("untitled-")
                ) {
                    delete appState.untitledNotes[noteId];
                    appState.openTabs = appState.openTabs.filter(
                        (t) => t.noteId !== noteId,
                    );
                } else if (noteId === "scratchpad") {
                    appState.scratchpadNote = null;
                    appState.openTabs = appState.openTabs.filter(
                        (t) => t.noteId !== "scratchpad",
                    );
                }

                console.log("[Editor] Saved note:", newNote.id);
            }
        } catch (e) {
            console.error("Failed to save scratchpad:", e);
        }

        showSaveModal = false;
        saveDialogEl?.close();
    }

    function cancelSave() {
        showSaveModal = false;
        saveDialogEl?.close();
    }

    // Font size change - update both state and CSS variable
    function setFontSize(size: number) {
        appState.editorFontSize = size;
        document.documentElement.style.setProperty(
            "--editor-font-size",
            size + "px",
        );
    }

    // Find/Replace functions
    function performFind() {
        if (!findQuery || !textareaEl) {
            findResultCount = 0;
            currentFindIndex = 0;
            return;
        }

        const text = content.toLowerCase();
        const query = findQuery.toLowerCase();
        let count = 0;
        let index = 0;

        while ((index = text.indexOf(query, index)) !== -1) {
            count++;
            index++;
        }

        findResultCount = count;
        if (count > 0 && currentFindIndex === 0) {
            currentFindIndex = 1;
            highlightFindResult(0);
        }
    }

    function highlightFindResult(resultIndex: number) {
        if (!textareaEl || !findQuery) return;

        const text = content.toLowerCase();
        const query = findQuery.toLowerCase();
        let count = 0;
        let index = 0;

        while ((index = text.indexOf(query, index)) !== -1) {
            if (count === resultIndex) {
                textareaEl.focus();
                textareaEl.setSelectionRange(index, index + findQuery.length);
                // Scroll to selection
                const lineHeight =
                    parseInt(getComputedStyle(textareaEl).lineHeight) || 20;
                const textBeforeCursor = content.substring(0, index);
                const lineNumber = textBeforeCursor.split("\n").length;
                textareaEl.scrollTop = Math.max(
                    0,
                    (lineNumber - 5) * lineHeight,
                );
                return;
            }
            count++;
            index++;
        }
    }

    function findNext() {
        if (findResultCount === 0) return;
        currentFindIndex =
            currentFindIndex >= findResultCount ? 1 : currentFindIndex + 1;
        highlightFindResult(currentFindIndex - 1);
    }

    function findPrev() {
        if (findResultCount === 0) return;
        currentFindIndex =
            currentFindIndex <= 1 ? findResultCount : currentFindIndex - 1;
        highlightFindResult(currentFindIndex - 1);
    }

    function replaceOne() {
        if (!textareaEl || !findQuery) return;

        const start = textareaEl.selectionStart;
        const end = textareaEl.selectionEnd;
        const selected = content.substring(start, end);

        if (selected.toLowerCase() === findQuery.toLowerCase()) {
            content =
                content.substring(0, start) +
                replaceText +
                content.substring(end);
            // Move cursor after replacement
            setTimeout(() => {
                if (textareaEl) {
                    textareaEl.setSelectionRange(
                        start + replaceText.length,
                        start + replaceText.length,
                    );
                }
                performFind();
            }, 0);
        } else {
            findNext();
        }
    }

    function replaceAll() {
        if (!findQuery) return;

        const regex = new RegExp(
            findQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            "gi",
        );
        content = content.replace(regex, replaceText);
        performFind();
    }

    function closeFindBar() {
        showFindBar = false;
        showReplaceBar = false;
        findQuery = "";
        replaceText = "";
        findResultCount = 0;
        currentFindIndex = 0;
        textareaEl?.focus();
    }

    // Formatting functions
    function wrapSelection(prefix: string, suffix: string = prefix) {
        if (!textareaEl) return;

        const start = textareaEl.selectionStart;
        const end = textareaEl.selectionEnd;
        const text = content;
        const selected = text.substring(start, end);

        const before = text.substring(0, start);
        const after = text.substring(end);

        content = before + prefix + selected + suffix + after;

        // Update textarea and restore selection
        setTimeout(() => {
            if (textareaEl) {
                textareaEl.focus();
                textareaEl.selectionStart = start + prefix.length;
                textareaEl.selectionEnd = end + prefix.length;
            }
        }, 0);

        handleContentChange();
    }

    function insertAtLineStart(prefix: string) {
        if (!textareaEl) return;

        const start = textareaEl.selectionStart;
        const text = content;

        // Find the start of the current line
        let lineStart = text.lastIndexOf("\n", start - 1) + 1;

        content =
            text.substring(0, lineStart) + prefix + text.substring(lineStart);

        setTimeout(() => {
            if (textareaEl) {
                textareaEl.focus();
                textareaEl.selectionStart = start + prefix.length;
                textareaEl.selectionEnd = start + prefix.length;
            }
        }, 0);

        handleContentChange();
    }

    function handleContentChange() {
        if (tab && !isScratchpad) {
            updateTabState(noteId as number, { isDirty: true });
        } else if (isScratchpad) {
            updateScratchpad({ content });
        }

        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => saveContent(), 2000);
    }

    function insertLink() {
        if (!textareaEl) return;

        const start = textareaEl.selectionStart;
        const end = textareaEl.selectionEnd;
        linkText = content.substring(start, end) || "";
        linkUrl = "https://";
        showLinkModal = true;

        setTimeout(() => linkDialogEl?.showModal(), 0);
    }

    function confirmLink() {
        if (!textareaEl) return;

        const start = textareaEl.selectionStart;
        const end = textareaEl.selectionEnd;
        const text = linkText || "link";
        const link = `[${text}](${linkUrl})`;
        const before = content.substring(0, start);
        const after = content.substring(end);
        content = before + link + after;
        handleContentChange();

        showLinkModal = false;
        linkDialogEl?.close();
    }

    function cancelLink() {
        showLinkModal = false;
        linkDialogEl?.close();
    }

    function clearFormatting() {
        if (!textareaEl) return;

        const start = textareaEl.selectionStart;
        const end = textareaEl.selectionEnd;
        const selected = content.substring(start, end);

        // Remove common markdown formatting
        const cleaned = selected
            .replace(/#{1,6}\s*/g, "")
            .replace(/\*\*/g, "")
            .replace(/\*/g, "")
            .replace(/__/g, "")
            .replace(/_/g, "")
            .replace(/~~(.*?)~~/g, "$1")
            .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
            .replace(/^[\-\*\+]\s/gm, "")
            .replace(/^\d+\.\s/gm, "");

        const before = content.substring(0, start);
        const after = content.substring(end);
        content = before + cleaned + after;
        handleContentChange();
    }

    // Highlight markdown syntax for visual feedback
    function highlightMarkdown(text: string): string {
        if (!text) return "";

        return (
            text
                // Escape HTML first
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                // Headers (style the whole line)
                .replace(
                    /^(#{1,6}\s.*$)/gm,
                    '<span class="md-header">$1</span>',
                )
                // Bold **text** or __text__
                .replace(
                    /(\*\*|__)(.+?)\1/g,
                    '<span class="md-bold">$1$2$1</span>',
                )
                // Italic *text* or _text_
                .replace(
                    /(\*|_)(.+?)\1/g,
                    '<span class="md-italic">$1$2$1</span>',
                )
                // Inline code `code`
                .replace(/`([^`]+)`/g, '<span class="md-code">`$1`</span>')
                // Links [text](url)
                .replace(/(\[.+?\]\(.+?\))/g, '<span class="md-link">$1</span>')
                // Lists
                .replace(/^(\s*[-*+]\s)/gm, '<span class="md-list">$1</span>') +
            // Add trailing newline to prevent cursor issues
            "\n"
        );
    }

    // Debounced highlighted content for performance
    let highlightedContent = $state("");
    let highlightTimeout: ReturnType<typeof setTimeout> | null = null;

    $effect(() => {
        const currentContent = content;
        if (highlightTimeout) clearTimeout(highlightTimeout);
        highlightTimeout = setTimeout(() => {
            highlightedContent = highlightMarkdown(currentContent);
        }, 50); // Very short debounce for responsiveness
    });

    // Sync scroll between textarea and pre
    let preEl = $state<HTMLPreElement | null>(null);

    function syncScroll() {
        if (textareaEl && preEl) {
            preEl.scrollTop = textareaEl.scrollTop;
            preEl.scrollLeft = textareaEl.scrollLeft;
        }
    }

    // Load on mount
    onMount(() => {
        loadContent();
        return () => {
            if (saveTimeout) clearTimeout(saveTimeout);
        };
    });

    // Watch for noteId changes ONLY (not other derived values)
    // Use untrack to prevent running on every content change
    let lastNoteId: number | string | null = null;
    $effect(() => {
        const currentNoteId = noteId;
        if (currentNoteId !== lastNoteId) {
            lastNoteId = currentNoteId;
            loadContent();
        }
    });

    // Restore position when textarea is ready
    $effect(() => {
        if (textareaEl && tab && !isLoading) {
            textareaEl.selectionStart = tab.cursorPosition;
            textareaEl.selectionEnd = tab.cursorPosition;
            textareaEl.scrollTop = tab.scrollTop;
        }
    });

    // Export content to globalThis for markdown preview
    $effect(() => {
        // Only export if this is the active note
        if (noteId === appState.activeNoteId) {
            (globalThis as any).wolffiaEditorContent = content;
        }
    });

    // Keyboard shortcuts
    function handleKeydown(e: KeyboardEvent) {
        if (e.ctrlKey && e.key === "s") {
            e.preventDefault();
            saveContent();
        }
        if (e.ctrlKey && e.key === "b") {
            e.preventDefault();
            wrapSelection("**");
        }
        if (e.ctrlKey && e.key === "i") {
            e.preventDefault();
            wrapSelection("*");
        }
        if (e.ctrlKey && e.key === "k") {
            e.preventDefault();
            insertLink();
        }
    }
</script>

<div
    class="h-full flex flex-col"
    role="textbox"
    aria-label="Note editor"
    tabindex="0"
    onkeydown={handleKeydown}
>
    <!-- Formatting Toolbar -->
    <div
        class="toolbar flex items-center gap-1 px-4 py-2 border-b border-base-300 bg-base-200"
    >
        <!-- Heading dropdown -->
        <div class="dropdown">
            <button
                type="button"
                class="btn btn-ghost btn-sm gap-1"
                onclick={() => (showHeadingMenu = !showHeadingMenu)}
            >
                <Heading1 size={16} />
                <ChevronDown size={12} />
            </button>
            {#if showHeadingMenu}
                <ul
                    class="dropdown-content menu bg-base-100 rounded-box shadow-lg p-2 w-40 z-50"
                >
                    <li>
                        <button
                            onclick={() => {
                                insertAtLineStart("# ");
                                showHeadingMenu = false;
                            }}>Heading 1</button
                        >
                    </li>
                    <li>
                        <button
                            onclick={() => {
                                insertAtLineStart("## ");
                                showHeadingMenu = false;
                            }}>Heading 2</button
                        >
                    </li>
                    <li>
                        <button
                            onclick={() => {
                                insertAtLineStart("### ");
                                showHeadingMenu = false;
                            }}>Heading 3</button
                        >
                    </li>
                    <li>
                        <button
                            onclick={() => {
                                insertAtLineStart("#### ");
                                showHeadingMenu = false;
                            }}>Heading 4</button
                        >
                    </li>
                </ul>
            {/if}
        </div>

        <!-- List dropdown -->
        <div class="dropdown">
            <button
                type="button"
                class="btn btn-ghost btn-sm gap-1"
                onclick={() => (showListMenu = !showListMenu)}
            >
                <List size={16} />
                <ChevronDown size={12} />
            </button>
            {#if showListMenu}
                <ul
                    class="dropdown-content menu bg-base-100 rounded-box shadow-lg p-2 w-44 z-50"
                >
                    <li>
                        <button
                            onclick={() => {
                                insertAtLineStart("- ");
                                showListMenu = false;
                            }}
                        >
                            <List size={14} /> Bullet List
                        </button>
                    </li>
                    <li>
                        <button
                            onclick={() => {
                                insertAtLineStart("1. ");
                                showListMenu = false;
                            }}
                        >
                            <ListOrdered size={14} /> Numbered List
                        </button>
                    </li>
                    <li>
                        <button
                            onclick={() => {
                                insertAtLineStart("- [ ] ");
                                showListMenu = false;
                            }}
                        >
                            ☐ Task List
                        </button>
                    </li>
                </ul>
            {/if}
        </div>

        <!-- Font Size dropdown -->
        <div class="dropdown">
            <div
                tabindex="0"
                role="button"
                class="btn btn-ghost btn-sm gap-1"
                title="Font Size"
            >
                <Type size={16} />
                <span class="text-xs">{appState.editorFontSize}px</span>
                <ChevronDown size={12} />
            </div>
            <ul
                tabindex="0"
                class="dropdown-content menu bg-base-200 rounded-box z-10 w-36 shadow-lg p-2"
            >
                <li>
                    <button
                        class={appState.editorFontSize === 10 ? "active" : ""}
                        onclick={() => setFontSize(10)}>10px</button
                    >
                </li>
                <li>
                    <button
                        class={appState.editorFontSize === 12 ? "active" : ""}
                        onclick={() => setFontSize(12)}>12px</button
                    >
                </li>
                <li>
                    <button
                        class={appState.editorFontSize === 14 ? "active" : ""}
                        onclick={() => setFontSize(14)}>14px (default)</button
                    >
                </li>
                <li>
                    <button
                        class={appState.editorFontSize === 16 ? "active" : ""}
                        onclick={() => setFontSize(16)}>16px</button
                    >
                </li>
                <li>
                    <button
                        class={appState.editorFontSize === 18 ? "active" : ""}
                        onclick={() => setFontSize(18)}>18px</button
                    >
                </li>
                <li>
                    <button
                        class={appState.editorFontSize === 20 ? "active" : ""}
                        onclick={() => setFontSize(20)}>20px</button
                    >
                </li>
                <li>
                    <button
                        class={appState.editorFontSize === 24 ? "active" : ""}
                        onclick={() => setFontSize(24)}>24px</button
                    >
                </li>
                <li class="divider my-1"></li>
                <li>
                    <div class="flex items-center gap-1 px-1">
                        <input
                            type="number"
                            min="8"
                            max="48"
                            step="1"
                            class="input input-xs input-bordered w-16 text-center"
                            value={appState.editorFontSize}
                            oninput={(e) => {
                                const val = parseInt(e.currentTarget.value);
                                if (!isNaN(val) && val >= 8 && val <= 48) {
                                    setFontSize(val);
                                }
                            }}
                        />
                        <span class="text-xs">px</span>
                    </div>
                </li>
            </ul>
        </div>

        <div class="divider divider-horizontal mx-1 h-6"></div>

        <!-- Bold -->
        <button
            type="button"
            class="btn btn-ghost btn-sm btn-square"
            title="Bold (Ctrl+B)"
            onclick={() => wrapSelection("**")}
        >
            <Bold size={16} />
        </button>

        <!-- Italic -->
        <button
            type="button"
            class="btn btn-ghost btn-sm btn-square"
            title="Italic (Ctrl+I)"
            onclick={() => wrapSelection("*")}
        >
            <Italic size={16} />
        </button>

        <!-- Link -->
        <button
            type="button"
            class="btn btn-ghost btn-sm btn-square"
            title="Insert Link (Ctrl+K)"
            onclick={insertLink}
        >
            <Link size={16} />
        </button>

        <!-- Clear Formatting -->
        <button
            type="button"
            class="btn btn-ghost btn-sm btn-square"
            title="Clear Formatting"
            onclick={clearFormatting}
        >
            <RemoveFormatting size={16} />
        </button>

        {#if isScratchpad || isUntitled}
            <div class="divider divider-horizontal mx-1 h-6"></div>

            <!-- Save To Notes button (desktop only - mobile/tablet uses FAB) -->
            <button
                type="button"
                class="hidden lg:flex btn btn-primary btn-sm gap-1"
                title="Save to Notes (Ctrl+S)"
                onclick={() => openSaveModal()}
            >
                <Save size={14} />
                <span>Save</span>
            </button>
        {/if}
    </div>

    <!-- Find/Replace Bar -->
    {#if showFindBar}
        <div
            class="flex flex-col gap-2 px-4 py-2 bg-base-200 border-b border-base-300"
        >
            <!-- Find Row -->
            <div class="flex items-center gap-2">
                <input
                    id="find-input"
                    type="text"
                    class="input input-sm input-bordered flex-1 max-w-xs"
                    placeholder="Find..."
                    bind:value={findQuery}
                    oninput={() => performFind()}
                    onkeydown={(e) => {
                        if (e.key === "Enter") {
                            e.shiftKey ? findPrev() : findNext();
                        } else if (e.key === "Escape") {
                            closeFindBar();
                        }
                    }}
                />
                <span class="text-sm text-base-content/60 min-w-[4rem]">
                    {findResultCount > 0
                        ? `${currentFindIndex}/${findResultCount}`
                        : "No results"}
                </span>
                <button
                    class="btn btn-sm btn-ghost btn-square"
                    onclick={findPrev}
                    title="Previous (Shift+Enter)"
                >
                    ↑
                </button>
                <button
                    class="btn btn-sm btn-ghost btn-square"
                    onclick={findNext}
                    title="Next (Enter)"
                >
                    ↓
                </button>
                <button class="btn btn-sm btn-ghost" onclick={closeFindBar}>
                    ✕
                </button>
            </div>

            <!-- Replace Row (optional) -->
            {#if showReplaceBar}
                <div class="flex items-center gap-2">
                    <input
                        type="text"
                        class="input input-sm input-bordered flex-1 max-w-xs"
                        placeholder="Replace with..."
                        bind:value={replaceText}
                        onkeydown={(e) => {
                            if (e.key === "Enter") replaceOne();
                            else if (e.key === "Escape") closeFindBar();
                        }}
                    />
                    <button class="btn btn-sm btn-outline" onclick={replaceOne}>
                        Replace
                    </button>
                    <button class="btn btn-sm btn-outline" onclick={replaceAll}>
                        Replace All
                    </button>
                </div>
            {/if}
        </div>
    {/if}

    {#if isLoading}
        <div class="flex-1 flex items-center justify-center">
            <span class="loading loading-spinner loading-lg"></span>
        </div>
    {:else}
        <!-- Large file warning banner -->
        {#if isLargeFile}
            <div
                class="bg-warning/10 text-warning border-b border-warning/20 px-4 py-2 flex items-center justify-between text-sm"
            >
                <span>
                    ⚠️ Large file ({contentSizeKB}KB) - Performance may be
                    impacted
                </span>
                <button
                    class="btn btn-ghost btn-xs"
                    onclick={() => (isLargeFile = false)}
                >
                    Dismiss
                </button>
            </div>
        {/if}

        {#if useVirtualEditor}
            <!-- Virtual editor for large files -->
            <VirtualTextEditor
                bind:content
                class="flex-1"
                onchange={(value) => {
                    content = value;
                    if (
                        isUntitled &&
                        typeof noteId === "string" &&
                        appState.untitledNotes[noteId]
                    ) {
                        appState.untitledNotes[noteId].content = value;
                    }
                    if (saveTimeout) clearTimeout(saveTimeout);
                    saveTimeout = setTimeout(() => saveContent(), 2000);
                }}
            />
        {:else}
            <!-- Editor overlay pattern: pre (highlighted) + textarea (transparent, on top) -->
            <div class="editor-overlay-container relative flex-1 w-full">
                <!-- Highlighted pre element (background) -->
                <pre
                    bind:this={preEl}
                    aria-hidden="true"
                    class="editor-highlight-layer absolute inset-0 m-0 p-4 overflow-hidden pointer-events-none whitespace-pre-wrap break-words">{@html highlightedContent}</pre>

                <!-- Transparent textarea (foreground, user types here) -->
                <textarea
                    bind:this={textareaEl}
                    bind:value={content}
                    class="editor-textarea-overlay absolute inset-0 w-full h-full p-4 bg-transparent border-none outline-none resize-none"
                    placeholder="Start typing..."
                    spellcheck="true"
                    onscroll={syncScroll}
                    oninput={(e) => {
                        const target = e.target as HTMLTextAreaElement;
                        const newValue = target.value;

                        content = newValue;
                        updateCursorInfo(target);

                        if (isUntitled && typeof noteId === "string") {
                            if (appState.untitledNotes[noteId]) {
                                appState.untitledNotes[noteId].content =
                                    newValue;
                            }
                            if (tab) {
                                updateTabState(noteId as any, {
                                    isDirty: true,
                                    cursorPosition: target.selectionStart,
                                });
                            }
                        } else if (tab && !isScratchpad) {
                            updateTabState(noteId as number, {
                                isDirty: true,
                                cursorPosition: target.selectionStart,
                            });
                        } else if (isScratchpad) {
                            updateScratchpad({
                                content: newValue,
                                cursorPosition: target.selectionStart,
                            });
                        }

                        if (saveTimeout) clearTimeout(saveTimeout);
                        saveTimeout = setTimeout(() => {
                            saveContent();
                        }, 2000);
                    }}
                    onblur={handleBlur}
                    onfocus={() => setActivePaneNoteId(noteId)}
                    onclick={(e) =>
                        updateCursorInfo(e.target as HTMLTextAreaElement)}
                    onkeyup={(e) =>
                        updateCursorInfo(e.target as HTMLTextAreaElement)}
                ></textarea>
            </div>
        {/if}
    {/if}
</div>

<!-- Link Modal -->
<dialog bind:this={linkDialogEl} class="modal">
    <div class="modal-box max-w-sm">
        <h3 class="font-bold text-lg mb-4">Insert Link</h3>

        <div class="space-y-4">
            <div class="form-control">
                <label class="label">
                    <span class="label-text">Text</span>
                </label>
                <input
                    type="text"
                    class="input input-bordered w-full"
                    placeholder="Link text"
                    bind:value={linkText}
                />
            </div>

            <div class="form-control">
                <label class="label">
                    <span class="label-text">URL</span>
                </label>
                <input
                    type="url"
                    class="input input-bordered w-full"
                    placeholder="https://"
                    bind:value={linkUrl}
                />
            </div>
        </div>

        <div class="modal-action">
            <button class="btn" onclick={cancelLink}>Cancel</button>
            <button class="btn btn-primary" onclick={confirmLink}>Insert</button
            >
        </div>
    </div>
    <form method="dialog" class="modal-backdrop">
        <button>close</button>
    </form>
</dialog>

<!-- Save To Notes Modal (for scratchpad) -->
<dialog bind:this={saveDialogEl} class="modal" onclose={cancelSave}>
    <div class="modal-box">
        <h3 class="font-bold text-lg mb-4">Save to Notes</h3>
        <p class="mb-4 text-sm text-base-content/70">
            Save this scratchpad as a permanent note
        </p>

        <!-- Note Name -->
        <div class="form-control mb-4">
            <label class="label" for="save-note-name">
                <span class="label-text">Note Name</span>
            </label>
            <input
                id="save-note-name"
                type="text"
                class="input input-bordered w-full"
                placeholder="Enter note name"
                bind:value={saveNoteName}
                onkeydown={(e) => e.key === "Enter" && confirmSaveToNotes()}
            />
        </div>

        <!-- Format Selection (hidden on mobile since speed-dial handles it) -->
        <div class="form-control hidden lg:block">
            <label class="label">
                <span class="label-text">File Format</span>
            </label>
            <div class="flex gap-4">
                <label class="label cursor-pointer gap-2">
                    <input
                        type="radio"
                        name="save-format"
                        class="radio radio-primary"
                        value="md"
                        checked={saveFormat === "md"}
                        onchange={() => (saveFormat = "md")}
                    />
                    <span class="label-text font-mono">.md</span>
                    <span class="label-text text-base-content/60">Markdown</span
                    >
                </label>
                <label class="label cursor-pointer gap-2">
                    <input
                        type="radio"
                        name="save-format"
                        class="radio radio-primary"
                        value="txt"
                        checked={saveFormat === "txt"}
                        onchange={() => (saveFormat = "txt")}
                    />
                    <span class="label-text font-mono">.txt</span>
                    <span class="label-text text-base-content/60"
                        >Plain Text</span
                    >
                </label>
            </div>
        </div>

        <div class="modal-action">
            <button class="btn" onclick={cancelSave}>Cancel</button>
            <button class="btn btn-primary" onclick={confirmSaveToNotes}>
                <Save size={16} />
                Save as {saveFormat.toUpperCase()}
            </button>
        </div>
    </div>
    <form method="dialog" class="modal-backdrop">
        <button>close</button>
    </form>
</dialog>

<style>
    /* Base editor font */
    .editor-textarea,
    .editor-textarea-overlay,
    .editor-highlight-layer {
        font-family: ui-monospace, "Cascadia Code", "Consolas",
            "DejaVu Sans Mono", monospace;
        font-size: var(--editor-font-size, 14px);
        line-height: 1.6;
        tab-size: 4;
    }

    /* Overlay container */
    .editor-overlay-container {
        position: relative;
        overflow: hidden;
    }

    /* Pre element - shows highlighted syntax */
    .editor-highlight-layer {
        color: oklch(var(--bc)); /* Base content color */
        background: transparent;
        margin: 0;
    }

    /* Textarea overlay - transparent text, visible caret */
    .editor-textarea-overlay {
        color: transparent !important;
        /* Use accent color for caret - always visible on any theme */
        caret-color: var(--accent-color, #ef4444) !important;
        background: transparent;
    }

    /* Markdown syntax highlighting classes */
    .editor-highlight-layer :global(.md-header) {
        color: oklch(var(--p));
        font-weight: 600;
    }

    .editor-highlight-layer :global(.md-bold) {
        font-weight: 700;
    }

    .editor-highlight-layer :global(.md-italic) {
        font-style: italic;
    }

    .editor-highlight-layer :global(.md-code) {
        background: oklch(var(--b3));
        padding: 0.1em 0.3em;
        border-radius: 3px;
        color: oklch(var(--s));
    }

    .editor-highlight-layer :global(.md-link) {
        color: oklch(var(--in));
        text-decoration: underline;
    }

    .editor-highlight-layer :global(.md-list) {
        color: oklch(var(--a));
    }

    .dropdown-content {
        position: absolute;
        top: 100%;
        left: 0;
    }
</style>
