<!--
  Wolffia - Settings Modal
  User preferences and recovery codes management
-->
<script lang="ts">
  import {
    Settings,
    KeyRound,
    Palette,
    Type,
    Shield,
    LogOut,
    RefreshCw,
    Keyboard,
  } from "@lucide/svelte";
  import { auth } from "$lib/api";
  import { onMount } from "svelte";
  import {
    appState,
    logout,
    setTheme,
    setAccentColor,
    setDarkModeIntensity,
  } from "$lib/stores/app.svelte";
  import { generateRecoveryCodes } from "$lib/crypto";
  import {
    getShortcutDefinitions,
    type ShortcutDefinition,
  } from "$lib/shortcuts";
  import RecoveryCodesModal from "./RecoveryCodesModal.svelte";

  // Get shortcut definitions for UI
  const shortcutDefs = getShortcutDefinitions();

  // Track system dark mode preference
  let systemPrefersDark = $state(false);

  onMount(() => {
    // Initial check
    systemPrefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;

    // Listen for changes
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      systemPrefersDark = e.matches;
    };
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  });

  // Check if effectively in dark mode (for showing dark mode options)
  let isEffectivelyDark = $derived(
    appState.theme === "dark" ||
      (appState.theme === "system" && systemPrefersDark),
  );

  // Rebinding state
  let rebindingShortcut = $state<string | null>(null);

  function formatBinding(
    key: string,
    ctrl: boolean,
    shift: boolean,
    alt: boolean,
  ): string {
    const parts: string[] = [];
    if (ctrl) parts.push("Ctrl");
    if (shift) parts.push("Shift");
    if (alt) parts.push("Alt");
    parts.push(key.length === 1 ? key.toUpperCase() : key);
    return parts.join("+");
  }

  function startRebinding(shortcutId: string) {
    rebindingShortcut = shortcutId;
    // Add global keyboard listener
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        rebindingShortcut = null;
        window.removeEventListener("keydown", handler);
        return;
      }

      // Skip modifier-only keypresses
      if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;

      // Save the new binding
      appState.customShortcuts[shortcutId] = {
        key: e.key,
        ctrl: e.ctrlKey,
        shift: e.shiftKey,
        alt: e.altKey,
      };

      rebindingShortcut = null;
      window.removeEventListener("keydown", handler);
    };
    window.addEventListener("keydown", handler);
  }

  function resetBinding(shortcutId: string) {
    delete appState.customShortcuts[shortcutId];
    // Trigger reactivity by reassigning
    appState.customShortcuts = { ...appState.customShortcuts };
  }

  function resetAllBindings() {
    appState.customShortcuts = {};
  }

  let { isOpen = false, onClose = () => {} } = $props<{
    isOpen: boolean;
    onClose: () => void;
  }>();

  let dialogEl = $state<HTMLDialogElement | null>(null);
  let activeTab = $state<"general" | "security" | "shortcuts" | "about">(
    "general",
  );
  let isLoading = $state(false);

  // Recovery
  let recoveryStatus = $state<{
    setup_complete: boolean;
    unused_codes: number;
  } | null>(null);
  let showRecoveryCodes = $state(false);
  let newRecoveryCodes = $state<string[]>([]);

  // Open/close dialog
  $effect(() => {
    if (dialogEl) {
      if (isOpen) {
        dialogEl.showModal();
        loadRecoveryStatus();
      } else {
        dialogEl.close();
      }
    }
  });

  async function loadRecoveryStatus() {
    const result = await auth.getRecoveryStatus();
    if (result.data) {
      recoveryStatus = result.data;
    }
  }

  async function regenerateRecoveryCodes() {
    if (
      !confirm("This will invalidate all existing recovery codes. Continue?")
    ) {
      return;
    }

    isLoading = true;
    try {
      // Get current salt_encryption from somewhere (would need to be stored)
      // For now, show that we need the password to regenerate
      alert(
        "To regenerate recovery codes, please log out and log in again, then go to Settings.",
      );
    } catch (e) {
      console.error("Failed to regenerate codes:", e);
    } finally {
      isLoading = false;
    }
  }

  async function handleLogout() {
    // Clear all cached data to prevent stale folder/note counts
    try {
      const { clearAllCachedData } = await import("$lib/offline");
      await clearAllCachedData();
    } catch (e) {
      console.warn("Failed to clear cache:", e);
    }
    logout();
    onClose();
    window.location.href = "/auth";
  }

  async function handlePurgeAllData() {
    if (
      !confirm(
        "Are you sure you want to delete ALL notes and folders from the server? This cannot be undone!",
      )
    ) {
      return;
    }

    isLoading = true;
    try {
      const { notes: notesApi, folders: foldersApi } = await import("$lib/api");

      // Delete all folders (this should cascade delete notes in those folders on server)
      for (const folder of appState.folders) {
        console.log("[Settings] Deleting folder:", folder.id);
        await foldersApi.delete(folder.id);
      }

      // Delete all notes (including unfiled ones) - only server notes
      for (const note of appState.notes) {
        console.log("[Settings] Deleting note:", note.id);
        // Only call API for server notes (numeric IDs)
        if (typeof note.id === "number") {
          await notesApi.delete(note.id);
        }
      }

      // Clear local state
      appState.folders = [];
      appState.notes = [];
      appState.openTabs = [];
      appState.activeNoteId = null;
      appState.scratchpadNote = null;

      // Clear cache too
      const { clearAllCachedData } = await import("$lib/offline");
      await clearAllCachedData();

      alert("All data purged successfully!");
      console.log("[Settings] All data purged");
    } catch (e) {
      console.error("[Settings] Purge failed:", e);
      alert(
        "Failed to purge data: " +
          (e instanceof Error ? e.message : "Unknown error"),
      );
    } finally {
      isLoading = false;
    }
  }

  function handleRecoveryCodesClose() {
    showRecoveryCodes = false;
    loadRecoveryStatus();
  }
</script>

<dialog bind:this={dialogEl} class="modal" onclose={onClose}>
  <div class="modal-box max-w-lg">
    <!-- Header -->
    <div class="flex items-center gap-3 mb-6">
      <Settings size={24} />
      <h3 class="font-bold text-lg">Settings</h3>
    </div>

    <!-- Tabs -->
    <div class="tabs tabs-boxed mb-6 flex-wrap">
      <button
        class="tab {activeTab === 'general' ? 'tab-active' : ''}"
        onclick={() => (activeTab = "general")}
      >
        <Palette size={16} class="mr-2" />
        General
      </button>
      <button
        class="tab {activeTab === 'security' ? 'tab-active' : ''}"
        onclick={() => (activeTab = "security")}
      >
        <Shield size={16} class="mr-2" />
        Security
      </button>
      <button
        class="tab hidden sm:flex {activeTab === 'shortcuts'
          ? 'tab-active'
          : ''}"
        onclick={() => (activeTab = "shortcuts")}
      >
        Shortcuts
      </button>
      <button
        class="tab {activeTab === 'about' ? 'tab-active' : ''}"
        onclick={() => (activeTab = "about")}
      >
        About
      </button>
    </div>

    {#if activeTab === "general"}
      <!-- General Settings -->
      <div class="space-y-4">
        <!-- Theme -->
        <div class="form-control">
          <label class="label">
            <span class="label-text flex items-center gap-2">
              <Palette size={16} />
              Theme
            </span>
          </label>
          <select
            class="select select-bordered w-full"
            value={appState.theme}
            onchange={(e) =>
              setTheme(e.currentTarget.value as "light" | "dark" | "system")}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>

        <!-- Dark Mode Intensity (show when effectively in dark mode) -->
        {#if isEffectivelyDark}
          <div class="form-control">
            <label class="label">
              <span class="label-text">Dark Mode Intensity</span>
            </label>
            <div class="flex flex-wrap gap-4">
              <label class="cursor-pointer flex items-center gap-2">
                <input
                  type="radio"
                  name="darkIntensity"
                  class="radio radio-primary radio-sm"
                  checked={appState.darkModeIntensity === "normal"}
                  onchange={() => setDarkModeIntensity("normal")}
                />
                <span class="label-text">Normal</span>
              </label>
              <label class="cursor-pointer flex items-center gap-2">
                <input
                  type="radio"
                  name="darkIntensity"
                  class="radio radio-primary radio-sm"
                  checked={appState.darkModeIntensity === "dim"}
                  onchange={() => setDarkModeIntensity("dim")}
                />
                <span class="label-text">Dim</span>
              </label>
              <label class="cursor-pointer flex items-center gap-2">
                <input
                  type="radio"
                  name="darkIntensity"
                  class="radio radio-primary radio-sm"
                  checked={appState.darkModeIntensity === "oled"}
                  onchange={() => setDarkModeIntensity("oled")}
                />
                <span class="label-text">OLED Black</span>
              </label>
            </div>
            <label class="label">
              <span class="label-text-alt text-base-content/60">
                OLED uses pure black for battery savings
              </span>
            </label>
          </div>
        {/if}
        <div class="form-control">
          <label class="label">
            <span class="label-text flex items-center gap-2">
              <Palette size={16} />
              Accent Color
            </span>
          </label>
          <div class="flex flex-wrap gap-2 mb-3">
            {#each ["#ec4899", "#8b5cf6", "#3b82f6", "#22c55e", "#f97316", "#ef4444", "#14b8a6", "#6366f1"] as color}
              <button
                type="button"
                class="w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 {appState.accentColor ===
                color
                  ? 'ring-2 ring-offset-2 ring-primary scale-110'
                  : 'border-transparent'}"
                style="background-color: {color}"
                onclick={() => setAccentColor(color)}
              >
              </button>
            {/each}
          </div>
          <div class="flex items-center gap-2">
            <span class="text-sm text-base-content/70">Custom:</span>
            <input
              type="color"
              class="w-12 h-8 cursor-pointer rounded"
              value={appState.accentColor}
              oninput={(e) => setAccentColor(e.currentTarget.value)}
            />
            <input
              type="text"
              class="input input-sm input-bordered w-24 font-mono"
              value={appState.accentColor}
              oninput={(e) => setAccentColor(e.currentTarget.value)}
              placeholder="#000000"
            />
          </div>
        </div>

        <!-- Sync Theme Across Devices -->
        <div class="form-control">
          <label class="label cursor-pointer" for="syncThemes">
            <span class="label-text">Sync Theme Across Devices</span>
            <input
              id="syncThemes"
              type="checkbox"
              class="toggle toggle-primary"
              checked={appState.syncThemes}
              onchange={() => (appState.syncThemes = !appState.syncThemes)}
            />
          </label>
          <span class="label-text-alt text-base-content/60 pl-1">
            When enabled, theme settings sync to your account
          </span>
        </div>

        <!-- Sidebar Visible -->
        <div class="form-control">
          <label class="label cursor-pointer">
            <span class="label-text">Show Sidebar on Desktop</span>
            <input
              type="checkbox"
              class="toggle toggle-primary"
              checked={appState.sidebarVisible}
              onchange={() =>
                (appState.sidebarVisible = !appState.sidebarVisible)}
            />
          </label>
        </div>

        <!-- Status Bar Visible -->
        <div class="form-control">
          <label class="label cursor-pointer">
            <span class="label-text">Show Status Bar</span>
            <input
              type="checkbox"
              class="toggle toggle-primary"
              checked={appState.statusBarVisible}
              onchange={() =>
                (appState.statusBarVisible = !appState.statusBarVisible)}
            />
          </label>
        </div>
      </div>
    {:else if activeTab === "security"}
      <!-- Security Settings -->
      <div class="space-y-6">
        <!-- User account section - conditional based on login status -->
        {#if appState.token}
          <!-- Logged in: Show user info -->
          <div class="flex items-center gap-3 p-3 bg-base-200 rounded-lg">
            <div class="avatar placeholder">
              <div
                class="bg-primary text-primary-content rounded-full w-10 h-10 flex items-center justify-center"
              >
                <span class="text-lg font-medium"
                  >{appState.username?.charAt(0).toUpperCase() || "?"}</span
                >
              </div>
            </div>
            <div class="flex-1">
              <p class="font-medium">{appState.username || "User"}</p>
              <p class="text-xs text-base-content/60">
                Logged in • Syncing enabled
              </p>
            </div>
          </div>
        {:else}
          <!-- Not logged in: Show login prompt -->
          <div class="p-4 bg-base-200 rounded-lg">
            <p class="text-sm text-base-content/70 mb-3">
              You're using Wolffia offline. Sign in to sync your notes across
              devices.
            </p>
            <a href="/auth" class="btn btn-primary btn-sm gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                <polyline points="10 17 15 12 10 7"></polyline>
                <line x1="15" y1="12" x2="3" y2="12"></line>
              </svg>
              Sign In
            </a>
          </div>
        {/if}

        <!-- E2E Encryption Status -->
        <div class="alert alert-info">
          <Shield size={18} />
          <span>End-to-end encryption is enabled for all your notes</span>
        </div>

        <!-- Recovery Codes -->
        <div class="form-control">
          <label class="label">
            <span class="label-text">Recovery Codes</span>
          </label>
          <p class="text-sm text-base-content/70 mb-2">
            Recovery codes can help you regain access if you forget your
            password.
          </p>
          <button
            class="btn btn-outline gap-2"
            onclick={regenerateRecoveryCodes}
            disabled={isLoading}
          >
            {#if isLoading}
              <span class="loading loading-spinner loading-sm"></span>
            {/if}
            Regenerate Codes
          </button>
        </div>

        <!-- Logout (only show when logged in) -->
        {#if appState.token}
          <div class="divider"></div>

          <button
            class="btn btn-error btn-outline w-full gap-2"
            onclick={handleLogout}
          >
            <LogOut size={18} />
            Logout
          </button>
        {/if}
      </div>
    {:else if activeTab === "shortcuts"}
      <!-- Shortcuts Tab -->
      <div class="space-y-4">
        <p class="text-sm text-base-content/70">
          Click on a shortcut to rebind it. Press Esc to cancel.
        </p>

        <div class="bg-base-200 rounded-lg p-4 space-y-3">
          {#each shortcutDefs as def}
            {@const custom = appState.customShortcuts[def.id]}
            {@const currentKey = custom?.key ?? def.defaultKey}
            {@const currentCtrl = custom?.ctrl ?? def.defaultCtrl ?? false}
            {@const currentShift = custom?.shift ?? def.defaultShift ?? false}
            {@const currentAlt = custom?.alt ?? def.defaultAlt ?? false}
            <div class="flex justify-between items-center">
              <span>{def.description}</span>
              <div class="flex items-center gap-2">
                {#if rebindingShortcut === def.id}
                  <kbd
                    class="kbd kbd-sm animate-pulse bg-primary text-primary-content"
                  >
                    Press keys...
                  </kbd>
                  <button
                    class="btn btn-ghost btn-xs"
                    onclick={() => (rebindingShortcut = null)}
                  >
                    Cancel
                  </button>
                {:else}
                  <button
                    class="kbd kbd-sm hover:bg-base-300 cursor-pointer transition-colors"
                    onclick={() => startRebinding(def.id)}
                    title="Click to rebind"
                  >
                    {formatBinding(
                      currentKey,
                      currentCtrl,
                      currentShift,
                      currentAlt,
                    )}
                  </button>
                  {#if custom}
                    <button
                      class="btn btn-ghost btn-xs text-error"
                      onclick={() => resetBinding(def.id)}
                      title="Reset to default"
                    >
                      ✕
                    </button>
                  {/if}
                {/if}
              </div>
            </div>
          {/each}
        </div>

        <div class="divider"></div>

        <button class="btn btn-outline btn-sm" onclick={resetAllBindings}>
          Reset All to Defaults
        </button>
      </div>
    {:else if activeTab === "about"}
      <!-- About Tab -->
      <div class="text-center space-y-4">
        <h2 class="text-2xl font-bold text-primary">Wolffia</h2>
        <p class="text-base-content/70">Secure, encrypted note-taking app</p>

        <div class="badge badge-ghost">Version 1.0.0</div>

        <div class="divider"></div>

        <div class="text-sm text-base-content/60 space-y-2">
          <p>End-to-end encrypted notes</p>
          <p>Real-time sync across devices</p>
          <p>Offline-first with local caching</p>
        </div>

        <div class="divider"></div>

        <p class="text-xs text-base-content/50">
          Built with SvelteKit, Tauri, and daisyUI
        </p>
      </div>
    {/if}

    <!-- Close Button -->
    <div class="modal-action">
      <form method="dialog">
        <button class="btn">Close</button>
      </form>
    </div>
  </div>

  <form method="dialog" class="modal-backdrop">
    <button>close</button>
  </form>
</dialog>

<!-- Recovery Codes Modal -->
<RecoveryCodesModal
  codes={newRecoveryCodes}
  isOpen={showRecoveryCodes}
  onClose={handleRecoveryCodesClose}
/>
