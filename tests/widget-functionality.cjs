// A running local server and Playwright in NODE_PATH are required.
// This exercises saved widget data through visible user controls in fresh profiles.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = process.env.NEWTAB_TEST_URL || 'http://127.0.0.1:4173';
const origin = new URL(base).origin;

async function ready(page) {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.NewtabWidgets && window.NewtabSideRail);
}
async function reload(page) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.NewtabWidgets && window.NewtabSideRail);
}
async function tools(page, name) {
    if (!await page.evaluate(() => document.body.classList.contains('side-rail-open'))) { await page.mouse.move(page.viewportSize().width - 2, 64); await page.locator('#side-rail-tab').click(); }
    await page.getByRole('tab', { name, exact: true }).click();
}
async function done(page) {
    if (await page.evaluate(() => NewtabWidgets.isArranging())) {
        const button = page.getByRole('button', { name: '完成主畫面編輯', exact: true });
        if (await page.evaluate(() => matchMedia('(pointer: coarse)').matches)) await button.tap();
        else await button.click();
    }
}
async function add(page, type) {
    await tools(page, '組件');
    await page.locator('#component-list [data-place-type="' + type + '"] .list-add').click();
    assert.equal(await page.evaluate(() => NewtabWidgets.isArranging()), false, 'a newly added ' + type + ' is immediately usable');
    await done(page);
    await page.locator('.widget[data-type="' + type + '"]').waitFor();
}
async function options(page, type) {
    return page.evaluate((type) => NewtabWidgets.getLayout().widgets.find((w) => w.type === type)?.options, type);
}
async function modalClosed(page) {
    await page.locator('.bookmark-modal').waitFor({ state: 'hidden' });
}
async function openBookmarks(page, index) {
    await page.getByRole('button', { name: /^(新增|管理)書籤$/ }).click();
    await page.locator('.bookmark-modal-panel').waitFor({ state: 'visible' });
    if (index != null) await page.locator('.bookmark-select').selectOption(String(index));
}
async function saveBookmark(page, url, label) {
    await page.locator('.bookmark-url-input').fill(url);
    await page.locator('.bookmark-name-input').fill(label);
    await page.locator('.bookmark-modal [data-confirm]').click();
    await modalClosed(page);
}
async function composingEnter(page, selector, legacy = false) {
    await page.locator(selector).focus();
    await page.locator(selector).evaluate((input, legacy) => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true,
            isComposing: !legacy, keyCode: legacy ? 229 : 13 }));
    }, legacy);
    assert.equal(await page.locator(selector).evaluate((input) => document.activeElement === input), true,
        selector + ' preserves CJK composition focus');
}

async function optionalWidgets(page, mobile) {
    for (const type of ['notes', 'todo', 'countdown', 'bookmarks']) {
        await add(page, type);
        console.log('added ' + type);
    }
    const note = '中文筆記第一行\nSecond line: <not markup> & saved immediately';
    await page.getByRole('textbox', { name: '備註內容', exact: true }).fill(note);
    await reload(page); // pagehide must flush the 500ms debounce.
    assert.equal(await page.getByRole('textbox', { name: '備註內容', exact: true }).inputValue(), note);
    console.log('notes immediate reload passed');
    await page.locator('.todo-add').click();
    assert.equal(await page.locator('.todo-text').evaluate((input) => document.activeElement === input), true);
    await page.locator('.todo-text').fill('今天整理收藏');
    await page.locator('.todo-check').click();
    assert.equal(await page.locator('.todo-check').getAttribute('aria-pressed'), 'true');
    await page.locator('.todo-add').click();
    await page.locator('.todo-text').nth(1).fill('第二項');
    await page.locator('.todo-remove').first().click();
    assert.equal(await page.locator('.todo-text').inputValue(), '第二項');
    assert.equal(await page.locator('.todo-text').evaluate((input) => document.activeElement === input), true);
    await reload(page);
    assert.deepEqual((await options(page, 'todo')).items, [{ text: '第二項', done: false }]);
    await page.locator('.todo-remove').click();
    assert.equal(await page.locator('.todo-add').evaluate((input) => document.activeElement === input), true);
    assert.equal(await page.locator('.todo-body').getAttribute('class').then((s) => s.includes('is-empty')), true);
    console.log('todo lifecycle passed');

    const today = await page.evaluate(() => {
        const date = new Date();
        return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
    });
    await page.getByRole('textbox', { name: '倒數標題' }).fill('下次見面的日子');
    await composingEnter(page, '.countdown-title-input');
    await composingEnter(page, '.countdown-title-input', true);
    await page.locator('.countdown-date-input').fill(today);
    await page.locator('.countdown-title-input').click();
    assert.equal(await page.locator('.countdown-days').textContent(), '0');
    assert.equal(await page.locator('.countdown-unit').textContent(), '今天');
    await page.locator('.countdown-date-input').fill('2020-01-01');
    await page.locator('.countdown-title-input').click();
    assert.equal(await page.locator('.countdown-unit').textContent(), '天前');
    await reload(page);
    assert.equal(await page.locator('.countdown-date-input').inputValue(), '2020-01-01');
    assert.equal(await page.locator('.countdown-title-input').inputValue(), '下次見面的日子');
    await page.locator('.countdown-date-input').fill('');
    await page.locator('.countdown-title-input').click();
    assert.equal(await page.locator('.countdown-unit').textContent(), '設定日期');
    console.log('countdown lifecycle passed');

    await openBookmarks(page);
    await page.locator('.bookmark-url-input').fill('javascript:alert(1)');
    await page.locator('.bookmark-name-input').fill('保留這個名稱');
    await page.locator('.bookmark-modal [data-confirm]').click();
    assert.equal(await page.locator('.bookmark-url-input').getAttribute('aria-invalid'), 'true');
    assert.equal(await page.locator('.bookmark-name-input').inputValue(), '保留這個名稱');
    assert.match(await page.locator('#bookmark-error').textContent(), /有效/);
    await page.evaluate(() => { NewtabApps.resolveFavicon = (url, cb) => { window.__lateFavicon = cb; }; });
    await saveBookmark(page, 'example.com/first', '原始名稱');
    assert.equal((await options(page, 'bookmarks')).links[0].url, 'https://example.com/first');

    // A late icon must not replace the management button that regained focus.
    await page.evaluate(() => window.__lateFavicon(NewtabApps.defaultGlyphDataUrl('E')));
    assert.equal(await page.getByRole('button', { name: '管理書籤', exact: true }).evaluate((button) => button === document.activeElement), true);
    const popupPromise = page.waitForEvent('popup');
    if (mobile) await page.locator('.bookmark-label').tap(); else await page.locator('.bookmark-label').click();
    const bookmarkPage = await popupPromise;
    await bookmarkPage.waitForLoadState('domcontentloaded');
    assert.equal(bookmarkPage.url(), 'https://example.com/first', 'bookmark labels navigate normally');
    await bookmarkPage.close();
    if (!mobile) {
        const opened = [];
        const trackPopup = (popup) => opened.push(popup);
        page.on('popup', trackPopup);
        await page.locator('.bookmark-label').dblclick();
        assert.equal(await page.locator('.bookmark-label-input').count(), 0, 'double-clicking a link never starts a conflicting inline editor');
        for (const popup of opened) await popup.close();
        page.off('popup', trackPopup);
    }

    // The visible management action exposes URL editing and deletion to keyboard/touch users.
    await openBookmarks(page, 0);
    await page.locator('.bookmark-url-input').fill('https://example.org/cancelled');
    await page.locator('.bookmark-name-input').fill('取消修改');
    await composingEnter(page, '.bookmark-name-input');
    await composingEnter(page, '.bookmark-name-input', true);
    await page.keyboard.press('Escape');
    await modalClosed(page);
    assert.equal((await options(page, 'bookmarks')).links[0].url, 'https://example.com/first');
    assert.equal((await options(page, 'bookmarks')).links[0].label, '原始名稱', 'cancelled renaming does not persist on blur');
    assert.equal(await page.getByRole('button', { name: '管理書籤', exact: true }).evaluate((el) => el === document.activeElement), true);
    await openBookmarks(page, 0);
    await saveBookmark(page, 'https://example.org/updated', '已修改');
    await reload(page);
    assert.equal((await options(page, 'bookmarks')).links[0].label, '已修改');
    assert.equal(await page.locator('.bookmark-tile').getAttribute('href'), 'https://example.org/updated');
    await page.locator('.bookmark-tile').focus();
    await page.keyboard.press('F2');
    await page.locator('.bookmark-modal-panel').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.bookmark-select').inputValue(), '0');
    await page.locator('.bookmark-select').focus();
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.locator('.bookmark-modal [data-confirm]').evaluate((button) => button === document.activeElement), true);
    await page.locator('.bookmark-modal [data-delete]').click();
    await modalClosed(page);
    await reload(page);
    assert.equal((await options(page, 'bookmarks')).links.length, 0);
    assert.equal(await page.getByRole('button', { name: '新增書籤', exact: true }).isVisible(), true);
    console.log('bookmark lifecycle passed');

    if (mobile) {
        await page.locator('.todo-add').tap();
        for (const selector of ['.todo-check', '.todo-remove', '.countdown-title-input', '.countdown-date-input']) {
            const rect = await page.locator(selector).boundingBox();
            assert(rect.width >= 44 && rect.height >= 44, selector + ' has a 44px touch target');
        }
        await openBookmarks(page);
        for (const selector of ['.notes-body textarea', '.todo-text', '.countdown-title-input', '.countdown-date-input', '.bookmark-url-input', '.bookmark-name-input', '.bookmark-select']) {
            assert.equal(await page.locator(selector).evaluate((el) => getComputedStyle(el).fontSize), '16px', selector + ' avoids narrow-screen text-entry zoom');
        }
        await page.keyboard.press('Escape');
        await modalClosed(page);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        for (const type of ['notes', 'todo', 'countdown', 'bookmarks']) {
            const rect = await page.locator('.widget[data-type="' + type + '"]').boundingBox();
            assert(rect.width >= 280 && rect.width <= 350, type + ' remains readable on mobile');
        }
        await page.locator('#widget-canvas').evaluate((canvas) => { canvas.scrollTop = 0; });
        const scrollTouch = await page.context().newCDPSession(page);
        await scrollTouch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 14, y: 700 }] });
        await page.waitForTimeout(80);
        for (let step = 1; step <= 10; step++) {
            await scrollTouch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 14, y: 700 - step * 35 }] });
            await page.waitForTimeout(30);
        }
        await page.waitForTimeout(750);
        await scrollTouch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        // Keep the native input session alive until this browser context closes.
        await page.waitForFunction(() => document.getElementById('widget-canvas').scrollTop > 100);
        console.log('native mobile canvas scrolling passed');
    }
}

async function boundaries(page) {
    // Start from realistic persisted collections near the caps; the final add,
    // edit and delete still use visible controls rather than test-only APIs.
    const fixture = await page.evaluate(() => {
        const layout = NewtabWidgets.getLayout();
        layout.widgets.find((w) => w.type === 'todo').options.items = Array.from({ length: 19 }, (_, i) => ({ text: '第 ' + (i + 1) + ' 項', done: false }));
        layout.widgets.find((w) => w.type === 'bookmarks').options.links = Array.from({ length: 11 }, (_, i) => ({ label: '收藏 ' + i, url: 'https://example.com/' + i, icon: '' }));
        return JSON.stringify(layout);
    });
    // Persisted fixtures are loaded on a new document without pagehide replacing them.
    await page.addInitScript((fixture) => {
        if (sessionStorage.getItem('widget-boundary-loaded')) return;
        localStorage.setItem('nt_layout_v1', fixture);
        sessionStorage.setItem('widget-boundary-loaded', '1');
    }, fixture);
    await reload(page);
    await page.locator('.todo-add').click();
    await page.locator('.todo-text').nth(19).fill('第 20 項');
    assert.equal(await page.locator('.todo-add').isDisabled(), true);
    assert.equal((await options(page, 'todo')).items.length, 20);
    await page.locator('.todo-remove').nth(9).click();
    assert.equal(await page.locator('.todo-add').isEnabled(), true);
    assert.equal(await page.locator('.todo-text').nth(9).inputValue(), '第 11 項');
    assert.equal(await page.locator('.todo-text').nth(9).evaluate((el) => document.activeElement === el), true);
    console.log('todo cap passed');
    await openBookmarks(page);
    await saveBookmark(page, 'example.com/11', '收藏 11');
    await openBookmarks(page);
    assert.equal(await page.locator('.bookmark-modal [data-confirm]').isDisabled(), true);
    assert.match(await page.locator('#bookmark-error').textContent(), /12/);
    await page.locator('.bookmark-select').selectOption('5');
    assert.equal(await page.locator('.bookmark-modal [data-confirm]').isEnabled(), true);
    await saveBookmark(page, 'example.org/at-capacity', '上限仍可修改');
    assert.equal((await options(page, 'bookmarks')).links.length, 12);
    await openBookmarks(page, 5);
    await page.locator('.bookmark-modal [data-delete]').click();
    await modalClosed(page);
    await openBookmarks(page);
    assert.equal(await page.locator('.bookmark-modal [data-confirm]').isEnabled(), true);
    await page.keyboard.press('Escape');
    await modalClosed(page);
    // Check what the actions saved without resetting the seeded document.
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('nt_layout_v1')));
    assert.equal(stored.widgets.find((w) => w.type === 'bookmarks').options.links.length, 11);
    assert.equal(stored.widgets.find((w) => w.type === 'todo').options.items.length, 19);
    assert.equal((await options(page, 'bookmarks')).links.length, 11);
    assert.equal((await options(page, 'todo')).items.length, 19);
    console.log('bookmark cap passed');
}

async function resize(page) {
    // Grid resize and exact-preview behavior are covered in home-editor.cjs.
    // This fixture verifies responsive persistence and compact content access.
    const saved = await page.evaluate(() => NewtabWidgets.getLayout().widgets.map(({ id, x, y, w, h }) => ({ id, x, y, w, h })));
    await page.setViewportSize({ width: 390, height: 844 });
    await reload(page);
    assert.deepEqual(await page.evaluate(() => NewtabWidgets.getLayout().widgets.map(({ id, x, y, w, h }) => ({ id, x, y, w, h }))), saved, 'mobile reload retains canonical desktop geometry');
    await page.setViewportSize({ width: 1440, height: 900 });
    await reload(page);
    assert.deepEqual(await page.evaluate(() => NewtabWidgets.getLayout().widgets.map(({ id, x, y, w, h }) => ({ id, x, y, w, h }))), saved);

    // A compact legacy card keeps the complete list reachable by scrolling.
    const compact = await page.evaluate(() => {
        const layout = NewtabWidgets.getLayout();
        const todo = layout.widgets.find((w) => w.type === 'todo');
        todo.w = 0.075; todo.h = 0.11; delete todo.options.homeDesktop; delete todo.options.homeMobile;
        return JSON.stringify(layout);
    });
    await page.addInitScript((compact) => {
        if (sessionStorage.getItem('widget-compact-loaded')) return;
        localStorage.setItem('nt_layout_v1', compact);
        sessionStorage.setItem('widget-compact-loaded', '1');
    }, compact);
    await page.setViewportSize({ width: 800, height: 600 });
    await reload(page);
    assert.equal(await page.locator('.widget[data-type="todo"]').getAttribute('data-layout'), 'compact');
    await page.locator('.todo-text').nth(8).fill('縮小後仍能修改');
    assert.equal((await options(page, 'todo')).items[8].text, '縮小後仍能修改');
    console.log('free resize, canonical mobile reload, and compact list access passed');
}

async function applications(page, mobile) {
    const use12 = (await options(page, 'clock')).hour12 === false;
    await tools(page, '個人化');
    await page.locator('#arrange-home').click();
    const clockWidget = page.locator('.widget[data-type=clock]');
    if (mobile) { await clockWidget.tap(); await page.locator('#editor-widget-settings').tap(); }
    else { await clockWidget.focus(); await page.keyboard.press('Shift+F10'); }
    await page.getByRole('menuitem', { name: '時間制', exact: true }).click();
    await page.getByRole('menuitemradio', { name: use12 ? '12 小時制' : '24 小時制', exact: true }).click();
    assert.equal((await options(page, 'clock')).hour12, use12);
    const apps = page.locator('.widget[data-type="app"]');
    const from = await apps.nth(0).boundingBox(), to = await apps.nth(1).boundingBox();
    if (mobile) {
        const touch = await page.context().newCDPSession(page);
        const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
        const end = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
        await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
        await page.waitForTimeout(620);
        for (let step = 1; step <= 10; step++) {
            await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{
                x: start.x + (end.x - start.x) * step / 10, y: start.y + (end.y - start.y) * step / 10 }] });
            // Realistic sample cadence; zero-time CDP bursts suppress the next
            // tap in Chromium even on a standalone page with no app handlers.
            await page.waitForTimeout(30);
        }
        await page.waitForTimeout(750);
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        // Context teardown closes the session after compatibility events settle.
    } else {
        await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(620);
        await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
        await page.waitForTimeout(750);
        await page.mouse.up();
    }
    await page.locator('.folder-tile').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.folder-tile').count(), 1, 'dragging apps together creates a folder');
    await done(page);
    if (mobile) await page.locator('.folder-tile').tap(); else await page.locator('.folder-tile').click();
    await page.locator('.folder-name-input').fill('日常資料夾');
    await composingEnter(page, '.folder-name-input');
    await composingEnter(page, '.folder-name-input', true);
    await page.keyboard.press('Enter');
    await page.locator('.folder-name-input').fill('不應保存');
    await page.keyboard.press('Escape');
    await page.locator('.folder-overlay').waitFor({ state: 'hidden' });
    await reload(page);
    assert.equal((await options(page, 'clock')).hour12, use12);
    assert.equal(await page.locator('.folder-label').textContent(), '日常資料夾');
    await page.locator('.folder-tile').click();
    assert.equal(await page.locator('.folder-open-item').first().evaluate((el) => getComputedStyle(el).opacity), '1', 'folder apps remain painted when reduced motion disables animations');
    const destination = await page.locator('.folder-open-item').first().getAttribute('href');
    const popupPromise = page.waitForEvent('popup');
    await page.locator('.folder-open-item').first().click();
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded');
    assert.equal(popup.url(), new URL(destination).href);
    await popup.close();
    await page.locator('.folder-close').click();
    await page.locator('.folder-overlay').waitFor({ state: 'hidden' });
    await tools(page, '個人化');
    await page.locator('#arrange-home').click();
    await page.locator('.widget[data-type=folder]').click();
    await page.locator('#editor-widget-settings').click();
    await page.getByRole('menuitem', { name: '解散資料夾', exact: true }).click();
    await done(page);
    assert.equal(await apps.count(), 4);
    await reload(page);
    assert.equal(await apps.count(), 4, 'dissolving a folder preserves its apps across reload');
    const builtin = page.locator('.app-tile').first();
    const builtinUrl = new URL(await builtin.getAttribute('href')).href;
    if (mobile) await builtin.tap(); else await builtin.click();
    await page.waitForURL(builtinUrl, { waitUntil: 'domcontentloaded' });
    await ready(page);
    if (!mobile) {
        const launcher = await page.locator('.app-tile').first().boundingBox();
        await page.mouse.move(launcher.x + launcher.width / 2, launcher.y + launcher.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(620);
        assert.equal(await page.evaluate(() => NewtabWidgets.isArranging()), true, 'long press still enters arrange mode while ordinary clicks navigate');
        await page.mouse.up();
        assert.equal(new URL(page.url()).origin, origin);
        await done(page);
    } else {
        const app = await page.locator('.app-tile').first().boundingBox();
        const heldTouch = await page.context().newCDPSession(page);
        const start = { x: app.x + app.width / 2, y: app.y + app.height / 2 };
        await heldTouch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
        await page.waitForTimeout(620);
        assert.equal(await page.evaluate(() => NewtabWidgets.isArranging()), true, 'native long press enters arrange mode');
        const target = await page.locator('.widget[data-type="app"]').nth(1).boundingBox();
        for (let step = 1; step <= 10; step++) {
            await heldTouch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{
                x: start.x + (target.x + target.width / 2 - start.x) * step / 10,
                y: start.y + (target.y + target.height / 2 - start.y) * step / 10 }] });
            await page.waitForTimeout(30);
        }
        await page.waitForTimeout(750);
        await heldTouch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.locator('.folder-tile').waitFor({ state: 'visible' });
        assert.equal(await page.locator('.folder-tile').count(), 1, 'the same held touch can drag and merge apps without being cancelled by browser panning');
        assert.equal(new URL(page.url()).origin, origin, 'a completed long-press drag does not activate its app link');
        await done(page);
    }

    await tools(page, '應用');
    await page.locator('#app-add-btn').click();
    await page.locator('#custom-app-name').fill('我的圖標');
    await page.locator('#custom-app-url').fill('javascript:alert(1)');
    await page.locator('#custom-app-submit').click();
    assert.equal(await page.locator('#custom-app-url').getAttribute('aria-invalid'), 'true');
    assert.equal(await page.locator('#custom-app-name').inputValue(), '我的圖標');
    await page.locator('#custom-app-url').fill('example.org/personal');
    await composingEnter(page, '#custom-app-name', true);
    assert.equal(await page.locator('.custom-app-modal').isVisible(), true);
    await page.locator('#custom-app-file').setInputFiles({ name: 'icon.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><rect width="160" height="120" fill="#b5d9e8"/><circle cx="60" cy="60" r="30" fill="#4b6c81"/></svg>') });
    await page.locator('.icon-crop-modal.is-visible [data-confirm]').waitFor({ state: 'visible' });
    await page.locator('.icon-crop-modal [data-zoom-in]').click();
    await page.locator('.icon-crop-modal [data-confirm]').click();
    await page.locator('.icon-crop-modal').waitFor({ state: 'hidden' });
    assert.match(await page.locator('#custom-app-icon-preview img').getAttribute('src'), /^data:image\/png/);
    await page.locator('#custom-app-submit').click();
    await page.locator('.custom-app-modal').waitFor({ state: 'hidden' });
    const customRow = page.locator('#app-list .list-row[data-custom-id]').filter({ hasText: '我的圖標' });
    const customId = await customRow.getAttribute('data-custom-id');
    await customRow.locator('.list-add').click();
    assert.equal(await page.evaluate(() => NewtabWidgets.isArranging()), false);
    const savedIcon = await page.locator('.app-tile[data-app-id="' + customId + '"] img').getAttribute('src');
    await reload(page);
    assert.equal(await page.locator('.app-tile[data-app-id="' + customId + '"] img').getAttribute('src'), savedIcon);
    assert.equal(await page.evaluate((id) => !!NewtabApps.get(id)?.cropMeta, customId), true);
    if (mobile) await page.locator('.app-tile[data-app-id="' + customId + '"]').tap();
    else await page.locator('.app-tile[data-app-id="' + customId + '"]').click();
    await page.waitForURL('https://example.org/personal', { waitUntil: 'domcontentloaded' });
    await ready(page);
    await tools(page, '應用');
    await page.locator('#app-list [data-delete-app="' + customId + '"]').click();
    await reload(page);
    assert.equal(await page.evaluate((id) => NewtabApps.get(id), customId), null);
    assert.equal(await page.locator('.app-tile[data-app-id="' + customId + '"]').count(), 0);
    console.log((mobile ? 'mobile' : 'desktop') + ': clock settings, folder lifecycle and custom icon upload/crop/navigation/removal passed');
}

(async () => {
    const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
    try {
        for (const mobile of [false, true]) {
            const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
                hasTouch: mobile, isMobile: mobile, reducedMotion: 'reduce' });
            await context.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() :
                route.request().isNavigationRequest() ? route.fulfill({ contentType: 'text/html', body: '<title>Test destination</title>' }) : route.abort());
            const page = await context.newPage();
            page.setDefaultTimeout(7000);
            const errors = [];
            page.on('pageerror', (error) => errors.push(error.message));
            await ready(page);
            await optionalWidgets(page, mobile);
            if (!mobile) {
                await boundaries(page);
                await resize(page);
            }
            assert.deepEqual(errors, [], 'widget actions have no uncaught exceptions');
            console.log((mobile ? 'mobile' : 'desktop') + ': optional widget editing, cancellation, persistence and input behavior passed');
            await context.close();

            const appContext = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, hasTouch: mobile, isMobile: mobile, reducedMotion: 'reduce' });
            await appContext.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() :
                route.request().isNavigationRequest() ? route.fulfill({ contentType: 'text/html', body: '<title>Test destination</title>' }) : route.abort());
            const appPage = await appContext.newPage();
            appPage.setDefaultTimeout(7000);
            const appErrors = [];
            appPage.on('pageerror', (error) => appErrors.push(error.message));
            await ready(appPage);
            await applications(appPage, mobile);
            assert.deepEqual(appErrors, [], 'launcher actions have no uncaught exceptions');
            await appContext.close();
        }
    } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
