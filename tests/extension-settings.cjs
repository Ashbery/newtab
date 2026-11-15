// Real isolated Brave extension; no personal profile, accounts, or public APIs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const extension = process.env.NEWTAB_EXTENSION_PATH || path.join(root, 'extension');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nacho-settings-'));
const executablePath = process.env.NEWTAB_BROWSER_PATH || 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe';
const out = path.join(root, '.impeccable/review/extension-weather-20261116'); fs.mkdirSync(out, { recursive: true });
async function launch() {
    const context = await chromium.launchPersistentContext(profile, { headless: true, executablePath, viewport: { width: 352, height: 640 },
        ignoreDefaultArgs: ['--disable-extensions'], args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension] });
    await context.route('https://ashbery.github.io/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><input id="bg-file" type="file"><h1>Fixture</h1></body></html>' }));
    await context.route('https://example.test/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Other page</title>Other page' }));
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id = worker.url().split('/')[2];
    const popup = await context.newPage(); await popup.goto('chrome-extension://' + id + '/popup.html');
    await popup.waitForFunction(() => !document.getElementById('keepAliveToggle').disabled);
    return { context, worker, id, popup };
}
async function message(page, action, values = {}) { return page.evaluate(({ action, values }) => chrome.runtime.sendMessage({ action, ...values }), { action, values }); }
async function tabFor(worker, page, url) {
    const before = await worker.evaluate(() => chrome.tabs.query({}).then(tabs => tabs.map(tab => tab.id)));
    const newPage = await page.context().newPage(); await newPage.goto(url);
    const tab = await worker.evaluate(ids => chrome.tabs.query({}).then(tabs => tabs.find(tab => !ids.includes(tab.id))), before);
    return { page: newPage, id: tab.id };
}
async function tabState(worker, id) { return worker.evaluate(id => chrome.tabs.get(id), id); }
(async () => {
    let context;
    try {
        let run = await launch(); context = run.context;
        const { worker, popup } = run;
        assert.equal(await popup.getByRole('checkbox', { name: '保留新分頁', exact: true }).count(), 1);
        const errors = []; popup.on('pageerror', error => errors.push(error.message));
        const keep = { activationCount: 17, startTime: 123456789, lastActivation: 123456790 };
        await worker.evaluate(stats => chrome.storage.local.set({ keepAliveEnabled: true, activationStats: stats,
            customVideo: 'original-media', videoName: '原本影片', videoType: 'base64', marker: 'keep' }), keep);
        await popup.waitForFunction(() => document.getElementById('keepAliveToggle').checked);
        const native = await tabFor(worker, popup, 'chrome://newtab/');
        await native.page.frameLocator('#newtab-frame').locator('h1').waitFor();
        await popup.waitForFunction(async () => (await chrome.runtime.sendMessage({ action: 'getExtensionState' })).state.protectedCount >= 1);
        assert.equal((await tabState(worker, native.id)).autoDiscardable, false);
        const ordinary = await tabFor(worker, popup, 'https://example.test/ordinary');
        assert.equal((await tabState(worker, ordinary.id)).autoDiscardable, true, 'other websites are never protected');
        await popup.screenshot({ path: path.join(out, 'popup-blue.png'), fullPage: true });
        await popup.locator('label:has(#keepAliveToggle)').click();
        await popup.waitForFunction(() => !document.getElementById('keepAliveToggle').checked && !document.getElementById('keepAliveToggle').disabled);
        assert.equal((await tabState(worker, native.id)).autoDiscardable, true, 'disabling restores tabs owned by this extension');
        const external = await tabFor(worker, popup, 'https://ashbery.github.io/newtab/external');
        await worker.evaluate(id => chrome.tabs.update(id, { autoDiscardable: false }), external.id);
        await popup.locator('label:has(#keepAliveToggle)').click();
        await popup.waitForFunction(() => document.getElementById('keepAliveToggle').checked && !document.getElementById('keepAliveToggle').disabled);
        await native.page.goto('https://example.test/left-newtab');
        await popup.waitForFunction(async id => (await chrome.tabs.get(id)).autoDiscardable, native.id);
        assert.equal((await tabState(worker, native.id)).autoDiscardable, true, 'leaving the new tab restores its original discard policy');
        await popup.locator('label:has(#keepAliveToggle)').click();
        await popup.waitForFunction(() => !document.getElementById('keepAliveToggle').checked && !document.getElementById('keepAliveToggle').disabled);
        assert.equal((await tabState(worker, external.id)).autoDiscardable, false, 'does not undo a policy that another owner already set');
        assert.deepEqual(await worker.evaluate(() => chrome.alarms.getAll()), [], 'no legacy or replacement keepalive alarms');
        console.log('PASS retained setting, actual new-tab protection, disable/navigation restore, other websites and ownership');

        for (const theme of ['knit', 'ribbon', 'blue']) {
            await popup.locator('label:has(input[value="' + theme + '"])').click();
            await popup.waitForFunction(theme => document.getElementById('portrait').src.includes('nacho-' + theme + '-') && !document.getElementById('keepAliveToggle').disabled, theme);
            assert.equal(await worker.evaluate(() => chrome.storage.local.get('nachoIconTheme').then(value => value.nachoIconTheme)), theme);
            assert.equal(await popup.locator('#portrait').evaluate(image => image.complete && image.naturalWidth === 512), true);
            await popup.screenshot({ path: path.join(out, 'popup-' + theme + '.png'), fullPage: true });
        }
        const manifest = await worker.evaluate(() => chrome.runtime.getManifest());
        assert.deepEqual(manifest.host_permissions, ['https://ashbery.github.io/*']);
        assert(!manifest.permissions.includes('idle') && !manifest.permissions.includes('background') && !manifest.permissions.includes('power'));
        await external.page.evaluate(() => window.postMessage({ type: 'FROM_PAGE', action: 'updateKeepAliveSetting', enabled: true }, location.origin));
        await popup.waitForTimeout(50);
        assert.equal((await message(popup, 'getExtensionState')).state.enabled, false, 'a webpage cannot change retention settings through the media bridge');
        const saved = await worker.evaluate(() => chrome.storage.local.get(null));
        assert.deepEqual(saved.activationStats, keep);
        assert.equal(saved.customVideo, 'original-media'); assert.equal(saved.marker, 'keep');
        assert.equal(saved.lastHeartbeat, undefined); assert.equal(saved.keepAlive_primary, undefined);
        assert.deepEqual(errors, []);
        console.log('PASS three icon choices, scope/permissions, legacy stats/media preservation and zero heartbeat writes');

        await popup.setViewportSize({ width: 320, height: 640 });
        await popup.emulateMedia({ reducedMotion: 'reduce' });
        await popup.locator('label:has(input[value="knit"])').click();
        await popup.waitForFunction(() => !document.getElementById('keepAliveToggle').disabled);
        assert.equal(await popup.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        assert((await popup.locator('body').boundingBox()).height <= 600, 'popup fits the browser action height without a footer scroll');
        assert.equal(await popup.evaluate(() => document.getAnimations().length), 0);
        await popup.locator('#keepAliveToggle').focus(); await popup.keyboard.press('Space');
        await popup.waitForFunction(() => document.getElementById('keepAliveToggle').checked && !document.getElementById('keepAliveToggle').disabled);
        await popup.screenshot({ path: path.join(out, 'popup-320.png'), fullPage: true });
        console.log('PASS narrow popup, keyboard toggle, reduced motion');

        await context.close(); run = await launch(); context = run.context;
        assert.equal(await run.popup.locator('#keepAliveToggle').isChecked(), true);
        assert.equal(await run.popup.locator('input[value="knit"]').isChecked(), true);
        const after = await run.worker.evaluate(() => chrome.storage.local.get(null));
        assert.deepEqual(after.activationStats, keep); assert.equal(after.customVideo, 'original-media');
        const restored = await tabFor(run.worker, run.popup, 'chrome://newtab/');
        await restored.page.frameLocator('#newtab-frame').locator('h1').waitFor();
        await run.popup.waitForFunction(async id => !(await chrome.tabs.get(id)).autoDiscardable, restored.id);
        assert.equal((await tabState(run.worker, restored.id)).autoDiscardable, false, 'cold start reapplies the persisted policy');
        console.log('PASS real cold restart retains settings/media and protects new native pages');
    } finally { if (context) await context.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
