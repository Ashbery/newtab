const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const extension = process.env.NEWTAB_EXTENSION_PATH;
if (!extension || !fs.existsSync(path.join(extension, 'manifest.json'))) {
  throw new Error('Set NEWTAB_EXTENSION_PATH to an existing unpacked new-tab extension directory containing manifest.json.');
}
const executable = process.env.NEWTAB_BROWSER_PATH || 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe';
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, '.impeccable/review'), { recursive: true });
const site = 'https://ashbery.github.io/newtab/';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ashbery-newtab-compat-'));
const evidence = [];
const launch = () => chromium.launchPersistentContext(profile, { executablePath: executable, headless: true, ignoreDefaultArgs: ['--disable-extensions'], args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension] });
async function workerOf(context) { return context.serviceWorkers()[0] || context.waitForEvent('serviceworker', { timeout: 15000 }); }
async function openNewtab(context) {
  const page = await context.newPage();
  await page.clock.install();
  await page.goto('chrome://newtab/', { waitUntil: 'networkidle' });
  await page.frameLocator('#newtab-frame').locator('#search-input').waitFor();
  return { page, frame: page.frames().find(f => f.url().startsWith(site)) };
}
async function localSite(route) {
  const url = new URL(route.request().url());
  const relative = decodeURIComponent(url.pathname.slice('/newtab/'.length)) || 'index.html';
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.abort();
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
  return route.fulfill({ contentType: types[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
}
async function seedWebsite(page) {
  return page.evaluate(async () => {
    localStorage.setItem('round6-storage-marker', 'preserved-from-top-level');
    NewtabWidgets.setClockHour12(true);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 4;
    const drawing = canvas.getContext('2d'); drawing.fillStyle = '#93b6ce'; drawing.fillRect(0, 0, 4, 4);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('VideoCacheDB', 2);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('videos')) request.result.createObjectStore('videos'); };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { const db = request.result, tx = db.transaction('videos', 'readwrite'); tx.objectStore('videos').put(blob, 'cached_video'); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
    });
    localStorage.removeItem('nt_background_v1');
    localStorage.setItem('videoSource', 'extension');
    localStorage.setItem('videoName', '保留的背景');
    localStorage.setItem('hasExtensionVideo', 'true');
    return blob.size;
  });
}
(async () => {
  let context;
  try {
    // Seed only the disposable profile, then restart to exercise real cold loading.
    context = await launch();
    let worker = await workerOf(context);
    const id = worker.url().split('/')[2];
    assert.equal(await worker.evaluate(() => chrome.runtime.getManifest().name), 'Ashbery 新分頁');
    await worker.evaluate(() => chrome.storage.local.set({ keepAliveEnabled: true, activationStats: { activationCount: 17, startTime: 123456789, lastActivation: 123456790 }, customVideo: 'synthetic-original-media', videoType: 'base64', videoName: '原本影片', round6Marker: 'preserved' }));
    await context.close();
    context = await launch(); worker = await workerOf(context);
    await context.route('https://www.google.com/search?*', r => r.fulfill({ contentType: 'text/html', body: '<title>Search destination</title>Search destination' }));
    await context.route('https://example.test/**', r => r.fulfill({ contentType: 'text/html', body: '<title>URL destination</title>URL destination' }));
    const popup = await context.newPage();
    await popup.goto('chrome-extension://' + id + '/popup.html');
    await popup.locator('#keepAliveToggle').waitFor({ state: 'attached' });
    await popup.waitForFunction(() => document.getElementById('keepAliveToggle').checked === true);
    assert.equal(await popup.locator('#keepAliveToggle').isChecked(), true);

    const old = await openNewtab(context);
    assert.equal(await old.frame.locator('html').getAttribute('data-newtab-extension'), 'ready');
    await old.frame.locator('#search-input').fill('legacy extension search');
    await old.frame.locator('#search-input').press('Enter');
    await old.page.waitForURL('https://www.google.com/search?*', { timeout: 10000 });
    assert.equal(new URL(old.page.url()).searchParams.get('q'), 'legacy extension search');
    evidence.push({ deployedPage: 'actual HTTPS site loaded; search navigated the top-level tab' });
    await old.page.close();

    // Serve the current working tree under its production origin, keeping real
    // extension host permissions and Chrome storage partition behavior intact.
    await context.route(site + '**', localSite);
    const direct = await context.newPage();
    await direct.goto(site, { waitUntil: 'networkidle' });
    await direct.waitForFunction(() => window.NewtabWidgets);
    const legacyBytes = await seedWebsite(direct);
    await direct.close();
    const modern = await openNewtab(context);
    await modern.frame.waitForFunction(() => localStorage.getItem('nt_background_v1') && JSON.parse(localStorage.getItem('nt_background_v1')).source === 'file');
    const preserved = await modern.frame.evaluate(async () => {
      const oldBytes = await new Promise((resolve, reject) => { const r = indexedDB.open('VideoCacheDB', 2); r.onerror = () => reject(r.error); r.onsuccess = () => { const db = r.result, q = db.transaction('videos').objectStore('videos').get('cached_video'); q.onsuccess = () => { db.close(); resolve(q.result.size); }; }; });
      return { marker: localStorage.getItem('round6-storage-marker'), oldBytes, meta: JSON.parse(localStorage.getItem('nt_background_v1')), clock12: NewtabWidgets.getLayout().widgets.find(w => w.type === 'clock').options.hour12, modernHelperSkipped: typeof window.extensionHelper === 'undefined', geolocationDelegated: document.featurePolicy.allowsFeature('geolocation') };
    });
    assert.equal(preserved.marker, 'preserved-from-top-level');
    assert.equal(preserved.oldBytes, legacyBytes);
    assert.equal(preserved.meta.name, '保留的背景');
    assert.equal(preserved.clock12, true);
    assert.equal(preserved.modernHelperSkipped, true);
    assert.equal(preserved.geolocationDelegated, true);
    await modern.frame.evaluate(() => localStorage.setItem('round6-storage-marker', 'written-inside-iframe'));
    const reread = await context.newPage(); await reread.goto(site, { waitUntil: 'networkidle' });
    assert.equal(await reread.evaluate(() => localStorage.getItem('round6-storage-marker')), 'written-inside-iframe');
    await reread.close();
    evidence.push({ websiteStorage: preserved, bidirectionalLocalStorage: true });

    const stats = () => popup.evaluate(() => chrome.runtime.sendMessage({ action: 'getActivationStats' })).then(r => r.stats);
    assert.equal((await stats()).isActive, true);
    await popup.locator('label:has(#keepAliveToggle)').click();
    await popup.waitForFunction(async () => !(await chrome.runtime.sendMessage({ action: 'getActivationStats' })).stats.isActive);
    assert.equal((await worker.evaluate(() => chrome.alarms.getAll())).length, 0);
    await popup.locator('label:has(#keepAliveToggle)').click();
    await popup.waitForFunction(async () => (await chrome.runtime.sendMessage({ action: 'getActivationStats' })).stats.isActive);
    assert.equal((await worker.evaluate(() => chrome.alarms.getAll())).length, 3);
    const beforeHeartbeat = (await stats()).activationCount;
    await modern.page.clock.fastForward(31000);
    await popup.waitForFunction(async count => (await chrome.runtime.sendMessage({ action: 'getActivationStats' })).stats.activationCount > count, beforeHeartbeat);
    const settings = await worker.evaluate(() => chrome.storage.local.get(['keepAliveEnabled', 'activationStats', 'customVideo', 'videoType', 'videoName', 'round6Marker']));
    assert.equal(settings.keepAliveEnabled, true);
    assert.equal(settings.activationStats.startTime, 123456789);
    assert(settings.activationStats.activationCount > 17);
    assert.equal(settings.customVideo, 'synthetic-original-media');
    assert.equal(settings.videoType, 'base64'); assert.equal(settings.videoName, '原本影片');
    assert.equal(settings.round6Marker, 'preserved');
    evidence.push({ popupAndColdStart: settings, iframeHeartbeatRecorded: true, toggleAlarmCounts: [0, 3] });

    // A grandchild of the website is outside the navigation bridge scope.
    await modern.frame.evaluate(() => { const frame = document.createElement('iframe'); frame.id = 'nested-probe'; frame.src = 'https://example.test/nested'; document.body.appendChild(frame); });
    await modern.frame.frameLocator('#nested-probe').locator('body').waitFor();
    assert(modern.page.url().endsWith('/newtab.html'));
    // An unrelated ordinary tab's direct iframe is also outside the bridge.
    const other = await context.newPage(); await other.goto('https://example.test/ordinary');
    await other.evaluate(() => { const frame = document.createElement('iframe'); frame.src = 'https://example.test/ordinary-child'; document.body.appendChild(frame); });
    await other.frameLocator('iframe').locator('body').waitFor();
    assert.equal(other.url(), 'https://example.test/ordinary'); await other.close();
    evidence.push({ unrelatedFrames: 'grandchild and ordinary-page iframe remained embedded' });

    await modern.frame.locator('#search-input').fill('example.test/from-search');
    await modern.frame.locator('#search-input').press('Enter');
    await modern.page.waitForURL('https://example.test/from-search', { timeout: 10000 });
    await modern.page.close();
    const shortcut = await openNewtab(context);
    const app = shortcut.frame.locator('.widget[data-id="app-images"] a');
    const destination = await app.getAttribute('href');
    await context.route(destination, r => r.fulfill({ contentType: 'text/html', body: '<title>Shortcut destination</title>Shortcut destination' }));
    await app.click();
    await shortcut.page.waitForURL(destination, { timeout: 10000 });
    evidence.push({ currentWebsite: 'direct URL and launcher shortcut navigated top-level', extensionId: id, hostPermissions: await worker.evaluate(() => chrome.runtime.getManifest().host_permissions) });
    console.log('PASS: actual deployed search; current website search/shortcut; top-level↔iframe localStorage and IndexedDB; popup settings/alarms/heartbeat; cold restart preserves settings/stats/media; other frames ignored.');
  } finally {
    if (context) await context.close();
    fs.writeFileSync(path.join(root, '.impeccable/review/round6-extension-integration.json'), JSON.stringify({ profile, evidence }, null, 2));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
