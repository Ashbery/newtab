const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { chromium } = require('playwright');
const clean = value => JSON.parse(JSON.stringify(value));
function initial() {
    return { v: 4, companionMigrated: true, rail: { open: false, tab: 'personalize', width: 300 }, widgets: [
        { id: 'clock-1', type: 'clock', x: .1, y: .1, w: .3, h: .18, z: 1, options: { hour12: false } },
        { id: 'search-1', type: 'search', x: .1, y: .32, w: .4, h: .08, z: 2, options: {} },
        { id: 'notes-shared', type: 'notes', x: .56, y: .2, w: .22, h: .24, z: 3, options: { content: '原有筆記', appearance: { alpha: .3 } } },
        { id: 'todo-shared', type: 'todo', x: .56, y: .55, w: .22, h: .24, z: 4, options: { items: [{ text: '原有待辦', done: false }] } }
    ] };
}
function machine(shared = new Map([['nt_layout_v1', JSON.stringify(initial())]]), sessionId) {
    const events = {}, session = new Map(), writes = [];
    if (sessionId) session.set('nt_layout_active_profile_v1', sessionId);
    let failure = false, busy = false, layout;
    const storage = { get length() { return shared.size; }, key: i => [...shared.keys()][i] || null,
        getItem: key => shared.get(key) ?? null,
        setItem(key, value) { if (failure === true || typeof failure === 'function' && failure(key)) throw new Error('quota'); writes.push(key); shared.set(key, String(value)); },
        removeItem: key => shared.delete(key) };
    const window = { innerWidth: 1440, innerHeight: 900, localStorage: storage,
        sessionStorage: { getItem: key => session.get(key) ?? null, setItem: (key, value) => session.set(key, String(value)), removeItem: key => session.delete(key) },
        addEventListener: (name, fn) => { events[name] = fn; }, console };
    const context = vm.createContext({ window, console, setTimeout: () => 1, clearTimeout() {}, Date, JSON, Math });
    vm.runInContext(fs.readFileSync('js/layout-engine.js', 'utf8'), context);
    vm.runInContext(fs.readFileSync('js/layout-profiles.js', 'utf8'), context);
    const L = window.NewtabLayout, P = window.NewtabLayoutProfiles;
    layout = clean(L.loadLayout());
    P.attach({ getLayout: () => clean(layout), isBusy: () => busy, apply: next => { layout = clean(next); } });
    return { P, L, shared, writes, get layout() { return layout; }, set layout(value) { layout = clean(value); },
        save: () => L.saveLayout(layout), busy: value => { busy = value; }, fail: value => { failure = value; },
        external: key => events.storage({ key }), sync: () => P.check() };
}
function widget(m, id = 'notes-shared') { return m.layout.widgets.find(w => w.id === id); }

test('opt-in preserves the legacy bytes and isolates geometry and visible sets while sharing content', () => {
    const m = machine(), original = m.shared.get('nt_layout_v1');
    assert.equal(m.P.enable('screen-a', '左側').ok, true);
    widget(m).x = .61; widget(m).options.homeDesktop = { v: 3, columns: 14, col: 8, row: 1, width: 280, height: 200 };
    assert(m.save());
    assert(m.P.select('screen-b', '右側').ok);
    widget(m).x = .2; widget(m).options.homeDesktop.col = 2; widget(m).options.content = '兩個螢幕共用';
    m.layout.widgets = m.layout.widgets.filter(w => w.id !== 'todo-shared'); assert(m.save());
    m.P.select('screen-a');
    assert.equal(widget(m).x, .61); assert.equal(widget(m).options.homeDesktop.col, 8);
    assert.equal(widget(m).options.content, '兩個螢幕共用'); assert(widget(m, 'todo-shared'));
    m.P.select('screen-b'); assert.equal(widget(m).x, .2); assert(!widget(m, 'todo-shared'));
    assert.equal(m.shared.get('nt_layout_v1'), original);
    assert.equal(JSON.parse(m.shared.get('nt_layout_before_profiles_v1')).raw, original);
});

test('unrelated shared fields and separate screen records survive stale-tab saves', () => {
    const a = machine(); a.P.enable('a'); a.P.select('b'); a.P.select('a');
    const b = machine(a.shared, 'b');
    widget(a).options.content = '較新內容'; widget(a).x = .7; assert(a.save());
    widget(b).options.appearance.alpha = .8; widget(b).x = .25; assert(b.save());
    // Neither background flush writes the other tab's stale fields.
    assert(a.save()); assert(b.save());
    const aa = machine(a.shared, 'a'), bb = machine(a.shared, 'b');
    assert.equal(widget(aa).options.content, '較新內容'); assert.equal(widget(aa).options.appearance.alpha, .8);
    assert.equal(widget(aa).x, .7); assert.equal(widget(bb).x, .25);
    assert.equal(bb.P.getState().activeId, 'b');
});

test('same-profile stale saves do not resurrect hidden widgets or overwrite untouched placement', () => {
    const a = machine(); a.P.enable('a'); const b = machine(a.shared, 'a');
    widget(a).x = .72; a.layout.widgets = a.layout.widgets.filter(w => w.id !== 'todo-shared'); a.save();
    widget(b, 'clock-1').options.hour12 = true; b.save(); b.save();
    const result = machine(a.shared, 'a');
    assert.equal(widget(result).x, .72); assert(!widget(result, 'todo-shared'));
    assert.equal(widget(result, 'clock-1').options.hour12, true);
});

test('hidden widgets reuse shared notes and singleton settings when added back', () => {
    const m = machine(); m.P.enable('a'); widget(m).options.content = '仍在這裡'; m.save();
    m.layout.widgets = m.layout.widgets.filter(w => !['notes', 'clock'].includes(w.type)); m.save();
    const note = m.L.addWidget(m.layout, 'notes'); assert(note.ok); assert.equal(note.widget.id, 'notes-shared');
    assert.equal(note.widget.options.content, '仍在這裡');
    const clock = m.L.addWidget(note.layout, 'clock'); assert(clock.ok); assert.equal(clock.widget.options.hour12, false);
});

test('revealing shared content in a draft does not overwrite a newer edit from another screen', () => {
    const a = machine(); a.P.enable('a'); a.P.select('b');
    a.layout.widgets = a.layout.widgets.filter(w => w.id !== 'notes-shared'); a.save();
    const b = machine(a.shared, 'a');
    const added = a.L.addWidget(a.layout, 'notes'); a.layout = added.layout;
    widget(b).options.content = '加入草稿之後的更新'; b.save();
    a.save();
    assert.equal(widget(machine(a.shared, 'b')).options.content, '加入草稿之後的更新');
});

test('disable restores general geometry with current content and leaves saved profiles intact', () => {
    const m = machine(); m.P.enable('a'); widget(m).x = .7; widget(m).options.content = '啟用後更新'; m.save();
    assert(m.P.disable().ok); assert.equal(m.P.getState().activeId, null);
    assert.equal(widget(m).x, .56); assert.equal(widget(m).options.content, '啟用後更新');
    assert.equal(m.P.getState().profiles.length, 1); m.save();
    widget(m).options.content = '停用時更新'; m.save(); m.P.enable('a');
    assert.equal(widget(m).x, .7); assert.equal(widget(m).options.content, '停用時更新');
});

test('a pending screen change binds edits to its source and only switches after the draft settles', () => {
    const m = machine(); m.P.enable('a'); m.P.select('b'); m.P.select('a');
    m.busy(true); widget(m).x = .63; assert.equal(m.P.select('b').pending, true);
    assert.equal(m.P.getState().activeId, 'a'); assert.equal(m.P.getState().pendingId, 'b');
    m.save(); m.sync(); assert.equal(m.P.getState().activeId, 'a');
    m.busy(false); m.sync(); assert.equal(m.P.getState().activeId, 'b'); assert.equal(widget(m).x, .56);
    m.P.select('a'); assert.equal(widget(m).x, .63);
    m.busy(true); m.P.select('b'); m.P.select('a'); assert.equal(m.P.getState().pendingId, null);
});

test('stopping automatic detection cancels only its pending switch, never a manual or completed choice', () => {
    const m = machine(); m.P.enable('a'); m.busy(true);
    assert.equal(m.P.select('b', '自動', { owner: 'screen-auto' }).pending, true);
    assert.equal(m.P.getState().pendingOwner, 'screen-auto');
    assert.equal(m.P.cancelPending('screen-auto').cancelled, true);
    m.busy(false); m.sync(); assert.equal(m.P.getState().activeId, 'a');
    m.busy(true); m.P.select('b', '自動', { owner: 'screen-auto' }); m.P.select('manual-c', '手動');
    assert.equal(m.P.getState().pendingOwner, 'manual');
    assert.equal(m.P.cancelPending('screen-auto').cancelled, false);
    assert.equal(m.P.getState().pendingId, 'manual-c');
    m.busy(false); m.sync(); assert.equal(m.P.getState().activeId, 'manual-c');
    m.P.select('b', '自動', { owner: 'screen-auto' });
    assert.equal(m.P.cancelPending('screen-auto').cancelled, false);
    assert.equal(m.P.getState().activeId, 'b');
    const fresh = machine(); fresh.busy(true); fresh.P.enable('auto-a', '自動啟用', { owner: 'screen-auto' });
    fresh.P.cancelPending('screen-auto'); fresh.busy(false); fresh.sync();
    assert.equal(fresh.P.getState().enabled, false); assert.equal(fresh.P.getState().profiles.length, 0);
});

test('storage failure never reports a successful enable or replaces legacy data', () => {
    const m = machine(), original = m.shared.get('nt_layout_v1'); m.fail(true);
    assert.equal(m.P.enable('a').ok, false); assert.equal(m.P.getState().enabled, false);
    assert.equal(m.shared.get('nt_layout_v1'), original); m.fail(false); assert(m.P.enable('a').ok);
    m.fail(true); widget(m).options.content = '尚未存入'; assert.equal(m.save(), false);
    m.fail(false); assert(m.save()); const next = machine(m.shared, 'a'); assert.equal(widget(next).options.content, '尚未存入');
});

test('a deferred switch that cannot save stays on its source and reports the storage error', () => {
    const m = machine(); m.P.enable('a'); m.P.select('b'); m.P.select('a');
    m.busy(true); m.P.select('b'); widget(m).options.content = '本機草稿'; m.fail(true);
    m.busy(false); m.sync();
    assert.equal(m.P.getState().activeId, 'a'); assert.equal(m.P.getState().error, 'storage-unavailable');
    assert.equal(widget(m).options.content, '本機草稿');
    m.fail(false); assert(m.P.select('b').ok); m.P.select('a'); assert.equal(widget(m).options.content, '本機草稿');
});

test('retrying a first enable after a late quota failure uses the latest general contents', () => {
    const m = machine(); m.fail(key => key === 'nt_layout_profiles_v1');
    assert.equal(m.P.enable('a').ok, false); assert.equal(m.P.getState().enabled, false);
    m.fail(false); widget(m).options.content = '失敗之後繼續編輯';
    m.layout.widgets = m.layout.widgets.filter(w => w.id !== 'todo-shared'); m.save();
    assert(m.P.enable('a').ok); assert.equal(widget(m).options.content, '失敗之後繼續編輯'); assert(!widget(m, 'todo-shared'));
});

test('remote content changes are deferred while typing and merged before refreshing the view', () => {
    const a = machine(); a.P.enable('a'); const b = machine(a.shared, 'a');
    b.busy(true); widget(b).options.content = '正在輸入';
    widget(a).options.appearance.alpha = .7; a.save();
    const field = a.writes.findLast(key => key.startsWith('nt_layout_shared_v1:'));
    b.external(field); b.sync(); assert.equal(widget(b).options.content, '正在輸入');
    b.busy(false); b.sync(); assert.equal(widget(b).options.content, '正在輸入'); assert.equal(widget(b).options.appearance.alpha, .7);
});

const base = process.env.NEWTAB_TEST_URL || 'http://127.0.0.1:4174/';
let browser;
test.before(async () => {
    browser = await chromium.launch({ headless: true, executablePath: process.env.NEWTAB_BROWSER_PATH || 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe' });
});
test.after(async () => { if (browser) await browser.close(); });
async function fixture() {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.route(/^https?:\/\//, route => {
        const url = new URL(route.request().url());
        if (url.origin !== new URL(base).origin) return route.abort();
        if (url.pathname.includes('/assets/character/live2d/')) return route.fulfill({ status: 404, body: '' });
        // These acceptance cases supply explicit monitor IDs; display discovery
        // is independently tested and must not auto-select the host's screen.
        if (url.pathname.endsWith('/screen-layouts.js')) return route.fulfill({ contentType: 'text/javascript', body: '' });
        return route.continue();
    });
    await context.addInitScript(layout => {
        if (!sessionStorage.getItem('profile-fixture')) { localStorage.setItem('nt_layout_v1', JSON.stringify(layout)); sessionStorage.setItem('profile-fixture', '1'); }
        window.__geo = [];
        Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (success, error) => window.__geo.push({ success, error }) } });
    }, initial());
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(8000);
    await page.goto(base, { waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.NewtabWidgets && window.NewtabLayoutProfiles);
    assert.equal(await page.evaluate(() => NewtabLayoutProfiles.enable('screen-a', '螢幕 A').ok), true);
    return { context, page, errors };
}

test('browser: typing defers screen switching, commits shared notes, and reloads independent placement', async () => {
    const { context, page, errors } = await fixture();
    try {
        await page.evaluate(() => { NewtabLayoutProfiles.select('screen-b'); NewtabLayoutProfiles.select('screen-a'); });
        await page.getByRole('textbox', { name: '備註內容' }).fill('兩個螢幕看到相同筆記');
        assert.equal(await page.evaluate(() => NewtabLayoutProfiles.select('screen-b').pending), true);
        assert.equal(await page.evaluate(() => NewtabLayoutProfiles.getState().activeId), 'screen-a');
        await page.locator('#side-rail-tab').focus();
        await page.waitForFunction(() => NewtabLayoutProfiles.getState().activeId === 'screen-b');
        assert.equal(await page.getByRole('textbox', { name: '備註內容' }).inputValue(), '兩個螢幕看到相同筆記');
        await page.evaluate(() => NewtabWidgets.removeById('todo-shared'));
        await page.evaluate(() => NewtabLayoutProfiles.select('screen-a'));
        assert.equal(await page.locator('.widget[data-type=todo]').count(), 1);
        await page.evaluate(() => NewtabLayoutProfiles.select('screen-b'));
        await page.reload(); await page.waitForFunction(() => window.NewtabWidgets);
        assert.equal(await page.locator('.widget[data-type=todo]').count(), 0);
        assert.equal(await page.getByRole('textbox', { name: '備註內容' }).inputValue(), '兩個螢幕看到相同筆記');
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('browser: Done and Cancel finish the source draft before applying the pending screen', async () => {
    const { context, page, errors } = await fixture();
    try {
        await page.evaluate(() => { NewtabLayoutProfiles.select('screen-b'); NewtabLayoutProfiles.select('screen-a'); NewtabWidgets.enterArrange(); });
        const original = await page.evaluate(() => NewtabWidgets.getLayout());
        await page.evaluate(() => { NewtabWidgets.removeById('todo-shared'); NewtabLayoutProfiles.select('screen-b'); });
        assert.equal(await page.evaluate(() => NewtabLayoutProfiles.getState().activeId), 'screen-a');
        await page.locator('#arrange-cancel').click();
        await page.waitForFunction(() => NewtabLayoutProfiles.getState().activeId === 'screen-b');
        await page.evaluate(() => NewtabLayoutProfiles.select('screen-a'));
        assert.equal(await page.locator('.widget[data-type=todo]').count(), 1);
        await page.evaluate(() => { NewtabWidgets.enterArrange(); NewtabWidgets.removeById('todo-shared'); NewtabLayoutProfiles.select('screen-b'); });
        await page.locator('#arrange-done-bar').click(); await page.waitForFunction(() => NewtabLayoutProfiles.getState().activeId === 'screen-b');
        assert.equal(await page.locator('.widget[data-type=todo]').count(), 1);
        await page.evaluate(() => NewtabLayoutProfiles.select('screen-a')); assert.equal(await page.locator('.widget[data-type=todo]').count(), 0);
        assert.equal(original.widgets.find(w => w.type === 'notes').options.content, await page.getByRole('textbox', { name: '備註內容' }).inputValue());
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('browser: a late location callback from the previous screen cannot update the new view', async () => {
    const { context, page, errors } = await fixture();
    try {
        await page.evaluate(() => { NewtabLayoutProfiles.select('screen-b'); NewtabLayoutProfiles.select('screen-a'); NewtabWidgets.removeById('todo-shared'); NewtabWidgets.removeById('notes-shared'); NewtabWidgets.addFromCatalog('weather'); });
        await page.waitForFunction(() => window.__geo.length === 1);
        await page.evaluate(() => NewtabLayoutProfiles.select('screen-b'));
        assert.equal(await page.locator('.widget[data-type=weather]').count(), 0);
        await page.evaluate(() => window.__geo[0].success({ coords: { latitude: 35, longitude: 139 } }));
        await page.evaluate(() => NewtabLayoutProfiles.select('screen-a'));
        await page.waitForFunction(() => window.__geo.length === 2);
        const weather = await page.evaluate(() => NewtabWidgets.getLayout().widgets.find(w => w.type === 'weather'));
        assert.equal(weather.options.lat, null); assert.equal(weather.options.lon, null);
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('browser: another tab refreshes shared content without changing its selected profile', async () => {
    const { context, page, errors } = await fixture();
    try {
        await page.evaluate(() => { NewtabWidgets.addFromCatalog('companion'); NewtabLayoutProfiles.select('screen-b'); NewtabLayoutProfiles.select('screen-a'); });
        const second = await context.newPage(); await second.goto(base, { waitUntil: 'domcontentloaded' }); await second.waitForFunction(() => window.NewtabWidgets);
        await second.evaluate(() => NewtabLayoutProfiles.select('screen-b'));
        await second.evaluate(() => { window.__retainedCharacter = document.querySelector('.companion-widget-body'); window.__retainedTodo = document.querySelector('.todo-body'); });
        await page.getByRole('textbox', { name: '備註內容' }).fill('跨分頁同步內容'); await page.locator('#side-rail-tab').focus();
        await second.waitForFunction(() => document.querySelector('.notes-body textarea').value === '跨分頁同步內容');
        assert.equal(await second.evaluate(() => NewtabLayoutProfiles.getState().activeId), 'screen-b');
        assert.equal(await second.evaluate(() => window.__retainedCharacter === document.querySelector('.companion-widget-body') && window.__retainedTodo === document.querySelector('.todo-body')), true, 'unrelated mounted content is not restarted by a shared note update');
        await second.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        await page.reload(); await page.waitForFunction(() => window.NewtabWidgets);
        assert.equal(await page.getByRole('textbox', { name: '備註內容' }).inputValue(), '跨分頁同步內容'); assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('browser: reset affects only the active layout and retains shared settings and hidden content', async () => {
    const { context, page, errors } = await fixture();
    try {
        await page.evaluate(() => { NewtabWidgets.setClockHour12(true); NewtabLayoutProfiles.select('screen-b'); NewtabWidgets.resetLayout(); });
        assert.equal(await page.locator('.widget[data-type=notes]').count(), 0);
        assert.equal(await page.evaluate(() => NewtabWidgets.getLayout().widgets.find(w => w.type === 'clock').options.hour12), true);
        await page.evaluate(() => NewtabLayoutProfiles.select('screen-a'));
        assert.equal(await page.getByRole('textbox', { name: '備註內容' }).inputValue(), '原有筆記');
        await page.evaluate(() => NewtabLayoutProfiles.select('screen-b'));
        await page.evaluate(() => { NewtabWidgets.removeById('companion-1'); NewtabWidgets.addFromCatalog('notes'); });
        assert.equal(await page.getByRole('textbox', { name: '備註內容' }).inputValue(), '原有筆記');
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('browser: a held drag keeps its source profile and the exact preview survives screen roundtrip', async () => {
    const { context, page, errors } = await fixture();
    try {
        await page.evaluate(() => { NewtabLayoutProfiles.select('screen-b'); NewtabLayoutProfiles.select('screen-a'); NewtabWidgets.enterArrange(); });
        const note = page.locator('.widget[data-id="notes-shared"]'), before = await note.boundingBox();
        await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2); await page.mouse.down(); await page.waitForTimeout(620);
        assert.equal(await page.evaluate(() => NewtabLayoutProfiles.select('screen-b').pending), true);
        await page.mouse.move(before.x + before.width / 2 + 120, before.y + before.height / 2 + 52, { steps: 8 });
        const preview = await page.locator('#home-drop-preview').evaluate(el => ({ state: el.dataset.state, x: parseFloat(el.style.left), y: parseFloat(el.style.top), width: parseFloat(el.style.width), height: parseFloat(el.style.height) }));
        assert.equal(preview.state, 'place'); await page.mouse.up();
        assert.equal(await page.evaluate(() => NewtabLayoutProfiles.getState().activeId), 'screen-a');
        await page.locator('#arrange-done-bar').click(); await page.waitForFunction(() => NewtabLayoutProfiles.getState().activeId === 'screen-b');
        const b = await note.boundingBox(); assert.equal(b.x, before.x); assert.equal(b.y, before.y);
        await page.evaluate(() => NewtabLayoutProfiles.select('screen-a')); const after = await note.boundingBox();
        for (const key of ['x', 'y', 'width', 'height']) assert(Math.abs(after[key] - preview[key]) < .1, 'screen A restores its exact ' + key);
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('browser: appearance and custom-app dialogs hold a pending screen until they close', async () => {
    const { context, page, errors } = await fixture();
    try {
        await page.evaluate(() => { NewtabLayoutProfiles.select('screen-b'); NewtabLayoutProfiles.select('screen-a'); NewtabAppearance.openWidget('clock-1'); });
        assert.equal(await page.evaluate(() => NewtabLayoutProfiles.select('screen-b').pending), true);
        await page.keyboard.press('Escape'); await page.waitForFunction(() => NewtabLayoutProfiles.getState().activeId === 'screen-b');
        await page.evaluate(() => { NewtabSideRail.open(); NewtabSideRail.setTab('apps'); });
        await page.getByRole('button', { name: '新增自訂應用', exact: true }).click();
        // Even after moving focus from a textbox, the non-native modal owns the interaction.
        await page.locator('.custom-app-modal-close').focus();
        assert.equal(await page.evaluate(() => NewtabLayoutProfiles.select('screen-a').pending), true);
        await page.locator('.custom-app-modal-close').click();
        await page.waitForFunction(() => NewtabLayoutProfiles.getState().activeId === 'screen-a');
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});
