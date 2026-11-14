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

test('reversing the same appearance dialog keeps the currently displayed pose', async () => {
    const { context, page, errors } = await fixture();
    try {
        const id = await page.evaluate(() => NewtabWidgets.getLayout().widgets.find(w => w.type === 'clock').id);
        await page.evaluate(id => NewtabAppearance.openWidget(id), id);
        await page.waitForFunction(() => +getComputedStyle(document.querySelector('.appearance-dialog[open]')).opacity > .999);
        await page.getByRole('spinbutton', { name: '組件背景透明度', exact: true }).fill('73');
        const reversal = await page.evaluate(async id => {
            function pose() {
                const el = document.querySelector('.appearance-dialog[open]'), rect = el.getBoundingClientRect();
                return { opacity: +getComputedStyle(el).opacity, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
            }
            document.querySelector('.appearance-close').click();
            await new Promise(resolve => setTimeout(resolve, 30));
            const before = pose();
            NewtabAppearance.openWidget(id);
            return { before, after: pose() };
        }, id);
        assert(reversal.before.opacity > .1, 'the reversal occurs while the old panel is still visibly exiting');
        assert(Math.abs(reversal.after.opacity - reversal.before.opacity) < .04, 'reopening does not restart from transparent');
        for (const key of ['x', 'y', 'width', 'height']) {
            assert(Math.abs(reversal.after[key] - reversal.before[key]) < .6, 'reopening preserves the visible ' + key);
        }
        await page.waitForFunction(() => +getComputedStyle(document.querySelector('.appearance-dialog[open]')).opacity > .999);
        assert.equal(await page.getByRole('spinbutton', { name: '組件背景透明度', exact: true }).inputValue(), '73');
        assert.equal(await page.locator('.appearance-dialog[open]').evaluate(el => el.inert), false);
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('a context menu reverses from its visible pose and releases its hit layer promptly', async () => {
    const { context, page, errors } = await fixture();
    try {
        await page.evaluate(() => NewtabContextMenu.openWidget(document.querySelector('.widget[data-type="clock"]')));
        await page.waitForFunction(() => +getComputedStyle(document.querySelector('.ctx-menu')).opacity > .999);
        const result = await page.evaluate(async () => {
            function pose() {
                const el = document.querySelector('.ctx-menu'), rect = el.getBoundingClientRect();
                return { opacity: +getComputedStyle(el).opacity, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
            }
            NewtabContextMenu.close();
            await new Promise(resolve => setTimeout(resolve, 30));
            const before = pose();
            NewtabContextMenu.openWidget(document.querySelector('.widget[data-type="clock"]'));
            return { before, after: pose() };
        });
        assert(result.before.opacity > .1);
        assert(Math.abs(result.after.opacity - result.before.opacity) < .04, 'a repeated context action does not flash the menu out');
        for (const key of ['x', 'y', 'width', 'height']) assert(Math.abs(result.after[key] - result.before[key]) < .6, 'menu pose remains continuous: ' + key);
        await page.waitForFunction(() => +getComputedStyle(document.querySelector('.ctx-menu')).opacity > .999);
        const closeMs = await page.evaluate(async () => {
            const menu = document.querySelector('.ctx-menu'), start = performance.now();
            NewtabContextMenu.close();
            if (!menu.inert) throw new Error('exiting menu must stop accepting input immediately');
            while (!menu.hidden && performance.now() - start < 1500) await new Promise(requestAnimationFrame);
            if (!menu.hidden) throw new Error('menu did not finish closing');
            return performance.now() - start;
        });
        assert(closeMs < 600, 'the menu exit does not keep an invisible shell for a long spring tail: ' + closeMs.toFixed(1) + 'ms');
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('weather custom controls reverse their disclosure without losing values or trapping hidden inputs', async () => {
    for (const width of [1440, 390]) {
        const { context, page, errors } = await fixture(width, width < 600);
        try {
            const id = await page.evaluate(() => {
                const result = NewtabWidgets.addFromCatalog('weather', { left: 16, top: 16,
                    options: { lat: 25.033, lon: 121.565, city: '測試城市', locationSource: 'manual', timeZone: 'Asia/Taipei' } });
                if (!result.ok) throw new Error('weather fixture did not fit');
                NewtabAppearance.openWidget(result.widget.id);
                return result.widget.id;
            });
            const mode = page.getByRole('combobox', { name: '按鈕外觀', exact: true });
            const custom = page.locator('.appearance-weather-custom');
            assert.equal(await custom.evaluate(el => el.hidden), true);
            await mode.selectOption('custom'); await page.waitForTimeout(90);
            const reversal = await page.evaluate(() => {
                const panel = document.querySelector('.appearance-weather-custom');
                const select = document.querySelector('.appearance-weather-mode select');
                const height = panel.getBoundingClientRect().height;
                select.value = 'inherit'; select.dispatchEvent(new Event('change', { bubbles: true }));
                return { before: height, after: panel.getBoundingClientRect().height, inert: panel.inert, hidden: panel.hidden };
            });
            assert(reversal.before > 5, 'the controls have visibly started expanding');
            assert(Math.abs(reversal.after - reversal.before) < .6, 'changing direction keeps the visible disclosure height');
            assert.equal(reversal.inert, true, 'outgoing controls immediately stop receiving input');
            await page.waitForTimeout(60); await mode.selectOption('custom');
            await page.waitForFunction(() => {
                const el = document.querySelector('.appearance-weather-custom');
                return !el.hidden && !el.inert && +getComputedStyle(el).opacity === 1 &&
                    el.getBoundingClientRect().height >= el.firstElementChild.scrollHeight - 2;
            });
            await page.getByRole('spinbutton', { name: '按鈕背景透明度', exact: true }).fill('73');
            await mode.selectOption('inherit'); await page.waitForTimeout(30);
            await page.emulateMedia({ reducedMotion: 'reduce' });
            await page.waitForFunction(() => document.querySelector('.appearance-weather-custom').hidden);
            assert.equal(await custom.getAttribute('aria-hidden'), 'true');
            await mode.selectOption('custom');
            assert.equal(await custom.evaluate(el => el.hidden || el.inert), false);
            assert.equal(await custom.evaluate(el => getComputedStyle(el).opacity), '1');
            assert.equal(await page.getByRole('spinbutton', { name: '按鈕背景透明度', exact: true }).inputValue(), '73');
            await page.getByRole('button', { name: '完成', exact: true }).click();
            await page.locator('.appearance-dialog').waitFor({ state: 'hidden' });
            const saved = await page.evaluate(id => NewtabWidgets.getLayout().widgets.find(w => w.id === id).options.appearance, id);
            assert.equal(saved.weatherButtonMode, 'custom'); assert.equal(saved.weatherButtonAlpha, .27);
            assert.deepEqual(errors, []);
        } finally { await context.close(); }
    }
});

test('reopening the same folder does not replay its contents from invisible', async () => {
    const { context, page, errors } = await fixture();
    try {
        const id = await page.evaluate(() => {
            const result = NewtabWidgets.addFromCatalog('folder', { left: 16, top: 16,
                options: { name: '我的收藏', children: [{ appId: 'gmail' }, { appId: 'youtube' }] } });
            if (!result.ok) throw new Error('folder fixture did not fit');
            NewtabFolderUI.open(result.widget.id); return result.widget.id;
        });
        await page.waitForFunction(() => +getComputedStyle(document.querySelector('.folder-open-item')).opacity === 1);
        const reversal = await page.evaluate(async id => {
            function opacity() { return +getComputedStyle(document.querySelector('.folder-open-item')).opacity; }
            NewtabFolderUI.close();
            await new Promise(resolve => setTimeout(resolve, 30));
            const before = opacity();
            NewtabFolderUI.open(id);
            await new Promise(requestAnimationFrame);
            return { before, after: opacity() };
        }, id);
        assert(reversal.before > .95);
        assert(reversal.after >= reversal.before - .04, 'the existing apps stay visible during a reversed folder dismissal');
        assert.equal(await page.getByRole('textbox', { name: '資料夾名稱', exact: true }).inputValue(), '我的收藏');
        assert.equal(await page.locator('.folder-open-item').count(), 2);
        await page.getByRole('button', { name: '關閉資料夾', exact: true }).click();
        await page.waitForFunction(() => !NewtabFolderUI.isOpen());
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});
