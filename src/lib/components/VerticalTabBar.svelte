<!--
  Wolffia - VerticalTabBar Component
  Collapsible vertical tabs on RIGHT side for desktop, slide-out drawer from RIGHT for mobile
  Compact mode shows just file icons when collapsed
-->
<script lang="ts">
    import {
        X,
        Plus,
        ChevronLeft,
        ChevronRight,
        PanelRight,
        PanelRightClose,
        FileText,
    } from "@lucide/svelte";
    import {
        appState,
        closeTab,
        createUntitledNote,
        toggleVerticalTabs,
        toggleVerticalTabsExpanded,
        toggleTabSelection,
        setTabColor,
        clearTabColor,
    } from "$lib/stores/app.svelte";

    // Color picker options for tab highlighting
    const tabColorOptions = [
        "#ef4444",
        "#f97316",
        "#eab308",
        "#22c55e",
        "#06b6d4",
        "#3b82f6",
        "#8b5cf6",
        "#ec4899",
    ];

    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    let showContextMenu = $state(false);
    let contextMenuX = $state(0);
    let contextMenuY = $state(0);
    let isCollapsed = $state(false);

    function handleTabClick(noteId: number | string, e: MouseEvent) {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            toggleTabSelection(noteId);
        } else {
            appState.activeNoteId = noteId;
        }
    }

    function handleCloseTab(e: MouseEvent, noteId: number | string) {
        e.stopPropagation();
        if (typeof noteId === "string" && noteId.startsWith("untitled-")) {
            delete appState.untitledNotes[noteId];
            appState.openTabs = appState.openTabs.filter(
                (t) => t.noteId !== noteId,
            );
            if (appState.activeNoteId === noteId) {
                appState.activeNoteId = appState.openTabs[0]?.noteId ?? null;
            }
        } else if (typeof noteId === "number") {
            closeTab(noteId);
        }
    }

    function handleNewNote() {
        createUntitledNote();
    }

    function handleContextMenu(e: MouseEvent) {
        e.preventDefault();
        contextMenuX = e.clientX;
        contextMenuY = e.clientY;
        showContextMenu = true;
    }

    function handleTouchStart() {
        longPressTimer = setTimeout(() => {
            contextMenuX = window.innerWidth / 2;
            contextMenuY = window.innerHeight / 3;
            showContextMenu = true;
        }, 500);
    }

    function handleTouchEnd() {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    }

    function closeContextMenu() {
        showContextMenu = false;
    }

    function handleDisableVerticalTabs() {
        toggleVerticalTabs();
        closeContextMenu();
    }

    function toggleCollapsed() {
        isCollapsed = !isCollapsed;
    }

    // Per-tab context menu for coloring
    let showTabContextMenu = $state(false);
    let tabContextMenuX = $state(0);
    let tabContextMenuY = $state(0);
    let tabContextMenuNoteId = $state<number | string | null>(null);

    function handleTabRightClick(e: MouseEvent, noteId: number | string) {
        e.preventDefault();
        e.stopPropagation();
        tabContextMenuX = e.clientX;
        tabContextMenuY = e.clientY;
        tabContextMenuNoteId = noteId;
        showTabContextMenu = true;
        showContextMenu = false;
    }

    function closeTabContextMenu() {
        showTabContextMenu = false;
        tabContextMenuNoteId = null;
    }

    function handleSetTabColor(color: string) {
        if (tabContextMenuNoteId !== null) {
            setTabColor(tabContextMenuNoteId, color);
        }
        closeTabContextMenu();
    }

    function handleClearTabColor() {
        if (tabContextMenuNoteId !== null) {
            clearTabColor(tabContextMenuNoteId);
        }
        closeTabContextMenu();
    }
</script>

<!-- Desktop: Collapsible sidebar panel on RIGHT side -->
<div
    class="hidden lg:flex flex-col h-full bg-base-200 border-l border-base-300 transition-all duration-200
           {isCollapsed ? 'w-12' : 'w-52'}"
    oncontextmenu={handleContextMenu}
>
    {#if isCollapsed}
        <!-- Collapsed: Compact icon view with file icons -->
        <div class="flex flex-col h-full">
            <button
                class="p-2 flex items-center justify-center hover:bg-base-300 border-b border-base-300"
                onclick={toggleCollapsed}
                title="Expand tabs panel"
            >
                <ChevronLeft size={16} />
            </button>
            <div class="flex-1 overflow-y-auto py-1">
                {#each appState.openTabs as tab (tab.noteId)}
                    <button
                        class="w-full p-2 flex items-center justify-center hover:bg-base-300 relative
                               {appState.activeNoteId === tab.noteId
                            ? 'bg-primary/20'
                            : ''}"
                        style={appState.tabColors[tab.noteId]
                            ? `border-left: 3px solid ${appState.tabColors[tab.noteId]};`
                            : ""}
                        title={tab.title}
                        onclick={(e) =>
                            handleTabClick(
                                tab.noteId,
                                e as unknown as MouseEvent,
                            )}
                        oncontextmenu={(e) =>
                            handleTabRightClick(e, tab.noteId)}
                    >
                        <FileText
                            size={18}
                            class={tab.isDirty ? "text-warning" : ""}
                        />
                    </button>
                {/each}
            </div>
            <button
                class="p-2 flex items-center justify-center hover:bg-base-300 border-t border-base-300"
                title="New Note (Ctrl+N)"
                onclick={handleNewNote}
            >
                <Plus size={16} />
            </button>
        </div>
    {:else}
        <!-- Header -->
        <div
            class="flex items-center justify-between p-2 border-b border-base-300"
        >
            <span class="text-sm font-medium">Open Tabs</span>
            <div class="flex gap-1">
                <button
                    class="btn btn-ghost btn-xs btn-square"
                    title="New Note (Ctrl+N)"
                    onclick={handleNewNote}
                >
                    <Plus size={16} />
                </button>
                <button
                    class="btn btn-ghost btn-xs btn-square"
                    title="Collapse panel"
                    onclick={toggleCollapsed}
                >
                    <ChevronRight size={16} />
                </button>
            </div>
        </div>

        <!-- Tabs list -->
        <div class="flex-1 overflow-y-auto p-1">
            {#each appState.openTabs as tab (tab.noteId)}
                <div
                    class="group flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-sm transition-colors mb-1
                           {appState.activeNoteId === tab.noteId
                        ? 'bg-primary/10 text-primary border border-primary/30'
                        : 'hover:bg-base-300'}
                           {appState.selectedTabs.has(tab.noteId)
                        ? 'ring-2 ring-secondary'
                        : ''}"
                    style={appState.tabColors[tab.noteId]
                        ? `border-left: 3px solid ${appState.tabColors[tab.noteId]}; background-color: ${appState.tabColors[tab.noteId]}15;`
                        : ""}
                    role="tab"
                    tabindex="0"
                    aria-selected={appState.activeNoteId === tab.noteId}
                    onclick={(e) => handleTabClick(tab.noteId, e)}
                    oncontextmenu={(e) => handleTabRightClick(e, tab.noteId)}
                    onkeydown={(e) =>
                        e.key === "Enter" &&
                        handleTabClick(tab.noteId, e as unknown as MouseEvent)}
                >
                    <span class="flex-1 truncate">
                        {tab.isDirty ? "● " : ""}{tab.title}
                    </span>
                    {#if typeof tab.noteId === "string" && tab.noteId.startsWith("untitled-")}
                        <span class="badge badge-xs badge-warning">new</span>
                    {/if}
                    <button
                        class="p-0.5 rounded hover:bg-base-300 opacity-0 group-hover:opacity-100 transition-opacity"
                        onclick={(e) => handleCloseTab(e, tab.noteId)}
                        aria-label="Close tab"
                    >
                        <X size={14} />
                    </button>
                </div>
            {/each}
        </div>
    {/if}
</div>

<!-- Mobile: Toggle button on RIGHT + slide-out panel from RIGHT -->
<div class="lg:hidden">
    <!-- Chevron button on RIGHT edge -->
    <button
        class="fixed right-0 top-1/2 -translate-y-1/2 z-40 p-1 bg-base-200 border border-base-300 rounded-l-lg shadow-lg"
        onclick={toggleVerticalTabsExpanded}
        aria-label="Toggle tabs panel"
        ontouchstart={handleTouchStart}
        ontouchend={handleTouchEnd}
    >
        {#if appState.verticalTabsExpanded}
            <ChevronRight size={20} />
        {:else}
            <ChevronLeft size={20} />
        {/if}
    </button>

    <!-- Slide-out panel from RIGHT -->
    {#if appState.verticalTabsExpanded}
        <!-- Backdrop -->
        <div
            class="fixed inset-0 bg-black/50 z-40"
            onclick={toggleVerticalTabsExpanded}
            role="button"
            tabindex="0"
            onkeydown={(e) =>
                e.key === "Escape" && toggleVerticalTabsExpanded()}
        ></div>

        <!-- Panel on RIGHT side -->
        <div
            class="fixed right-0 top-0 bottom-0 w-64 bg-base-200 z-50 shadow-xl animate-slide-in-right"
            ontouchstart={handleTouchStart}
            ontouchend={handleTouchEnd}
        >
            <!-- Header -->
            <div
                class="flex items-center justify-between p-3 border-b border-base-300"
            >
                <button
                    class="btn btn-ghost btn-xs btn-square"
                    onclick={toggleVerticalTabsExpanded}
                >
                    <X size={16} />
                </button>
                <span class="font-medium">Open Tabs</span>
                <button
                    class="btn btn-ghost btn-xs btn-square"
                    title="New Note"
                    onclick={handleNewNote}
                >
                    <Plus size={16} />
                </button>
            </div>

            <!-- Tabs list -->
            <div class="overflow-y-auto p-2" style="height: calc(100% - 56px);">
                {#each appState.openTabs as tab (tab.noteId)}
                    <div
                        class="group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors mb-1
                               {appState.activeNoteId === tab.noteId
                            ? 'bg-primary/10 text-primary'
                            : 'hover:bg-base-300'}
                               {appState.selectedTabs.has(tab.noteId)
                            ? 'ring-2 ring-secondary'
                            : ''}"
                        role="tab"
                        tabindex="0"
                        aria-selected={appState.activeNoteId === tab.noteId}
                        onclick={(e) => {
                            handleTabClick(tab.noteId, e);
                            toggleVerticalTabsExpanded();
                        }}
                    >
                        <span class="flex-1 truncate">
                            {tab.isDirty ? "● " : ""}{tab.title}
                        </span>
                        {#if typeof tab.noteId === "string" && tab.noteId.startsWith("untitled-")}
                            <span class="badge badge-xs badge-warning">new</span
                            >
                        {/if}
                        <button
                            class="p-1 rounded hover:bg-base-300"
                            onclick={(e) => handleCloseTab(e, tab.noteId)}
                            aria-label="Close tab"
                        >
                            <X size={14} />
                        </button>
                    </div>
                {/each}
            </div>
        </div>
    {/if}
</div>

<!-- Context Menu -->
{#if showContextMenu}
    <div
        class="fixed inset-0 z-50"
        onclick={closeContextMenu}
        onkeydown={(e) => e.key === "Escape" && closeContextMenu()}
        role="button"
        tabindex="0"
    >
        <ul
            class="menu bg-base-100 rounded-box shadow-lg p-2 w-52"
            style="position: fixed; left: {contextMenuX}px; top: {contextMenuY}px;"
        >
            <li>
                <button onclick={handleDisableVerticalTabs}>
                    <PanelRight size={16} />
                    Use Horizontal Tabs
                </button>
            </li>
        </ul>
    </div>
{/if}

<!-- Tab-specific Context Menu (Color Picker) -->
{#if showTabContextMenu}
    <div
        class="fixed inset-0 z-50"
        onclick={closeTabContextMenu}
        onkeydown={(e) => e.key === "Escape" && closeTabContextMenu()}
        role="button"
        tabindex="0"
    >
        <div
            class="menu bg-base-100 rounded-box shadow-lg p-2 w-48"
            style="position: fixed; left: {tabContextMenuX}px; top: {tabContextMenuY}px;"
        >
            <p class="px-3 py-1 text-xs text-base-content/60 uppercase">
                Tab Color
            </p>
            <div class="flex flex-wrap gap-1 px-2 py-1">
                {#each tabColorOptions as color}
                    <button
                        class="w-6 h-6 rounded-full border-2 hover:scale-110 transition-transform"
                        style="background-color: {color}; border-color: {appState
                            .tabColors[tabContextMenuNoteId ?? ''] === color
                            ? 'white'
                            : 'transparent'};"
                        onclick={() => handleSetTabColor(color)}
                        title={color}
                    ></button>
                {/each}
            </div>
            <div class="divider my-1"></div>
            <button
                class="btn btn-ghost btn-sm w-full justify-start gap-2"
                onclick={handleClearTabColor}
            >
                Clear Color
            </button>
        </div>
    </div>
{/if}

<style>
    @keyframes slide-in-right {
        from {
            transform: translateX(100%);
        }
        to {
            transform: translateX(0);
        }
    }
    .animate-slide-in-right {
        animation: slide-in-right 0.2s ease-out;
    }
</style>
