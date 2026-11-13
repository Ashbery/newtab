// Run with a local static server and Playwright available in NODE_PATH.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fs = require('node:fs');
const base = process.env.NEWTAB_TEST_URL || 'http://127.0.0.1:4173';
fs.mkdirSync('.impeccable/review', { recursive: true });

(async () => {
    const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
    try {
        for (const width of [1440, 390, 320]) {
            const height = width === 320 ? 640 : 900;
            const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', e => errors.push(e.message));
            await page.goto(base, { waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() => window.NewtabAppearance && window.NewtabWidgets && document.querySelector('#background-appearance input'));
            const clockId = await page.evaluate(() => NewtabWidgets.getLayout().widgets.find(w => w.type === 'clock').id);
            const clock = page.locator(`.widget[data-id="${clockId}"]`);
            const bodyBefore = await page.evaluate(() => NewtabWidgets.getLayout().widgets.find(w => w.type === 'clock'));
            assert.equal(await clock.locator('.clock-glass').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(248, 251, 253, 0)');
            await page.locator('#side-rail-tab').focus();
            await page.keyboard.press('Enter');
            await page.getByRole('tab', { name: '個人化', exact: true }).click();
            const opacity = page.getByRole('spinbutton', { name: '背景透明度', exact: true });
            const blur = page.getByRole('spinbutton', { name: '背景模糊', exact: true });
            await opacity.fill('52'); await opacity.blur();
            await blur.fill('25'); await blur.blur();
            assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('nt_appearance_v1'))), { transparency: 52, blur: 25 });
            await opacity.fill(''); await opacity.blur();
            assert.equal(await opacity.inputValue(), '52', 'clearing a number does not erase a saved setting');
            await blur.fill('151'); await blur.blur();
            assert.equal(await blur.inputValue(), '100');
            await blur.fill('-8'); await blur.blur();
            assert.equal(await blur.inputValue(), '0');
            await blur.fill('25'); await blur.blur();
            await page.screenshot({ path: `.impeccable/review/appearance-background-${width}.png` });
            await page.locator('#side-rail-close').click();
            await page.evaluate(() => document.body.classList.add('has-custom-background'));
            assert.equal(await clock.locator('.clock-glass').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(248, 251, 253, 0)', 'custom media does not restore a solid clock');
            assert.ok(await page.locator('.app-tile-label').evaluateAll(elements => elements.every(el => getComputedStyle(el).backgroundColor === 'rgba(0, 0, 0, 0)')));
            await clock.focus(); await page.keyboard.press('Shift+F10');
            await page.getByRole('menuitem', { name: '自訂組件外觀', exact: true }).click();
            await page.getByRole('spinbutton', { name: '組件背景透明度', exact: true }).fill('73');
            await page.getByRole('spinbutton', { name: '組件背景模糊', exact: true }).fill('30');
            await page.getByRole('spinbutton', { name: '邊框濃度', exact: true }).fill('25');
            await page.getByRole('combobox', { name: '組件文字顏色', exact: true }).selectOption('light');
            await page.screenshot({ path: `.impeccable/review/appearance-widget-${width}.png` });
            const bounds = await page.locator('.appearance-dialog').boundingBox();
            assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width, 'dialog fits narrow viewport');
            assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= height, 'dialog fits short viewport');
            await page.getByRole('button', { name: '完成', exact: true }).click();
            const appearance = await page.evaluate(id => NewtabWidgets.getLayout().widgets.find(w => w.id === id).options.appearance, clockId);
            assert.equal(appearance.alpha, .27); assert.equal(appearance.blur, 12); assert.equal(appearance.border, .25); assert.equal(appearance.text, 'light');
            assert.equal(await clock.locator('#clock').evaluate(el => getComputedStyle(el).color), 'rgb(244, 248, 252)');
            await page.reload({ waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() => window.NewtabWidgets);
            assert.equal(await clock.locator('.clock-glass').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(248, 251, 253, 0.27)');
            assert.equal(await page.locator('#video-background').evaluate(el => getComputedStyle(el).opacity), '0.48');
            await clock.focus(); await page.keyboard.press('Shift+F10');
            await page.getByRole('menuitem', { name: '自訂組件外觀', exact: true }).click();
            await page.getByRole('button', { name: '恢復預設', exact: true }).click();
            await page.getByRole('button', { name: '完成', exact: true }).click();
            assert.equal(await clock.locator('.clock-glass').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(248, 251, 253, 0)');
            const after = await page.evaluate(id => NewtabWidgets.getLayout().widgets.find(w => w.id === id), clockId);
            for (const key of ['x', 'y', 'w', 'h']) assert.equal(after[key], bodyBefore[key], 'appearance reset preserves geometry');
            assert.equal(after.options.hour12, bodyBefore.options.hour12);
            await page.locator('#side-rail-tab').focus(); await page.keyboard.press('Enter');
            await page.getByRole('button', { name: '恢復背景預設', exact: true }).click();
            assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('nt_appearance_v1'))), { transparency: 0, blur: 0 });
            await page.locator('#side-rail-close').click();
            const companion = page.locator('.widget[data-type="companion"]').first();
            if (await companion.count()) {
                await companion.focus(); await page.keyboard.press('Shift+F10');
                await page.getByRole('menuitem', { name: '自訂組件外觀', exact: true }).click();
                const animation = page.getByRole('combobox', { name: '角色動畫', exact: true });
                assert.deepEqual(await animation.locator('option').evaluateAll(items => items.map(item => item.value)), ['auto', 'on', 'off']);
                assert.equal(await page.getByRole('textbox', { name: 'ChatGPT 對話網址', exact: true }).count(), 0, 'inline chat needs no external conversation URL');
                await animation.selectOption('off');
                await page.getByRole('button', { name: '完成', exact: true }).click();
                const options = await page.evaluate(() => NewtabWidgets.getLayout().widgets.find(w => w.type === 'companion').options);
                assert.equal(options.animationMode, 'off');
                assert.equal(await companion.locator('.companion-trigger').getAttribute('href'), null);
                await companion.focus(); await page.keyboard.press('Shift+F10');
                await page.getByRole('menuitem', { name: '自訂組件外觀', exact: true }).click();
                assert.equal(await animation.inputValue(), 'off');
                await animation.selectOption('on');
                await page.getByRole('button', { name: '完成', exact: true }).click();
                await page.reload({ waitUntil: 'domcontentloaded' });
                await page.waitForFunction(() => window.NewtabWidgets);
                assert.equal(await page.evaluate(() => NewtabWidgets.getLayout().widgets.find(w => w.type === 'companion').options.animationMode), 'on', 'explicit animation choice survives reload');
                await companion.focus(); await page.keyboard.press('Shift+F10');
                await page.getByRole('menuitem', { name: '自訂組件外觀', exact: true }).click();
                assert.equal(await animation.inputValue(), 'on');
                await page.getByRole('button', { name: '恢復預設', exact: true }).click();
                assert.equal(await animation.inputValue(), 'auto', 'reset follows the system motion preference');
                assert.equal(await page.evaluate(() => NewtabWidgets.getLayout().widgets.find(w => w.type === 'companion').options.animationMode), 'auto');
                await page.keyboard.press('Escape');
                await page.locator('.appearance-dialog').waitFor({ state: 'detached' });
                assert.equal(await page.locator('.appearance-dialog').count(), 0);
            }
            if (width === 1440) {
                const result = await page.evaluate(() => NewtabWidgets.addFromCatalog('notes'));
                assert.equal(result.ok, true);
                const notes = page.locator('.widget[data-type="notes"]').first();
                assert.equal(await notes.locator('.notes-body').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(248, 251, 253, 0.3)');
                assert.equal(await notes.locator('textarea').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
                await notes.locator('textarea').fill('外觀重設保留我的備註');
                await notes.focus(); await page.keyboard.press('Shift+F10');
                await page.getByRole('menuitem', { name: '自訂組件外觀', exact: true }).click();
                await page.getByRole('spinbutton', { name: '組件背景透明度', exact: true }).fill('98');
                await page.getByRole('button', { name: '恢復預設', exact: true }).click();
                await page.getByRole('button', { name: '完成', exact: true }).click();
                assert.equal(await notes.locator('textarea').inputValue(), '外觀重設保留我的備註');
                await page.evaluate(() => {
                    const note = NewtabWidgets.getLayout().widgets.find(w => w.type === 'notes');
                    NewtabWidgets.setAppearance(note.id, { bgAlpha: .2, bgDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=' });
                });
                assert.equal(await notes.locator('.widget-surface').evaluate(el => getComputedStyle(el, '::before').opacity), '0.2', 'legacy image opacity applies only to its separate image layer');
                assert.equal(await notes.locator('textarea').evaluate(el => getComputedStyle(el).opacity), '1');
                for (const type of ['todo', 'bookmarks']) {
                    const added = await page.evaluate(type => {
                        const result = NewtabWidgets.addFromCatalog(type);
                        const widget = NewtabWidgets.getLayout().widgets.find(w => w.type === type);
                        if (widget) NewtabWidgets.setAppearance(widget.id, { alpha: 1, tint: '#102030', text: 'light' });
                        return result.ok;
                    }, type);
                    assert.equal(added, true);
                    const empty = page.locator(`.widget[data-type="${type}"]`);
                    assert.equal(await empty.locator('.widget-empty-title').evaluate(el => getComputedStyle(el).color), 'rgb(244, 248, 252)');
                    assert.equal(await empty.locator('.widget-empty-hint').evaluate(el => getComputedStyle(el).color), 'rgb(224, 234, 242)');
                }
            }
            assert.deepEqual(errors, []);
            await context.close();
            console.log(`PASS ${width}px: percent inputs, bounds, persistence, scoped resets, transparent clock/labels, readable text`);
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
