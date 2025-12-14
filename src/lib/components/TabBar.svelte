<!--
  Wolffia - TabBar Component
  Horizontal tabs with scroll buttons, context menu, and multi-selection for split view
-->
<script lang="ts">
    import {
        X,
        Plus,
        ChevronLeft,
        ChevronRight,
        PanelLeftClose,
    } from "@lucide/svelte";
    import {
        appState,
        closeTab,
        createUntitledNote,
        toggleVerticalTabs,
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

    let tabsContainerEl = $state<HTMLDivElement | null>(null);
    let canScrollLeft = $state(false);
    let canScrollRight = $state(false);

    // Context menu state (for tab bar)
    let showContextMenu = $state(false);
    let contextMenuX = $state(0);
    let contextMenuY = $state(0);
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;

    // Per-tab context menu state (for coloring)
    let showTabContextMenu = $state(false);
    let tabContextMenuX = $state(0);
    let tabContextMenuY = $state(0);
    let tabContextMenuNoteId = $state<number | string | null>(null);

    function handleTabClick(noteId: number | string, e: MouseEvent) {
        // Ctrl+click for multi-select (split view)
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

    // Tab-specific right-click handler
    function handleTabRightClick(e: MouseEvent, noteId: number | string) {
        e.preventDefault();
        e.stopPropagation();
        tabContextMenuX = e.clientX;
        tabContextMenuY = e.clientY;
        tabContextMenuNoteId = noteId;
        showTabContextMenu = true;
        showContextMenu = false;
    }

    // Mobile long-press handler for individual tabs (color picker)
    let tabLongPressTimer: ReturnType<typeof setTimeout> | null = null;

    function handleTabTouchStart(noteId: number | string) {
        tabLongPressTimer = setTimeout(() => {
            // Center the context menu on mobile
            tabContextMenuX = window.innerWidth / 2 - 96; // 96 = half of w-48
            tabContextMenuY = window.innerHeight / 3;
            tabContextMenuNoteId = noteId;
            showTabContextMenu = true;
        }, 500);
    }

    function handleTabTouchEnd() {
        if (tabLongPressTimer) {
            clearTimeout(tabLongPressTimer);
            tabLongPressTimer = null;
        }
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

    // Scroll functions
    function updateScrollButtons() {
        if (tabsContainerEl) {
            canScrollLeft = tabsContainerEl.scrollLeft > 0;
            canScrollRight =
                tabsContainerEl.scrollLeft <
                tabsContainerEl.scrollWidth - tabsContainerEl.clientWidth - 1;
        }
    }

    function scrollLeft() {
        if (tabsContainerEl) {
            tabsContainerEl.scrollBy({ left: -150, behavior: "smooth" });
        }
    }

    function scrollRight() {
        if (tabsContainerEl) {
            tabsContainerEl.scrollBy({ left: 150, behavior: "smooth" });
        }
    }

    function handleWheel(e: WheelEvent) {
        if (tabsContainerEl) {
            e.preventDefault();
            tabsContainerEl.scrollLeft += e.deltaY;
            updateScrollButtons();
        }
    }

    function handleScroll() {
        updateScrollButtons();
    }

    // Context menu
    function handleContextMenu(e: MouseEvent) {
        e.preventDefault();
        contextMenuX = e.clientX;
        contextMenuY = e.clientY;
        showContextMenu = true;
    }

    function handleTouchStart(e: TouchEvent) {
        longPressTimer = setTimeout(() => {
            contextMenuX = e.touches[0].clientX;
            contextMenuY = e.touches[0].clientY;
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

    function handleEnableVerticalTabs() {
        toggleVerticalTabs();
        closeContextMenu();
    }

    $effect(() => {
        const _ = appState.openTabs.length;
        setTimeout(updateScrollButtons, 50);
    });
</script>

{#if appState.openTabs.length > 0}
    <div
        class="tab-bar flex items-center bg-base-200 border-b border-base-300 h-10 relative"
        oncontextmenu={handleContextMenu}
        ontouchstart={handleTouchStart}
        ontouchend={handleTouchEnd}
        role="tablist"
    >
        <!-- Left scroll button -->
        {#if canScrollLeft}
            <button
                class="absolute left-0 z-10 h-full px-1 bg-gradient-to-r from-base-200 via-base-200 to-transparent hover:from-base-300"
                onclick={scrollLeft}
                aria-label="Scroll tabs left"
            >
                <ChevronLeft size={16} />
            </button>
        {/if}

        <!-- Scrollable tabs container -->
        <div
            bind:this={tabsContainerEl}
            class="flex-1 flex items-center overflow-x-auto flex-nowrap px-2 touch-pan-x"
            style="scrollbar-width: none; -ms-overflow-style: none; -webkit-overflow-scrolling: touch;"
            onwheel={handleWheel}
            onscroll={handleScroll}
        >
            {#each appState.openTabs as tab (tab.noteId)}
                <div
                    class="group flex items-center gap-1 px-3 py-1.5 mr-1 rounded-t-lg cursor-pointer text-sm transition-colors flex-shrink-0
                           {appState.activeNoteId === tab.noteId
                        ? 'bg-base-100 border-t border-x border-base-300'
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
                    ontouchstart={() => handleTabTouchStart(tab.noteId)}
                    ontouchend={handleTabTouchEnd}
                    onkeydown={(e) =>
                        e.key === "Enter" &&
                        handleTabClick(tab.noteId, e as unknown as MouseEvent)}
                >
                    <span class="truncate max-w-[120px]">
                        {tab.isDirty ? "● " : ""}{tab.title}
                        {#if typeof tab.noteId === "string" && (tab.noteId.startsWith("untitled-") || tab.noteId === "scratchpad")}
                            <span class="badge badge-xs badge-warning ml-1"
                                >unsaved</span
                            >
                        {/if}
                    </span>
                    <button
                        class="ml-1 p-0.5 rounded hover:bg-base-300 opacity-0 group-hover:opacity-100 transition-opacity"
                        onclick={(e) => handleCloseTab(e, tab.noteId)}
                        aria-label="Close tab"
                    >
                        <X size={14} />
                    </button>
                </div>
            {/each}

            <!-- New Tab Button -->
            <button
                class="btn btn-ghost btn-xs btn-square ml-1 flex-shrink-0"
                title="New Note (Ctrl+N)"
                onclick={handleNewNote}
            >
                <Plus size={16} />
            </button>
        </div>

        <!-- Right scroll button -->
        {#if canScrollRight}
            <button
                class="absolute right-0 z-10 h-full px-1 bg-gradient-to-l from-base-200 via-base-200 to-transparent hover:from-base-300"
                onclick={scrollRight}
                aria-label="Scroll tabs right"
            >
                <ChevronRight size={16} />
            </button>
        {/if}
    </div>
{/if}

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
                <button onclick={handleEnableVerticalTabs}>
                    <PanelLeftClose size={16} />
                    Use Vertical Tabs
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
            {#if (globalThis as any).wolffiaIsMarkdownFile?.() || tabContextMenuNoteId
                    ?.toString()
                    .startsWith("untitled-")}
                <button
                    class="btn btn-ghost btn-sm w-full justify-start gap-2"
                    onclick={() => {
                        (globalThis as any).wolffiaTogglePreview?.();
                        closeTabContextMenu();
                    }}
                >
                    Toggle Preview
                </button>
            {/if}
        </div>
    </div>
{/if}
