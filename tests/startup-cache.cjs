// Isolated real service workers; public fixtures only, no personal profile.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
let build = 'one', failStyles = false, documentDelay = 0, optionalDelay = 1200;
const counts = { document: 0, scripts: 0, styleFailures: 0, api: 0, post: 0 };
const siteCache = fs.readFileSync(path.join(root, 'js/site-cache.js'));
const worker = fs.readFileSync(path.join(root, 'newtab-sw.js'));
const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    function send(body, type = 'text/html', status = 200) { res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body); }
    if (url.pathname === '/wrapper') return send('<iframe src="http://127.0.0.1:' + server.address().port + '/newtab/"></iframe>');
    if (url.pathname === '/newtab/newtab-sw.js') return send(worker, 'text/javascript');
    if (url.pathname === '/newtab/assets/preview.png') return setTimeout(() => send(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1sAAAAASUVORK5CYII=', 'base64'), 'image/png'), optionalDelay);
    if (url.pathname === '/newtab/js/site-cache.js') return send(siteCache, 'text/javascript');
    if (url.pathname === '/newtab/js/app.js') { counts.scripts++; return send('window.appliedBuild=' + JSON.stringify(build) + ';NewtabSiteCache.start();', 'text/javascript'); }
    if (url.pathname === '/newtab/css/app.css') {
        if (failStyles) { counts.styleFailures++; return send('unavailable', 'text/plain', 503); }
        return send('body{color:#304a5b}', 'text/css');
    }
    if (url.pathname === '/newtab/api/probe') { counts.api++; return send(JSON.stringify({ number: counts.api }), 'application/json'); }
    if (url.pathname === '/newtab/chat') { counts.post++; return send('no-store', 'text/plain'); }
    if (url.pathname === '/newtab/' || url.pathname === '/newtab/index.html') {
        counts.document++;
        const current = build;
        return setTimeout(() => send('<!doctype html><meta name="newtab-release" content="' + current + '"><link rel="preload" as="image" href="assets/preview.png"><link rel="stylesheet" href="css/app.css?v=' + current + '">' +
            '<script defer src="js/site-cache.js?v=' + current + '"></script><script defer src="js/app.js?v=' + current + '"></script><h1>' + current + '</h1>'), documentDelay);
    }
    send('not found', 'text/plain', 404);
});
async function snapshotState(page) {
    return page.evaluate(async () => {
        const cache = await caches.open('newtab-shell-meta-v1');
        const keys = await cache.keys();
        const record = keys[0] && await cache.match(keys[0]);
        const state = record && await record.json();
        if (!state) return null;
        const response = await (await caches.open(state.current)).match(new URL('index.html', location.href));
        return { ...state, html: response && await response.text(), snapshots: (await caches.keys()).filter(name => name.startsWith('newtab-shell-v1-')) };
    });
}
async function cachedVersion(page, version) {
    await page.waitForFunction(async version => {
        const meta = await caches.open('newtab-shell-meta-v1');
        const keys = await meta.keys();
        const record = keys[0] && await meta.match(keys[0]);
        if (!record) return false;
        const state = await record.json();
        const response = await (await caches.open(state.current)).match(new URL('index.html', location.href));
        return response && (await response.text()).includes('<h1>' + version + '</h1>');
    }, version);
}
(async () => {
    await new Promise(resolve => server.listen(0, '0.0.0.0', resolve));
    const base = 'http://127.0.0.1:' + server.address().port + '/newtab/';
    const browser = await chromium.launch({ headless: true, ...(process.env.NEWTAB_BROWSER_PATH ? { executablePath: process.env.NEWTAB_BROWSER_PATH } : { channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' }) });
    const context = await browser.newContext();
    const errors = [];
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    try {
        const page = await context.newPage(), coldStart = performance.now(); await page.goto(base, { waitUntil: 'domcontentloaded' }); await cachedVersion(page, 'one');
        await page.evaluate(() => navigator.serviceWorker.ready);
        assert(performance.now() - coldStart < 900, 'slow optional artwork must not delay critical snapshot installation');
        optionalDelay = 0;
        assert.equal(await page.evaluate(() => appliedBuild), 'one');
        console.log('PASS cold load installs a complete public shell');
        console.log('PASS optional artwork cannot delay critical shell activation');

        documentDelay = 1200;
        const warm = await context.newPage(), start = performance.now();
        await warm.goto(base, { waitUntil: 'domcontentloaded' });
        const duration = performance.now() - start;
        assert(duration < 900, 'cached startup must not await the deliberately slow document response: ' + duration);
        assert.equal(await warm.evaluate(() => appliedBuild), 'one');
        console.log('PASS warm navigation bypasses slow HTML network (' + Math.round(duration) + ' ms)');
        await new Promise(resolve => setTimeout(resolve, 1350)); documentDelay = 0;

        const original = await snapshotState(page);
        build = 'two'; failStyles = true;
        const failed = await context.newPage(); await failed.goto(base);
        await failed.waitForFunction(() => appliedBuild === 'one');
        await new Promise(resolve => setTimeout(resolve, 400));
        assert(counts.styleFailures > 0); assert.equal((await snapshotState(page)).current, original.current);
        assert.equal((await snapshotState(page)).snapshots.length, 1, 'failed snapshot is removed');
        console.log('PASS failed update preserves the complete previous shell');

        failStyles = false;
        const update = await context.newPage(); await update.goto(base); await cachedVersion(page, 'two');
        const upgraded = await context.newPage(); await upgraded.goto(base);
        assert.equal(await upgraded.evaluate(() => appliedBuild), 'two');
        assert.match(await upgraded.evaluate(() => fetch('js/app.js?v=one').then(r => r.text())), /"one"/, 'old versioned requests retain their matching cached script');
        assert.equal((await snapshotState(page)).snapshots.length, 2);
        console.log('PASS atomic update is used by next navigation while old asset URLs remain valid');

        await context.setOffline(true);
        const offline = await context.newPage(); await offline.goto(base);
        assert.equal(await offline.evaluate(() => appliedBuild), 'two');
        await context.setOffline(false);
        console.log('PASS prepared shell starts offline');

        const probe = await upgraded.evaluate(async () => [await fetch('api/probe').then(r => r.json()), await fetch('api/probe').then(r => r.json()), await fetch('chat', { method: 'POST', body: 'fixture' }).then(r => r.text())]);
        assert.notEqual(probe[0].number, probe[1].number); assert.equal(counts.post, 1);
        const cachedURLs = await upgraded.evaluate(async () => (await Promise.all((await caches.keys()).map(async name => (await (await caches.open(name)).keys()).map(req => req.url)))).flat());
        assert(!cachedURLs.some(url => /api\/probe|\/chat$/.test(url)));
        console.log('PASS APIs and POST conversation requests never enter app caches');

        build = 'three';
        const third = await context.newPage(); await third.goto(base); await cachedVersion(page, 'three');
        await page.waitForFunction(async () => (await caches.keys()).filter(name => name.startsWith('newtab-shell-v1-')).length === 2);
        // The candidate exists briefly alongside current+previous while its
        // atomic commit runs; observe the completed cleanup, not that interval.
        console.log('PASS snapshot count remains bounded after another release');

        const wrapper = await context.newPage(); await wrapper.goto('http://localhost:' + server.address().port + '/wrapper');
        const frame = wrapper.frames().find(f => f.url().startsWith(base));
        assert(frame); await frame.waitForFunction(() => appliedBuild === 'three');
        const cacheAllowed = await frame.evaluate(async () => { try { await caches.open('newtab-shell-meta-v1'); return true; } catch (_) { return false; } });
        if (cacheAllowed) {
            await cachedVersion(frame, 'three'); await frame.evaluate(() => navigator.serviceWorker.ready);
            await context.setOffline(true);
            await wrapper.setContent('<iframe src="' + base + '"></iframe>');
            await wrapper.frameLocator('iframe').locator('h1').waitFor();
            assert.equal(await wrapper.frameLocator('iframe').locator('h1').textContent(), 'three');
            await context.setOffline(false);
            console.log('PASS permitted cross-site iframe partition reuses its prepared shell offline');
        } else {
            assert.equal(await frame.evaluate(() => appliedBuild), 'three');
            console.log('PASS storage-denied cross-site iframe stays usable through ordinary loading');
        }

        const denied = await browser.newContext();
        const deniedErrors = [];
        try {
            await denied.addInitScript(() => Object.defineProperty(navigator, 'serviceWorker', { configurable: true, get() { throw new DOMException('Fixture denied access', 'SecurityError'); } }));
            const direct = await denied.newPage(); direct.on('pageerror', error => deniedErrors.push(error.message));
            await direct.goto(base); assert.equal(await direct.evaluate(() => appliedBuild), 'three');
            await direct.evaluate(() => { NewtabSiteCache.start(); NewtabSiteCache.start(); });
            assert.deepEqual(deniedErrors, []);
            console.log('PASS synchronous registration denial and repeated start do not break the app');
        } finally { await denied.close(); }
        assert.deepEqual(errors, []);
    } finally { await context.close(); await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
