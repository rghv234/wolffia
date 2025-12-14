<!--
  Wolffia - Main Page
  Editor with tabs, vertical tabs mode, and split screen support
-->
<script lang="ts">
    import TabBar from "$lib/components/TabBar.svelte";
    import VerticalTabBar from "$lib/components/VerticalTabBar.svelte";
    import Editor from "$lib/components/Editor.svelte";
    import MarkdownPreview from "$lib/components/MarkdownPreview.svelte";
    import { appState, setSplitRatio } from "$lib/stores/app.svelte";

    // Preview mode state - tied to specific note
    let previewNoteId = $state<number | string | null>(null);

    // Check if preview should be shown (only for active note that matches previewNoteId)
    let showPreview = $derived(
        previewNoteId !== null && previewNoteId === appState.activeNoteId,
    );

    // Check if current file is .md (for context menu)
    let isMarkdownFile = $derived.by(() => {
        const tab = appState.openTabs.find(
            (t) => t.noteId === appState.activeNoteId,
        );
        return tab?.title?.endsWith(".md") ?? false;
    });

    // Get content for preview from active note
    // For real-time updates, we check if Editor has exposed its content
    let previewContent = $derived.by(() => {
        const noteId = appState.activeNoteId;
        if (!noteId) return "";

        // Try to get from globalized editor content first (real-time updates)
        const editorContent = (globalThis as any).wolffiaEditorContent;
        if (typeof editorContent === "string") {
            return editorContent;
        }

        // Fallback to state
        if (typeof noteId === "string" && noteId.startsWith("untitled-")) {
            return appState.untitledNotes[noteId]?.content ?? "";
        } else if (noteId === "scratchpad") {
            return appState.scratchpadNote?.content ?? "";
        } else {
            // For saved notes, content is encrypted - we can't show preview directly
            // Editor decrypts and stores in local variable
            return "";
        }
    });

    // Toggle preview function (exposed for context menu)
    function togglePreview() {
        if (previewNoteId === appState.activeNoteId) {
            // Turn off preview
            previewNoteId = null;
        } else {
            // Turn on preview for current note
            previewNoteId = appState.activeNoteId;
        }
    }
    (globalThis as any).wolffiaTogglePreview = togglePreview;
    (globalThis as any).wolffiaIsMarkdownFile = () => isMarkdownFile;

    // Computed key for Editor to force re-render when untitled note changes
    let editorKey = $derived(
        `${appState.activeNoteId}-${appState.scratchpadVersion}`,
    );

    // Split view keys
    let leftEditorKey = $derived(`left-${appState.splitView?.leftNoteId}`);
    let rightEditorKey = $derived(`right-${appState.splitView?.rightNoteId}`);

    // Resizing state
    let isResizing = $state(false);
    let containerEl = $state<HTMLDivElement | null>(null);

    function handleMouseDown(e: MouseEvent) {
        e.preventDefault();
        isResizing = true;

        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing || !containerEl) return;
            const rect = containerEl.getBoundingClientRect();
            const ratio = (e.clientX - rect.left) / rect.width;
            setSplitRatio(ratio);
        };

        const handleMouseUp = () => {
            isResizing = false;
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };

        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
    }

    // Touch resizing for mobile
    function handleTouchStart(e: TouchEvent) {
        e.preventDefault();
        isResizing = true;

        const handleTouchMove = (e: TouchEvent) => {
            if (!isResizing || !containerEl) return;
            const rect = containerEl.getBoundingClientRect();
            const touch = e.touches[0];
            // For mobile, use Y for vertical split
            const ratio = (touch.clientY - rect.top) / rect.height;
            setSplitRatio(ratio);
        };

        const handleTouchEnd = () => {
            isResizing = false;
            document.removeEventListener("touchmove", handleTouchMove);
            document.removeEventListener("touchend", handleTouchEnd);
        };

        document.addEventListener("touchmove", handleTouchMove, {
            passive: false,
        });
        document.addEventListener("touchend", handleTouchEnd);
    }
</script>

<svelte:head>
    <title>Wolffia - Notes</title>
</svelte:head>

<div class="flex h-full">
    <!-- Main content -->
    <div class="flex-1 flex flex-col overflow-hidden">
        <!-- Horizontal Tab bar (if vertical tabs disabled) -->
        {#if !appState.verticalTabsEnabled}
            <TabBar />
        {/if}

        <!-- Editor area -->
        <div class="flex-1 overflow-hidden" bind:this={containerEl}>
            {#if appState.splitView?.enabled}
                <!-- Split View Mode -->
                <div class="flex flex-col lg:flex-row h-full">
                    <!-- Left/Top Editor -->
                    <div
                        class="overflow-hidden"
                        style="flex: {appState.splitView.splitRatio} 1 0%;"
                    >
                        {#if appState.splitView.leftNoteId}
                            {#key leftEditorKey}
                                <Editor
                                    noteId={appState.splitView.leftNoteId}
                                />
                            {/key}
                        {/if}
                    </div>

                    <!-- Resizable Divider -->
                    <div
                        class="flex-shrink-0 bg-base-300 hover:bg-primary/50 transition-colors cursor-col-resize lg:cursor-col-resize cursor-row-resize lg:w-1 w-full lg:h-full h-1 group"
                        onmousedown={handleMouseDown}
                        ontouchstart={handleTouchStart}
                        role="separator"
                        aria-orientation="vertical"
                    >
                        <div
                            class="w-full h-full flex items-center justify-center"
                        >
                            <div
                                class="hidden lg:block w-0.5 h-8 bg-base-content/20 group-hover:bg-primary rounded-full"
                            ></div>
                            <div
                                class="lg:hidden h-0.5 w-8 bg-base-content/20 group-hover:bg-primary rounded-full"
                            ></div>
                        </div>
                    </div>

                    <!-- Right/Bottom Editor -->
                    <div
                        class="overflow-hidden"
                        style="flex: {1 - appState.splitView.splitRatio} 1 0%;"
                    >
                        {#if appState.splitView.rightNoteId}
                            {#key rightEditorKey}
                                <Editor
                                    noteId={appState.splitView.rightNoteId}
                                />
                            {/key}
                        {/if}
                    </div>
                </div>
            {:else if appState.activeNoteId}
                <!-- Single Editor Mode (with optional preview) -->
                {#if showPreview}
                    <div class="flex flex-row h-full">
                        <div class="flex-1 overflow-hidden">
                            {#key editorKey}
                                <Editor noteId={appState.activeNoteId} />
                            {/key}
                        </div>
                        <div class="w-px bg-base-300"></div>
                        <div class="flex-1 overflow-hidden">
                            <MarkdownPreview content={previewContent} />
                        </div>
                    </div>
                {:else}
                    {#key editorKey}
                        <Editor noteId={appState.activeNoteId} />
                    {/key}
                {/if}
            {:else}
                <!-- Empty state -->
                <div
                    class="flex items-center justify-center h-full text-base-content/50"
                >
                    <div class="text-center">
                        <p class="text-lg">No note selected</p>
                        <p class="text-sm mt-2">
                            Select a note from the sidebar or create a new one
                        </p>
                    </div>
                </div>
            {/if}
        </div>
    </div>

    <!-- Vertical Tabs on RIGHT side (if enabled) -->
    {#if appState.verticalTabsEnabled}
        <VerticalTabBar />
    {/if}
</div>
