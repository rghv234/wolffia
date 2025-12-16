<!--
  Wolffia - Auth Page
  Login/Register with recovery codes flow
-->
<script lang="ts">
    import {
        User,
        Lock,
        Eye,
        EyeOff,
        LogIn,
        UserPlus,
        KeyRound,
    } from "@lucide/svelte";
    import { goto } from "$app/navigation";
    import { auth } from "$lib/api";
    import {
        generateSalt,
        deriveKeys,
        exportKeyAsBase64,
        setEncryptionKey,
        generateRecoveryCodes,
    } from "$lib/crypto";
    import { appState } from "$lib/stores/app.svelte";
    import {
        syncLocalNotesToServer,
        loadAllData,
        connectSync,
    } from "$lib/sync";
    import RecoveryCodesModal from "$lib/components/RecoveryCodesModal.svelte";

    // State
    let isLogin = $state(true);
    let username = $state("");
    let password = $state("");
    let confirmPassword = $state("");
    let showPassword = $state(false);
    let isLoading = $state(false);
    let error = $state("");

    // Recovery codes modal
    let showRecoveryCodes = $state(false);
    let recoveryCodes = $state<string[]>([]);

    // Recovery mode
    let isRecoveryMode = $state(false);
    let recoveryCode = $state("");

    // Offline state
    let isOffline = $state(false);
    let hasOfflineCredentials = $state(false);

    import {
        cacheCredentials,
        getCachedCredentials,
        isOfflineAvailable,
        type CachedAuth,
    } from "$lib/offline";

    // Check for cached credentials on mount
    import { onMount } from "svelte";
    onMount(() => {
        hasOfflineCredentials = isOfflineAvailable();
    });

    async function handleLogin() {
        if (!username || !password) {
            error = "Please enter username and password";
            return;
        }

        isLoading = true;
        error = "";
        isOffline = false;

        try {
            // Try to get salts from server first
            let saltAuth: string;
            let saltEncryption: string;
            let userId: number | null = null;

            try {
                const params = await auth.getParams(username);
                if (params.error) {
                    throw new Error(params.error);
                }
                saltAuth = params.data!.salt_auth;
                saltEncryption = params.data!.salt_encryption;
            } catch (networkError) {
                // Server unavailable - try offline login
                console.log("Server unavailable, trying offline login...");
                const cached = getCachedCredentials();

                if (!cached || cached.username !== username) {
                    error =
                        "Server unavailable and no cached credentials for this user";
                    return;
                }

                // Use cached salts
                saltAuth = cached.salt_auth;
                saltEncryption = cached.salt_encryption;
                userId = cached.user_id;
                isOffline = true;
            }

            // Derive keys
            const { keyA, keyB } = await deriveKeys(
                password,
                saltAuth,
                saltEncryption,
            );

            // Export Key A for auth
            const passwordHash = await exportKeyAsBase64(keyA);

            if (isOffline) {
                // Offline login - verify against cached hash
                const cached = getCachedCredentials()!;
                if (cached.auth_key_hash !== passwordHash) {
                    error = "Incorrect password (offline verification)";
                    return;
                }

                // Offline login successful
                appState.token = "offline_session";
                appState.userId = userId;
                appState.username = username;
                setEncryptionKey(keyB);

                goto("/");
                return;
            }

            // Online login
            const result = await auth.login({
                username,
                password_hash: passwordHash,
            });
            if (result.error) {
                error = result.error;
                return;
            }

            // Store session
            appState.token = result.data!.token;
            appState.userId = result.data!.user.id;
            appState.username = result.data!.user.username;

            // Set encryption key
            setEncryptionKey(keyB);

            // Cache credentials for offline login
            cacheCredentials({
                username,
                salt_auth: saltAuth,
                salt_encryption: saltEncryption,
                user_id: result.data!.user.id,
                auth_key_hash: passwordHash,
            });

            // Sync any local notes to server (offline-first support)
            try {
                await syncLocalNotesToServer();
            } catch (syncError) {
                console.warn("[Auth] Failed to sync local notes:", syncError);
                // Don't block login on sync failure
            }

            // Load user data BEFORE navigating to prevent glitchy home screen
            try {
                await loadAllData();
                connectSync();
            } catch (loadError) {
                console.warn(
                    "[Auth] Failed to load data after login:",
                    loadError,
                );
                // Still navigate - app can work offline
            }

            // Navigate to app
            goto("/");
        } catch (e) {
            error = e instanceof Error ? e.message : "Login failed";
        } finally {
            isLoading = false;
        }
    }

    async function handleRegister() {
        if (!username || !password) {
            error = "Please enter username and password";
            return;
        }

        if (password !== confirmPassword) {
            error = "Passwords do not match";
            return;
        }

        if (password.length < 8) {
            error = "Password must be at least 8 characters";
            return;
        }

        isLoading = true;
        error = "";

        try {
            // Generate salts
            const saltAuth = generateSalt();
            const saltEncryption = generateSalt();

            // Derive keys
            const { keyA, keyB } = await deriveKeys(
                password,
                saltAuth,
                saltEncryption,
            );

            // Export Key A for auth
            const passwordHash = await exportKeyAsBase64(keyA);

            // Register
            const result = await auth.register({
                username,
                password_hash: passwordHash,
                salt_auth: saltAuth,
                salt_encryption: saltEncryption,
            });

            if (result.error) {
                error = result.error;
                return;
            }

            // Auto-login after registration
            const loginResult = await auth.login({
                username,
                password_hash: passwordHash,
            });
            if (loginResult.error) {
                error =
                    "Registration successful but login failed. Please log in manually.";
                isLogin = true;
                return;
            }

            // Store session
            appState.token = loginResult.data!.token;
            appState.userId = loginResult.data!.user.id;
            appState.username = loginResult.data!.user.username;

            // Set encryption key
            setEncryptionKey(keyB);

            // Cache credentials for offline login
            cacheCredentials({
                username,
                salt_auth: saltAuth,
                salt_encryption: saltEncryption,
                user_id: loginResult.data!.user.id,
                auth_key_hash: passwordHash,
            });

            // Generate recovery codes
            const { codes, encryptedSalts } =
                await generateRecoveryCodes(saltEncryption);

            // Send first encrypted salt to server (all codes encrypt to same salt)
            await auth.generateRecoveryCodes(encryptedSalts[0]);

            // Show recovery codes modal
            recoveryCodes = codes;
            showRecoveryCodes = true;
        } catch (e) {
            error = e instanceof Error ? e.message : "Registration failed";
        } finally {
            isLoading = false;
        }
    }

    async function handleRecovery() {
        if (!username || !recoveryCode) {
            error = "Please enter username and recovery code";
            return;
        }

        isLoading = true;
        error = "";

        try {
            const result = await auth.verifyRecoveryCode(
                username,
                recoveryCode,
            );
            if (result.error) {
                error = result.error;
                return;
            }

            // Recovery successful - show password reset flow
            // For now, just show success and prompt new password
            error = `Recovery successful! ${result.data!.remaining_codes} codes remaining. Please set a new password.`;
            isRecoveryMode = false;
        } catch (e) {
            error = e instanceof Error ? e.message : "Recovery failed";
        } finally {
            isLoading = false;
        }
    }

    function handleRecoveryCodesClose() {
        showRecoveryCodes = false;
        goto("/");
    }

    function handleSubmit(e: SubmitEvent) {
        e.preventDefault();
        if (isRecoveryMode) {
            handleRecovery();
        } else if (isLogin) {
            handleLogin();
        } else {
            handleRegister();
        }
    }
</script>

<svelte:head>
    <title>Wolffia - {isLogin ? "Login" : "Register"}</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-base-200 p-4">
    <div class="card bg-base-100 shadow-xl w-full max-w-md">
        <div class="card-body">
            <!-- Logo -->
            <div class="text-center mb-6">
                <h1 class="text-3xl font-bold">Wolffia</h1>
                <p class="text-base-content/60 text-sm mt-1">
                    E2EE Note-taking Workspace
                </p>
            </div>

            <!-- Error -->
            {#if error}
                <div class="alert alert-error mb-4">
                    <span class="text-sm">{error}</span>
                </div>
            {/if}

            <!-- Form -->
            <form onsubmit={handleSubmit}>
                {#if isRecoveryMode}
                    <!-- Recovery Mode -->
                    <div class="form-control mb-4">
                        <label class="label" for="username">
                            <span class="label-text">Username</span>
                        </label>
                        <div
                            class="input input-bordered flex items-center gap-2"
                        >
                            <User size={18} class="text-base-content/50" />
                            <input
                                type="text"
                                id="username"
                                class="grow bg-transparent outline-none"
                                placeholder="Enter username"
                                bind:value={username}
                            />
                        </div>
                    </div>

                    <div class="form-control mb-6">
                        <label class="label" for="recovery-code">
                            <span class="label-text">Recovery Code</span>
                        </label>
                        <div
                            class="input input-bordered flex items-center gap-2"
                        >
                            <KeyRound size={18} class="text-base-content/50" />
                            <input
                                type="text"
                                id="recovery-code"
                                class="grow bg-transparent outline-none font-mono uppercase tracking-wider"
                                placeholder="XXXXXXXX"
                                maxlength="8"
                                bind:value={recoveryCode}
                            />
                        </div>
                    </div>
                {:else}
                    <!-- Username -->
                    <div class="form-control mb-4">
                        <label class="label" for="username">
                            <span class="label-text">Username</span>
                        </label>
                        <div
                            class="input input-bordered flex items-center gap-2"
                        >
                            <User size={18} class="text-base-content/50" />
                            <input
                                type="text"
                                id="username"
                                class="grow bg-transparent outline-none"
                                placeholder="Enter username"
                                bind:value={username}
                            />
                        </div>
                    </div>

                    <!-- Password -->
                    <div class="form-control mb-4">
                        <label class="label" for="password">
                            <span class="label-text">Password</span>
                        </label>
                        <div
                            class="input input-bordered flex items-center gap-2"
                        >
                            <Lock size={18} class="text-base-content/50" />
                            <input
                                type={showPassword ? "text" : "password"}
                                id="password"
                                class="grow bg-transparent outline-none"
                                placeholder="Enter password"
                                bind:value={password}
                            />
                            <button
                                type="button"
                                class="btn btn-ghost btn-xs btn-circle"
                                onclick={() => (showPassword = !showPassword)}
                            >
                                {#if showPassword}
                                    <EyeOff size={16} />
                                {:else}
                                    <Eye size={16} />
                                {/if}
                            </button>
                        </div>
                    </div>

                    <!-- Confirm Password (Register only) -->
                    {#if !isLogin}
                        <div class="form-control mb-6">
                            <label class="label" for="confirm-password">
                                <span class="label-text">Confirm Password</span>
                            </label>
                            <div
                                class="input input-bordered flex items-center gap-2"
                            >
                                <Lock size={18} class="text-base-content/50" />
                                <input
                                    type={showPassword ? "text" : "password"}
                                    id="confirm-password"
                                    class="grow bg-transparent outline-none"
                                    placeholder="Confirm password"
                                    bind:value={confirmPassword}
                                />
                            </div>
                        </div>
                    {/if}
                {/if}

                <!-- Submit Button -->
                <button
                    type="submit"
                    class="btn btn-primary w-full gap-2"
                    disabled={isLoading}
                >
                    {#if isLoading}
                        <span class="loading loading-spinner loading-sm"></span>
                    {:else if isRecoveryMode}
                        <KeyRound size={18} />
                        Recover Account
                    {:else if isLogin}
                        <LogIn size={18} />
                        Login
                    {:else}
                        <UserPlus size={18} />
                        Create Account
                    {/if}
                </button>
            </form>

            <!-- Toggle -->
            <div class="divider text-xs text-base-content/50">OR</div>

            {#if isRecoveryMode}
                <button
                    class="btn btn-ghost btn-sm w-full"
                    onclick={() => (isRecoveryMode = false)}
                >
                    Back to Login
                </button>
            {:else}
                <div class="flex flex-col gap-2">
                    <button
                        class="btn btn-ghost btn-sm w-full"
                        onclick={() => {
                            isLogin = !isLogin;
                            error = "";
                        }}
                    >
                        {isLogin
                            ? "Don't have an account? Register"
                            : "Already have an account? Login"}
                    </button>

                    {#if isLogin}
                        <button
                            class="btn btn-ghost btn-sm btn-xs w-full text-base-content/60"
                            onclick={() => {
                                isRecoveryMode = true;
                                error = "";
                            }}
                        >
                            Forgot password? Use recovery code
                        </button>
                    {/if}
                </div>
            {/if}
        </div>
    </div>
</div>

<!-- Recovery Codes Modal -->
<RecoveryCodesModal
    codes={recoveryCodes}
    isOpen={showRecoveryCodes}
    onClose={handleRecoveryCodesClose}
/>
