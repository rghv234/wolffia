/**
 * Wolffia - Service Worker
 * PWA offline support with caching strategies
 * @ts-nocheck
 */

const CACHE_VERSION = 'v2';  // Bump version to force refresh
const CACHE_NAME = `wolffia-${CACHE_VERSION}`;

// App shell files to cache on install
const APP_SHELL = [
    '/',
    '/manifest.json',
    '/favicon.svg'
];

// Cache-First for static assets (including SvelteKit chunks)
// These assets have hashed filenames so they're immutable
const CACHE_FIRST_PATTERNS = [
    /\.(js|css|woff2?|png|jpg|jpeg|svg|ico|webp)$/,
    /^\/_app\//,       // SvelteKit app chunks (immutable)
    /^\/$/,            // Root page
    /\/favicon/        // Favicons
];

// Network-First for dynamic/API content
const NETWORK_FIRST_PATTERNS = [
    /\/api\//,
    /\/auth\//,
    /\/events/,
    /\/settings/
];

// Install - cache app shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('Caching app shell');
            return cache.addAll(APP_SHELL);
        })
    );
    self.skipWaiting();
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name.startsWith('wolffia-') && name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        })
    );
    self.clients.claim();
});

// Fetch - apply caching strategy
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    // Skip SSE/EventSource
    if (event.request.headers.get('accept')?.includes('text/event-stream')) {
        return;
    }

    // Network-First for API calls
    if (NETWORK_FIRST_PATTERNS.some((pattern) => pattern.test(url.pathname))) {
        event.respondWith(networkFirst(event.request));
        return;
    }

    // Cache-First for static assets (including SvelteKit _app chunks)
    if (CACHE_FIRST_PATTERNS.some((pattern) => pattern.test(url.pathname))) {
        event.respondWith(cacheFirst(event.request));
        return;
    }

    // For navigation requests (HTML pages), use stale-while-revalidate
    // and fall back to cached root if completely offline
    if (event.request.mode === 'navigate') {
        event.respondWith(handleNavigation(event.request));
        return;
    }

    // Stale-While-Revalidate for everything else
    event.respondWith(staleWhileRevalidate(event.request));
});

/**
 * Cache-First strategy
 */
async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) {
        return cached;
    }

    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        return new Response('Offline', { status: 503 });
    }
}

/**
 * Network-First strategy
 */
async function networkFirst(request) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        const cached = await caches.match(request);
        if (cached) {
            return cached;
        }
        return new Response(JSON.stringify({ error: 'Offline' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

/**
 * Stale-While-Revalidate strategy
 * Returns cached immediately, refreshes in background
 * Falls back to offline page if completely unavailable
 */
async function staleWhileRevalidate(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);

    // If we have a cache, return it and update in background
    if (cached) {
        fetch(request).then((response) => {
            if (response.ok) {
                cache.put(request, response.clone());
            }
        }).catch(() => {
            // Network failed, that's fine - we have cache
        });
        return cached;
    }

    // No cache - try network
    try {
        const response = await fetch(request);
        if (response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        // Network failed and no cache - try to return root page for SPA routing
        const rootCached = await cache.match('/');
        if (rootCached) {
            return rootCached;
        }

        // Nothing available - return offline response
        return new Response(
            '<html><body style="font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;"><div style="text-align:center"><h1>Offline</h1><p>Please connect to the internet and refresh.</p></div></body></html>',
            {
                status: 503,
                headers: { 'Content-Type': 'text/html' }
            }
        );
    }
}

/**
 * Handle navigation requests (HTML pages)
 * Falls back to cached root if completely offline
 */
async function handleNavigation(request) {
    try {
        // Try network first for navigation
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        // Network failed - try cache
        const cached = await caches.match(request);
        if (cached) {
            return cached;
        }

        // Fall back to root page (SPA can route from there)
        const rootCached = await caches.match('/');
        if (rootCached) {
            return rootCached;
        }

        // Last resort - offline message
        return new Response(
            '<html><body><h1>Offline</h1><p>Please reconnect to the internet.</p></body></html>',
            {
                status: 503,
                headers: { 'Content-Type': 'text/html' }
            }
        );
    }
}

// Handle push notifications
self.addEventListener('push', (event) => {
    if (event.data) {
        const data = event.data.json();
        self.registration.showNotification(data.title || 'Wolffia', {
            body: data.body,
            icon: '/icon-192.png',
            badge: '/icon-192.png'
        });
    }
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        self.clients.openWindow('/')
    );
});
