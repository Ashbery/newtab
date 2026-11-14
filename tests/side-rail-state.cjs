// Isolated fixtures: no personal profile, permissions, account, or live APIs.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = process.env.NEWTAB_TEST_URL || 'http://127.0.0.1:4174/';
const legacy = {
    v: 4, companionMigrated: true, rail: { open: true, tab: 'about', width: 320 },
    widgets: [
        { id: 'clock-1', type: 'clock', x: .1, y: .1, w: .25, h: .15, z: 1, options: { hour12: true } },
        { id: 'notes-kept', type: 'notes', x: .5, y: .3, w: .25, h: .25, z: 2,
            options: { content: '保留筆記', appearance: { alpha: .43, tint: '#d4e7ef' } } }
    ]
};
async function pageIn(context) {
    const page = await context.newPage();
    await page.addInitScript(seed => {
        if (!localStorage.getItem('nt_layout_v1')) localStorage.setItem('nt_layout_v1', JSON.stringify(seed));
        window._railStorageWrites = [];
        const set = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
            if (this === localStorage) _railStorageWrites.push(key);
            return set.call(this, key, value);
        };
    }, legacy);
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.classList.contains('nt-ready') && window.NewtabSideRail);
    return page;
}
async function railState(page) {
    return page.evaluate(() => ({ open: NewtabSideRail.isOpen(), body: document.body.classList.contains('side-rail-open'),
        inert: document.querySelector('#side-rail').inert,
        selected: document.querySelector('.side-rail-tabs [aria-selected=true]').dataset.panel }));
}
async function closedFresh(page) {
    assert.deepEqual(await railState(page), { open: false, body: false, inert: true, selected: 'personalize' });
}
async function unchangedWidgets(page, expected) {
    assert.deepEqual(await page.evaluate(() => NewtabWidgets.getLayout().widgets), expected);
}
(async () => {
    const browser = await chromium.launch({ executablePath: process.env.NEWTAB_BROWSER_PATH || 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe', headless: true });
    try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
        await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
        const a = await pageIn(context);
        await closedFresh(a);
        assert.equal(await a.evaluate(() => localStorage.getItem('nt_layout_v1')), JSON.stringify(legacy), 'startup does not migrate or erase saved layout bytes');
        const widgets = await a.evaluate(() => NewtabWidgets.getLayout().widgets);
        await a.evaluate(() => { _railStorageWrites.length = 0; NewtabSideRail.open(); NewtabSideRail.setTab('apps'); });
        assert.deepEqual(await a.evaluate(() => _railStorageWrites), [], 'opening and switching panels writes no durable state');
        assert.equal((await railState(a)).selected, 'apps');
        assert.equal((await railState(a)).open, true);
        await unchangedWidgets(a, widgets);
        console.log('PASS legacy open/tab ignored; current-page interactions persist nothing');

        await a.reload({ waitUntil: 'domcontentloaded' });
        await a.waitForFunction(() => document.documentElement.classList.contains('nt-ready'));
        await closedFresh(a); await unchangedWidgets(a, widgets);
        await a.evaluate(() => { NewtabSideRail.open(); NewtabSideRail.setTab('about'); });
        const b = await pageIn(context); await closedFresh(b); await unchangedWidgets(b, widgets);
        assert.equal((await railState(a)).open, true, 'opening another page leaves this page alone');
        assert.equal((await railState(a)).selected, 'about');
        console.log('PASS reload and another tab start closed, preserving saved widget data');

        await a.evaluate(() => { NewtabLayoutProfiles.enable('screen-a', '螢幕A'); NewtabLayoutProfiles.select('screen-b', '螢幕B'); NewtabLayoutProfiles.select('screen-a'); });
        await b.waitForFunction(() => NewtabLayoutProfiles.getState().enabled);
        await closedFresh(b);
        assert.equal((await railState(a)).open, true);
        assert.equal((await railState(a)).selected, 'about', 'profile switching does not change the current page panel');
        await a.evaluate(() => NewtabWidgets.setAppearance('notes-kept', { alpha: .71 }));
        await b.waitForFunction(() => NewtabWidgets.getLayout().widgets.find(w => w.id === 'notes-kept').options.appearance.alpha === .71);
        await closedFresh(b);
        await a.evaluate(() => { _railStorageWrites.length = 0; NewtabSideRail.setTab('components'); NewtabSideRail.close(); });
        assert.deepEqual(await a.evaluate(() => _railStorageWrites), [], 'profile mode panel interactions also persist nothing');
        await closedFresh(b);
        console.log('PASS profile changes and cross-tab content synchronization never reopen or switch panels');

        await a.evaluate(() => { NewtabSideRail.open(); NewtabSideRail.setTab('apps'); });
        await a.reload({ waitUntil: 'domcontentloaded' });
        await a.waitForFunction(() => document.documentElement.classList.contains('nt-ready'));
        await closedFresh(a);
        assert.equal(await a.evaluate(() => NewtabLayoutProfiles.getState().activeId), 'screen-a');
        assert.equal(await a.evaluate(() => NewtabWidgets.getLayout().widgets.find(w => w.id === 'notes-kept').options.appearance.alpha), .71);
        assert.equal(await a.evaluate(() => NewtabWidgets.getLayout().widgets.find(w => w.id === 'notes-kept').options.content), '保留筆記');
        assert.equal(await a.evaluate(() => NewtabWidgets.getLayout().widgets.find(w => w.id === 'clock-1').options.hour12), true);
        console.log('PASS profile reload resets transient rail state while retaining profile and preferences');
        await context.close();
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
