// Paint-level animation measurements in isolated Brave. Provider/network traffic is blocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const base = process.env.NEWTAB_TEST_URL || 'http://127.0.0.1:4174/';
const origin = new URL(base).origin;
const browserOptions = process.env.NEWTAB_BROWSER_PATH ? { executablePath: process.env.NEWTAB_BROWSER_PATH } :
    { channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' };
const openedBrowsers = new Set();
fs.mkdirSync('.impeccable/review', { recursive: true });

// Read pixels only after a real canvas paint, not when a RAF counter increments.
// Queueing the capture keeps it after all Canvas2D triangles but before compositing.
function installPaintProbe() {
    let sampler, painter, previous, scheduled = false;
    const probe = window.companionPaintProbe = { active: false, readback: false, samples: [] };
    function observe(canvas) {
        if (!probe.active || scheduled || !canvas.classList.contains('companion-canvas')) return;
        scheduled = true;
        queueMicrotask(() => {
            scheduled = false;
            if (!probe.active || !canvas.isConnected) return;
            const at = performance.now(), state = window.NewtabCompanion?.getState('companion-1');
            const sample = { at, counter: state?.frames, animationTime: state?.animationTime, drawMs: state?.drawMs,
                pointerX: state?.pointerX, pointerY: state?.pointerY, pose: state?.pose ? { ...state.pose } : null };
            if (probe.readback) {
                if (!sampler) {
                    sampler = document.createElement('canvas'); sampler.width = 96; sampler.height = 128;
                    painter = sampler.getContext('2d', { willReadFrequently: true });
                }
                painter.clearRect(0, 0, 96, 128); painter.drawImage(canvas, 0, 0, 96, 128);
                const rgba = painter.getImageData(0, 0, 96, 128).data;
                let hash = 2166136261, changed = 0, difference = 0, alpha = 0;
                for (let i = 0; i < rgba.length; i++) {
                    hash = Math.imul(hash ^ rgba[i], 16777619);
                    if ((i & 3) === 3) alpha += rgba[i];
                    if (previous) { const delta = Math.abs(rgba[i] - previous[i]); if (delta) changed++; difference += delta; }
                }
                sample.hash = hash >>> 0; sample.changedChannels = changed; sample.meanDifference = difference / rgba.length;
                sample.alpha = alpha; sample.captureMs = performance.now() - at;
                previous = rgba;
            }
            probe.samples.push(sample);
        });
    }
    const clearRect = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) { const result = clearRect.apply(this, args); observe(this.canvas); return result; };
    const drawArrays = WebGLRenderingContext.prototype.drawArrays;
    WebGLRenderingContext.prototype.drawArrays = function (...args) { const result = drawArrays.apply(this, args); observe(this.canvas); return result; };
    probe.start = readback => { previous = null; probe.samples = []; probe.readback = readback; probe.active = true; };
    probe.stop = () => { probe.active = false; return probe.samples; };
}
async function open(fallback = false, reducedMotion = 'no-preference', embedded = false) {
    const browser = await chromium.launch({ headless: true, ...browserOptions, args: fallback ? ['--disable-webgl'] : [] });
    openedBrowsers.add(browser);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2,
        reducedMotion, serviceWorkers: 'block' });
    const wrapper = new URL('__companion_motion_wrapper__', base).href;
    await context.route(/^https?:\/\//, route => {
        if (embedded && route.request().url() === wrapper) return route.fulfill({ contentType: 'text/html',
            body: '<style>html,body{margin:0;height:100%}iframe{width:100%;height:100%;border:0}</style><iframe id="motion-frame" src="' + base + '"></iframe>' });
        return new URL(route.request().url()).origin === origin ? route.continue() : route.abort();
    });
    await context.addInitScript(installPaintProbe);
    const page = await context.newPage(); page.setDefaultTimeout(8000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(embedded ? wrapper : base, { waitUntil: 'domcontentloaded' });
    const view = embedded ? (page.frames().find(frame => frame.url() === base) ||
        await page.waitForEvent('framenavigated', { predicate: frame => frame.url() === base })) : page;
    assert(view, 'embedded character page exists');
    await view.waitForFunction(() => window.NewtabCompanion?.getState('companion-1')?.motion &&
        !['loading','static'].includes(NewtabCompanion.getState('companion-1').motion));
    return { browser, context, page, view, errors };
}
function percentile(values, fraction) { const sorted = values.filter(Number.isFinite).sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0; }
function summarise(samples, rafs, state) {
    const intervals = samples.slice(1).map((sample, index) => sample.at - samples[index].at);
    const duration = samples.at(-1)?.at - samples[0]?.at;
    const changed = samples.slice(1).filter((sample, index) => sample.hash !== samples[index].hash).length;
    return { renderer: state.renderer, targetFps: state.targetFps, paints: samples.length,
        paintFps: duration > 0 ? (samples.length - 1) * 1000 / duration : 0,
        uniqueVisualFps: samples[0]?.hash !== undefined && duration > 0 ? changed * 1000 / duration : null,
        uniqueRatio: samples[0]?.hash !== undefined ? changed / Math.max(1, samples.length - 1) : null,
        rafHz: (rafs.length - 1) * 1000 / (rafs.at(-1) - rafs[0]),
        medianIntervalMs: percentile(intervals, .5), p95IntervalMs: percentile(intervals, .95), maxIntervalMs: Math.max(0, ...intervals),
        medianSubmissionMs: percentile(samples.map(s => s.drawMs), .5), p95SubmissionMs: percentile(samples.map(s => s.drawMs), .95),
        medianReadbackMs: percentile(samples.map(s => s.captureMs), .5), p95ReadbackMs: percentile(samples.map(s => s.captureMs), .95),
        minimumAlpha: samples[0]?.hash !== undefined ? Math.min(...samples.map(s => s.alpha)) : null };
}
async function measure(page, readback, milliseconds = 2200) {
    return page.evaluate(({ readback, milliseconds }) => new Promise(resolve => {
        const rafs = []; let started;
        companionPaintProbe.start(readback);
        function sample(now) {
            if (started === undefined) started = now;
            rafs.push(now);
            if (now - started < milliseconds) requestAnimationFrame(sample);
            else resolve({ samples: companionPaintProbe.stop(), rafs, state: NewtabCompanion.getState('companion-1') });
        }
        requestAnimationFrame(sample);
    }), { readback, milliseconds });
}
async function benchmark() {
    const results = [];
    for (const fallback of [false, true]) {
        const { browser, page, errors } = await open(fallback);
        try {
            await page.waitForFunction(() => NewtabCompanion.getState('companion-1').motion === 'running');
            await page.waitForTimeout(350);
            const baseline = await measure(page, false), captured = await measure(page, true);
            const details = await page.locator('.companion-canvas').evaluate(canvas => {
                const bounds = canvas.getBoundingClientRect(), gl = canvas.getContext('webgl');
                const info = gl && gl.getExtension('WEBGL_debug_renderer_info');
                return { bitmap: [canvas.width, canvas.height], css: [bounds.width, bounds.height], dpr: devicePixelRatio,
                    graphics: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'Canvas2D / unavailable' };
            });
            const result = { fallback, ...details, timingOnly: summarise(baseline.samples, baseline.rafs, baseline.state),
                pixelReadback: summarise(captured.samples, captured.rafs, captured.state) };
            assert.equal(result.pixelReadback.renderer, fallback ? 'canvas2d' : 'webgl');
            assert(result.pixelReadback.minimumAlpha > 100000, 'actual artwork pixels remain nonempty');
            assert(result.pixelReadback.uniqueRatio > .9, 'successive real paints change the artwork pixels');
            assert(result.timingOnly.paintFps >= Math.min(60, result.timingOnly.rafHz) * .93,
                'readback-free paint cadence reaches at least the 60Hz display budget: ' + JSON.stringify(result.timingOnly));
            assert(result.pixelReadback.uniqueVisualFps >= Math.min(60, result.pixelReadback.rafHz) * .9,
                'actual changing artwork supports the 60fps goal despite synchronous measurement overhead: ' + JSON.stringify(result.pixelReadback));
            assert.deepEqual(errors, []);
            results.push(result);
            console.log('PAINT BENCHMARK ' + JSON.stringify(result));
        } finally { await browser.close(); }
    }
    const label = process.env.NEWTAB_MOTION_LABEL || 'current';
    fs.writeFileSync('.impeccable/review/companion-paint-' + label + '.json', JSON.stringify(results, null, 2));
    return results;
}

async function checkVisibilityAndPreferences(fallback) {
    const { browser, page, view, errors } = await open(fallback, 'no-preference', true);
    try {
        await view.waitForFunction(() => NewtabCompanion.getState('companion-1').motion === 'running');
        await view.evaluate(() => companionPaintProbe.start(true));
        await view.waitForFunction(() => companionPaintProbe.samples.length >= 6);
        await page.locator('#motion-frame').evaluate(el => { el.style.display = 'none'; });
        await view.waitForFunction(() => NewtabCompanion.getState('companion-1').motion === 'paused', null, { polling: 25 });
        await page.waitForTimeout(100);
        const hidden = await view.evaluate(() => ({ count: companionPaintProbe.samples.length, time: NewtabCompanion.getState('companion-1').animationTime }));
        await page.waitForTimeout(220);
        assert.deepEqual(await view.evaluate(() => ({ count: companionPaintProbe.samples.length, time: NewtabCompanion.getState('companion-1').animationTime })), hidden,
            'hidden iframe stops actual canvas paints and animation time');
        await page.locator('#motion-frame').evaluate(el => { el.style.display = ''; });
        await view.waitForFunction(count => companionPaintProbe.samples.length > count + 3, hidden.count);
        const resumed = await view.evaluate(count => companionPaintProbe.samples[count], hidden.count);
        assert(resumed.animationTime - hidden.time < .05, 'resuming does not fast-forward through the hidden interval');
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await view.waitForFunction(() => NewtabCompanion.getState('companion-1').motion === 'reduced');
        await page.waitForTimeout(100);
        const reduced = await view.evaluate(() => companionPaintProbe.samples.length);
        await page.waitForTimeout(160);
        assert.equal(await view.evaluate(() => companionPaintProbe.samples.length), reduced, 'system reduced motion stops actual paints');
        await view.evaluate(() => NewtabWidgets.setCompanionOptions('companion-1', { animationMode: 'on' }));
        await view.waitForFunction(count => companionPaintProbe.samples.length > count + 5, reduced);
        assert.equal(await view.evaluate(() => NewtabCompanion.getState('companion-1').motion), 'running', 'explicit play honors the user over the system default');
        await view.evaluate(() => NewtabWidgets.setCompanionOptions('companion-1', { animationMode: 'off' }));
        await view.waitForFunction(() => NewtabCompanion.getState('companion-1').motion === 'off');
        await page.waitForTimeout(100);
        const paused = await view.evaluate(() => companionPaintProbe.samples.length);
        await page.waitForTimeout(160);
        assert.equal(await view.evaluate(() => companionPaintProbe.samples.length), paused, 'explicit pause leaves stable canvas pixels');
        await view.evaluate(() => NewtabWidgets.removeById('companion-1'));
        assert.equal(await view.evaluate(() => NewtabCompanion.getState('companion-1')), null);
        await page.waitForTimeout(160);
        assert.equal(await view.evaluate(() => companionPaintProbe.samples.length), paused, 'removed character has no remaining render callbacks');
        assert.deepEqual(errors, []);
        console.log('PASS visibility/preferences: ' + (fallback ? 'Canvas2D' : 'WebGL') + ' real paints pause, resume without time jump, explicit play, reduced motion, removal');
    } finally { await browser.close(); }
}

async function checkPointerContinuity(fallback) {
    const { browser, page, errors } = await open(fallback);
    try {
        const trigger = page.locator('.companion-trigger'), before = await trigger.boundingBox();
        await page.mouse.move(before.x + before.width * .1, before.y + before.height * .5);
        await page.waitForTimeout(800);
        await page.evaluate(() => companionPaintProbe.start(true));
        await page.mouse.move(before.x + before.width * .9, before.y + before.height * .35);
        await page.waitForTimeout(650);
        const right = await page.evaluate(() => NewtabCompanion.getState('companion-1'));
        await page.mouse.move(before.x + before.width * .1, before.y + before.height * .65);
        await page.waitForTimeout(650);
        const left = await page.evaluate(() => NewtabCompanion.getState('companion-1'));
        const samples = await page.evaluate(() => companionPaintProbe.stop());
        const transitions = samples.slice(1).map((sample, index) => Math.abs(sample.pointerX - samples[index].pointerX));
        assert(samples.length > 35, 'pointer transition produces enough real rendered frames to inspect');
        assert(right.pointerX > .2 && left.pointerX < -.2, 'gaze follows both pointer directions');
        assert(Math.max(...transitions) < .5, 'gaze interpolates rather than jumping directly between pointer targets');
        assert(Math.max(...samples.map(sample => sample.meanDifference)) < 6, 'neighboring actual artwork frames remain visually continuous');
        assert(samples.every(sample => sample.alpha > 100000), 'pointer tracking never produces an empty frame');
        assert.deepEqual(await trigger.boundingBox(), before, 'visible motion keeps the pointer target stable');
        assert.deepEqual(errors, []);
        console.log('PASS pointer continuity: ' + JSON.stringify({ fallback, paints: samples.length,
            maxPointerStep: Math.max(...transitions), maxMeanPixelDifference: Math.max(...samples.map(sample => sample.meanDifference)) }));
    } finally { await browser.close(); }
}

async function checkLargeCanvasBudget(fallback) {
    const { browser, page, errors } = await open(fallback);
    try {
        await page.locator('.widget[data-type="companion"]').evaluate(el => {
            // Exercise the renderer's size guard without changing a saved profile.
            Object.assign(el.style, { left: '16px', top: '16px', width: '1125px', height: '1500px' });
        });
        await page.waitForFunction(() => document.querySelector('.companion-canvas').getBoundingClientRect().height > 1300);
        const limit = fallback ? 1024 : 2048;
        await page.waitForFunction(limit => Math.max(document.querySelector('.companion-canvas').width,
            document.querySelector('.companion-canvas').height) === limit, limit);
        await page.waitForTimeout(180);
        const sample = await measure(page, false, 1200), summary = summarise(sample.samples, sample.rafs, sample.state);
        const bitmap = await page.locator('.companion-canvas').evaluate(el => [el.width, el.height]);
        assert.equal(Math.max(...bitmap), limit, 'oversized artwork keeps the intended renderer backing-store cap');
        assert(summary.paintFps >= Math.min(60, summary.rafHz) * .9, 'large custom artwork remains within the60fps budget: ' + JSON.stringify(summary));
        assert.deepEqual(errors, []);
        console.log('PASS large canvas budget: ' + JSON.stringify({ fallback, bitmap, ...summary }));
    } finally { await browser.close(); }
}

(async () => {
    if (process.argv.includes('--resources-only')) { for (const fallback of [false, true]) await checkLargeCanvasBudget(fallback); return; }
    if (!process.argv.includes('--checks-only')) await benchmark();
    if (!process.argv.includes('--benchmark-only')) for (const fallback of [false, true]) {
        await checkVisibilityAndPreferences(fallback);
        await checkPointerContinuity(fallback);
        await checkLargeCanvasBudget(fallback);
    }
})().catch(async error => { console.error(error); await Promise.allSettled([...openedBrowsers].map(browser => browser.close())); process.exitCode = 1; });
