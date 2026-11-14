// Browser regressions for interruptible UI motion. Run against a local preview;
// external services are blocked and no personal browser profile is used.
const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const { chromium } = require('playwright');
const base = process.env.NEWTAB_TEST_URL || 'http://127.0.0.1:4174/';
const origin = new URL(base).origin;
let browser;
before(async () => {
    const options = { headless: true };
    if (process.env.NEWTAB_BROWSER_PATH) options.executablePath = process.env.NEWTAB_BROWSER_PATH;
    else options.channel = process.env.PLAYWRIGHT_CHANNEL || 'msedge';
    browser = await chromium.launch(options);
});
after(async () => { if (browser) await browser.close(); });

async function fixture(width = 1440, mobile = false) {
    const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 },
        isMobile: mobile, hasTouch: mobile, reducedMotion: 'no-preference', serviceWorkers: 'block' });
    await context.route(/^https?:\/\//, route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        // Character playback is independently tested and not needed for UI races.
        if (url.pathname.includes('/assets/character/live2d/')) return route.fulfill({ status: 404, body: 'omitted' });
        return route.continue();
    });
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(8000); page.on('pageerror', error => errors.push(error.message));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.NewtabMotion && window.NewtabWidgets && window.NewtabAppearance);
    return { context, page, errors };
}

test('narrow pointer crossing a submenu trigger does not cover the intended action', async () => {
    const { context, page, errors } = await fixture(320);
    try {
        const clock = page.locator('.widget[data-type="clock"]');
        await clock.focus(); await page.keyboard.press('Shift+F10');
        const trigger = page.getByRole('menuitem', { name: '時間制', exact: true });
        await trigger.hover(); await page.waitForTimeout(220);
        assert.equal(await trigger.getAttribute('aria-expanded'), 'false', 'narrow menus open submenus only by deliberate activation');
        await page.getByRole('menuitem', { name: '自訂組件外觀', exact: true }).click();
        await page.locator('.appearance-dialog[open]').waitFor();
        await page.keyboard.press('Escape'); await page.locator('.appearance-dialog').waitFor({ state: 'hidden' });
        // Removing accidental hover activation must retain explicit submenu use.
        await clock.focus(); await page.keyboard.press('Shift+F10'); await trigger.click();
        await page.getByRole('menuitemradio', { name: '12 小時制', exact: true }).click();
        await page.waitForFunction(() => NewtabWidgets.getLayout().widgets.find(w => w.type === 'clock').options.hour12 === true);
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('mobile search reopened during its exit remains the one active portal', async () => {
    const { context, page, errors } = await fixture(390, true);
    try {
        await page.locator('#search-input').tap(); await page.locator('#search-input').fill('保留輸入');
        for (let i = 0; i < 3; i++) {
            await page.keyboard.press('Escape'); await page.waitForTimeout(40);
            await page.locator('#side-rail-tab').focus(); await page.keyboard.press('/');
            await page.waitForFunction(() => document.activeElement.id === 'search-input');
        }
        await page.waitForTimeout(350);
        assert.equal(await page.locator('#search-input').count(), 1);
        assert.equal(await page.locator('.search-expand-layer.is-open').count(), 1);
        assert.equal(await page.locator('.search-expand-layer.is-closing').count(), 0);
        assert.equal(await page.locator('#search-input').inputValue(), '保留輸入');
        assert(await page.locator('#search-input').evaluate(el => !!el.closest('.search-expand-panel')));
        await page.locator('#clear-btn').tap(); assert.equal(await page.locator('#search-input').inputValue(), '');
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.querySelector('.search-expand-layer.is-open, .search-expand-layer.is-closing'));
        assert(await page.locator('#search-input').evaluate(el => !!el.closest('.widget[data-type="search"]')));
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('closing an old appearance dialog cannot close a freshly opened one or lose settings', async () => {
    const { context, page, errors } = await fixture();
    try {
        const initial = await page.evaluate(() => NewtabWidgets.getLayout().widgets.map(({ id, x, y, w, h }) => ({ id, x, y, w, h })));
        const id = await page.evaluate(() => NewtabWidgets.getLayout().widgets.find(w => w.type === 'clock').id);
        await page.evaluate(id => NewtabAppearance.openWidget(id), id);
        await page.getByRole('spinbutton', { name: '組件背景透明度', exact: true }).fill('73');
        await page.keyboard.press('Escape'); await page.waitForTimeout(30);
        await page.evaluate(id => NewtabAppearance.openWidget(id), id); await page.waitForTimeout(350);
        assert.equal(await page.locator('.appearance-dialog[open]').count(), 1);
        assert.equal(await page.locator('.appearance-dialog[open]').evaluate(el => el.inert), false);
        assert.equal(await page.getByRole('spinbutton', { name: '組件背景透明度', exact: true }).inputValue(), '73');
        await page.getByRole('button', { name: '完成', exact: true }).click();
        await page.locator('.appearance-dialog').waitFor({ state: 'hidden' });
        assert.deepEqual(await page.evaluate(() => NewtabWidgets.getLayout().widgets.map(({ id, x, y, w, h }) => ({ id, x, y, w, h }))), initial);
        assert.equal(await page.evaluate(id => NewtabWidgets.getLayout().widgets.find(w => w.id === id).options.appearance.alpha, id), .27);
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('enabling reduced motion during an exit completes cleanup and releases focus', async () => {
    const { context, page, errors } = await fixture();
    try {
        const clock = page.locator('.widget[data-type="clock"]'); await clock.focus();
        await page.keyboard.press('Shift+F10');
        const item = page.getByRole('menuitem', { name: '自訂組件外觀', exact: true });
        await item.focus(); await page.keyboard.press('Enter');
        await page.locator('.appearance-dialog[open]').waitFor(); await page.waitForTimeout(30);
        await page.keyboard.press('Escape'); await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.locator('.appearance-dialog').waitFor({ state: 'hidden' });
        await page.waitForFunction(() => document.querySelector('.ctx-menu')?.hidden === true);
        assert.equal(await page.locator('dialog[open]').count(), 0);
        assert.equal(await page.evaluate(() => NewtabMotion.reduced()), true);
        assert.equal(await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running' && a.effect?.target?.closest?.('.appearance-dialog,.ctx-menu,.ctx-sub')).length), 0);
        await clock.focus(); await page.keyboard.press('Shift+F10'); await item.focus(); await page.keyboard.press('Enter');
        assert.equal(await page.locator('.appearance-dialog[open]').evaluate(el => getComputedStyle(el).opacity), '1');
        await page.keyboard.press('Escape'); await page.locator('.appearance-dialog').waitFor({ state: 'hidden' });
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('an exiting background sheet cannot intercept Escape or steal focus from a new dialog', async () => {
    const { context, page, errors } = await fixture();
    try {
        const id = await page.evaluate(() => NewtabWidgets.getLayout().widgets.find(w => w.type === 'clock').id);
        await page.evaluate(() => NewtabBackground.openUpload());
        await page.waitForTimeout(300);
        await page.evaluate(id => {
            document.querySelector('#close-upload').click();
            NewtabAppearance.openWidget(id);
        }, id);
        assert.equal(await page.locator('#video-upload-container').evaluate(el => el.inert), true);
        await page.keyboard.press('Escape');
        await page.locator('.appearance-dialog').waitFor({ state: 'hidden' });
        await page.locator('#video-upload-container').waitFor({ state: 'hidden' });

        await page.evaluate(() => NewtabBackground.openUpload());
        await page.waitForTimeout(300);
        await page.evaluate(id => {
            document.querySelector('#close-upload').click();
            NewtabAppearance.openWidget(id);
            document.querySelector('.appearance-dialog input[type="number"]').focus();
        }, id);
        await page.locator('#video-upload-container').waitFor({ state: 'hidden' });
        assert.equal(await page.locator('.appearance-dialog[open]').evaluate(el => el.contains(document.activeElement)), true,
            'old sheet completion does not restore its opener over the new modal');
        assert.equal(await page.evaluate(() => document.activeElement.matches('.appearance-dialog input[type="number"]')), true);
        await page.keyboard.press('Escape');
        await page.locator('.appearance-dialog').waitFor({ state: 'hidden' });
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});
