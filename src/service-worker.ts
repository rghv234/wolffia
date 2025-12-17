/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

/**
 * Wolffia - Service Worker (SvelteKit Native)
 * Precaches all build assets for reliable offline support
 */

import { build, files, version } from '$service-worker';

declare const self: ServiceWorkerGlobalScope;

// Unique cache name for this deployment
const CACHE = `wolffia-${version}`;

// All assets that should work offline
const ASSETS = [
    ...build,  // All built JS/CSS chunks from Vite
    ...files   // All static files (favicon, manifest, etc.)
];

// Install: precache all assets
self.addEventListener('install', (event) => {
    async function addFilesToCache() {
        const cache = await caches.open(CACHE);
        console.log('[SW] Precaching', ASSETS.length, 'assets');

        // Precache all build/static assets
        await cache.addAll(ASSETS);

        // Also cache the root page for offline navigation fallback
        try {
            const rootResponse = await fetch('/');
            if (rootResponse.ok) {
                await cache.put('/', rootResponse);
                console.log('[SW] Cached root page for offline fallback');
            }
        } catch (e) {
            console.warn('[SW] Could not cache root page:', e);
        }
    }

    event.waitUntil(addFilesToCache());

    // Activate immediately without waiting
    self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
    async function deleteOldCaches() {
        const keys = await caches.keys();
        console.log('[SW] Found', keys.length, 'caches, current:', CACHE);
        for (const key of keys) {
            if (key !== CACHE) {
                console.log('[SW] Deleting old cache:', key);
                await caches.delete(key);
            }
        }
    }

    event.waitUntil(deleteOldCaches());

    // Take control immediately
    self.clients.claim();
    console.log('[SW] Activated and controlling all clients');
});

// Fetch: serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    // Only handle GET requests
    if (event.request.method !== 'GET') return;

    // NEVER intercept SSE/EventSource - let browser handle directly
    const url = new URL(event.request.url);
    if (url.pathname.startsWith('/events')) {
        return; // Don't call respondWith - let it pass through
    }

    async function respond(): Promise<Response> {
        const url = new URL(event.request.url);
        const cache = await caches.open(CACHE);

        // For precached assets, always serve from cache
        if (ASSETS.includes(url.pathname)) {
            const cached = await cache.match(url.pathname);
            if (cached) {
                return cached;
            }
        }

        // API requests: network first, cache fallback
        if (url.pathname.startsWith('/api/') ||
            url.pathname.startsWith('/auth/')) {
            try {
                const response = await fetch(event.request);
                return response;
            } catch {
                // API unavailable - return offline JSON
                return new Response(
                    JSON.stringify({ error: 'Offline' }),
                    {
                        status: 503,
                        headers: { 'Content-Type': 'application/json' }
                    }
                );
            }
        }

        // Navigation requests (HTML pages): network first, cache fallback
        if (event.request.mode === 'navigate') {
            try {
                const response = await fetch(event.request);
                if (response.ok) {
                    // Cache the page
                    cache.put(event.request, response.clone());
                }
                return response;
            } catch {
                console.log('[SW] Offline, trying cache for:', event.request.url);

                // Offline - return cached page or root
                const cached = await cache.match(event.request);
                if (cached) {
                    console.log('[SW] Serving from cache:', event.request.url);
                    return cached;
                }

                // Fallback to root for SPA routing
                const root = await cache.match('/');
                if (root) {
                    console.log('[SW] Serving root as fallback');
                    return root;
                }

                console.log('[SW] No cached content available');
                // Return a proper offline page
                return new Response(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1">
                        <title>Wolffia - Offline</title>
                        <style>
                            body { font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1f2937; color: #f9fafb; }
                            .container { text-align: center; padding: 2rem; }
                            h1 { font-size: 2rem; margin-bottom: 1rem; }
                            p { color: #9ca3af; margin-bottom: 2rem; }
                            button { background: #10b981; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; cursor: pointer; font-size: 1rem; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h1>📝 Wolffia</h1>
                            <p>You're offline. Please connect to the internet and visit the app once to enable offline mode.</p>
                            <button onclick="location.reload()">Retry</button>
                        </div>
                    </body>
                    </html>
                `, {
                    status: 503,
                    headers: { 'Content-Type': 'text/html' }
                });
            }
        }

        // Other requests: cache first, network fallback
        try {
            const cached = await cache.match(event.request);
            if (cached) {
                // Return cache, refresh in background
                fetch(event.request).then(response => {
                    if (response.ok) {
                        cache.put(event.request, response.clone());
                    }
                }).catch(() => { });
                return cached;
            }

            const response = await fetch(event.request);
            if (response.ok) {
                cache.put(event.request, response.clone());
            }
            return response;
        } catch (err) {
            const cached = await cache.match(event.request);
            if (cached) return cached;

            throw err;
        }
    }

    event.respondWith(respond());
});
