<!--
  Wolffia - Find/Replace Bar
  In-editor search with regex support
-->
<script lang="ts">
    import {
        Search,
        Replace,
        X,
        ChevronUp,
        ChevronDown,
        CaseSensitive,
        Regex,
    } from "@lucide/svelte";
    import {
        getFindVisible,
        setFindVisible,
        getReplaceVisible,
        setReplaceVisible,
    } from "$lib/shortcuts";

    let {
        onFind = (query: string, options: FindOptions) => {},
        onReplace = (
            query: string,
            replacement: string,
            options: FindOptions,
        ) => {},
        onReplaceAll = (
            query: string,
            replacement: string,
            options: FindOptions,
        ) => {},
        onClose = () => {},
    } = $props<{
        onFind?: (query: string, options: FindOptions) => void;
        onReplace?: (
            query: string,
            replacement: string,
            options: FindOptions,
        ) => void;
        onReplaceAll?: (
            query: string,
            replacement: string,
            options: FindOptions,
        ) => void;
        onClose?: () => void;
    }>();

    interface FindOptions {
        caseSensitive: boolean;
        regex: boolean;
    }

    let findQuery = $state("");
    let replaceQuery = $state("");
    let caseSensitive = $state(false);
    let useRegex = $state(false);
    let matchCount = $state(0);
    let currentMatch = $state(0);

    let isVisible = $derived(getFindVisible());
    let showReplace = $derived(getReplaceVisible());

    function handleFind() {
        onFind(findQuery, { caseSensitive, regex: useRegex });
    }

    function handleFindNext() {
        currentMatch = Math.min(currentMatch + 1, matchCount);
        handleFind();
    }

    function handleFindPrev() {
        currentMatch = Math.max(currentMatch - 1, 1);
        handleFind();
    }

    function handleReplace() {
        onReplace(findQuery, replaceQuery, { caseSensitive, regex: useRegex });
    }

    function handleReplaceAll() {
        onReplaceAll(findQuery, replaceQuery, {
            caseSensitive,
            regex: useRegex,
        });
    }

    function handleClose() {
        setFindVisible(false);
        setReplaceVisible(false);
        onClose();
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") {
            handleClose();
        } else if (e.key === "Enter") {
            if (e.shiftKey) {
                handleFindPrev();
            } else {
                handleFindNext();
            }
        }
    }
</script>

{#if isVisible}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <form
        class="bg-base-200 border-b border-base-300 p-2 flex flex-col gap-2"
        role="search"
        aria-label="Find and Replace"
        onsubmit={(e) => e.preventDefault()}
        onkeydown={handleKeydown}
    >
        <!-- Find Row -->
        <div class="flex items-center gap-2">
            <div class="flex-1 flex items-center gap-2">
                <div
                    class="input input-sm input-bordered flex items-center gap-2 flex-1"
                >
                    <Search size={14} class="text-base-content/50" />
                    <input
                        type="text"
                        class="grow bg-transparent outline-none text-sm"
                        placeholder="Find..."
                        bind:value={findQuery}
                        oninput={handleFind}
                    />
                </div>

                <!-- Match Count -->
                {#if matchCount > 0}
                    <span
                        class="text-xs text-base-content/60 whitespace-nowrap"
                    >
                        {currentMatch} / {matchCount}
                    </span>
                {/if}
            </div>

            <!-- Options -->
            <div class="flex items-center gap-1">
                <button
                    class="btn btn-ghost btn-xs btn-square {caseSensitive
                        ? 'btn-active'
                        : ''}"
                    onclick={() => {
                        caseSensitive = !caseSensitive;
                        handleFind();
                    }}
                    title="Case Sensitive"
                >
                    <CaseSensitive size={14} />
                </button>
                <button
                    class="btn btn-ghost btn-xs btn-square {useRegex
                        ? 'btn-active'
                        : ''}"
                    onclick={() => {
                        useRegex = !useRegex;
                        handleFind();
                    }}
                    title="Use Regex"
                >
                    <Regex size={14} />
                </button>
            </div>

            <!-- Navigation -->
            <div class="flex items-center gap-1">
                <button
                    class="btn btn-ghost btn-xs btn-square"
                    onclick={handleFindPrev}
                    title="Previous Match"
                >
                    <ChevronUp size={14} />
                </button>
                <button
                    class="btn btn-ghost btn-xs btn-square"
                    onclick={handleFindNext}
                    title="Next Match"
                >
                    <ChevronDown size={14} />
                </button>
            </div>

            <!-- Close -->
            <button
                class="btn btn-ghost btn-xs btn-square"
                onclick={handleClose}
            >
                <X size={14} />
            </button>
        </div>

        <!-- Replace Row -->
        {#if showReplace}
            <div class="flex items-center gap-2">
                <div class="flex-1 flex items-center gap-2">
                    <div
                        class="input input-sm input-bordered flex items-center gap-2 flex-1"
                    >
                        <Replace size={14} class="text-base-content/50" />
                        <input
                            type="text"
                            class="grow bg-transparent outline-none text-sm"
                            placeholder="Replace with..."
                            bind:value={replaceQuery}
                        />
                    </div>
                </div>

                <button class="btn btn-ghost btn-xs" onclick={handleReplace}>
                    Replace
                </button>
                <button class="btn btn-ghost btn-xs" onclick={handleReplaceAll}>
                    Replace All
                </button>
            </div>
        {/if}
    </form>
{/if}
