// Window Management lifecycle fixtures in isolated Brave. No private profile,
// real screen permission, account, location, or network service is accessed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const base = process.env.NEWTAB_TEST_URL || 'http://127.0.0.1:4174/';
const output = path.resolve('.impeccable/review/screen-layouts');
fs.mkdirSync(output, { recursive: true });
function fixture(options) {
    const monitors = options.monitors || [0, 1920].map(left => ({ label: 'Twin display', left, top: 0, width: 1920, height: 1080, isInternal: false }));
    const details = new EventTarget(); details.screens = monitors.map(value => ({ ...value })); details.currentScreen = details.screens[options.current || 0];
    const permission = new EventTarget(); permission.state = options.permission || 'prompt';
    let calls = 0, queries = 0, deferred = null;
    const state = window._screenFixture = {
        details, permission,
        get calls() { return calls; }, get queries() { return queries; },
        current(index) { details.currentScreen = details.screens[index]; details.dispatchEvent(new Event('currentscreenchange')); },
        replace(next, index = 0) { details.screens = next.map(value => ({ ...value })); details.currentScreen = details.screens[index]; details.dispatchEvent(new Event('screenschange')); },
        revoke() { permission.state = 'denied'; if (permission.onchange) permission.onchange(); permission.dispatchEvent(new Event('change')); },
        grant() { permission.state = 'granted'; },
        hold() { deferred = {}; deferred.promise = new Promise(resolve => { deferred.resolve = resolve; }); },
        release() { deferred.resolve(); deferred = null; }
    };
    Object.defineProperty(document, 'permissionsPolicy', { configurable: true, value: { allowsFeature: () => !options.blocked } });
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: async () => { queries++; return permission; } } });
    Object.defineProperty(window, 'getScreenDetails', { configurable: true, value: options.unsupported ? undefined : async () => {
        calls++; if (deferred) await deferred.promise;
        if (options.reject || permission.state === 'denied') throw new DOMException('Fixture permission denied', 'NotAllowedError');
        permission.state = 'granted'; return details;
    } });
}
async function boot(browser, options = {}, existing) {
    const context = existing || await browser.newContext({ viewport: options.viewport || { width: 1440, height: 900 }, serviceWorkers: 'block', reducedMotion: options.reducedMotion || 'no-preference', hasTouch: !!options.touch });
    if (!existing) await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    const page = await context.newPage(); await page.addInitScript(fixture, options);
    const errors = []; page.on('pageerror', error => errors.push(String(error)));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.screen-layouts', { state: 'attached' });
    await page.evaluate(() => { NewtabSideRail.open(); NewtabSideRail.setTab('personalize'); });
    await page.waitForTimeout(650);
    await page.locator('.screen-layouts').scrollIntoViewIfNeeded();
    return { context, page, errors };
}
const state = page => page.evaluate(() => ({ profile: NewtabLayoutProfiles.getState(), screen: NewtabScreenLayouts.getState(), calls: _screenFixture.calls, queries: _screenFixture.queries,
    saved: JSON.parse(localStorage.getItem('nt_screen_layouts_v1')) }));
async function enabled(page) { await page.waitForFunction(() => NewtabLayoutProfiles.getState().enabled && !NewtabLayoutProfiles.getState().pendingId); }
async function activate(page) { await page.locator('.screen-layouts-auto').click(); await enabled(page); await page.waitForFunction(() => !NewtabScreenLayouts.getState().busy); }
(async () => {
    const browser = await chromium.launch({ executablePath: process.env.BRAVE_PATH || 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe', headless: true });
    const passed = [];
    async function test(name, fn) { if (process.env.SCREEN_TEST_FILTER && !new RegExp(process.env.SCREEN_TEST_FILTER).test(name)) return; await fn(); passed.push(name); console.log('PASS ' + name); }
    try {
        await test('explicit permission, equal-resolution display identity, and event-only switching', async () => {
            const { context, page, errors } = await boot(browser);
            assert.equal((await state(page)).calls, 0); assert.equal((await state(page)).queries, 0);
            await activate(page); const first = await state(page);
            assert.equal(first.saved.screens.length, 2); assert.equal(new Set(first.saved.screens.map(x => x.profileId)).size, 2);
            await page.evaluate(() => _screenFixture.current(1));
            await page.waitForFunction(id => NewtabLayoutProfiles.getState().activeId !== id, first.profile.activeId);
            const second = await state(page); assert.equal(second.profile.profiles.length, 2);
            await page.evaluate(() => _screenFixture.current(0));
            await page.waitForFunction(id => NewtabLayoutProfiles.getState().activeId === id, first.profile.activeId);
            assert.equal((await state(page)).calls, 1, 'events do not request screen data repeatedly');
            assert.deepEqual(errors, []); await context.close();
        });
        await test('two fresh simultaneous tabs converge on one association per display', async () => {
            const { context, page: a } = await boot(browser);
            const { page: b } = await boot(browser, {}, context);
            await Promise.all([a, b].map(page => page.evaluate(() => { _screenFixture.hold(); NewtabScreenLayouts.enableAuto(); })));
            await Promise.all([a, b].map(page => page.evaluate(() => _screenFixture.release())));
            await Promise.all([a, b].map(enabled));
            await a.waitForTimeout(200);
            const left = await state(a), right = await state(b);
            assert.equal(left.profile.activeId, right.profile.activeId);
            assert.equal(left.profile.profiles.length, 1); assert.equal(right.profile.profiles.length, 1);
            assert.equal(left.saved.screens.length, 2); assert.deepEqual(left.saved.screens, right.saved.screens);
            await Promise.all([a, b].map(page => page.evaluate(() => _screenFixture.current(1))));
            await a.waitForFunction(() => NewtabLayoutProfiles.getState().profiles.length === 2);
            assert.equal((await state(a)).profile.activeId, (await state(b)).profile.activeId);
            await context.close();
        });
        await test('startup resumes only an already granted permission; revocation clears old objects', async () => {
            const { context, page } = await boot(browser, { permission: 'granted' });
            await activate(page); const id = (await state(page)).profile.activeId;
            await page.reload({ waitUntil: 'domcontentloaded' }); await enabled(page);
            await page.waitForFunction(() => _screenFixture.calls === 1 && NewtabScreenLayouts.getState().auto);
            assert.equal((await state(page)).profile.activeId, id);
            await page.evaluate(() => _screenFixture.revoke());
            assert.equal((await state(page)).screen.auto, false);
            assert.equal(await page.locator('[data-screen-bind]').evaluate(el => el.hidden), true);
            await page.evaluate(() => { _screenFixture.current(1); document.querySelector('[data-screen-bind]').click(); });
            assert.equal((await state(page)).profile.activeId, id); assert.equal((await state(page)).screen.auto, false);
            await page.evaluate(() => { _screenFixture.grant(); return NewtabScreenLayouts.enableAuto(); });
            await page.waitForFunction(old => NewtabLayoutProfiles.getState().activeId !== old, id);
            assert.equal((await state(page)).calls, 2);
            await context.close();
            const prompt = await boot(browser);
            await activate(prompt.page); await prompt.page.reload({ waitUntil: 'domcontentloaded' });
            await prompt.page.waitForSelector('.screen-layouts', { state: 'attached' });
            await prompt.page.waitForFunction(() => NewtabScreenLayouts.getState().reason === 'permission');
            assert.equal((await state(prompt.page)).calls, 0, 'reload never prompts when permission is prompt');
            await prompt.context.close();
        });
        await test('ambiguous rearrangement retains the chosen layout until explicit binding', async () => {
            const { context, page } = await boot(browser); await activate(page);
            const before = await state(page);
            await page.evaluate(() => _screenFixture.replace([100, 2020].map(left => ({ label: 'Twin display', left, top: 0, width: 1920, height: 1080, isInternal: false }))));
            await page.waitForFunction(() => NewtabScreenLayouts.getState().reason === 'ambiguous');
            const after = await state(page); assert.equal(after.profile.activeId, before.profile.activeId); assert.deepEqual(after.saved.screens, before.saved.screens);
            await page.locator('[data-screen-bind]').click();
            await page.waitForFunction(() => NewtabScreenLayouts.getState().reason === '');
            assert.equal((await state(page)).profile.activeId, before.profile.activeId);
            assert.equal((await state(page)).saved.screens.find(x => x.profileId === before.profile.activeId).screen.left, 100);
            await context.close();
        });
        for (const action of ['manual stop', 'permission revocation']) await test(action + ' cancels only the queued automatic switch before Done', async () => {
            const { context, page } = await boot(browser, { reducedMotion: 'reduce' }); await activate(page);
            const initial = (await state(page)).profile.activeId;
            await page.locator('#arrange-home').click();
            await page.evaluate(() => _screenFixture.current(1));
            await page.waitForFunction(() => NewtabLayoutProfiles.getState().pendingOwner === 'screen-auto');
            if (action === 'manual stop') {
                await page.evaluate(() => NewtabSideRail.open());
                await page.locator('.screen-layouts-auto').click();
            } else await page.evaluate(() => _screenFixture.revoke());
            assert.equal((await state(page)).profile.pendingId, null); assert.equal((await state(page)).screen.auto, false);
            await page.evaluate(() => NewtabSideRail.close()); await page.locator('#arrange-done-bar').click();
            await page.waitForTimeout(250); assert.equal((await state(page)).profile.activeId, initial);
            // A later explicit manual request remains valid even if another stop
            // or permission notification arrives while arrangement is pending.
            await page.evaluate(() => NewtabSideRail.open()); await page.locator('#arrange-home').click();
            await page.evaluate(() => NewtabSideRail.open()); await page.locator('[data-screen-new]').click();
            await page.waitForFunction(() => NewtabLayoutProfiles.getState().pendingOwner === 'manual');
            const manualId = (await state(page)).profile.pendingId;
            await page.evaluate(action => action === 'manual stop' ? NewtabScreenLayouts.disableAuto() : _screenFixture.revoke(), action);
            assert.equal((await state(page)).profile.pendingId, manualId);
            await page.evaluate(() => NewtabSideRail.close()); await page.locator('#arrange-done-bar').click();
            await page.waitForFunction(id => NewtabLayoutProfiles.getState().activeId === id, manualId);
            await context.close();
        });
        await test('a stop in another tab invalidates an unresolved permission request', async () => {
            const { context, page: a } = await boot(browser, { reducedMotion: 'reduce' });
            const { page: b } = await boot(browser, { reducedMotion: 'reduce' }, context);
            // Persist false first: a repeated stop must still notify the other
            // tab rather than being swallowed as an unchanged localStorage value.
            await b.evaluate(() => NewtabScreenLayouts.disableAuto());
            await a.waitForFunction(() => localStorage.getItem('nt_screen_layouts_v1') !== null);
            await a.evaluate(() => { _screenFixture.hold(); NewtabScreenLayouts.enableAuto(); });
            assert.equal((await state(a)).screen.busy, true);
            await b.evaluate(() => NewtabScreenLayouts.disableAuto());
            await a.waitForFunction(() => !NewtabScreenLayouts.getState().busy);
            await a.evaluate(() => _screenFixture.release()); await a.waitForTimeout(250);
            const result = await state(a); assert.equal(result.screen.auto, false); assert.equal(result.saved.auto, false); assert.equal(result.profile.enabled, false);
            await context.close();
        });
        await test('manual fallback, naming, switching, and saved layouts remain available without permission', async () => {
            for (const mode of [{ blocked: true }, { unsupported: true }]) {
                const { context, page } = await boot(browser, mode);
                assert((await state(page)).screen.reason);
                await page.locator('.screen-layouts-enable').click(); await enabled(page);
                const first = (await state(page)).profile.activeId;
                await page.locator('#screen-layouts-name').fill('工作螢幕'); await page.locator('.screen-layouts-name button').click();
                assert.equal((await state(page)).profile.profiles[0].name, '工作螢幕');
                await page.locator('[data-screen-new]').click(); await enabled(page);
                const next = (await state(page)).profile.activeId; assert.notEqual(first, next);
                await page.locator('#screen-layouts-select').focus(); await page.locator('#screen-layouts-select').selectOption(first);
                await page.waitForFunction(id => NewtabLayoutProfiles.getState().activeId === id, first);
                await page.locator('.screen-layouts-enable').click();
                await page.waitForFunction(() => !NewtabLayoutProfiles.getState().enabled);
                assert.equal((await state(page)).profile.profiles.length, 2); assert.equal((await state(page)).calls, 0);
                await context.close();
            }
        });
        await test('continuous reversible disclosure and native keyboard controls at four sizes', async () => {
            for (const [width, height] of [[320, 480], [390, 600], [1440, 900], [3440, 1440]]) {
                const { context, page, errors } = await boot(browser, { viewport: { width, height }, touch: width < 500 });
                await page.locator('#screen-layouts-enabled').focus(); await page.keyboard.press('Space'); await enabled(page);
                await page.waitForTimeout(650);
                const measurements = await page.locator('.screen-layouts').evaluate(el => ({ width: el.getBoundingClientRect().width, scroll: el.scrollWidth,
                    targets: [...el.querySelectorAll('button,select,input:not([type=checkbox])')].filter(node => !node.hidden).map(node => node.getBoundingClientRect().height) }));
                assert(measurements.scroll <= Math.ceil(measurements.width)); assert(measurements.targets.every(h => h >= 44));
                const continuity = await page.evaluate(async () => {
                    const checkbox = document.querySelector('#screen-layouts-enabled'), content = document.querySelector('.screen-layouts-fields');
                    checkbox.click(); const closed = { hidden: content.hidden, inert: content.inert };
                    await new Promise(resolve => setTimeout(resolve, 80));
                    const before = content.getBoundingClientRect().height; checkbox.click();
                    return { closed, before, after: content.getBoundingClientRect().height, inert: content.inert };
                });
                assert.deepEqual(continuity.closed, { hidden: false, inert: true }); assert.equal(continuity.inert, false);
                assert(Math.abs(continuity.before - continuity.after) < .1, 'reverse starts at current height');
                await page.waitForTimeout(650); await page.locator('.screen-layouts').scrollIntoViewIfNeeded();
                await page.screenshot({ path: path.join(output, `screen-layouts-${width}.png`) }); assert.deepEqual(errors, []);
                await context.close();
            }
        });
        await test('reduced motion lands disclosure immediately without hidden focusable fields', async () => {
            const { context, page } = await boot(browser, { reducedMotion: 'reduce' });
            await page.locator('.screen-layouts-enable').click(); await enabled(page);
            assert.equal(await page.locator('.screen-layouts-fields').evaluate(el => el.hidden || el.inert), false);
            await page.locator('.screen-layouts-enable').click();
            await page.waitForFunction(() => document.querySelector('.screen-layouts-fields').hidden);
            assert.equal(await page.locator('.screen-layouts-fields').evaluate(el => el.inert), true);
            await context.close();
        });
        fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ passed }, null, 2));
        console.log(`${passed.length}/${passed.length} screen layout groups passed`);
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
