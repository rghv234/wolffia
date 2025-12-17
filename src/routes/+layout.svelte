<!--
  Wolffia - Root Layout
  daisyUI Drawer with responsive sidebar
  Auth pages render without sidebar
-->
<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  // Note: Using window.location.href instead of goto to avoid $app/navigation type issues
  import Sidebar from "$lib/components/Sidebar.svelte";
  import StatusBar from "$lib/components/StatusBar.svelte";
  import ThemeController from "$lib/components/ThemeController.svelte";
  import SettingsModal from "$lib/components/SettingsModal.svelte";
  import ImportExportModal from "$lib/components/ImportExportModal.svelte";
  import SaveModal from "$lib/components/SaveModal.svelte";
  import { Plus, Columns3, SplitSquareHorizontal } from "@lucide/svelte";
  import {
    appState,
    createScratchpadNote,
    setAccentColor,
    setDarkModeIntensity,
    enableSplitView,
    disableSplitView,
  } from "$lib/stores/app.svelte";
  import { loadAllData, connectSync, syncPendingNotes } from "$lib/sync";
  import { initKeyboardShortcuts } from "$lib/shortcuts";
  import { restoreEncryptionKey } from "$lib/crypto";

  let { children } = $props();

  let showSettings = $state(false);
  let showImportExport = $state(false);
  let isInitialized = $state(false);
  let isAuthPage = $state(false);

  // Track URL changes to detect auth page
  // Use window.location directly and update on navigation
  function updateAuthPageStatus() {
    if (typeof window !== "undefined") {
      isAuthPage = window.location.pathname.startsWith("/auth");
    }
  }

  function handleNewNote() {
    createScratchpadNote();
  }

  onMount(() => {
    updateAuthPageStatus();
    initializeApp();
    // Always setup menu listener
    setupMenuListener();
    // Apply saved accent color
    if (appState.accentColor) {
      setAccentColor(appState.accentColor);
    }

    // Register service worker for PWA offline support
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          console.log("[PWA] Service Worker registered:", registration.scope);
        })
        .catch((error) => {
          console.error("[PWA] Service Worker registration failed:", error);
        });
    }

    // Sync pending notes when coming back online
    const handleOnline = async () => {
      console.log("[PWA] Back online - syncing pending changes");
      await syncPendingNotes();

      // Sync pending deletes
      const pendingDeletes = localStorage.getItem("wolffia_pending_deletes");
      if (pendingDeletes) {
        const ids: number[] = JSON.parse(pendingDeletes);
        const remaining: number[] = [];
        const { notes: notesApi } = await import("$lib/api");

        for (const noteId of ids) {
          try {
            const result = await notesApi.delete(noteId);
            if (!result.error) {
              console.log("[PWA] Synced pending delete:", noteId);
            } else {
              remaining.push(noteId);
            }
          } catch {
            remaining.push(noteId);
          }
        }

        if (remaining.length > 0) {
          localStorage.setItem(
            "wolffia_pending_deletes",
            JSON.stringify(remaining),
          );
        } else {
          localStorage.removeItem("wolffia_pending_deletes");
        }
      }

      // Also try to reconnect SSE
      loadAllData();
      connectSync();
    };
    window.addEventListener("online", handleOnline);

    // Apply saved theme on mount (important for auth page)
    const savedTheme = localStorage.getItem("wolffia_theme") as
      | "system"
      | "emerald"
      | "dracula"
      | null;
    if (savedTheme && savedTheme !== "system") {
      document.documentElement.dataset.theme = savedTheme;
    } else {
      // Apply based on system preference
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      document.documentElement.dataset.theme = prefersDark
        ? "dracula"
        : "emerald";

      // Update PWA theme-color meta tag for titlebar
      const themeColorMeta = document.querySelector('meta[name="theme-color"]');
      if (themeColorMeta) {
        themeColorMeta.setAttribute(
          "content",
          prefersDark ? "#1f2937" : "#f3f4f6",
        );
      }
    }

    // Apply saved dark mode intensity (OLED, Dim, or Normal)
    if (appState.darkModeIntensity && appState.darkModeIntensity !== "normal") {
      setDarkModeIntensity(appState.darkModeIntensity);
    }

    // Listen for navigation events
    window.addEventListener("popstate", updateAuthPageStatus);

    // Disable browser context menu globally to allow custom context menu
    document.addEventListener("contextmenu", (e) => {
      // Only prevent default if the target is inside the sidebar
      if ((e.target as HTMLElement).closest(".sidebar")) {
        e.preventDefault();
      }
    });

    // Also check periodically for SPA navigation (goto doesn't trigger popstate)
    const checkInterval = setInterval(updateAuthPageStatus, 100);
    setTimeout(() => clearInterval(checkInterval), 2000); // Stop after 2s

    // Initialize keyboard shortcuts (Ctrl+N, Ctrl+S, etc.)
    const cleanupShortcuts = initKeyboardShortcuts();

    return () => {
      cleanupShortcuts?.();
    };
  });

  async function initializeApp() {
    // Auth pages don't need initialization checks
    if (isAuthPage) {
      isInitialized = true;
      return;
    }

    // Restore encryption key from cache (for offline use)
    await restoreEncryptionKey();

    // Show UI immediately - app works offline-first without login
    isInitialized = true;

    // If logged in, load data from server
    if (appState.token) {
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Backend timeout")), 5000),
        );
        await Promise.race([loadAllData(), timeoutPromise]);
        connectSync();
      } catch (e) {
        console.warn("Backend not available, working offline:", e);
      }
    } else {
      console.log(
        "[App] Running in offline-first mode without login. Login via Settings to sync.",
      );
    }
  }

  async function setupMenuListener() {
    if (typeof window !== "undefined" && "__TAURI__" in window) {
      console.log("[Menu] Setting up Tauri menu listener...");
      try {
        const { listen } = await import("@tauri-apps/api/event");

        await listen<string>("menu-event", (event) => {
          console.log("[Menu] Received menu event:", event.payload);
          switch (event.payload) {
            case "new":
            case "new-note":
              createScratchpadNote();
              break;
            case "settings":
              showSettings = true;
              break;
            case "import":
            case "export":
            case "import-export":
              showImportExport = true;
              break;
            case "toggle_sidebar":
            case "toggle-sidebar":
              const checkbox = document.getElementById(
                "sidebar-drawer",
              ) as HTMLInputElement;
              if (checkbox) checkbox.checked = !checkbox.checked;
              break;
            case "find":
              document.dispatchEvent(new CustomEvent("wolffia:find"));
              break;
            case "replace":
              document.dispatchEvent(new CustomEvent("wolffia:replace"));
              break;
            case "save":
              document.dispatchEvent(new CustomEvent("wolffia:save"));
              break;
            default:
              console.log("[Menu] Unhandled menu event:", event.payload);
          }
        });
        console.log("[Menu] Listener registered successfully");
      } catch (e) {
        console.warn("[Menu] Tauri event listener not available:", e);
      }
    } else {
      // Web browser context - no Tauri menu listener needed
    }
  }
</script>

{#if !isInitialized}
  <!-- Loading state -->
  <div class="h-screen flex items-center justify-center bg-base-200">
    <div class="text-center">
      <span class="loading loading-spinner loading-lg text-primary"></span>
      <p class="mt-4 text-base-content/60">Loading...</p>
    </div>
  </div>
{:else if isAuthPage}
  <!-- Auth pages: No sidebar, no navbar, just content -->
  {@render children()}
{:else}
  <!-- Main app: Full layout with sidebar -->
  <!-- Sidebar conditionally open on desktop based on sidebarVisible -->
  <div
    class="drawer {appState.sidebarVisible ? 'lg:drawer-open' : ''} h-screen"
  >
    <input id="sidebar-drawer" type="checkbox" class="drawer-toggle" />

    <div class="drawer-content flex flex-col">
      <!-- Mobile navbar -->
      <div class="navbar bg-base-100 lg:hidden border-b border-base-300">
        <div class="flex-none">
          <label
            for="sidebar-drawer"
            class="btn btn-square btn-ghost drawer-button"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              class="inline-block w-5 h-5 stroke-current"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 6h16M4 12h16M4 18h16"
              ></path>
            </svg>
          </label>
        </div>
        <div class="flex-1">
          <span class="text-xl font-bold">Wolffia</span>
        </div>
        <div class="flex-none">
          <ThemeController />
        </div>
      </div>

      <!-- Desktop expand sidebar button (when collapsed) -->
      {#if !appState.sidebarVisible}
        <button
          class="hidden lg:flex fixed left-0 top-1/2 -translate-y-1/2 z-40 p-1 bg-base-200 border border-base-300 rounded-r-lg shadow-lg"
          onclick={() => (appState.sidebarVisible = true)}
          aria-label="Expand sidebar"
          title="Expand sidebar"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
      {/if}

      <!-- Page content -->
      <main class="flex-1 overflow-hidden">
        {@render children()}
      </main>

      <!-- Status bar -->
      <StatusBar class="hidden sm:flex" />

      <!-- Mobile FAB with Flower Speed-Dial for save format -->
      <div class="fab lg:hidden">
        {#if Object.keys(appState.untitledNotes).length > 0 || (appState.splitView?.enabled && appState.splitView?.activePaneNoteId && typeof appState.splitView.activePaneNoteId === "string" && appState.splitView.activePaneNoteId.startsWith("untitled-"))}
          <!-- Speed Dial for Save format selection -->
          <div class="fab-speed-dial">
            <!-- Speed dial options (flower pattern) -->
            <button
              class="fab-option btn btn-circle btn-sm btn-secondary shadow-md"
              style="--fab-offset-x: -4rem; --fab-offset-y: -1rem;"
              aria-label="Save as Markdown"
              onclick={() =>
                document.dispatchEvent(
                  new CustomEvent("wolffia:open-save-modal", {
                    detail: { format: "md" },
                  }),
                )}
            >
              <span class="text-xs font-bold">.md</span>
            </button>
            <button
              class="fab-option btn btn-circle btn-sm btn-secondary shadow-md"
              style="--fab-offset-x: -1rem; --fab-offset-y: -4rem;"
              aria-label="Save as Plain Text"
              onclick={() =>
                document.dispatchEvent(
                  new CustomEvent("wolffia:open-save-modal", {
                    detail: { format: "txt" },
                  }),
                )}
            >
              <span class="text-xs font-bold">.txt</span>
            </button>

            <!-- Main Save FAB button -->
            <button
              class="btn btn-circle btn-primary shadow-lg transition-transform duration-300 hover:scale-110"
              aria-label="Save to Notes"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="transition-transform duration-300"
              >
                <path
                  d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"
                />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
            </button>
          </div>
        {:else}
          <!-- Simple Plus FAB for new note -->
          <button
            class="btn btn-circle btn-primary shadow-lg transition-transform duration-300 hover:scale-110"
            aria-label="New Note"
            onclick={handleNewNote}
          >
            <Plus size={24} class="transition-transform duration-300" />
          </button>
        {/if}
      </div>

      <!-- Mobile Split View FAB (left side) -->
      {#if (appState.selectedTabs.size === 2 || appState.splitView?.enabled) && !isAuthPage}
        <div class="fixed bottom-6 left-6 z-40 lg:hidden">
          <button
            class="btn btn-circle shadow-lg"
            style="background-color: var(--accent-color); color: white;"
            onclick={() => {
              if (appState.splitView?.enabled) {
                disableSplitView();
              } else if (appState.selectedTabs.size === 2) {
                enableSplitView();
              }
            }}
            aria-label={appState.splitView?.enabled
              ? "Unsplit View"
              : "Split View"}
          >
            {#if appState.splitView?.enabled}
              <Columns3 size={20} />
            {:else}
              <SplitSquareHorizontal size={20} />
            {/if}
          </button>
        </div>
      {/if}
    </div>

    <!-- Sidebar -->
    <div class="drawer-side z-40">
      <label
        for="sidebar-drawer"
        aria-label="close sidebar"
        class="drawer-overlay"
      ></label>
      <Sidebar
        onSettingsClick={() => (showSettings = true)}
        onImportExportClick={() => (showImportExport = true)}
      />
    </div>
  </div>

  <!-- Modals -->
  <SettingsModal isOpen={showSettings} onClose={() => (showSettings = false)} />
  <ImportExportModal
    isOpen={showImportExport}
    onClose={() => (showImportExport = false)}
  />
  <SaveModal />
{/if}
