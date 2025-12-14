<!--
  Wolffia - MarkdownPreview Component
  Renders markdown content as HTML for preview
-->
<script lang="ts">
    let { content = "" } = $props<{ content: string }>();

    // Simple markdown to HTML conversion
    function renderMarkdown(md: string): string {
        if (!md) return "";

        let html = md
            // Escape HTML first
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            // Headers
            .replace(/^######\s+(.*)$/gm, "<h6>$1</h6>")
            .replace(/^#####\s+(.*)$/gm, "<h5>$1</h5>")
            .replace(/^####\s+(.*)$/gm, "<h4>$1</h4>")
            .replace(/^###\s+(.*)$/gm, "<h3>$1</h3>")
            .replace(/^##\s+(.*)$/gm, "<h2>$1</h2>")
            .replace(/^#\s+(.*)$/gm, "<h1>$1</h1>")
            // Bold and Italic
            .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
            .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
            .replace(/\*(.+?)\*/g, "<em>$1</em>")
            .replace(/___(.+?)___/g, "<strong><em>$1</em></strong>")
            .replace(/__(.+?)__/g, "<strong>$1</strong>")
            .replace(/_(.+?)_/g, "<em>$1</em>")
            // Strikethrough
            .replace(/~~(.+?)~~/g, "<del>$1</del>")
            // Inline code
            .replace(
                /`([^`]+)`/g,
                '<code class="bg-base-300 px-1 rounded text-sm">$1</code>',
            )
            // Links
            .replace(
                /\[([^\]]+)\]\(([^)]+)\)/g,
                '<a href="$2" class="link link-primary" target="_blank" rel="noopener">$1</a>',
            )
            // Images
            .replace(
                /!\[([^\]]*)\]\(([^)]+)\)/g,
                '<img src="$2" alt="$1" class="max-w-full rounded my-2" />',
            )
            // Horizontal rule
            .replace(/^---$/gm, '<hr class="my-4 border-base-300" />')
            .replace(/^\*\*\*$/gm, '<hr class="my-4 border-base-300" />')
            // Unordered lists
            .replace(/^\s*[-*+]\s+(.*)$/gm, "<li>$1</li>")
            // Ordered lists
            .replace(/^\s*\d+\.\s+(.*)$/gm, "<li>$1</li>")
            // Blockquotes
            .replace(
                /^>\s+(.*)$/gm,
                '<blockquote class="border-l-4 border-primary pl-4 my-2 italic text-base-content/70">$1</blockquote>',
            )
            // Task lists
            .replace(
                /^- \[ \]\s+(.*)$/gm,
                '<div class="flex items-center gap-2"><input type="checkbox" class="checkbox checkbox-sm" disabled /> <span>$1</span></div>',
            )
            .replace(
                /^- \[x\]\s+(.*)$/gm,
                '<div class="flex items-center gap-2"><input type="checkbox" class="checkbox checkbox-sm" checked disabled /> <span>$1</span></div>',
            )
            // Paragraphs (double newlines)
            .replace(/\n\n/g, '</p><p class="my-2">')
            // Single newlines to <br>
            .replace(/\n/g, "<br />");

        // Wrap in paragraph if not already wrapped
        if (!html.startsWith("<")) {
            html = '<p class="my-2">' + html + "</p>";
        }

        // Wrap list items in ul
        html = html.replace(
            /(<li>.*<\/li>\s*)+/g,
            '<ul class="list-disc pl-6 my-2">$&</ul>',
        );

        return html;
    }

    // Debounced rendering - wait 300ms after last content change
    let renderedContent = $state("");
    let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

    $effect(() => {
        // Track content dependency
        const currentContent = content;

        // Clear previous timeout
        if (debounceTimeout) clearTimeout(debounceTimeout);

        // Schedule debounced render
        debounceTimeout = setTimeout(() => {
            renderedContent = renderMarkdown(currentContent);
        }, 300);

        return () => {
            if (debounceTimeout) clearTimeout(debounceTimeout);
        };
    });
</script>

<div
    class="markdown-preview flex-1 w-full h-full p-4 bg-base-100 overflow-y-auto prose prose-sm max-w-none"
>
    {@html renderedContent}
</div>

<style>
    .markdown-preview :global(h1) {
        font-size: 1.75rem;
        font-weight: 700;
        margin: 0.5rem 0;
        border-bottom: 1px solid oklch(var(--bc) / 0.2);
        padding-bottom: 0.25rem;
    }
    .markdown-preview :global(h2) {
        font-size: 1.5rem;
        font-weight: 600;
        margin: 0.5rem 0;
    }
    .markdown-preview :global(h3) {
        font-size: 1.25rem;
        font-weight: 600;
        margin: 0.5rem 0;
    }
    .markdown-preview :global(h4),
    .markdown-preview :global(h5),
    .markdown-preview :global(h6) {
        font-size: 1.1rem;
        font-weight: 600;
        margin: 0.5rem 0;
    }
    .markdown-preview :global(pre) {
        background: oklch(var(--b3));
        padding: 1rem;
        border-radius: 0.5rem;
        overflow-x: auto;
    }
</style>
