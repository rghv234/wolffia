<!--
  Wolffia - ThemeController Component
  Unified theming using appState
  - Uses emerald (light) / dracula (dark) themes
-->
<script lang="ts">
    import { Sun, Moon, Monitor } from "@lucide/svelte";
    import { onMount } from "svelte";
    import { appState, setTheme } from "$lib/stores/app.svelte";

    let { class: className = "" } = $props<{ class?: string }>();

    // Track system preference for reactive icon display
    let systemPrefersDark = $state(false);

    onMount(() => {
        // Initial check
        systemPrefersDark = window.matchMedia(
            "(prefers-color-scheme: dark)",
        ).matches;

        // Listen for system preference changes and re-apply theme
        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        const handler = (e: MediaQueryListEvent) => {
            systemPrefersDark = e.matches;
            // Re-apply theme when system preference changes (only if in system mode)
            if (appState.theme === "system") {
                const html = document.documentElement;
                html.dataset.theme = e.matches ? "dracula" : "emerald";
            }
        };
        mediaQuery.addEventListener("change", handler);
        return () => mediaQuery.removeEventListener("change", handler);
    });

    // Derive effective theme for icon display
    let effectiveTheme = $derived.by(() => {
        if (appState.theme === "system") {
            return systemPrefersDark ? "dark" : "light";
        }
        return appState.theme;
    });

    function cycleTheme() {
        // Cycle: system -> light -> dark -> system
        if (appState.theme === "system") {
            setTheme("light");
        } else if (appState.theme === "light") {
            setTheme("dark");
        } else {
            setTheme("system");
        }
    }
</script>

<button
    class="btn btn-ghost btn-square theme-toggle-btn {className}"
    onclick={cycleTheme}
    aria-label="Cycle theme: {appState.theme}"
    title={appState.theme === "system"
        ? "Theme: Auto (System)"
        : appState.theme === "light"
          ? "Theme: Light"
          : "Theme: Dark"}
>
    {#if appState.theme === "system"}
        <Monitor size={20} />
    {:else if effectiveTheme === "light"}
        <Sun size={20} />
    {:else}
        <Moon size={20} />
    {/if}
</button>
