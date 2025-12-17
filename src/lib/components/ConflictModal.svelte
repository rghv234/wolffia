<!--
  Wolffia - Conflict Resolution Modal
  Shows when sync detects a conflict between local and server versions
  User can choose: Keep Local, Keep Server, or Keep Both
-->
<script lang="ts">
    import { X, Check, Copy, ArrowLeft, ArrowRight } from "@lucide/svelte";
    import { decryptContent } from "$lib/crypto";

    interface Props {
        open: boolean;
        noteTitle: string;
        localContent: string; // Encrypted
        serverContent: string; // Encrypted
        localTimestamp: string;
        serverTimestamp: string;
        onResolve: (choice: "local" | "server" | "both") => void;
        onClose: () => void;
    }

    let {
        open = false,
        noteTitle = "",
        localContent = "",
        serverContent = "",
        localTimestamp = "",
        serverTimestamp = "",
        onResolve,
        onClose,
    }: Props = $props();

    let dialogEl = $state<HTMLDialogElement | null>(null);
    let decryptedLocal = $state("");
    let decryptedServer = $state("");
    let isDecrypting = $state(false);

    // Open/close dialog based on open prop
    $effect(() => {
        if (open && dialogEl && !dialogEl.open) {
            dialogEl.showModal();
            decryptContents();
        } else if (!open && dialogEl?.open) {
            dialogEl.close();
        }
    });

    async function decryptContents() {
        isDecrypting = true;
        try {
            if (localContent) {
                decryptedLocal = await decryptContent(localContent);
            }
            if (serverContent) {
                decryptedServer = await decryptContent(serverContent);
            }
        } catch (e) {
            console.error("[ConflictModal] Decryption failed:", e);
            decryptedLocal = "[Decryption failed]";
            decryptedServer = "[Decryption failed]";
        }
        isDecrypting = false;
    }

    function formatDate(iso: string): string {
        if (!iso) return "Unknown";
        const date = new Date(iso);
        return date.toLocaleString();
    }

    function handleChoice(choice: "local" | "server" | "both") {
        onResolve(choice);
        onClose();
    }

    function truncatePreview(text: string, lines: number = 10): string {
        const split = text.split("\n");
        if (split.length <= lines) return text;
        return split.slice(0, lines).join("\n") + "\n...";
    }
</script>

<dialog bind:this={dialogEl} class="modal" onclose={onClose}>
    <div class="modal-box max-w-4xl">
        <button
            type="button"
            class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
            onclick={onClose}
        >
            <X size={16} />
        </button>

        <h3 class="font-bold text-lg flex items-center gap-2 text-warning">
            ⚠️ Sync Conflict Detected
        </h3>
        <p class="text-sm text-base-content/70 mt-1">
            "{noteTitle}" was edited in two places while you were offline.
        </p>

        {#if isDecrypting}
            <div class="flex justify-center py-8">
                <span class="loading loading-spinner loading-lg"></span>
            </div>
        {:else}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <!-- Local Version -->
                <div class="card bg-base-200 border border-primary">
                    <div class="card-body p-4">
                        <h4 class="card-title text-sm flex items-center gap-2">
                            <ArrowLeft size={16} class="text-primary" />
                            Your Offline Version
                        </h4>
                        <p class="text-xs text-base-content/60">
                            Modified: {formatDate(localTimestamp)}
                        </p>
                        <pre
                            class="text-xs bg-base-300 p-3 rounded-lg overflow-auto max-h-48 whitespace-pre-wrap">{truncatePreview(
                                decryptedLocal,
                            )}</pre>
                        <button
                            class="btn btn-primary btn-sm mt-2"
                            onclick={() => handleChoice("local")}
                        >
                            <Check size={14} />
                            Keep This Version
                        </button>
                    </div>
                </div>

                <!-- Server Version -->
                <div class="card bg-base-200 border border-secondary">
                    <div class="card-body p-4">
                        <h4 class="card-title text-sm flex items-center gap-2">
                            <ArrowRight size={16} class="text-secondary" />
                            Server Version
                        </h4>
                        <p class="text-xs text-base-content/60">
                            Modified: {formatDate(serverTimestamp)}
                        </p>
                        <pre
                            class="text-xs bg-base-300 p-3 rounded-lg overflow-auto max-h-48 whitespace-pre-wrap">{truncatePreview(
                                decryptedServer,
                            )}</pre>
                        <button
                            class="btn btn-secondary btn-sm mt-2"
                            onclick={() => handleChoice("server")}
                        >
                            <Check size={14} />
                            Keep This Version
                        </button>
                    </div>
                </div>
            </div>

            <!-- Keep Both Option -->
            <div class="divider">OR</div>
            <button
                class="btn btn-outline btn-block gap-2"
                onclick={() => handleChoice("both")}
            >
                <Copy size={16} />
                Keep Both (Create a copy of the other version)
            </button>
        {/if}
    </div>
    <form method="dialog" class="modal-backdrop">
        <button>close</button>
    </form>
</dialog>
