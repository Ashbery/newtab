// Uses a tiny generated WebM, so playback checks do not depend on external media.
// Run against the local server, with Playwright installed / available in NODE_PATH.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

async function assertTheme(page) {
    const state = await page.evaluate(() => {
        const video = document.getElementById('video-background');
        const image = document.getElementById('image-background');
        return {
            custom: document.body.classList.contains('has-custom-background'),
            paused: video.paused, src: video.getAttribute('src'), sources: video.querySelectorAll('source').length,
            videoVisible: getComputedStyle(video).display !== 'none', imageVisible: getComputedStyle(image).display !== 'none',
            meta: JSON.parse(localStorage.getItem('nt_background_v1'))
        };
    });
    assert.equal(state.custom, false);
    assert.equal(state.paused, true);
    assert.equal(state.src, null, 'restoring the theme releases the active video source');
    assert.equal(state.sources, 0, 'a legacy source element cannot restart hidden video');
    assert.equal(state.videoVisible, false);
    assert.equal(state.imageVisible, false);
    assert.equal(state.meta.source, 'default');
    assert.equal(state.meta.url, '');
    assert.equal(await page.locator('#rail-media-status').getAttribute('hidden'), null);
    for (const action of ['play-pause', 'mute']) {
        assert.equal(await page.locator('#side-rail [data-action="' + action + '"]').evaluate((button) => button.hidden), true,
            'theme restoration condenses the irrelevant ' + action + ' control');
    }
}

async function openBackground(page) {
    if (!await page.evaluate(() => document.body.classList.contains('side-rail-open'))) {
        if (await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches)) {
            const size = page.viewportSize(); await page.mouse.move(size.width - 2, size.height / 2);
            await page.waitForFunction(() => getComputedStyle(document.getElementById('side-rail-tab')).opacity === '1');
        }
        await page.locator('#side-rail-tab').click();
    }
    await page.getByRole('tab', { name: '個人化', exact: true }).click();
    await page.locator('#background-home').click();
}

async function restoreAndReload(page) {
    if (!await page.locator('#video-upload-container').isVisible()) await openBackground(page);
    await page.locator('#restore-theme').click();
    await page.locator('#video-upload-container').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#side-rail-tab').evaluate((button) => button === document.activeElement), true,
        'restoring the theme returns focus to the visible background opener');
    await assertTheme(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    // Legacy media restoration uses IndexedDB and media load callbacks. Allow
    // them to settle before asserting that neither source overrides the default.
    await page.waitForTimeout(300);
    await assertTheme(page);
}

(async () => {
    const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
    try {
        const generator = await browser.newPage();
        const bytes = await generator.evaluate(async () => {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 64;
            const ctx = canvas.getContext('2d');
            const stream = canvas.captureStream(15);
            const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
            const chunks = [];
            recorder.ondataavailable = (event) => chunks.push(event.data);
            const done = new Promise((resolve) => { recorder.onstop = resolve; });
            recorder.start();
            let frame = 0;
            const timer = setInterval(() => {
                ctx.fillStyle = frame++ % 2 ? '#557799' : '#223344';
                ctx.fillRect(0, 0, 64, 64);
            }, 60);
            await new Promise((resolve) => setTimeout(resolve, 800));
            recorder.stop();
            clearInterval(timer);
            await done;
            stream.getTracks().forEach((track) => track.stop());
            return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
        });
        const imageBytes = await generator.evaluate(async () => {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 16;
            const context = canvas.getContext('2d');
            context.fillStyle = '#7799bb';
            context.fillRect(0, 0, 16, 16);
            const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
            return Array.from(new Uint8Array(await blob.arrayBuffer()));
        });
        await generator.close();
        const base = process.env.NEWTAB_TEST_URL || 'http://127.0.0.1:4173';
        const clip = base + '/test-loop.webm';
        for (const reducedMotion of ['reduce', 'no-preference']) {
            const page = await browser.newPage({ reducedMotion });
            const errors = [];
            page.on('pageerror', (error) => errors.push(error.message));
            await page.route(/^https?:\/\//, (route) => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
            await page.route('**/test-loop.webm', (route) => route.fulfill({ contentType: 'video/webm', body: Buffer.from(bytes) }));
            await page.route('**/broken-background.jpg', (route) => route.fulfill({ status: 404, contentType: 'text/plain', body: 'missing test image' }));
            await page.route('https://assets.mixkit.co/**', (route) => route.abort());
            await page.addInitScript((url) => {
                if (sessionStorage.getItem('test-background-seeded')) return;
                localStorage.setItem('nt_background_v1', JSON.stringify({ type: 'video', source: 'url', name: 'Test loop', url }));
                sessionStorage.setItem('test-background-seeded', 'true');
            }, clip);
            await page.goto(base, { waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() => {
                const video = document.getElementById('video-background');
                return video.currentSrc.endsWith('/test-loop.webm') && !video.paused && video.readyState >= 2;
            });
            const samples = [];
            for (let i = 0; i < 18; i++) {
                samples.push(await page.locator('#video-background').evaluate((video) => video.currentTime));
                await page.waitForTimeout(100);
            }
            assert(samples.some((time, i) => i && time < samples[i - 1]), 'playback must actually wrap to the start');
            assert.equal(await page.locator('#video-background').evaluate((video) => video.loop && video.autoplay && video.muted), true);
            await page.evaluate(() => NewtabWidgets.enterArrange());
            await page.getByRole('button', { name: '完成主畫面編輯' }).click();
            assert.equal(await page.locator('#video-background').evaluate((video) => video.paused), false, 'editing does not pause wallpaper');
            await page.evaluate(() => NewtabSideRail.open());
            for (const action of ['play-pause', 'mute']) {
                assert.equal(await page.locator('#side-rail [data-action="' + action + '"]').isVisible(), true, 'video restores its ' + action + ' control');
                assert.equal(await page.locator('#side-rail [data-action="' + action + '"]').isEnabled(), true);
            }
            assert.equal(await page.locator('#rail-media-status').isVisible(), false, 'video replaces the static-background status');
            await page.locator('[data-action="mute"]').click();
            assert.equal(await page.locator('#video-background').evaluate((video) => video.muted), false);
            await page.locator('[data-action="mute"]').click();
            assert.equal(await page.locator('#video-background').evaluate((video) => video.muted), true);
            await page.locator('[data-action="play-pause"]').click();
            await page.waitForTimeout(200);
            assert.equal(await page.locator('#video-background').evaluate((video) => video.paused), true, 'manual pause remains respected');
            await page.locator('[data-action="play-pause"]').click();
            await page.waitForFunction(() => !document.getElementById('video-background').paused);

            await page.keyboard.press('Escape');
            await openBackground(page);
            const previousMetadata = await page.evaluate(() => localStorage.getItem('nt_background_v1'));
            for (const invalid of ['javascript:alert(1)', base + '/broken-background.jpg']) {
                await page.locator('#bg-url').fill(invalid);
                await page.locator('#load-url-btn').click();
                await page.waitForFunction(() => document.getElementById('background-status').classList.contains('is-error') &&
                    document.getElementById('video-upload-container').getAttribute('aria-busy') === 'false');
                assert.equal(await page.evaluate(() => localStorage.getItem('nt_background_v1')), previousMetadata,
                    'invalid or unavailable media does not overwrite the saved background');
                assert.equal(await page.locator('#video-background').evaluate((video) => !video.paused && video.currentSrc.endsWith('/test-loop.webm')), true,
                    'the prior video keeps playing when replacement validation fails');
            }
            await page.evaluate((url) => {
                localStorage.setItem('customBackground', url);
                localStorage.setItem('customVideo', url);
                localStorage.setItem('bgSource', 'url');
                localStorage.setItem('videoSource', 'url');
                localStorage.setItem('hasIdbBackground', 'true');
            }, clip);
            await restoreAndReload(page);

            // A file upload exercises real IndexedDB persistence and object URLs.
            await openBackground(page);
            await page.locator('#bg-file').setInputFiles({ name: 'saved-test.png', mimeType: 'image/png', buffer: Buffer.from(imageBytes) });
            await page.locator('#confirm-upload').click();
            await page.locator('#video-upload-container').waitFor({ state: 'hidden' });
            assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('nt_background_v1')).source), 'file');
            await page.reload({ waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() => document.body.classList.contains('has-custom-background') &&
                getComputedStyle(document.getElementById('image-background')).display !== 'none');
            assert.match(await page.locator('#image-background').evaluate((image) => image.style.backgroundImage), /blob:/,
                'the saved image is restored from IndexedDB');
            await restoreAndReload(page);
            const cached = await page.evaluate(() => new Promise((resolve, reject) => {
                const request = indexedDB.open('NewtabBackgroundDB', 1);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    const database = request.result;
                    const read = database.transaction('media').objectStore('media').get('cached_background');
                    read.onsuccess = () => { resolve({ name: read.result?.name, size: read.result?.blob?.size }); database.close(); };
                    read.onerror = () => { reject(read.error); database.close(); };
                };
            }));
            assert.equal(cached.name, 'saved-test.png', 'restoring the theme preserves the cached original image');
            assert.equal(cached.size, imageBytes.length);
            assert.deepEqual(errors, []);
            console.log(`PASS: playback, looping, pause, failed replacement, image persistence and theme restoration (${reducedMotion})`);
            await page.close();
        }
    } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
