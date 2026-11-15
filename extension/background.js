/* Event-driven new-tab support. Background workers may sleep; pages do not
 * need periodic writes or heartbeat messages to keep their saved settings. */
'use strict';

const newtabPage = chrome.runtime.getURL('newtab.html');
const popupPage = chrome.runtime.getURL('popup.html');
const protectionKey = 'nachoProtectedTabs';
const iconThemes = ['blue', 'knit', 'ribbon'];
let operations = Promise.resolve();
function enqueue(operation) {
    const result = operations.then(operation);
    operations = result.catch(() => {});
    return result;
}
function isHostedNewtab(value) {
    try {
        const url = new URL(value);
        return url.origin === 'https://ashbery.github.io' && (url.pathname === '/newtab' || url.pathname.startsWith('/newtab/'));
    } catch (_) { return false; }
}
function nativeNewtab(value) { return [newtabPage, 'chrome://newtab/', 'edge://newtab/', 'brave://newtab/'].includes(value); }
function isPopup(sender) { return sender.id === chrome.runtime.id && sender.url === popupPage; }
function isSite(sender) { return sender.id === chrome.runtime.id && sender.tab && isHostedNewtab(sender.url); }
function isWrapper(sender) {
    return sender.id === chrome.runtime.id && sender.frameId === 0 && sender.url === newtabPage && sender.tab && sender.documentId;
}
async function settings() {
    const saved = await chrome.storage.local.get(['keepAliveEnabled', 'nachoIconTheme']);
    return { enabled: saved.keepAliveEnabled === true, theme: iconThemes.includes(saved.nachoIconTheme) ? saved.nachoIconTheme : 'blue' };
}
async function setIcon(theme) {
    await chrome.action.setIcon({ path: { 16: 'icons/nacho-' + theme + '-16.png', 32: 'icons/nacho-' + theme + '-32.png',
        48: 'icons/nacho-' + theme + '-48.png', 128: 'icons/nacho-' + theme + '-128.png' } });
}
async function reconcileProtection() {
    const config = await settings();
    const session = await chrome.storage.session.get(null);
    const protectedTabs = Object.assign({}, session[protectionKey] || {});
    const tabs = await chrome.tabs.query({});
    const existing = new Set(tabs.map(tab => String(tab.id)));
    for (const id of Object.keys(protectedTabs)) if (!existing.has(id)) delete protectedTabs[id];
    let eligibleCount = 0, protectedCount = 0, pendingRestoreCount = 0, pendingProtectCount = 0;
    for (const tab of tabs) {
        const url = tab.pendingUrl || tab.url;
        const eligible = isHostedNewtab(url) || nativeNewtab(url) && !!session['newtabDocument:' + tab.id];
        if (eligible) eligibleCount++;
        if (config.enabled && eligible) {
            if (tab.autoDiscardable !== false) {
                protectedTabs[tab.id] = true;
                // Store ownership before applying the policy so worker suspension
                // cannot lose the information needed for restoring the tab.
                await chrome.storage.session.set({ [protectionKey]: protectedTabs });
                try { await chrome.tabs.update(tab.id, { autoDiscardable: false }); }
                catch (_) { pendingProtectCount++; continue; }
            }
            protectedCount++;
        } else if (protectedTabs[tab.id]) {
            try {
                if (tab.autoDiscardable === false) await chrome.tabs.update(tab.id, { autoDiscardable: true });
                delete protectedTabs[tab.id];
            } catch (_) {
                // Keep ownership after a transient API failure. The next event
                // or explicit Retry must still be able to restore this tab.
                pendingRestoreCount++;
            }
        }
    }
    if (JSON.stringify(session[protectionKey] || {}) !== JSON.stringify(protectedTabs))
        await chrome.storage.session.set({ [protectionKey]: protectedTabs });
    return { enabled: config.enabled, theme: config.theme, eligibleCount, protectedCount, pendingRestoreCount, pendingProtectCount };
}
async function initialize() {
    // Remove only alarms owned by the earlier version; no periodic replacement.
    await Promise.all(['keepAlivePrimary', 'keepAliveSecondary', 'maintenance'].map(name => chrome.alarms.clear(name)));
    const config = await settings();
    await setIcon(config.theme);
    return reconcileProtection();
}

// Register listeners synchronously: MV3 may wake a suspended worker for any
// event. Navigation and saved state never depend on an interval.
chrome.webNavigation.onBeforeNavigate.addListener(async details => {
    if (details.frameId <= 0 || details.parentFrameId !== 0 || isHostedNewtab(details.url)) return;
    let destination;
    try { destination = new URL(details.url); } catch (_) { return; }
    if (!['https:', 'http:'].includes(destination.protocol)) return;
    try {
        const key = 'newtabDocument:' + details.tabId;
        const registered = (await chrome.storage.session.get(key))[key];
        if (!registered || registered !== details.parentDocumentId) return;
        const tab = await chrome.tabs.get(details.tabId);
        if (!nativeNewtab(tab.url)) return;
        await chrome.tabs.update(details.tabId, { url: destination.href });
    } catch (_) { /* The exact parent document or tab may have closed. */ }
});
chrome.tabs.onRemoved.addListener(tabId => {
    enqueue(async () => {
        await chrome.storage.session.remove('newtabDocument:' + tabId);
        await reconcileProtection();
    }).catch(() => {});
});
chrome.tabs.onUpdated.addListener((tabId, change) => {
    if (change.url || change.status === 'complete' || change.discarded !== undefined)
        enqueue(reconcileProtection).catch(() => {});
});
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.keepAliveEnabled) enqueue(reconcileProtection).catch(() => {});
    if (changes.nachoIconTheme) enqueue(async () => setIcon((await settings()).theme)).catch(() => {});
});
chrome.runtime.onStartup.addListener(() => { enqueue(initialize).catch(() => {}); });
chrome.runtime.onInstalled.addListener(() => { enqueue(initialize).catch(() => {}); });

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!request || typeof request.action !== 'string') return false;
    if (request.action === 'newtabOpened') {
        if (!isWrapper(sender)) { sendResponse({ success: false }); return false; }
        // Begin loading as soon as the exact parent is registered; preferences
        // and old statistics never delay the first paint.
        chrome.storage.session.set({ ['newtabDocument:' + sender.tab.id]: sender.documentId }).then(() => {
            sendResponse({ success: true });
            enqueue(reconcileProtection).catch(() => {});
        }, () => sendResponse({ success: false, error: '新分頁登記失敗，請重新載入。' }));
        return true;
    }
    const pageAction = ['saveVideo', 'loadVideo', 'keepAlive'].includes(request.action);
    if (!(pageAction ? isSite(sender) : isPopup(sender))) { sendResponse({ success: false, error: '無法接受這個來源的請求。' }); return false; }
    enqueue(async () => {
        if (request.action === 'getExtensionState') return { success: true, state: await reconcileProtection() };
        if (request.action === 'updateKeepAliveSetting') {
            if (typeof request.enabled !== 'boolean') throw new Error('設定值不正確。');
            await chrome.storage.local.set({ keepAliveEnabled: request.enabled });
            return { success: true, state: await reconcileProtection() };
        }
        if (request.action === 'setIconTheme') {
            if (!iconThemes.includes(request.theme)) throw new Error('請選擇可用的造型。');
            const previousTheme = (await settings()).theme;
            await setIcon(request.theme);
            try { await chrome.storage.local.set({ nachoIconTheme: request.theme }); }
            catch (error) { await setIcon(previousTheme).catch(() => {}); throw error; }
            return { success: true, state: await reconcileProtection() };
        }
        if (request.action === 'getActivationStats') {
            const saved = await chrome.storage.local.get('activationStats');
            const config = await settings();
            return { stats: Object.assign({}, saved.activationStats || {}, { isActive: config.enabled, keepAliveEnabled: config.enabled }) };
        }
        // Older open pages can still send heartbeats until reloaded. Acknowledge
        // without timers, writes or invented uptime.
        if (request.action === 'keepAlive') return { success: true };
        if (request.action === 'saveVideo') {
            if (typeof request.data !== 'string' || !request.data.length) throw new Error('沒有可儲存的影片。');
            await chrome.storage.local.set({ customVideo: request.data, videoType: request.type || 'base64',
                videoName: typeof request.name === 'string' ? request.name : '自訂影片', lastUpdated: new Date().toISOString() });
            return { success: true };
        }
        if (request.action === 'loadVideo') return chrome.storage.local.get(['customVideo', 'videoType', 'videoName']);
        throw new Error('無法辨識這個操作。');
    }).then(sendResponse, error => sendResponse({ success: false, error: error.message || '設定未儲存，請重試。' }));
    return true;
});
enqueue(initialize).catch(() => {});
