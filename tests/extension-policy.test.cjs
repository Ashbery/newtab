// Failure/cold-worker tests execute the real background source with Chrome APIs
// replaced at their boundary. Browser integration is in extension-settings.cjs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../extension/background.js'), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
async function harness(data) {
    const local = data?.local || { keepAliveEnabled: true, activationStats: { activationCount: 17 }, customVideo: 'retained' };
    const session = data?.session || { 'newtabDocument:7': 'document-seven' };
    const tabs = data?.tabs || [{ id: 7, url: 'chrome-extension://fixture/newtab.html', autoDiscardable: true }];
    const control = { failRestore: false, failProtect: false, failLocal: false, icon: null, writes: [], alarms: new Set(['keepAlivePrimary', 'keepAliveSecondary', 'maintenance', 'unrelated']) };
    const listeners = {};
    const event = name => ({ addListener: fn => { listeners[name] = fn; } });
    const area = (name, values) => ({
        async get(keys) { if (keys === null) return copy(values); return copy(Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(key => key in values).map(key => [key, values[key]]))); },
        async set(next) { if (name === 'local' && control.failLocal) throw Error('Storage unavailable'); Object.assign(values, copy(next)); control.writes.push(name); },
        async remove(key) { delete values[key]; }
    });
    const chrome = {
        runtime: { id: 'fixture', getURL: name => 'chrome-extension://fixture/' + name, onMessage: event('message'), onStartup: event('startup'), onInstalled: event('installed') },
        storage: { local: area('local', local), session: area('session', session), onChanged: event('storage') },
        action: { async setIcon(icon) { control.icon = icon.path[128]; } },
        alarms: { async clear(name) { control.alarms.delete(name); } },
        webNavigation: { onBeforeNavigate: event('navigation') },
        tabs: { onRemoved: event('removed'), onUpdated: event('updated'), async query() { return copy(tabs); },
            async get(id) { const tab = tabs.find(tab => tab.id === id); if (!tab) throw Error('No tab'); return copy(tab); },
            async update(id, change) {
                if (change.autoDiscardable === true && control.failRestore || change.autoDiscardable === false && control.failProtect) throw Error('Temporary tab update failure');
                const tab = tabs.find(tab => tab.id === id); if (!tab) throw Error('No tab'); Object.assign(tab, change); return copy(tab);
            } }
    };
    const context = vm.createContext({ chrome, URL, console, setInterval() { throw Error('Background heartbeat must not be created'); } });
    vm.runInContext(source, context); await vm.runInContext('operations', context);
    const sender = { id: 'fixture', url: 'chrome-extension://fixture/popup.html' };
    return { local, session, tabs, control, context,
        reconcile: () => vm.runInContext('reconcileProtection()', context),
        request: (request, from = sender) => new Promise(resolve => listeners.message(request, from, resolve)) };
}
(async () => {
    const h = await harness();
    assert.equal(h.tabs[0].autoDiscardable, false);
    assert.equal(h.session.nachoProtectedTabs['7'], true);
    assert.deepEqual([...h.control.alarms], ['unrelated'], 'clears only old own alarms');
    assert.deepEqual(h.local.activationStats, { activationCount: 17 }); assert.equal(h.local.customVideo, 'retained');
    assert(!h.control.writes.includes('local'), 'startup writes no local heartbeat or statistics');
    console.log('PASS ownership and old-alarm migration preserve stored media/stats without heartbeat writes');

    h.control.failRestore = true;
    const pending = await h.request({ action: 'updateKeepAliveSetting', enabled: false });
    assert.equal(pending.state.pendingRestoreCount, 1);
    assert.equal(h.session.nachoProtectedTabs['7'], true, 'failed restoration retains ownership');
    assert.equal(h.tabs[0].autoDiscardable, false);
    h.control.failRestore = false;
    const retried = await h.request({ action: 'getExtensionState' });
    assert.equal(retried.state.pendingRestoreCount, 0); assert.equal(h.tabs[0].autoDiscardable, true);
    assert.deepEqual(h.session.nachoProtectedTabs, {});
    console.log('PASS transient restore failure reports pending state; Retry restores and releases ownership');

    h.control.failProtect = true;
    const blocked = await h.request({ action: 'updateKeepAliveSetting', enabled: true });
    assert.equal(blocked.state.pendingProtectCount, 1); assert.equal(blocked.state.protectedCount, 0);
    h.control.failProtect = false;
    assert.equal((await h.request({ action: 'getExtensionState' })).state.protectedCount, 1);
    const restarted = await harness({ local: h.local, session: h.session, tabs: h.tabs });
    await restarted.request({ action: 'updateKeepAliveSetting', enabled: false });
    assert.equal(h.tabs[0].autoDiscardable, true, 'fresh worker recovers session ownership and restores tab policy');
    console.log('PASS protection failure retries, and a fresh worker retains restoration ownership');

    restarted.control.failLocal = true;
    const icon = await restarted.request({ action: 'setIconTheme', theme: 'knit' });
    assert.equal(icon.success, false); assert.match(restarted.control.icon, /nacho-blue-128/);
    assert.equal(restarted.local.nachoIconTheme, undefined);
    const toggle = await restarted.request({ action: 'updateKeepAliveSetting', enabled: true });
    assert.equal(toggle.success, false); assert.equal(restarted.local.keepAliveEnabled, false);
    restarted.control.failLocal = false;
    console.log('PASS save failures preserve previous preference and roll back the toolbar icon');

    const site = { id: 'fixture', url: 'https://ashbery.github.io/newtab/', tab: { id: 7 }, frameId: 1 };
    assert.equal((await restarted.request({ action: 'updateKeepAliveSetting', enabled: true }, site)).success, false);
    assert.equal((await restarted.request({ action: 'setIconTheme', theme: 'knit' }, site)).success, false);
    assert.equal((await restarted.request({ action: 'newtabOpened' }, site)).success, false);
    assert.equal((await restarted.request({ action: 'setIconTheme', theme: '../bad' })).success, false);
    const before = copy(restarted.local); await restarted.request({ action: 'keepAlive' }, site);
    assert.deepEqual(restarted.local, before, 'legacy heartbeat message is a no-op');
    console.log('PASS settings sender validation, safe theme allowlist, and legacy heartbeat no-op');
})().catch(error => { console.error(error); process.exitCode = 1; });
