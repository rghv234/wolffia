<!--
  Wolffia - VirtualTextEditor Component
  Lightweight virtual scrolling text editor for large files
  Only renders visible lines + buffer for performance
-->
<script lang="ts">
    import { onMount, tick } from "svelte";

    // Props
    let {
        content = $bindable(""),
        class: className = "",
        placeholder = "Start typing...",
        readonly = false,
        onchange,
    }: {
        content: string;
        class?: string;
        placeholder?: string;
        readonly?: boolean;
        onchange?: (value: string) => void;
    } = $props();

    // Configuration
    const LINE_HEIGHT = 24; // px per line (1.5rem at 16px base)
    const BUFFER_LINES = 10; // Extra lines above/below viewport
    const VISIBLE_LINES = 50; // Max lines to render at once

    // State
    let containerEl = $state<HTMLDivElement | null>(null);
    let inputEl = $state<HTMLTextAreaElement | null>(null);
    let scrollTop = $state(0);
    let containerHeight = $state(400);
    let cursorLine = $state(0);
    let cursorCol = $state(0);
    let isFocused = $state(false);

    // Derived: Split content into lines
    let lines = $derived(content.split("\n"));
    let totalHeight = $derived(lines.length * LINE_HEIGHT);

    // Derived: Calculate visible line range
    let visibleRange = $derived.by(() => {
        const startLine = Math.max(
            0,
            Math.floor(scrollTop / LINE_HEIGHT) - BUFFER_LINES,
        );
        const endLine = Math.min(
            lines.length,
            startLine + VISIBLE_LINES + BUFFER_LINES * 2,
        );
        return { start: startLine, end: endLine };
    });

    // Derived: Get visible lines with their indices
    let visibleLines = $derived.by(() => {
        const result: { index: number; text: string; top: number }[] = [];
        for (let i = visibleRange.start; i < visibleRange.end; i++) {
            result.push({
                index: i,
                text: lines[i] || "",
                top: i * LINE_HEIGHT,
            });
        }
        return result;
    });

    // Handle scroll
    function handleScroll(e: Event) {
        const target = e.target as HTMLDivElement;
        scrollTop = target.scrollTop;
    }

    // Handle input in hidden textarea
    function handleInput(e: Event) {
        const target = e.target as HTMLTextAreaElement;
        content = target.value;
        onchange?.(content);
        updateCursorPosition(target);
    }

    // Handle keyboard navigation
    function handleKeyDown(e: KeyboardEvent) {
        const target = e.target as HTMLTextAreaElement;

        // After any key, update cursor position
        requestAnimationFrame(() => updateCursorPosition(target));
    }

    // Track cursor position
    function updateCursorPosition(textarea: HTMLTextAreaElement) {
        const pos = textarea.selectionStart;
        const textBefore = textarea.value.substring(0, pos);
        const linesBefore = textBefore.split("\n");
        cursorLine = linesBefore.length - 1;
        cursorCol = linesBefore[linesBefore.length - 1].length;

        // Scroll to keep cursor visible
        scrollToCursor();
    }

    // Scroll to cursor when it goes out of view
    function scrollToCursor() {
        if (!containerEl) return;

        const cursorTop = cursorLine * LINE_HEIGHT;
        const viewportTop = scrollTop;
        const viewportBottom = scrollTop + containerHeight - LINE_HEIGHT;

        if (cursorTop < viewportTop) {
            containerEl.scrollTop = cursorTop - LINE_HEIGHT;
        } else if (cursorTop > viewportBottom) {
            containerEl.scrollTop =
                cursorTop - containerHeight + LINE_HEIGHT * 2;
        }
    }

    // Click on a line to position cursor
    async function handleLineClick(lineIndex: number, e: MouseEvent) {
        if (!inputEl || readonly) return;

        // Calculate character position from click
        const target = e.target as HTMLElement;
        const lineEl = target.closest(".virtual-line") as HTMLElement;
        if (!lineEl) return;

        // Get click position relative to line start
        const rect = lineEl.getBoundingClientRect();
        const clickX = e.clientX - rect.left;

        // Estimate character position (monospace assumption)
        const charWidth = 8; // Approximate char width
        const charIndex = Math.round(clickX / charWidth);
        const lineText = lines[lineIndex] || "";
        const clampedCharIndex = Math.min(charIndex, lineText.length);

        // Calculate absolute position in content
        let absolutePos = 0;
        for (let i = 0; i < lineIndex; i++) {
            absolutePos += lines[i].length + 1; // +1 for newline
        }
        absolutePos += clampedCharIndex;

        // Focus and set cursor
        inputEl.focus();
        await tick();
        inputEl.setSelectionRange(absolutePos, absolutePos);
        cursorLine = lineIndex;
        cursorCol = clampedCharIndex;
    }

    // Mount: measure container
    onMount(() => {
        if (containerEl) {
            containerHeight = containerEl.clientHeight;

            // Update on resize
            const observer = new ResizeObserver((entries) => {
                containerHeight = entries[0]?.contentRect.height || 400;
            });
            observer.observe(containerEl);

            return () => observer.disconnect();
        }
    });

    // Highlight markdown syntax (reuse logic)
    function highlightLine(text: string): string {
        if (!text) return "&nbsp;";

        let html = text
            // Escape HTML
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            // Headers
            .replace(/^(#{1,6}\s.*)$/gm, '<span class="md-header">$1</span>')
            // Bold
            .replace(/\*\*(.+?)\*\*/g, '<span class="md-bold">**$1**</span>')
            // Italic
            .replace(
                /(?<!\*)\*([^*]+)\*(?!\*)/g,
                '<span class="md-italic">*$1*</span>',
            )
            // Code
            .replace(/`([^`]+)`/g, '<span class="md-code">`$1`</span>')
            // Links
            .replace(
                /\[([^\]]+)\]\(([^)]+)\)/g,
                '<span class="md-link">[$1]($2)</span>',
            );

        return html || "&nbsp;";
    }
</script>

<div class="virtual-text-editor {className}" class:focused={isFocused}>
    <!-- Hidden textarea for actual input -->
    <textarea
        bind:this={inputEl}
        bind:value={content}
        class="hidden-input"
        {placeholder}
        {readonly}
        spellcheck="true"
        oninput={handleInput}
        onkeydown={handleKeyDown}
        onfocus={() => (isFocused = true)}
        onblur={() => (isFocused = false)}
    ></textarea>

    <!-- Virtual scroll container -->
    <div
        bind:this={containerEl}
        class="virtual-scroll-container"
        onscroll={handleScroll}
    >
        <!-- Spacer for total height -->
        <div class="virtual-spacer" style="height: {totalHeight}px;"></div>

        <!-- Visible lines only -->
        <div class="virtual-lines">
            {#each visibleLines as line (line.index)}
                <div
                    class="virtual-line"
                    class:cursor-line={line.index === cursorLine && isFocused}
                    style="top: {line.top}px; height: {LINE_HEIGHT}px;"
                    onclick={(e) => handleLineClick(line.index, e)}
                    role="textbox"
                    tabindex="-1"
                >
                    <span class="line-number">{line.index + 1}</span>
                    <span class="line-content"
                        >{@html highlightLine(line.text)}</span
                    >

                    <!-- Cursor indicator -->
                    {#if line.index === cursorLine && isFocused}
                        <span
                            class="cursor-indicator"
                            style="left: calc(3rem + {cursorCol * 0.55}em);"
                        ></span>
                    {/if}
                </div>
            {/each}
        </div>
    </div>

    <!-- Stats bar -->
    <div class="virtual-stats">
        <span>Line {cursorLine + 1}:{cursorCol + 1}</span>
        <span>{lines.length} lines</span>
        <span>{content.length.toLocaleString()} chars</span>
    </div>
</div>

<style>
    .virtual-text-editor {
        display: flex;
        flex-direction: column;
        height: 100%;
        font-family: ui-monospace, "Cascadia Code", "Consolas", monospace;
        font-size: 14px;
        position: relative;
    }

    .hidden-input {
        position: absolute;
        opacity: 0;
        pointer-events: none;
        width: 1px;
        height: 1px;
    }

    .virtual-scroll-container {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        position: relative;
        background: oklch(var(--b1));
        cursor: text;
    }

    .virtual-spacer {
        width: 100%;
        pointer-events: none;
    }

    .virtual-lines {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
    }

    .virtual-line {
        position: absolute;
        left: 0;
        right: 0;
        display: flex;
        align-items: center;
        padding: 0 0.5rem;
        white-space: pre;
        overflow: hidden;
        cursor: text;
    }

    .virtual-line:hover {
        background: oklch(var(--b2) / 0.5);
    }

    .virtual-line.cursor-line {
        background: oklch(var(--b2));
    }

    .line-number {
        width: 2.5rem;
        text-align: right;
        padding-right: 0.5rem;
        color: oklch(var(--bc) / 0.4);
        user-select: none;
        font-size: 12px;
    }

    .line-content {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .cursor-indicator {
        position: absolute;
        width: 2px;
        height: 1.2em;
        background: var(--accent-color, #ec4899);
        animation: blink 1s step-end infinite;
    }

    @keyframes blink {
        50% {
            opacity: 0;
        }
    }

    .virtual-stats {
        display: flex;
        gap: 1rem;
        padding: 0.25rem 0.5rem;
        background: oklch(var(--b2));
        border-top: 1px solid oklch(var(--b3));
        font-size: 12px;
        color: oklch(var(--bc) / 0.6);
    }

    /* Markdown highlighting */
    :global(.md-header) {
        color: oklch(var(--p));
        font-weight: bold;
    }

    :global(.md-bold) {
        font-weight: bold;
    }

    :global(.md-italic) {
        font-style: italic;
    }

    :global(.md-code) {
        background: oklch(var(--b2));
        padding: 0 0.25rem;
        border-radius: 2px;
        font-family: inherit;
    }

    :global(.md-link) {
        color: oklch(var(--in));
        text-decoration: underline;
    }

    /* Focus styling */
    .virtual-text-editor.focused .virtual-scroll-container {
        outline: 2px solid var(--accent-color, #ec4899);
        outline-offset: -2px;
    }
</style>
