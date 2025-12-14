<!--
  Wolffia - FolderModal Component
  Native <dialog> with color picker support
-->
<script lang="ts">
    import { Folder, X, Check, Trash2 } from "@lucide/svelte";

    let {
        isOpen = false,
        editingFolder = null,
        onClose = () => {},
        onCreate = (name: string, color: string) => {},
        onDelete = () => {},
    } = $props<{
        isOpen: boolean;
        editingFolder?: { id: number; name: string; color?: string } | null;
        onClose: () => void;
        onCreate: (name: string, color: string) => void;
        onDelete?: () => void;
    }>();

    let folderName = $state("");
    let folderColor = $state("#fbbf24"); // Default yellow/amber

    let dialogRef: HTMLDialogElement | undefined = $state();

    // Preset colors (nice palette)
    const presetColors = [
        { hex: "#fbbf24", label: "Yellow" },
        { hex: "#22c55e", label: "Green" },
        { hex: "#3b82f6", label: "Blue" },
        { hex: "#ef4444", label: "Red" },
        { hex: "#a855f7", label: "Purple" },
        { hex: "#ec4899", label: "Pink" },
        { hex: "#f97316", label: "Orange" },
        { hex: "#14b8a6", label: "Teal" },
        { hex: "#6366f1", label: "Indigo" },
        { hex: "#71717a", label: "Gray" },
    ];

    $effect(() => {
        if (isOpen && dialogRef) {
            // Initialize from editing folder
            if (editingFolder) {
                folderName = editingFolder.name;
                folderColor = editingFolder.color || "#fbbf24";
            } else {
                folderName = "";
                folderColor = "#fbbf24";
            }
            dialogRef.showModal();
        } else if (!isOpen && dialogRef) {
            dialogRef.close();
        }
    });

    function handleCreate() {
        if (folderName.trim()) {
            onCreate(folderName.trim(), folderColor);
            folderName = "";
            folderColor = "#fbbf24";
            onClose();
        }
    }

    function handleDelete() {
        if (editingFolder && onDelete) {
            onDelete();
            onClose();
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Enter" && folderName.trim()) {
            handleCreate();
        } else if (e.key === "Escape") {
            onClose();
        }
    }
</script>

<dialog bind:this={dialogRef} class="modal" onclose={onClose}>
    <div class="modal-box">
        <h3 class="font-bold text-lg flex items-center gap-2">
            <Folder size={20} style="color: {folderColor}" />
            {editingFolder ? "Edit Folder" : "New Folder"}
        </h3>

        <div class="py-4 space-y-4">
            <!-- Folder Name -->
            <div class="form-control">
                <label class="label">
                    <span class="label-text">Folder Name</span>
                </label>
                <input
                    type="text"
                    class="input input-bordered w-full"
                    placeholder="Enter folder name..."
                    bind:value={folderName}
                    onkeydown={handleKeydown}
                    autofocus
                />
            </div>

            <!-- Folder Color -->
            <div class="form-control">
                <label class="label">
                    <span class="label-text">Folder Color</span>
                </label>

                <!-- Preset colors -->
                <div class="flex flex-wrap gap-2 mb-3">
                    {#each presetColors as color}
                        <button
                            type="button"
                            class="w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 {folderColor ===
                            color.hex
                                ? 'ring-2 ring-offset-2 ring-primary scale-110'
                                : 'border-transparent'}"
                            style="background-color: {color.hex}"
                            onclick={() => (folderColor = color.hex)}
                            title={color.label}
                        >
                            {#if folderColor === color.hex}
                                <Check size={14} class="text-white mx-auto" />
                            {/if}
                        </button>
                    {/each}
                </div>

                <!-- Custom color picker -->
                <div class="flex items-center gap-2">
                    <label class="text-sm text-base-content/70">Custom:</label>
                    <input
                        type="color"
                        class="w-12 h-8 cursor-pointer rounded"
                        bind:value={folderColor}
                    />
                    <input
                        type="text"
                        class="input input-sm input-bordered w-24 font-mono"
                        bind:value={folderColor}
                        placeholder="#000000"
                    />
                </div>
            </div>
        </div>

        <div class="modal-action">
            {#if editingFolder}
                <button
                    class="btn btn-error btn-outline mr-auto"
                    onclick={handleDelete}
                >
                    <Trash2 size={16} />
                    Delete
                </button>
            {/if}
            <button class="btn" onclick={onClose}> Cancel </button>
            <button
                class="btn btn-primary"
                onclick={handleCreate}
                disabled={!folderName.trim()}
            >
                {editingFolder ? "Save" : "Create Folder"}
            </button>
        </div>
    </div>

    <!-- Click outside to close -->
    <form method="dialog" class="modal-backdrop">
        <button onclick={onClose}>close</button>
    </form>
</dialog>
