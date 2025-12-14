<!--
  Wolffia - Recovery Codes Modal
  Displays recovery codes after generation with copy/download options
-->
<script lang="ts">
    import { Copy, Download, AlertTriangle, Check, X } from "@lucide/svelte";

    let {
        codes = [],
        isOpen = false,
        onClose = () => {},
    } = $props<{
        codes: string[];
        isOpen: boolean;
        onClose: () => void;
    }>();

    let copied = $state(false);
    let dialogEl = $state<HTMLDialogElement | null>(null);

    // Open/close dialog based on isOpen prop
    $effect(() => {
        if (dialogEl) {
            if (isOpen) {
                dialogEl.showModal();
            } else {
                dialogEl.close();
            }
        }
    });

    function copyToClipboard() {
        const text = codes.join("\n");
        navigator.clipboard.writeText(text);
        copied = true;
        setTimeout(() => (copied = false), 2000);
    }

    function downloadCodes() {
        const text = `Wolffia Recovery Codes
========================
Generated: ${new Date().toISOString()}

IMPORTANT: Store these codes securely. Each code can only be used once.
If you lose access to your password, use one of these codes to recover your account.

${codes.map((c: string, i: number) => `${i + 1}. ${c}`).join("\n")}

========================
Keep this file safe and private!`;

        const blob = new Blob([text], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "wolffia-recovery-codes.txt";
        a.click();
        URL.revokeObjectURL(url);
    }

    function handleClose() {
        onClose();
    }
</script>

<dialog bind:this={dialogEl} class="modal" onclose={handleClose}>
    <div class="modal-box max-w-md">
        <!-- Header -->
        <div class="flex items-center gap-3 mb-4">
            <div class="p-2 bg-warning/20 rounded-lg">
                <AlertTriangle class="text-warning" size={24} />
            </div>
            <div>
                <h3 class="font-bold text-lg">Save Your Recovery Codes</h3>
                <p class="text-sm text-base-content/70">
                    You won't see these again!
                </p>
            </div>
        </div>

        <!-- Warning -->
        <div class="alert alert-warning mb-4">
            <AlertTriangle size={16} />
            <span class="text-sm">
                These codes are the <strong>only way</strong> to recover your account
                if you forget your password. Save them somewhere safe!
            </span>
        </div>

        <!-- Codes Grid -->
        <div
            class="grid grid-cols-2 gap-2 p-4 bg-base-200 rounded-lg font-mono text-center mb-4"
        >
            {#each codes as code, i (i)}
                <div class="p-2 bg-base-100 rounded border border-base-300">
                    <span class="text-base-content/50 text-xs mr-1"
                        >{i + 1}.</span
                    >
                    <span class="font-bold tracking-wider">{code}</span>
                </div>
            {/each}
        </div>

        <!-- Actions -->
        <div class="flex gap-2 mb-4">
            <button
                class="btn btn-outline flex-1 gap-2"
                onclick={copyToClipboard}
            >
                {#if copied}
                    <Check size={16} class="text-success" />
                    Copied!
                {:else}
                    <Copy size={16} />
                    Copy All
                {/if}
            </button>

            <button
                class="btn btn-outline flex-1 gap-2"
                onclick={downloadCodes}
            >
                <Download size={16} />
                Download
            </button>
        </div>

        <!-- Confirmation -->
        <div class="form-control mb-4">
            <label class="label cursor-pointer gap-3">
                <input
                    type="checkbox"
                    class="checkbox checkbox-primary"
                    id="confirm-saved"
                />
                <span class="label-text"
                    >I have saved my recovery codes in a safe place</span
                >
            </label>
        </div>

        <!-- Close Button -->
        <div class="modal-action">
            <button class="btn btn-primary w-full" onclick={handleClose}>
                Done
            </button>
        </div>
    </div>

    <!-- Click outside to close (disabled for important modal) -->
    <form method="dialog" class="modal-backdrop bg-black/50">
        <button disabled>close</button>
    </form>
</dialog>
