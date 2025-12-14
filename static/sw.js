/**
 * Wolffia - Service Worker
 * PWA offline support with caching strategies
 * @ts-nocheck
 */

const CACHE_VERSION = 'v1';
const CACHE_NAME = `wolffia-${CACHE_VERSION}`;

// App shell files to cache (Cache-First)
const APP_SHELL = [
    '/',
    '/index.html',
    '/manifest.json'
];

// Cache-First for app shell, Network-First for API
const CACHE_FIRST_PATTERNS = [
    /\.(js|css|woff2?|png|jpg|jpeg|svg|ico)$/,
    /^\/$/,
    /\/index\.html$/
];

const NETWORK_FIRST_PATTERNS = [
    /\/api\//,
    /\/auth\//,
    /\/events/
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

    // Cache-First for static assets
    if (CACHE_FIRST_PATTERNS.some((pattern) => pattern.test(url.pathname))) {
        event.respondWith(cacheFirst(event.request));
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
 */
async function staleWhileRevalidate(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);

    const networkPromise = fetch(request).then((response) => {
        if (response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    });

    return cached || networkPromise;
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
