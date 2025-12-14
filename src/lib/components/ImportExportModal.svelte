<!--
  Wolffia - Import/Export Modal
  Data portability UI with drag-and-drop
-->
<script lang="ts">
    import {
        Upload,
        Download,
        FileText,
        Archive,
        AlertCircle,
        Check,
    } from "@lucide/svelte";
    import {
        importFiles,
        exportDecrypted,
        exportEncrypted,
        importEncryptedBackup,
        downloadBlob,
    } from "$lib/portability";

    let { isOpen = false, onClose = () => {} } = $props<{
        isOpen: boolean;
        onClose: () => void;
    }>();

    let dialogEl = $state<HTMLDialogElement | null>(null);
    let activeTab = $state<"import" | "export">("import");
    let isProcessing = $state(false);
    let progress = $state({ current: 0, total: 0 });
    let result = $state<{ success: number; failed: number } | null>(null);
    let isDragging = $state(false);
    let fileInput = $state<HTMLInputElement | null>(null);

    // Open/close dialog
    $effect(() => {
        if (dialogEl) {
            if (isOpen) {
                dialogEl.showModal();
                result = null;
            } else {
                dialogEl.close();
            }
        }
    });

    // Handle file drop
    function handleDrop(e: DragEvent) {
        e.preventDefault();
        isDragging = false;

        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
            handleImport(files);
        }
    }

    function handleDragOver(e: DragEvent) {
        e.preventDefault();
        isDragging = true;
    }

    function handleDragLeave() {
        isDragging = false;
    }

    function handleFileSelect(e: Event) {
        const input = e.target as HTMLInputElement;
        if (input.files && input.files.length > 0) {
            handleImport(input.files);
        }
    }

    async function handleImport(files: FileList) {
        isProcessing = true;
        result = null;
        progress = { current: 0, total: files.length };

        try {
            // Check if it's a backup file
            if (files.length === 1 && files[0].name.endsWith(".json")) {
                result = await importEncryptedBackup(
                    files[0],
                    (current, total) => {
                        progress = { current, total };
                    },
                );
            } else {
                result = await importFiles(
                    files,
                    undefined,
                    (current, total) => {
                        progress = { current, total };
                    },
                );
            }
        } catch (e) {
            console.error("Import error:", e);
            result = { success: 0, failed: files.length };
        } finally {
            isProcessing = false;
        }
    }

    async function handleExportDecrypted() {
        isProcessing = true;
        progress = { current: 0, total: 0 };

        try {
            const blob = await exportDecrypted((current, total) => {
                progress = { current, total };
            });
            downloadBlob(blob, `wolffia-export-${Date.now()}.zip`);
        } catch (e) {
            console.error("Export error:", e);
        } finally {
            isProcessing = false;
        }
    }

    async function handleExportEncrypted() {
        isProcessing = true;

        try {
            const blob = await exportEncrypted();
            downloadBlob(blob, `wolffia-backup-${Date.now()}.json`);
        } catch (e) {
            console.error("Export error:", e);
        } finally {
            isProcessing = false;
        }
    }
</script>

<dialog bind:this={dialogEl} class="modal" onclose={onClose}>
    <div class="modal-box max-w-lg">
        <!-- Header -->
        <div class="flex items-center justify-between mb-6">
            <h3 class="font-bold text-lg">Import / Export</h3>
        </div>

        <!-- Tabs -->
        <div class="tabs tabs-boxed mb-6">
            <button
                class="tab flex-1 {activeTab === 'import' ? 'tab-active' : ''}"
                onclick={() => {
                    activeTab = "import";
                    result = null;
                }}
            >
                <Upload size={16} class="mr-2" />
                Import
            </button>
            <button
                class="tab flex-1 {activeTab === 'export' ? 'tab-active' : ''}"
                onclick={() => {
                    activeTab = "export";
                    result = null;
                }}
            >
                <Download size={16} class="mr-2" />
                Export
            </button>
        </div>

        {#if activeTab === "import"}
            <!-- Import Tab -->
            <div
                class="border-2 border-dashed rounded-lg p-8 text-center transition-colors
          {isDragging
                    ? 'border-primary bg-primary/10'
                    : 'border-base-300 hover:border-primary/50'}"
                role="region"
                aria-label="File drop zone"
                ondrop={handleDrop}
                ondragover={handleDragOver}
                ondragleave={handleDragLeave}
            >
                <Upload size={48} class="mx-auto mb-4 text-base-content/50" />
                <p class="text-lg font-medium mb-2">Drop files here</p>
                <p class="text-sm text-base-content/60 mb-4">
                    Supports .txt, .md, and .json backup files
                </p>
                <button
                    class="btn btn-primary btn-sm"
                    onclick={() => fileInput?.click()}
                    disabled={isProcessing}
                >
                    Browse Files
                </button>
                <input
                    bind:this={fileInput}
                    type="file"
                    class="hidden"
                    multiple
                    accept=".txt,.md,.markdown,.json"
                    onchange={handleFileSelect}
                />
            </div>

            <div class="alert mt-4">
                <AlertCircle size={16} />
                <span class="text-sm"
                    >Files are encrypted on your device before upload. Plain
                    text never reaches the server.</span
                >
            </div>
        {:else}
            <!-- Export Tab -->
            <div class="space-y-4">
                <!-- Decrypted Export -->
                <div class="card bg-base-200">
                    <div class="card-body p-4">
                        <div class="flex items-start gap-4">
                            <div class="p-3 bg-success/20 rounded-lg">
                                <FileText size={24} class="text-success" />
                            </div>
                            <div class="flex-1">
                                <h4 class="font-medium">Decrypted Export</h4>
                                <p class="text-sm text-base-content/60 mt-1">
                                    Download all notes as plain text files.
                                    Preserves original formats (.md or .txt).
                                </p>
                            </div>
                        </div>
                        <button
                            class="btn btn-success btn-sm mt-3"
                            onclick={handleExportDecrypted}
                            disabled={isProcessing}
                        >
                            <Download size={16} />
                            Download Notes
                        </button>
                    </div>
                </div>

                <!-- Encrypted Backup -->
                <div class="card bg-base-200">
                    <div class="card-body p-4">
                        <div class="flex items-start gap-4">
                            <div class="p-3 bg-warning/20 rounded-lg">
                                <Archive size={24} class="text-warning" />
                            </div>
                            <div class="flex-1">
                                <h4 class="font-medium">Encrypted Backup</h4>
                                <p class="text-sm text-base-content/60 mt-1">
                                    Download raw encrypted data. Can be restored
                                    later with your password.
                                </p>
                            </div>
                        </div>
                        <button
                            class="btn btn-warning btn-sm mt-3"
                            onclick={handleExportEncrypted}
                            disabled={isProcessing}
                        >
                            <Download size={16} />
                            Download Backup (JSON)
                        </button>
                    </div>
                </div>
            </div>
        {/if}

        <!-- Progress -->
        {#if isProcessing}
            <div class="mt-4">
                <div class="flex items-center justify-between text-sm mb-2">
                    <span>Processing...</span>
                    <span>{progress.current} / {progress.total}</span>
                </div>
                <progress
                    class="progress progress-primary w-full"
                    value={progress.current}
                    max={progress.total}
                ></progress>
            </div>
        {/if}

        <!-- Result -->
        {#if result}
            <div
                class="alert {result.failed > 0
                    ? 'alert-warning'
                    : 'alert-success'} mt-4"
            >
                <Check size={16} />
                <span>
                    {result.success} items processed
                    {#if result.failed > 0}
                        , {result.failed} failed
                    {/if}
                </span>
            </div>
        {/if}

        <!-- Close -->
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
