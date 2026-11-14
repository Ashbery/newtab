// Compare real painted head pixels, rather than trusting pose diagnostics.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const base = process.env.NEWTAB_TEST_URL || 'http://127.0.0.1:4174/';
const origin = new URL(base).origin;
const browserOptions = process.env.NEWTAB_BROWSER_PATH ? { executablePath: process.env.NEWTAB_BROWSER_PATH } :
    { channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' };
const artifactDirectory = '.impeccable/review';
fs.mkdirSync(artifactDirectory, { recursive: true });

function installHeadProbe() {
    // Whole upper silhouette and face through the chin. The .015 UV margin
    // below this strip keeps the comparison away from the neck transition.
    const region = { left: 0, top: 0, right: 1, bottom: .445 };
    // Padded bounds around the two independently animated eyelid apertures,
    // expressed in original 1086x1448 artwork pixels, not widget pixels.
    const excludedEyes = [
        { left: 390 / 1086, top: 395 / 1448, right: 558 / 1086, bottom: 523 / 1448 },
        { left: 598 / 1086, top: 353 / 1448, right: 764 / 1086, bottom: 480 / 1448 }
    ];
    const probe = window.stillHeadProbe = { active: false, phase: 'initial', samples: [], region, excludedEyes };
    let pending = false, last = -Infinity, sampler, painter, headSampler, headPainter, baseline, motionBaseline, selected, eyePixels, bodyPixels;
    function observe(canvas) {
        if (!probe.active || pending || !canvas.classList.contains('companion-canvas') || performance.now() - last < 60) return;
        pending = true;
        queueMicrotask(() => {
            pending = false;
            if (!probe.active || !canvas.isConnected) return;
            last = performance.now();
            if (!sampler) {
                sampler = document.createElement('canvas'); sampler.width = canvas.width; sampler.height = canvas.height;
                painter = sampler.getContext('2d', { willReadFrequently: true });
                headSampler = document.createElement('canvas'); headSampler.width = canvas.width; headSampler.height = canvas.height;
                headPainter = headSampler.getContext('2d', { willReadFrequently: true });
                selected = []; eyePixels = []; bodyPixels = [];
                for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
                    const u = (x + .5) / canvas.width, v = (y + .5) / canvas.height;
                    const offset = (y * canvas.width + x) * 4;
                    const eye = excludedEyes.some(rect => u >= rect.left && u <= rect.right && v >= rect.top && v <= rect.bottom);
                    if (v <= region.bottom && !eye) selected.push(offset);
                    if (eye) eyePixels.push(offset);
                    if (u >= .15 && u <= .85 && v >= .54 && v <= .8) bodyPixels.push(offset);
                }
            }
            if (sampler.width !== canvas.width || sampler.height !== canvas.height) {
                probe.dimensionChanged = true; return;
            }
            painter.clearRect(0, 0, sampler.width, sampler.height); painter.drawImage(canvas, 0, 0);
            const movingRgba = painter.getImageData(0, 0, sampler.width, sampler.height).data;
            // Brave's canvas readback protection can change low bits throughout
            // a bitmap when unrelated pixels change. Isolate the inspected
            // region before reading it, keeping animated eyes/torso out of its
            // bitmap. No inspected pixel is erased or granted a tolerance.
            headPainter.clearRect(0, 0, sampler.width, sampler.height); headPainter.drawImage(sampler, 0, 0);
            headPainter.fillStyle = '#000';
            const below = Math.floor(region.bottom * sampler.height - .5) + 1;
            headPainter.fillRect(0, below, sampler.width, sampler.height - below);
            for (const rect of excludedEyes) {
                const left = Math.ceil(rect.left * sampler.width - .5), top = Math.ceil(rect.top * sampler.height - .5);
                const right = Math.floor(rect.right * sampler.width - .5), bottom = Math.floor(rect.bottom * sampler.height - .5);
                headPainter.fillRect(left, top, right - left + 1, bottom - top + 1);
            }
            const rgba = headPainter.getImageData(0, 0, sampler.width, sampler.height).data;
            if (!baseline) {
                baseline = rgba.slice();
                motionBaseline = movingRgba.slice();
                probe.baselinePng = sampler.toDataURL('image/png');
                probe.backingSize = { width: canvas.width, height: canvas.height };
                probe.comparedPixels = selected.length;
                probe.opaqueHeadPixels = selected.filter(offset => baseline[offset + 3] >= 250).length;
            }
            let headChangedPixels = 0, headChangedChannels = 0, headMaximumDelta = 0, bodyChangedPixels = 0, eyeChangedPixels = 0;
            for (const offset of selected) {
                let changed = false;
                for (let channel = 0; channel < 4; channel++) {
                    const delta = Math.abs(rgba[offset + channel] - baseline[offset + channel]);
                    if (delta) { changed = true; headChangedChannels++; headMaximumDelta = Math.max(headMaximumDelta, delta); }
                }
                if (changed) headChangedPixels++;
            }
            for (const offset of bodyPixels) if ([0, 1, 2, 3].some(channel => movingRgba[offset + channel] !== motionBaseline[offset + channel])) bodyChangedPixels++;
            for (const offset of eyePixels) if ([0, 1, 2, 3].some(channel => movingRgba[offset + channel] !== motionBaseline[offset + channel])) eyeChangedPixels++;
            const state = NewtabCompanion.getState('companion-1');
            probe.samples.push({ phase: probe.phase, animationTime: state.animationTime, blink: state.blink, breath: state.pose.breath,
                headChangedPixels, headChangedChannels, headMaximumDelta, bodyChangedPixels, eyeChangedPixels });
            probe.latestPng = () => sampler.toDataURL('image/png');
        });
    }
    const clearRect = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) { const result = clearRect.apply(this, args); observe(this.canvas); return result; };
    const drawArrays = WebGLRenderingContext.prototype.drawArrays;
    WebGLRenderingContext.prototype.drawArrays = function (...args) { const result = drawArrays.apply(this, args); observe(this.canvas); return result; };
}

for (const fallback of [false, true]) test(`${fallback ? 'Canvas2D' : 'WebGL'} head pixels stay fixed during pointer, greeting, chat and breathing`, async () => {
    const renderer = fallback ? 'canvas2d' : 'webgl';
    const browser = await chromium.launch({ headless: true, ...browserOptions, args: fallback ? ['--disable-webgl'] : [] });
    try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2,
            reducedMotion: 'no-preference', serviceWorkers: 'block' });
        await context.route(/^https?:\/\//, route => {
            const request = new URL(route.request().url());
            // This is the pixel regression for the original portrait fallback.
            if (request.pathname.endsWith('/assets/character/live2d/nacho.model3.json')) return route.fulfill({ status: 404, body: 'image-rig fixture' });
            return request.origin === origin ? route.continue() : route.abort();
        });
        await context.addInitScript(installHeadProbe);
        const page = await context.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(base, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => NewtabCompanion.getState('companion-1')?.motion === 'running');
        assert.equal(await page.evaluate(() => NewtabCompanion.getState('companion-1').renderer), renderer);
        await page.waitForTimeout(180);
        await page.evaluate(() => { stillHeadProbe.active = true; });
        await page.waitForFunction(() => stillHeadProbe.samples.length >= 3);
        const trigger = page.locator('.companion-trigger'), box = await trigger.boundingBox();
        async function phase(name, action, wait = 650) {
            await page.evaluate(name => { stillHeadProbe.phase = name; }, name);
            await action(); await page.waitForTimeout(wait);
        }
        await phase('pointer-left', () => page.mouse.move(box.x + box.width * .05, box.y + box.height * .35));
        await phase('pointer-right', () => page.mouse.move(box.x + box.width * .95, box.y + box.height * .35));
        await phase('pointer-up', () => page.mouse.move(box.x + box.width * .5, box.y + box.height * .05));
        await phase('pointer-down', () => page.mouse.move(box.x + box.width * .5, box.y + box.height * .9));
        await phase('greeting-focus', () => trigger.focus());
        await phase('chat-thinking', () => page.evaluate(() => NewtabCompanion.setChatState('companion-1', 'thinking')));
        await phase('chat-replying', () => page.evaluate(() => NewtabCompanion.setChatState('companion-1', 'replying')));
        await phase('idle-breathing', () => page.evaluate(() => NewtabCompanion.setChatState('companion-1', 'idle')), 1400);
        await page.waitForFunction(() => stillHeadProbe.samples.some(sample => sample.blink > .7), null, { timeout: 7000 });
        const report = await page.evaluate(() => {
            stillHeadProbe.active = false;
            return { renderer: NewtabCompanion.getState('companion-1').renderer, region: stillHeadProbe.region,
                excludedEyes: stillHeadProbe.excludedEyes, backingSize: stillHeadProbe.backingSize,
                comparedPixels: stillHeadProbe.comparedPixels, opaqueHeadPixels: stillHeadProbe.opaqueHeadPixels,
                dimensionChanged: !!stillHeadProbe.dimensionChanged, samples: stillHeadProbe.samples,
                baselinePng: stillHeadProbe.baselinePng, lastPng: stillHeadProbe.latestPng() };
        });
        for (const [name, data] of [['baseline', report.baselinePng], ['last', report.lastPng]]) {
            fs.writeFileSync(`${artifactDirectory}/companion-still-head-${renderer}-${name}.png`, Buffer.from(data.split(',')[1], 'base64'));
        }
        delete report.baselinePng; delete report.lastPng;
        fs.writeFileSync(`${artifactDirectory}/companion-still-head-${renderer}.json`, JSON.stringify(report, null, 2));
        // An honest visual record of the compared strip and excluded blink windows.
        await page.evaluate(() => {
            if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
            const figure = document.querySelector('.companion-figure');
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:absolute;inset:0;z-index:4;pointer-events:none';
            const outlines = [{ ...stillHeadProbe.region, color: '#00a5cf' }, ...stillHeadProbe.excludedEyes.map(rect => ({ ...rect, color: '#f2406c' }))];
            for (const rect of outlines) {
                const box = document.createElement('div');
                box.style.cssText = `position:absolute;box-sizing:border-box;border:1px solid ${rect.color};left:${rect.left * 100}%;top:${rect.top * 100}%;width:${(rect.right - rect.left) * 100}%;height:${(rect.bottom - rect.top) * 100}%`;
                overlay.appendChild(box);
            }
            figure.appendChild(overlay);
        });
        await page.locator('.widget[data-type="companion"]').screenshot({ path: `${artifactDirectory}/companion-still-head-${renderer}-region.png` });
        assert.equal(report.dimensionChanged, false, 'Comparison uses one stable backing resolution');
        assert.ok(report.opaqueHeadPixels > 5000, 'The comparison includes visible head artwork, not just transparent space');
        assert.ok(report.samples.length > 40);
        const changed = report.samples.filter(sample => sample.headChangedPixels > 0);
        assert.equal(changed.length, 0, 'Every RGBA pixel outside the eyelid exclusions must stay identical: ' + JSON.stringify(changed.slice(0, 3)));
        assert.ok(report.samples.some(sample => sample.blink > .7 && sample.eyeChangedPixels > 100), 'The eye apertures still visibly blink');
        assert.ok(report.samples.some(sample => sample.bodyChangedPixels > 100), 'Breathing still changes the torso artwork');
        const breaths = report.samples.map(sample => sample.breath);
        assert.ok(Math.max(...breaths) - Math.min(...breaths) > .001, 'The comparison spans distinct breathing phases');
        await page.evaluate(() => { window.reviewChatOpened = []; window.NewtabCharacterChat = { open: id => reviewChatOpened.push(id) }; });
        await trigger.click();
        await trigger.focus(); await page.keyboard.press('Enter');
        assert.deepEqual(await page.evaluate(() => reviewChatOpened), ['companion-1', 'companion-1']);
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ renderer, sampledFrames: report.samples.length, comparedPixels: report.comparedPixels,
            maximumChangedHeadPixels: Math.max(...report.samples.map(sample => sample.headChangedPixels)),
            region: report.region, excludedEyes: report.excludedEyes }));
        await context.close();
    } finally { await browser.close(); }
});
