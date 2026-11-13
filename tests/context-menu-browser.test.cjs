// Run against a local static server: NEWTAB_TEST_URL=http://127.0.0.1:4173 node --test tests/context-menu-browser.test.cjs
// Requires Playwright and a browser. Windows defaults to the installed Edge channel.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const url = process.env.NEWTAB_TEST_URL || 'http://127.0.0.1:4173/';
let browser;

before(async () => {
    browser = await chromium.launch({
        headless: true,
        channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined)
    });
});
after(async () => { if (browser) await browser.close(); });

// A real persisted clock in the lower-right quadrant. It needs no remote data.
// Keyboard context menus and the shared touch toolbar must clamp at both edges.
const cornerLayout = {
    v: 4,
    rail: { open: false, width: 300, tab: 'personalize' },
    widgets: [{ id: 'clock-1', type: 'clock', x: .4, y: .82, w: .58, h: .16, z: 1, pinned: false, options: { hour12: false } }]
};

async function assertMenuFits(page, selector) {
    await page.locator(selector).waitFor({ state: 'visible' });
    // Inspect the fully expanded box, not the smaller entrance-animation frame.
    await page.waitForTimeout(300);
    const metrics = await page.locator(selector).evaluate(element => {
        const rect = element.getBoundingClientRect();
        const view = window.visualViewport;
        const left = view ? view.offsetLeft : 0;
        const top = view ? view.offsetTop : 0;
        return {
            rect: rect.toJSON(),
            view: { left, top, right: left + (view ? view.width : innerWidth), bottom: top + (view ? view.height : innerHeight) }
        };
    });
    const { rect, view } = metrics;
    const description = selector + ': ' + JSON.stringify(metrics);
    assert.ok(rect.width > 100 && rect.height > 50, 'the menu must actually be expanded');
    assert.ok(rect.left >= view.left + 7.5, description);
    assert.ok(rect.top >= view.top + 7.5, description);
    assert.ok(rect.right <= view.right - 7.5, description);
    assert.ok(rect.bottom <= view.bottom - 7.5, description);
}

async function openSettings(page, widget, input) {
    if (input === 'keyboard') {
        await widget.focus();
        await page.keyboard.press('Shift+F10');
    } else {
        await widget.scrollIntoViewIfNeeded();
        const box = await widget.boundingBox();
        const touch = await page.context().newCDPSession(page);
        // Use the visible upper edge, clear of the fixed editing toolbar.
        const point = { x: box.x + box.width / 2, y: box.y + 3 };
        await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
        await page.waitForTimeout(620);
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        assert.equal(await widget.evaluate(el => el.classList.contains('is-editor-selected')), true, 'held touch reveals selection');
        await page.locator('#editor-widget-settings').tap();
    }
    await assertMenuFits(page, '.ctx-menu.is-visible');
}

async function openTimeSubmenu(page, input) {
    if (input === 'keyboard') {
        for (let i = 0; i < 8 && !/時間制/.test(await page.evaluate(() => document.activeElement.textContent)); i++) await page.keyboard.press('ArrowDown');
        assert.match(await page.evaluate(() => document.activeElement.textContent), /時間制/);
        await page.keyboard.press('ArrowRight');
    } else {
        await page.locator('.ctx-menu .has-sub').filter({ hasText: '時間制' }).tap();
    }
    await assertMenuFits(page, '.ctx-sub.is-open');
    // Opening the cascade must not move or crop the main menu.
    await assertMenuFits(page, '.ctx-menu.is-visible');
}

for (const [width, height] of [[320, 640], [390, 844]]) {
    for (const reducedMotion of ['no-preference', 'reduce']) {
        for (const input of ['keyboard', 'touch']) {
            test(`${width}px ${reducedMotion} ${input}: corner menus fit and actions restore usable focus`, async () => {
                const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, reducedMotion });
                const errors = [];
                try {
                    await context.addInitScript(({ layout, width, height }) => {
                        // Init scripts precede the viewport meta tag on phones;
                        // innerHeight here may describe the temporary 980px layout.
                        const pitch = (width - 40) / 4;
                        layout.widgets[0].options.homeMobile = { x: (20 + pitch + 4) / width, y: height * .82, w: (pitch * 3 - 8) / width, h: height * .16 };
                        localStorage.setItem('nt_layout_v1', JSON.stringify(layout));
                    }, { layout: cornerLayout, width, height });
                    const page = await context.newPage();
                    page.setDefaultTimeout(6000);
                    page.on('pageerror', error => errors.push(error.message));
                    await page.goto(url, { waitUntil: 'networkidle' });
                    await page.evaluate(() => document.fonts.ready);
                    await page.locator('#side-rail-tab').tap();
                    await page.getByRole('tab', { name: '個人化', exact: true }).tap();
                    await page.locator('#arrange-home').tap();
                    await page.waitForTimeout(300);

                    const widget = page.locator('.widget[data-id="clock-1"]');
                    const trigger = await widget.boundingBox();
                    // The shared phone grid keeps a 24px outer inset. The
                    // expanded menu must still clamp to its separate 8px margin.
                    assert.ok(trigger.x + trigger.width > width - 32, 'fixture must open beside the right edge: ' + JSON.stringify(trigger));
                    assert.ok(trigger.y > height * .7, 'fixture must open near the bottom');
                    assert.equal(await page.locator('.widget-options').count(), 0, 'per-widget ellipsis buttons are removed');

                    await openSettings(page, widget, input);
                    await openTimeSubmenu(page, input);
                    await page.keyboard.press('Escape');
                    assert.equal(await page.locator('.ctx-menu').isVisible(), false);
                    assert.equal(await page.locator('.ctx-sub').isVisible(), false);
                    const opener = input === 'keyboard' ? widget : page.locator('#editor-widget-settings');
                    assert.equal(await opener.evaluate(element => document.activeElement === element), true, 'Escape returns to the invoking control');

                    await openSettings(page, widget, input);
                    await openTimeSubmenu(page, input);
                    if (input === 'keyboard') await page.keyboard.press('Enter');
                    else await page.getByRole('menuitemradio', { name: '12 小時制', exact: true }).tap();
                    assert.equal(await page.evaluate(() => NewtabWidgets.getLayout().widgets.find(widget => widget.id === 'clock-1').options.hour12), true);
                    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('nt_layout_v1')).widgets.find(widget => widget.id === 'clock-1').options.hour12), false, 'arrangement settings remain a draft until Done');
                    assert.equal(await page.locator('#clock .clock-period').isVisible(), true, '12-hour selection is reflected in the clock');

                    if (input === 'keyboard') { await page.locator('#arrange-done-bar').focus(); await page.keyboard.press('Enter'); }
                    else await page.locator('#arrange-done-bar').tap();
                    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('nt_layout_v1')).widgets.find(widget => widget.id === 'clock-1').options.hour12), true, 'Done commits settings');
                    await page.locator('#side-rail-tab').tap();
                    await page.getByRole('tab', { name: '個人化', exact: true }).tap();
                    await page.locator('#arrange-home').tap();

                    await openSettings(page, widget, input);
                    if (input === 'keyboard') {
                        await page.keyboard.press('End');
                        await page.keyboard.press('Enter');
                    } else {
                        await page.getByRole('menuitem', { name: '從主畫面移除', exact: true }).tap();
                    }
                    await page.waitForFunction(() => document.activeElement.id === 'arrange-done-bar');
                    assert.equal(await page.locator('#arrange-done-bar').isVisible(), true);
                    assert.equal(await page.locator('.widget[data-id="clock-1"][data-active="true"]').count(), 0);
                    assert.equal(await page.evaluate(() => NewtabWidgets.getLayout().widgets.some(widget => widget.id === 'clock-1')), false);
                    assert.deepEqual(errors, []);
                } finally { await context.close(); }
            });
        }
    }
}
