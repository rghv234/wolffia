<!--
  Wolffia - StatusBar Component
  Editor metrics connected to app state
-->
<script lang="ts">
    import {
        appState,
        enableSplitView,
        disableSplitView,
    } from "$lib/stores/app.svelte";
    import {
        ZoomIn,
        ZoomOut,
        RotateCcw,
        SplitSquareHorizontal,
        Columns3,
    } from "@lucide/svelte";

    let { class: className = "" } = $props<{ class?: string }>();

    // Split view state
    let showSplitButton = $derived(
        appState.selectedTabs.size === 2 || appState.splitView?.enabled,
    );
    let isSplitActive = $derived(appState.splitView?.enabled);

    function handleSplitClick() {
        if (isSplitActive) {
            disableSplitView();
        } else if (appState.selectedTabs.size === 2) {
            enableSplitView();
        }
    }

    // Get current tab info
    let currentTab = $derived(
        appState.openTabs.find((t) => t.noteId === appState.activeNoteId),
    );

    // Get active note
    let activeNote = $derived(
        appState.activeNoteId === "scratchpad"
            ? appState.scratchpadNote
            : appState.notes?.find((n) => n.id === appState.activeNoteId),
    );

    // Cursor position from appState (updated by Editor)
    let cursorLine = $derived(appState.cursorLine);
    let cursorCol = $derived(appState.cursorCol);
    let charCount = $derived(appState.charCount);

    // Detect file type from title extension
    let fileType = $derived.by(() => {
        const title = currentTab?.title || activeNote?.title || "";
        const noteId = appState.activeNoteId;

        // Check explicit file extensions
        if (title.endsWith(".txt")) return "Plain Text";
        if (title.endsWith(".md")) return "Markdown";

        // For untitled notes (not yet saved), show as unsaved
        if (typeof noteId === "string" && noteId.startsWith("untitled-")) {
            return "Unsaved";
        }

        // Scratchpad is always markdown-style
        if (noteId === "scratchpad") return "Scratchpad";

        // For saved notes without extension, assume Markdown
        return "Markdown";
    });
    let encoding = $state("UTF-8");
    let zoomLevel = $derived(
        appState.editorFontSize
            ? Math.round((appState.editorFontSize / 14) * 100)
            : 100,
    );

    // Zoom functions - update both state and CSS variable
    function zoomIn() {
        if (appState.editorFontSize < 24) {
            appState.editorFontSize += 2;
            document.documentElement.style.setProperty(
                "--editor-font-size",
                appState.editorFontSize + "px",
            );
        }
    }

    function zoomOut() {
        if (appState.editorFontSize > 10) {
            appState.editorFontSize -= 2;
            document.documentElement.style.setProperty(
                "--editor-font-size",
                appState.editorFontSize + "px",
            );
        }
    }

    function zoomReset() {
        appState.editorFontSize = 14;
        document.documentElement.style.setProperty(
            "--editor-font-size",
            "14px",
        );
    }
</script>

<footer
    class="status-bar px-4 flex items-center justify-between border-t border-base-300 bg-base-200 {className}"
>
    <div
        class="flex-1 flex items-center gap-4 text-xs text-base-content/70 overflow-hidden"
    >
        {#if activeNote || appState.activeNoteId === "scratchpad"}
            <!-- Line/Column -->
            <span>Ln {cursorLine}, Col {cursorCol}</span>

            <!-- Character count -->
            <span>Length: {charCount}</span>

            <!-- File Type -->
            <span class="hidden sm:inline">{fileType}</span>

            <!-- Encoding -->
            <span class="hidden sm:inline">{encoding}</span>
        {:else}
            <span class="text-base-content/50">No file open</span>
        {/if}
    </div>

    <div class="flex-none flex items-center gap-2 text-xs text-base-content/70">
        <!-- Zoom controls -->
        <div class="flex items-center gap-1">
            <button
                class="btn btn-ghost btn-xs btn-square"
                title="Zoom Out (Ctrl+-)"
                onclick={zoomOut}
            >
                <ZoomOut size={14} />
            </button>
            <span class="min-w-12 text-center">{zoomLevel}%</span>
            <button
                class="btn btn-ghost btn-xs btn-square"
                title="Zoom In (Ctrl++)"
                onclick={zoomIn}
            >
                <ZoomIn size={14} />
            </button>
            <button
                class="btn btn-ghost btn-xs btn-square"
                title="Reset Zoom (Ctrl+0)"
                onclick={zoomReset}
            >
                <RotateCcw size={12} />
            </button>
        </div>

        <!-- Split View Button (only when 2 tabs selected or split active) -->
        {#if showSplitButton}
            <button
                class="btn btn-xs gap-1 px-2"
                style="background-color: var(--accent-color); color: white;"
                title={isSplitActive ? "Unsplit View" : "Split View"}
                onclick={handleSplitClick}
            >
                {#if isSplitActive}
                    <Columns3 size={12} />
                    <span class="hidden sm:inline">Unsplit</span>
                {:else}
                    <SplitSquareHorizontal size={12} />
                    <span class="hidden sm:inline">Split</span>
                {/if}
            </button>
        {/if}

        <!-- Save status -->
        {#if currentTab?.isDirty}
            <span class="text-warning">Unsaved</span>
        {:else if currentTab}
            <span class="text-success">Saved</span>
        {/if}
    </div>
</footer>
