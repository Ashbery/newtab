require('node:fs').mkdirSync('.impeccable/review', { recursive: true });
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const url = process.env.NEWTAB_TEST_URL || 'http://127.0.0.1:4173/';
let browser;
const browserOptions = process.env.NEWTAB_BROWSER_PATH ? { executablePath: process.env.NEWTAB_BROWSER_PATH } : { channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) };
before(async () => { browser = await chromium.launch({ headless: true, ...browserOptions }); });
after(async () => { if (browser) await browser.close(); });

async function open(width = 1440, height = 900, extra = {}) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: extra.reducedMotion || 'no-preference' });
    if (extra.noWebGL) await context.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return type === 'webgl' ? null : original.call(this, type, ...rest); };
    });
    const page = await context.newPage();
    await page.goto(url);
    await page.waitForFunction(() => {
        const element = document.querySelector('.widget[data-type="companion"] .home-companion');
        return element && element.dataset.motion !== 'loading';
    });
    const widget = page.locator('.widget[data-type="companion"]');
    return { page, context, widget, id: await widget.getAttribute('data-id') };
}

test('character is a bounded widget at standard, ultrawide and mobile sizes', async () => {
    for (const [width, height] of [[1440,900],[1920,1080],[2560,1080],[3440,1440],[3840,1080],[5120,1440],[390,844],[320,640]]) {
        const { page, context, widget } = await open(width, height);
        try {
            await widget.scrollIntoViewIfNeeded();
            const bounds = await widget.evaluate(element => {
                const outer = element.getBoundingClientRect();
                const names = ['.companion-trigger','.companion-canvas','.companion-portrait','.companion-disc'];
                return names.map(selector => {
                    const r = element.querySelector(selector).getBoundingClientRect();
                    return { selector, inside: r.left >= outer.left - 1 && r.top >= outer.top - 1 && r.right <= outer.right + 1 && r.bottom <= outer.bottom + 1 };
                });
            });
            assert.ok(bounds.every(item => item.inside), JSON.stringify({ width, bounds }));
            assert.equal(await page.locator('#home-companion').count(), 0, 'no fixed character remains outside the widget grid');
            const trigger = widget.locator('.companion-trigger');
            const original = await trigger.boundingBox();
            await trigger.hover(); await page.waitForTimeout(160);
            assert.deepEqual(await trigger.boundingBox(), original, 'motion never changes the pointer target');
        } finally { await context.close(); }
    }
});

test('illustrated blink and regional rig draw changing pixels; arranging freezes them', async () => {
    const { page, context, widget, id } = await open();
    try {
        await page.waitForFunction(id => NewtabCompanion.getState(id).motion === 'running', id);
        const canvas = widget.locator('canvas');
        const first = await canvas.screenshot();
        await page.waitForTimeout(650);
        const second = await canvas.screenshot();
        assert.notDeepEqual(first, second, 'character artwork changes rather than translating its container');
        await page.waitForFunction(id => NewtabCompanion.getState(id).blink > .5, id, { timeout: 7000, polling: 'raf' });
        await widget.screenshot({ path: '.impeccable/review/companion-illustrated-blink.png' });
        await page.evaluate(() => NewtabWidgets.enterArrange());
        await page.waitForFunction(id => NewtabCompanion.getState(id).motion === 'paused', id);
        const frames = await page.evaluate(id => NewtabCompanion.getState(id).frames, id);
        await page.waitForTimeout(180);
        assert.equal(await page.evaluate(id => NewtabCompanion.getState(id).frames, id), frames);
        await page.evaluate(() => NewtabWidgets.exitArrange());
        await page.waitForFunction(id => NewtabCompanion.getState(id).motion === 'running', id);
        await page.evaluate(id => NewtabAppearance.openWidget(id), id);
        await page.waitForFunction(id => NewtabCompanion.getState(id).motion === 'paused', id);
        const dialogFrames = await page.evaluate(id => NewtabCompanion.getState(id).frames, id);
        await page.waitForTimeout(160);
        assert.equal(await page.evaluate(id => NewtabCompanion.getState(id).frames, id), dialogFrames, 'modal editing pauses the occluded rig');
        await page.keyboard.press('Escape');
        await page.waitForFunction(id => NewtabCompanion.getState(id).motion === 'running', id);
    } finally { await context.close(); }
});

test('system preference, explicit play and explicit pause have distinct persistent behavior', async () => {
    const { page, context, widget, id } = await open(1440, 900, { reducedMotion: 'reduce' });
    try {
        assert.equal(await page.evaluate(id => NewtabCompanion.getState(id).motion, id), 'reduced');
        await page.waitForTimeout(160);
        assert.equal(await page.evaluate(id => NewtabCompanion.getState(id).frames, id), 0);
        assert.equal(await widget.locator('.companion-portrait').evaluate(e => e.naturalWidth > 0), true);
        await page.evaluate(id => NewtabWidgets.setCompanionOptions(id, { animationMode: 'on' }), id);
        await page.waitForFunction(id => NewtabCompanion.getState(id).motion === 'running', id);
        await page.reload();
        await page.waitForFunction(id => NewtabCompanion.getState(id)?.motion === 'running', id);
        assert.equal(await page.evaluate(id => NewtabCompanion.getState(id).mode, id), 'on');
        await page.evaluate(id => NewtabWidgets.setCompanionOptions(id, { animationMode: 'off' }), id);
        await page.waitForFunction(id => NewtabCompanion.getState(id).motion === 'off', id);
        await page.reload();
        await page.waitForFunction(id => NewtabCompanion.getState(id)?.motion === 'off', id);
        assert.equal(await page.evaluate(id => NewtabCompanion.getState(id).frames, id), 0);
        await page.evaluate(id => NewtabWidgets.setCompanionOptions(id, { animationMode: 'auto' }), id);
        await page.waitForFunction(id => NewtabCompanion.getState(id).motion === 'reduced', id);
    } finally { await context.close(); }
});

test('character opens the in-page chat from pointer and keyboard, then cleans up on removal', async () => {
    const { page, context, widget, id } = await open();
    try {
        await page.evaluate(id => NewtabWidgets.setAppearance(id, { text: 'light', tint: '#102030', alpha: 1, border: 1 }), id);
        const surface = await widget.locator('.companion-surface').evaluate(e => ({ border: getComputedStyle(e).borderStyle, width: getComputedStyle(e).borderWidth, radius: getComputedStyle(e).borderRadius }));
        assert.deepEqual(surface, { border: 'solid', width: '1px', radius: '50%' });
        assert.equal(await widget.locator('.companion-action-label').evaluate(e => getComputedStyle(e).color), 'rgb(244, 248, 252)');
        await page.evaluate(() => { window.characterChatOpened = []; window.NewtabCharacterChat = { open: id => characterChatOpened.push(id) }; });
        const trigger = widget.locator('.companion-trigger');
        assert.equal(await trigger.evaluate(e => e.tagName), 'BUTTON');
        assert.equal(await trigger.getAttribute('href'), null);
        const pageCount = context.pages().length, originalUrl = page.url();
        await trigger.click();
        await trigger.focus(); await page.keyboard.press('Enter');
        await page.keyboard.press('Space');
        assert.deepEqual(await page.evaluate(() => characterChatOpened), [id, id, id]);
        assert.equal(context.pages().length, pageCount, 'chat activation does not open another browser page');
        assert.equal(page.url(), originalUrl);
        await page.evaluate(id => document.dispatchEvent(new CustomEvent('newtab:chat-state', { detail: { widgetId: id, state: 'thinking' } })), id);
        assert.equal(await page.evaluate(id => NewtabCompanion.getState(id).chatState, id), 'thinking');
        await page.evaluate(id => document.dispatchEvent(new CustomEvent('newtab:chat-state', { detail: { widgetId: id, state: 'speaking' } })), id);
        assert.equal(await page.evaluate(id => NewtabCompanion.getState(id).chatState, id), 'replying');
        await page.evaluate(id => NewtabWidgets.removeById(id), id);
        assert.equal(await page.locator('.widget[data-type="companion"]').count(), 0);
        assert.equal(await page.evaluate(id => NewtabCompanion.getState(id), id), null);
        await page.reload();
        assert.equal(await page.locator('.widget[data-type="companion"]').count(), 0, 'removed character is not recreated on reload');
    } finally { await context.close(); }
});

test('a browser with WebGL disabled still animates illustrated pixels and blinks in Canvas2D', async () => {
    const fallbackBrowser = await chromium.launch({ headless: true, ...browserOptions, args: ['--disable-webgl'] });
    try {
        const context = await fallbackBrowser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
        const page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
        await page.goto(url);
        await page.waitForFunction(() => NewtabCompanion.getState('companion-1')?.motion === 'running');
        assert.equal(await page.evaluate(() => NewtabCompanion.getState('companion-1').renderer), 'canvas2d');
        const canvas = page.locator('.companion-canvas'), trigger = page.locator('.companion-trigger');
        const bounds = await trigger.boundingBox(), first = await canvas.screenshot();
        await page.waitForTimeout(650);
        assert.notDeepEqual(await canvas.screenshot(), first, 'fallback changes the artwork, not just the target box');
        assert.deepEqual(await trigger.boundingBox(), bounds);
        await page.waitForFunction(() => NewtabCompanion.getState('companion-1').blink > .7, null, { polling: 'raf', timeout: 6000 });
        await page.locator('.widget[data-type="companion"]').screenshot({ path: '.impeccable/review/companion-brave-no-webgl.png' });
        await page.evaluate(() => NewtabWidgets.setCompanionOptions('companion-1', { animationMode: 'off' }));
        await page.waitForFunction(() => NewtabCompanion.getState('companion-1').motion === 'off');
        const paused = await canvas.screenshot(); await page.waitForTimeout(200);
        assert.deepEqual(await canvas.screenshot(), paused, 'explicit pause leaves stable artwork');
        await page.evaluate(() => NewtabWidgets.removeById('companion-1'));
        assert.equal(await page.evaluate(() => NewtabCompanion.getState('companion-1')), null);
        assert.deepEqual(errors, []);
    } finally { await fallbackBrowser.close(); }
});

test('loss of an active graphics context switches to animated fallback without an empty character', async () => {
    const { page, context, widget, id } = await open();
    try {
        const canLoseContext = await widget.locator('canvas').evaluate(canvas => {
            const gl = canvas.getContext('webgl'); const extension = gl && gl.getExtension('WEBGL_lose_context');
            if (!extension) return false; extension.loseContext(); return true;
        });
        if (canLoseContext) {
            await page.waitForFunction(id => NewtabCompanion.getState(id).renderer === 'canvas2d' && NewtabCompanion.getState(id).motion === 'running', id);
            const count = await page.evaluate(id => NewtabCompanion.getState(id).frames, id);
            await page.waitForTimeout(200);
            assert((await page.evaluate(id => NewtabCompanion.getState(id).frames, id)) > count);
        }
    } finally { await context.close(); }
});

test('embedded new-tab frame animates while visible and pauses when its frame is hidden', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
    try {
        const wrapper = new URL('__companion_frame_test__', url).href;
        await context.route(wrapper, route => route.fulfill({ contentType: 'text/html', body: '<style>html,body{margin:0;height:100%}iframe{width:100%;height:100%;border:0}</style><iframe id="frame" src="' + url + '"></iframe>' }));
        const page = await context.newPage(); await page.goto(wrapper);
        const frame = page.frames().find(frame => frame.url() === url);
        assert(frame, 'the website is loaded in its own frame');
        await frame.waitForFunction(() => NewtabCompanion.getState('companion-1')?.motion === 'running');
        const initial = await frame.evaluate(() => NewtabCompanion.getState('companion-1').frames);
        await page.waitForTimeout(180);
        assert((await frame.evaluate(() => NewtabCompanion.getState('companion-1').frames)) > initial);
        await page.locator('#frame').evaluate(element => { element.style.display = 'none'; });
        await frame.waitForFunction(() => NewtabCompanion.getState('companion-1').motion === 'paused');
        const paused = await frame.evaluate(() => NewtabCompanion.getState('companion-1').frames);
        await page.waitForTimeout(180);
        assert.equal(await frame.evaluate(() => NewtabCompanion.getState('companion-1').frames), paused);
        await page.locator('#frame').evaluate(element => { element.style.display = ''; });
        await frame.waitForFunction(() => NewtabCompanion.getState('companion-1').motion === 'running');
    } finally { await context.close(); }
});

test('RAF pacing reaches the display-limited target at 60, 120, 144 and 240 Hz without speeding up motion', async () => {
    for (const fallback of [false, true]) for (const hz of [60, 120, 144, 240]) {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
        try {
            await context.addInitScript(({ fallback }) => {
                if (fallback) {
                    const getContext = HTMLCanvasElement.prototype.getContext;
                    HTMLCanvasElement.prototype.getContext = function (kind, ...args) { return kind === 'webgl' ? null : getContext.call(this, kind, ...args); };
                }
                let serial = 0, now = 1000;
                const callbacks = new Map();
                window.requestAnimationFrame = callback => { callbacks.set(++serial, callback); return serial; };
                window.cancelAnimationFrame = id => callbacks.delete(id);
                window.__companionClock = { step(delta) {
                    now += delta; const batch = Array.from(callbacks.entries());
                    for (const [id, callback] of batch) if (callbacks.has(id)) { callbacks.delete(id); callback(now); }
                } };
            }, { fallback });
            const page = await context.newPage(); await page.goto(url);
            await page.waitForFunction(() => NewtabCompanion.getState('companion-1')?.motion === 'running', null, { polling: 50 });
            const result = await page.evaluate(hz => {
                __companionClock.step(0);
                const before = NewtabCompanion.getState('companion-1');
                const trigger = document.querySelector('.companion-trigger'), box = trigger.getBoundingClientRect();
                trigger.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', clientX: box.right, clientY: box.top + box.height / 2, bubbles: true }));
                for (let i = 0; i < hz / 2; i++) __companionClock.step(1000 / hz);
                const halfSecond = NewtabCompanion.getState('companion-1');
                for (let i = 0; i < hz * 2.5; i++) __companionClock.step(1000 / hz);
                const after = NewtabCompanion.getState('companion-1');
                return { renderer: after.renderer, target: after.targetFps, frames: after.frames - before.frames,
                    seconds: after.animationTime - before.animationTime, pointer: halfSecond.pointerX };
            }, hz);
            const target = fallback ? 60 : 90;
            assert.equal(result.renderer, fallback ? 'canvas2d' : 'webgl');
            assert.equal(result.target, target);
            assert.ok(Math.abs(result.frames - Math.min(hz, target) * 3) <= 1, JSON.stringify({ hz, ...result }));
            assert.ok(Math.abs(result.seconds - 3) < .001, 'Animation speed follows elapsed time at every display refresh rate');
            assert.ok(Math.abs(result.pointer - (1 - Math.pow(.82, 15))) < .001, 'Pointer easing retains its original half-second response');
            if (hz === 144) {
                await page.evaluate(() => NewtabWidgets.enterArrange());
                await page.waitForFunction(() => NewtabCompanion.getState('companion-1').motion === 'paused', null, { polling: 50 });
                const paused = await page.evaluate(() => { __companionClock.step(10000); return NewtabCompanion.getState('companion-1'); });
                await page.evaluate(() => NewtabWidgets.exitArrange());
                await page.waitForFunction(() => NewtabCompanion.getState('companion-1').motion === 'running', null, { polling: 50 });
                const resumed = await page.evaluate(() => { __companionClock.step(0); return NewtabCompanion.getState('companion-1'); });
                assert.equal(resumed.animationTime, paused.animationTime, 'A paused interval never fast-forwards the pose');
            }
        } finally { await context.close(); }
    }
});

test('real Brave rendering sustains the higher target with and without WebGL', async () => {
    const results = [];
    for (const fallback of [false, true]) {
        const measuredBrowser = await chromium.launch({ headless: true, ...browserOptions, args: fallback ? ['--disable-webgl'] : [] });
        try {
            const page = await measuredBrowser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'no-preference' });
            await page.goto(url);
            await page.waitForFunction(() => NewtabCompanion.getState('companion-1')?.motion === 'running');
            // Warm up image upload and the first visible render before sampling.
            await page.waitForTimeout(300);
            const measured = await page.evaluate(() => new Promise(resolve => {
                let start, initialFrames, rafs = 0, previous = -1;
                const costs = [];
                function sample(now) {
                    const state = NewtabCompanion.getState('companion-1');
                    if (start === undefined) { start = now; initialFrames = state.frames; }
                    else rafs++;
                    if (state.frames !== previous) { costs.push(state.drawMs); previous = state.frames; }
                    const duration = now - start;
                    if (duration >= 2500) {
                        costs.sort((a, b) => a - b);
                        resolve({ renderer: state.renderer, targetFps: state.targetFps, fps: (state.frames - initialFrames) * 1000 / duration,
                            rafHz: rafs * 1000 / duration, medianDrawMs: costs[Math.floor(costs.length / 2)], p95DrawMs: costs[Math.floor(costs.length * .95)] });
                    } else requestAnimationFrame(sample);
                }
                requestAnimationFrame(sample);
            }));
            results.push(measured);
            assert.equal(measured.renderer, fallback ? 'canvas2d' : 'webgl');
            const displayLimited = Math.min(measured.targetFps, measured.rafHz);
            assert.ok(measured.fps >= displayLimited * .85, JSON.stringify(measured));
            assert.ok(measured.fps <= measured.targetFps * 1.05, 'The target caps unnecessary rendering above the selected rate');
        } finally { await measuredBrowser.close(); }
    }
    require('node:fs').writeFileSync('.impeccable/review/companion-motion-performance.json', JSON.stringify(results, null, 2));
    console.log('Character motion performance:', JSON.stringify(results));
});
