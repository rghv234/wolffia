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
        await cache.addAll(ASSETS);
    }

    event.waitUntil(addFilesToCache());

    // Activate immediately without waiting
    self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
    async function deleteOldCaches() {
        for (const key of await caches.keys()) {
            if (key !== CACHE) {
                console.log('[SW] Deleting old cache:', key);
                await caches.delete(key);
            }
        }
    }

    event.waitUntil(deleteOldCaches());

    // Take control immediately
    self.clients.claim();
});

// Fetch: serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    // Only handle GET requests
    if (event.request.method !== 'GET') return;

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
            url.pathname.startsWith('/auth/') ||
            url.pathname.startsWith('/events')) {
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
                // Offline - return cached page or root
                const cached = await cache.match(event.request);
                if (cached) return cached;

                // Fallback to root for SPA routing
                const root = await cache.match('/');
                if (root) return root;

                return new Response('Offline', { status: 503 });
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
