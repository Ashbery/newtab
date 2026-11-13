require('node:fs').mkdirSync('.impeccable/review', { recursive: true });
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const url = process.env.NEWTAB_TEST_URL || 'http://127.0.0.1:4173/';
let browser;
before(async () => { browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) }); });
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

test('reduced motion, explicit pause and graphics fallback preserve the character', async () => {
    for (const settings of [{ reducedMotion: 'reduce' }, { noWebGL: true }]) {
        const { page, context, widget, id } = await open(1440, 900, settings);
        try {
            const state = await page.evaluate(id => NewtabCompanion.getState(id), id);
            assert.equal(state.motion, settings.noWebGL ? 'static' : 'reduced');
            await page.waitForTimeout(160);
            assert.equal(await page.evaluate(id => NewtabCompanion.getState(id).frames, id), 0);
            assert.equal(await widget.locator('.companion-portrait').evaluate(e => e.naturalWidth > 0), true);
            if (settings.noWebGL) assert.equal(await widget.locator('.companion-portrait').evaluate(e => getComputedStyle(e).opacity), '1');
        } finally { await context.close(); }
    }
    const { page, context, id } = await open();
    try {
        await page.evaluate(id => NewtabWidgets.setCompanionOptions(id, { animation: false }), id);
        await page.waitForFunction(id => NewtabCompanion.getState(id).motion === 'off', id);
        await page.reload();
        await page.waitForFunction(id => NewtabCompanion.getState(id)?.motion === 'off', id);
        assert.equal(await page.evaluate(id => NewtabCompanion.getState(id).frames, id), 0);
    } finally { await context.close(); }
});

test('character opens the configured ChatGPT conversation in a separate tab and is removable', async () => {
    const { page, context, widget, id } = await open();
    try {
        const target = 'https://chatgpt.com/c/newtab-character-test';
        await page.evaluate(id => NewtabWidgets.setAppearance(id, { text: 'light', tint: '#102030', alpha: 1, border: 1 }), id);
        const surface = await widget.locator('.companion-surface').evaluate(e => ({ border: getComputedStyle(e).borderStyle, width: getComputedStyle(e).borderWidth, radius: getComputedStyle(e).borderRadius }));
        assert.deepEqual(surface, { border: 'solid', width: '1px', radius: '50%' });
        assert.equal(await widget.locator('.companion-action-label').evaluate(e => getComputedStyle(e).color), 'rgb(244, 248, 252)');
        await context.route('https://chatgpt.com/**', route => route.fulfill({ contentType: 'text/html', body: '<title>ChatGPT test destination</title>' }));
        await page.evaluate(({ id, target }) => NewtabWidgets.setCompanionOptions(id, { chatUrl: target }), { id, target });
        const trigger = widget.locator('.companion-trigger');
        assert.equal(await trigger.getAttribute('href'), target);
        const popupPromise = context.waitForEvent('page');
        await trigger.focus(); await page.keyboard.press('Enter');
        const popup = await popupPromise; await popup.waitForLoadState();
        assert.equal(popup.url(), target);
        assert.equal(await popup.evaluate(() => !!window.opener), false);
        await popup.close();
        assert.deepEqual(await page.evaluate(() => [
            'javascript:alert(1)', 'https://chatgpt.com.evil.example/', 'http://chatgpt.com/', 'https://user:pass@chatgpt.com/', 'https://chatgpt.com:8443/'
        ].map(NewtabCompanion.safeChatUrl)), Array(5).fill('https://chatgpt.com/'));
        await page.evaluate(id => NewtabWidgets.removeById(id), id);
        assert.equal(await page.locator('.widget[data-type="companion"]').count(), 0);
        assert.equal(await page.evaluate(id => NewtabCompanion.getState(id), id), null);
        await page.reload();
        assert.equal(await page.locator('.widget[data-type="companion"]').count(), 0, 'removed character is not recreated on reload');
    } finally { await context.close(); }
});
