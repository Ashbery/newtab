// Synthetic local media only; startup previews never replace stored originals.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = process.env.NEWTAB_TEST_URL || 'http://127.0.0.1:4174/';
const origin = new URL(base).origin;
const previewKey = 'nt_startup_background_v1';
let passed = 0;

async function fixture(browser, mode = '') {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await context.route(/^https?:\/\//, route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage(); page.setDefaultTimeout(6000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ mode, previewKey }) => {
        window.startupEvents = []; window.previewWrites = 0; window.previewDecodeCount = 0; window.backgroundLoads = 0;
        let api;
        Object.defineProperty(window, 'NewtabStartup', { configurable: true, get: () => api, set(value) {
            api = value;
            for (const name of ['backgroundReady', 'clearBackground']) {
                const original = value[name];
                if (typeof original !== 'function') continue;
                value[name] = function (...args) {
                    startupEvents.push({ name, decoded: previewDecodeCount,
                        videoReady: document.getElementById('video-background')?.readyState,
                        preview: !!localStorage.getItem(previewKey) });
                    return original.apply(this, args);
                };
            }
        } });
        // Also exercises background.js independently before the head startup
        // integration is loaded; the actual head implementation replaces this.
        window.NewtabStartup = { backgroundReady() {}, clearBackground() {} };
        const set = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
            if (key === previewKey) {
                previewWrites++;
                if (mode === 'quota') throw new DOMException('Synthetic quota', 'QuotaExceededError');
            }
            return set.call(this, key, value);
        };
        const decode = HTMLImageElement.prototype.decode;
        window.pendingPreviewDecodes = [];
        HTMLImageElement.prototype.decode = function () {
            if (!this.src.startsWith('blob:')) return decode.call(this);
            if (mode === 'hold' || mode === 'timeout') return new Promise(resolve => pendingPreviewDecodes.push(resolve));
            return decode.call(this).then(() => { previewDecodeCount++; });
        };
        const load = HTMLMediaElement.prototype.load;
        HTMLMediaElement.prototype.load = function () { if (this.id === 'video-background') backgroundLoads++; return load.call(this); };
        if (mode === 'canvas') {
            HTMLCanvasElement.prototype.toDataURL = function () { throw new DOMException('Synthetic tainted canvas', 'SecurityError'); };
        }
        if (mode === 'timeout') {
            const timer = window.setTimeout;
            window.setTimeout = (callback, delay, ...args) => timer(callback, delay === 12000 ? 350 : delay, ...args);
        }
    }, { mode, previewKey });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.NewtabBackground && window.NewtabWidgets);
    return { page, context, errors };
}

async function seed(page, bytes, type, poster) {
    await page.evaluate(async ({ bytes, type, poster, previewKey }) => {
        const name = type === 'video' ? 'saved.webm' : 'same-name.png';
        const identity = JSON.stringify({ type, source: 'file', name, url: '' });
        localStorage.setItem('nt_background_v1', identity);
        if (poster) localStorage.setItem(previewKey, JSON.stringify({ version: 1, identity, image: poster }));
        await new Promise((resolve, reject) => {
            const request = indexedDB.open('NewtabBackgroundDB', 1);
            request.onupgradeneeded = () => request.result.createObjectStore('media');
            request.onsuccess = () => {
                const db = request.result, tx = db.transaction('media', 'readwrite');
                tx.objectStore('media').put({ blob: new Blob([new Uint8Array(bytes)], { type: type === 'video' ? 'video/webm' : 'image/png' }), type, name }, 'cached_background');
                tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
            };
            request.onerror = () => reject(request.error);
        });
    }, { bytes, type, poster, previewKey });
}

async function originalBytes(page) {
    return page.evaluate(() => new Promise((resolve, reject) => {
        const request = indexedDB.open('NewtabBackgroundDB', 1);
        request.onsuccess = () => {
            const db = request.result, read = db.transaction('media').objectStore('media').get('cached_background');
            read.onsuccess = async () => { db.close(); resolve(Array.from(new Uint8Array(await read.result.blob.arrayBuffer()))); };
            read.onerror = () => reject(read.error);
        };
    }));
}

async function waitPreview(page) {
    await page.waitForFunction(key => !!localStorage.getItem(key) && startupEvents.some(event => event.name === 'backgroundReady'), previewKey);
    const value = await page.evaluate(key => ({ record: JSON.parse(localStorage.getItem(key)), identity: localStorage.getItem('nt_background_v1') }), previewKey);
    assert.equal(value.record.version, 1); assert.equal(value.record.identity, value.identity);
    assert.match(value.record.image, /^data:image\/(webp|jpeg);base64,/); assert(value.record.image.length <= 180000);
    assert.deepEqual(Object.keys(value.record).sort(), ['identity', 'image', 'version']);
    return value.record;
}

(async () => {
    const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
    try {
        const generator = await browser.newPage();
        const media = await generator.evaluate(async () => {
            const canvas = document.createElement('canvas'); canvas.width = 1920; canvas.height = 1080;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#123456'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            const image = Array.from(new Uint8Array(await (await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))).arrayBuffer()));
            const poster = canvas.toDataURL('image/jpeg', .4);
            ctx.fillStyle = '#bb6622'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            const replacement = Array.from(new Uint8Array(await (await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))).arrayBuffer()));
            canvas.width = 160; canvas.height = 90;
            const stream = canvas.captureStream(15), chunks = [], recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
            recorder.ondataavailable = event => chunks.push(event.data);
            const stopped = new Promise(resolve => { recorder.onstop = resolve; });
            recorder.start(); let frame = 0;
            const timer = setInterval(() => { ctx.fillStyle = frame++ % 2 ? '#123456' : '#335577'; ctx.fillRect(0, 0, 160, 90); }, 60);
            await new Promise(resolve => setTimeout(resolve, 800)); recorder.stop(); clearInterval(timer); await stopped;
            stream.getTracks().forEach(track => track.stop());
            return { image, poster, replacement, video: Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())) };
        });
        await generator.close();

        {
            const { page, context, errors } = await fixture(browser);
            await seed(page, media.image, 'image'); await page.reload();
            const first = await waitPreview(page);
            const dimensions = await page.evaluate(src => new Promise(resolve => { const img = new Image(); img.onload = () => resolve([img.naturalWidth, img.naturalHeight]); img.src = src; }), first.image);
            assert(Math.max(...dimensions) <= 960, 'preview is bounded independently of the original size');
            assert.deepEqual(await originalBytes(page), media.image);
            assert(await page.evaluate(() => startupEvents.some(event => event.name === 'backgroundReady' && event.decoded > 0)), 'overlay releases only after image decoding');
            await page.reload(); await waitPreview(page); assert.equal(await page.evaluate(() => previewWrites), 0, 'existing matching preview is reused');
            await page.evaluate(() => NewtabBackground.openUpload());
            await page.locator('#bg-file').setInputFiles({ name: 'same-name.png', mimeType: 'image/png', buffer: Buffer.from(media.replacement) });
            await page.locator('#confirm-upload').click(); await page.locator('#video-upload-container').waitFor({ state: 'hidden' });
            await page.waitForFunction(({ key, image }) => JSON.parse(localStorage.getItem(key) || '{}').image !== image && !!localStorage.getItem(key), { key: previewKey, image: first.image });
            const replacement = await waitPreview(page);
            assert.equal(replacement.identity, first.identity, 'same filename metadata intentionally matches'); assert.notEqual(replacement.image, first.image);
            assert.deepEqual(await originalBytes(page), media.replacement);
            assert.deepEqual(errors, []); await context.close(); passed++; console.log('PASS decoded local image preview, bounded size, reload reuse and same-name replacement');
        }
        {
            const { page, context, errors } = await fixture(browser);
            await seed(page, media.video, 'video'); await page.reload(); await waitPreview(page);
            await page.waitForFunction(() => !document.getElementById('video-background').paused);
            const samples = []; for (let i = 0; i < 18; i++) { samples.push(await page.locator('#video-background').evaluate(el => el.currentTime)); await page.waitForTimeout(100); }
            assert(samples.some((value, i) => i && value < samples[i - 1]), 'native video still wraps normally');
            assert.equal(await page.evaluate(() => previewWrites), 1, 'looped frames do not recapture previews');
            assert.equal(await page.evaluate(() => backgroundLoads), 1, 'capture adds no video reload');
            assert(await page.evaluate(() => startupEvents.some(event => event.name === 'backgroundReady' && event.videoReady >= 2)));
            assert.equal(await page.locator('#video-background').evaluate(el => el.loop && el.muted && el.autoplay && el.playsInline), true);
            assert.deepEqual(await originalBytes(page), media.video);
            assert.deepEqual(errors, []); await context.close(); passed++; console.log('PASS first decoded video preview preserves originals, autoplay and native looping');
        }
        {
            const { page, context, errors } = await fixture(browser, 'hold');
            await seed(page, media.image, 'image', media.poster); await page.reload();
            await page.waitForFunction(() => pendingPreviewDecodes.length === 1);
            await page.evaluate(() => NewtabBackground.openUpload()); await page.locator('#restore-theme').click();
            await page.evaluate(() => pendingPreviewDecodes.forEach(resolve => resolve()));
            await page.waitForTimeout(60);
            assert.equal(await page.evaluate(key => localStorage.getItem(key), previewKey), null);
            assert.equal(await page.evaluate(() => document.body.classList.contains('has-custom-background')), false);
            assert.equal(await page.evaluate(() => startupEvents.filter(event => event.name === 'backgroundReady').length), 0, 'late decode cannot revive a reset preview');
            assert.deepEqual(await originalBytes(page), media.image);
            assert.deepEqual(errors, []); await context.close(); passed++; console.log('PASS theme restoration clears preview and rejects late decoder completion without deleting originals');
        }
        for (const mode of ['quota', 'canvas', 'timeout', 'broken']) {
            const { page, context, errors } = await fixture(browser, mode);
            const canDisplay = mode === 'quota' || mode === 'canvas';
            await seed(page, mode === 'broken' ? [1, 2, 3] : media.image, 'image', canDisplay ? undefined : media.poster);
            await page.reload();
            await page.waitForFunction(canDisplay => startupEvents.some(event => event.name === (canDisplay ? 'backgroundReady' : 'clearBackground')), canDisplay);
            assert.equal(await page.evaluate(key => localStorage.getItem(key), previewKey), null);
            assert.equal(await page.evaluate(() => document.body.classList.contains('has-custom-background')), canDisplay);
            assert.deepEqual(await originalBytes(page), mode === 'broken' ? [1, 2, 3] : media.image);
            assert.deepEqual(errors, []); await context.close(); passed++; console.log('PASS ' + mode + ' keeps startup recoverable and preserves stored media');
        }
        console.log('Startup backgrounds: ' + passed + ' passed');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
