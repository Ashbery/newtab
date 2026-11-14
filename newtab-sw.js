/* Public app-shell snapshots. Never stores conversations, APIs or user media. */
'use strict';
const BASE = new URL('./', self.location.href);
const DOCUMENT_URL = new URL('index.html', BASE).href;
const META_CACHE = 'newtab-shell-meta-v1';
const SNAPSHOT_PREFIX = 'newtab-shell-v1-';
const ASSET_CACHE = 'newtab-public-assets-v1';
const POINTER_URL = new URL('__newtab_shell_pointer__', BASE).href;
const ASSET_LIMIT = 64;
const ASSET_BYTE_LIMIT = 2 * 1024 * 1024;
let refreshing = null;

function localURL(value) {
    try {
        const url = new URL(value.replace(/&amp;/g, '&'), BASE);
        return url.origin === BASE.origin && url.pathname.startsWith(BASE.pathname) ? url : null;
    } catch (_) { return null; }
}
function publicAsset(url) {
    return url.origin === BASE.origin && url.pathname.startsWith(BASE.pathname + 'assets/') &&
        /\.(?:png|jpe?g|webp|avif|svg|ico|ttf|woff2?)$/i.test(url.pathname);
}
function shellAsset(url) {
    if (url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return false;
    const path = url.pathname.slice(BASE.pathname.length);
    return (path === 'nachoneko-assets.js' || /^(?:js|css)\/[\w./-]+\.(?:js|css)$/.test(path)) &&
        url.searchParams.has('v');
}
function attributes(tag) {
    const result = {};
    for (const match of tag.matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/g)) result[match[1].toLowerCase()] = match[3];
    return result;
}
function filesIn(html) {
    const required = new Set(), optional = new Set();
    // Read tags, not inline script contents; the repository uses quoted URLs.
    for (const match of html.matchAll(/<(script|link)\b[^>]*>/gi)) {
        const attrs = attributes(match[0]);
        const url = localURL(match[1].toLowerCase() === 'script' ? attrs.src || '' : attrs.href || '');
        if (!url) continue;
        if (match[1].toLowerCase() === 'script' && attrs.src && shellAsset(url)) required.add(url.href);
        if (match[1].toLowerCase() === 'link' && attrs.rel === 'stylesheet' && shellAsset(url)) required.add(url.href);
        if (attrs.rel === 'preload' && publicAsset(url)) optional.add(url.href);
    }
    if (!required.size || !/<meta\b[^>]*name=["']newtab-release["']/i.test(html)) throw new Error('Not an app shell');
    return { required: [...required], optional: [...optional] };
}
async function fetchPublic(url, versioned) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
        const response = await fetch(url, { cache: versioned ? 'default' : 'no-cache', credentials: 'omit', signal: controller.signal });
        if (!response.ok || response.redirected || response.type === 'opaque') throw new Error('Unavailable app file');
        return response;
    } finally { clearTimeout(timer); }
}
async function pointer() {
    try {
        const response = await (await caches.open(META_CACHE)).match(POINTER_URL);
        const value = response && await response.json();
        return value && typeof value.current === 'string' && value.current.startsWith(SNAPSHOT_PREFIX) ? value : null;
    } catch (_) { return null; }
}
async function currentDocument() {
    const state = await pointer();
    return state && caches.match(DOCUMENT_URL, { cacheName: state.current });
}
async function parallel(items, action) {
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
        while (next < items.length) await action(items[next++]);
    }));
}
async function snapshot(response) {
    const html = await response.clone().text();
    const files = filesIn(html);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(html));
    const name = SNAPSHOT_PREFIX + Array.from(new Uint8Array(digest)).slice(0, 12).map(n => n.toString(16).padStart(2, '0')).join('');
    const previous = await pointer();
    if (previous && previous.current === name && await caches.match(DOCUMENT_URL, { cacheName: name })) return;
    const cache = await caches.open(name);
    try {
        // Versioned files already used by the first page can reuse HTTP cache.
        await parallel(files.required, async url => { await cache.put(url, await fetchPublic(url, true)); });
        await cache.put(DOCUMENT_URL, response.clone());
        const latest = await pointer();
        if (latest && (!previous || latest.current !== previous.current) && latest.current !== name) {
            // A newly activated worker may finish an update while this older
            // worker still has an event alive. Never replace that newer commit.
            await caches.delete(name);
            return;
        }
        // This is the commit point. Incomplete snapshots never become visible.
        await (await caches.open(META_CACHE)).put(POINTER_URL, new Response(JSON.stringify({
            current: name, previous: previous && previous.current !== name ? previous.current : previous && previous.previous || null
        }), { headers: { 'Content-Type': 'application/json' } }));
        const keep = new Set([name, previous && previous.current]);
        for (const old of await caches.keys()) if (old.startsWith(SNAPSHOT_PREFIX) && !keep.has(old)) await caches.delete(old);
    } catch (error) {
        if (!previous || previous.current !== name) await caches.delete(name);
        throw error;
    }
}
function refresh() {
    if (refreshing) return refreshing;
    refreshing = fetchPublic(DOCUMENT_URL).then(snapshot).catch(() => {
        // A failed update leaves the last complete version usable.
    }).finally(() => { refreshing = null; });
    return refreshing;
}
async function navigation(event) {
    const saved = await currentDocument();
    const force = event.request.cache === 'reload' || event.request.cache === 'no-store';
    if (saved && !force) { event.waitUntil(refresh()); return saved; }
    try {
        const response = await fetch(event.request);
        if (response.ok) event.waitUntil(refresh());
        return response;
    } catch (error) {
        if (saved) return saved;
        throw error;
    }
}
async function snapshotFile(request) {
    const state = await pointer();
    if (state) for (const name of [state.current, state.previous]) {
        if (!name || !name.startsWith(SNAPSHOT_PREFIX)) continue;
        // CacheStorage.match does not recreate a just-pruned old snapshot if
        // a request races with promotion/cleanup in another event.
        const response = await caches.match(request, { cacheName: name });
        if (response) return response;
    }
    return null;
}
async function saveAsset(request, response) {
    if (!response.ok || response.redirected || response.type === 'opaque') return;
    const bytes = await response.clone().arrayBuffer();
    if (bytes.byteLength > ASSET_BYTE_LIMIT) return;
    const cache = await caches.open(ASSET_CACHE);
    await cache.put(request, response);
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - ASSET_LIMIT; i++) await cache.delete(keys[i]);
}
async function asset(event) {
    const request = event.request;
    const saved = await snapshotFile(request) || await (await caches.open(ASSET_CACHE)).match(request);
    // Public images/fonts may update in the background; versioned code comes
    // exclusively from complete snapshots or the ordinary network path.
    const network = fetch(request).then(response => {
        event.waitUntil(saveAsset(request, response.clone()).catch(() => {}));
        return response;
    });
    if (saved) { event.waitUntil(network.catch(() => {})); return saved; }
    return network;
}
async function warmOptional() {
    const html = await currentDocument();
    if (!html) return;
    const urls = filesIn(await html.text()).optional;
    await parallel(urls, async url => {
        try { await saveAsset(new Request(url), await fetchPublic(url, true)); } catch (_) { /* best effort after activation */ }
    });
}
self.addEventListener('install', event => {
    event.waitUntil(refresh().then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'newtab-cache-warm-assets') event.waitUntil(warmOptional().catch(() => {}));
});
self.addEventListener('fetch', event => {
    const request = event.request, url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== BASE.origin) return;
    if (request.mode === 'navigate' && (url.pathname === BASE.pathname || url.pathname === BASE.pathname + 'index.html')) {
        event.respondWith(navigation(event).catch(() => fetch(request)));
    } else if (shellAsset(url)) {
        event.respondWith(snapshotFile(request).then(response => response || fetch(request)).catch(() => fetch(request)));
    } else if (publicAsset(url)) {
        event.respondWith(asset(event).catch(() => fetch(request)));
    }
});
