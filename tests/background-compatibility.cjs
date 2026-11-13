// Isolated legacy-storage fixtures; no installed extension or browser profile is used.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = process.env.NEWTAB_TEST_URL || 'http://127.0.0.1:4173';
const legacyUrl = new URL('/__legacy_background__.webm', base).href;

async function home(context) {
    const page = await context.newPage();
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.NewtabBackground);
    return page;
}

async function seed(page, bytes, source = 'extension') {
    await page.evaluate(async ({ bytes, source, legacyUrl }) => {
        localStorage.removeItem('nt_background_v1');
        localStorage.setItem('videoSource', source);
        localStorage.setItem('videoName', '舊擴充背景');
        localStorage.setItem('hasExtensionVideo', 'true');
        if (source === 'url') {
            localStorage.setItem('videoUrl', legacyUrl);
            localStorage.setItem('customVideo', 'blob:expired-previous-file');
        }
        await new Promise((resolve, reject) => {
            const request = indexedDB.open('VideoCacheDB', 2);
            request.onupgradeneeded = () => request.result.createObjectStore('videos');
            request.onsuccess = () => {
                const db = request.result;
                const tx = db.transaction('videos', 'readwrite');
                tx.objectStore('videos').put(new Blob([new Uint8Array(bytes)], { type: 'video/webm' }), 'cached_video');
                tx.oncomplete = () => { db.close(); resolve(); };
                tx.onerror = () => reject(tx.error);
            };
            request.onerror = () => reject(request.error);
        });
    }, { bytes, source, legacyUrl });
}

async function readStore(page, name, store, key) {
    return page.evaluate(({ name, store, key }) => new Promise((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction(store);
            const read = tx.objectStore(store).get(key);
            tx.oncomplete = async () => {
                db.close();
                const record = read.result, blob = record && (record.blob || record);
                resolve(record ? { name: record.name || '', type: record.type || '', bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) } : null);
            };
            tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
    }), { name, store, key });
}

async function readyVideo(page) {
    try {
        await page.waitForFunction(() => document.body.classList.contains('has-custom-background') &&
            document.getElementById('video-background').readyState >= 2, null, { timeout: 5000 });
    } catch (error) {
        console.error(await page.evaluate(() => { const v = document.getElementById('video-background'); return {
            custom: document.body.classList.contains('has-custom-background'), src: v.getAttribute('src'), ready: v.readyState,
            error: v.error && v.error.message, meta: localStorage.getItem('nt_background_v1'), legacy: localStorage.getItem('videoSource')
        }; }));
        throw error;
    }
}

async function theme(page) {
    assert.deepEqual(await page.evaluate(() => ({
        custom: document.body.classList.contains('has-custom-background'),
        src: document.getElementById('video-background').getAttribute('src'),
        source: JSON.parse(localStorage.getItem('nt_background_v1')).source
    })), { custom: false, src: null, source: 'default' });
}

(async () => {
    const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
    try {
        const generator = await browser.newPage();
        const bytes = await generator.evaluate(async () => {
            const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
            const stream = canvas.captureStream(15), chunks = [];
            const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
            recorder.ondataavailable = event => chunks.push(event.data);
            const done = new Promise(resolve => { recorder.onstop = resolve; });
            recorder.start();
            let frame = 0;
            const timer = setInterval(() => {
                const ctx = canvas.getContext('2d'); ctx.fillStyle = frame++ % 2 ? '#334455' : '#667788'; ctx.fillRect(0, 0, 64, 64);
            }, 60);
            await new Promise(resolve => setTimeout(resolve, 800)); recorder.stop(); clearInterval(timer); await done;
            stream.getTracks().forEach(track => track.stop());
            return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
        });
        const png = await generator.evaluate(async () => {
            const canvas = document.createElement('canvas'); canvas.width = canvas.height = 8;
            canvas.getContext('2d').fillRect(0, 0, 8, 8);
            return Array.from(new Uint8Array(await (await new Promise(resolve => canvas.toBlob(resolve))).arrayBuffer()));
        });
        await generator.close();

        {
            const context = await browser.newContext(); const page = await home(context);
            await seed(page, bytes); await page.reload(); await readyVideo(page);
            assert.deepEqual((await readStore(page, 'NewtabBackgroundDB', 'media', 'cached_background')).bytes, bytes);
            assert.deepEqual((await readStore(page, 'VideoCacheDB', 'videos', 'cached_video')).bytes, bytes, 'legacy original is retained');
            assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('nt_background_v1')).source), 'file');
            await page.reload(); await readyVideo(page);
            await page.evaluate(() => NewtabBackground.openUpload()); await page.locator('#restore-theme').click();
            await theme(page); await page.reload(); await page.waitForTimeout(250); await theme(page);
            await context.close(); console.log('PASS legacy blob migrates, plays, survives reload, and respects later theme restoration');
        }
        {
            const context = await browser.newContext();
            await context.route(legacyUrl, route => route.fulfill({ contentType: 'video/webm', body: Buffer.from(bytes) }));
            const page = await home(context); await seed(page, bytes, 'url'); await page.reload(); await readyVideo(page);
            assert.equal(await page.locator('#video-background').getAttribute('src'), legacyUrl);
            assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('nt_background_v1')).url), legacyUrl);
            await context.close(); console.log('PASS legacy videoUrl takes precedence over an expired old blob URL');
        }
        {
            const context = await browser.newContext(); const page = await home(context); await seed(page, bytes);
            await page.evaluate(() => {
                localStorage.setItem('videoUrl', 'https://example.invalid/old.mp4');
                localStorage.setItem('nt_background_v1', JSON.stringify({ source: 'default', type: 'image', url: '' }));
            });
            await page.reload(); await page.waitForTimeout(300); await theme(page);
            assert.deepEqual((await readStore(page, 'VideoCacheDB', 'videos', 'cached_video')).bytes, bytes);
            await context.close(); console.log('PASS explicit modern default ignores legacy cache and URL without deleting them');
        }
        for (const choice of ['theme', 'image']) {
            const context = await browser.newContext(); const page = await home(context); await seed(page, bytes);
            await page.addInitScript(() => {
                const open = indexedDB.open.bind(indexedDB);
                indexedDB.open = function (name, ...args) {
                    const request = open(name, ...args);
                    if (name === 'VideoCacheDB') {
                        window.__legacyOpenStarted = true;
                        Object.defineProperty(request, 'onsuccess', { set(handler) {
                            request.addEventListener('success', event => setTimeout(() => handler.call(request, event), 500));
                        } });
                    }
                    return request;
                };
            });
            await page.reload(); await page.waitForFunction(() => window.__legacyOpenStarted);
            await page.evaluate(() => NewtabBackground.openUpload());
            if (choice === 'theme') await page.locator('#restore-theme').click();
            else {
                await page.locator('#bg-file').setInputFiles({ name: 'new-choice.png', mimeType: 'image/png', buffer: Buffer.from(png) });
                await page.locator('#confirm-upload').click();
                await page.locator('#video-upload-container').waitFor({ state: 'hidden' });
            }
            await page.waitForTimeout(650);
            if (choice === 'theme') await theme(page);
            else {
                const media = await readStore(page, 'NewtabBackgroundDB', 'media', 'cached_background');
                assert.equal(media.name, 'new-choice.png'); assert.deepEqual(media.bytes, png);
                assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('nt_background_v1')).name), 'new-choice.png');
                assert.equal(await page.locator('#video-background').getAttribute('src'), null);
            }
            await context.close(); console.log('PASS delayed legacy read cannot overwrite a newer ' + choice + ' choice');
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
