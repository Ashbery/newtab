const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = process.env.NEWTAB_TEST_URL || 'http://127.0.0.1:4174/';
const browserOptions = process.env.NEWTAB_BROWSER_PATH ? { executablePath: process.env.NEWTAB_BROWSER_PATH } : { channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) };
let browser;
before(async () => { browser = await chromium.launch({ headless: true, ...browserOptions }); });
after(async () => { if (browser) await browser.close(); });

function city(name = '測試城市', extra = {}) { return { name, latitude: 25, longitude: 121, admin1: '測試地區', country: '測試國家', ...extra }; }
async function fixture(t, viewport = { width: 1440, height: 900 }) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    t.after(() => context.close());
    const url = new URL('__weather-location-test__', base).href;
    await context.route(url, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><link rel="stylesheet" href="' + new URL('css/weather-location.css', base) + '"><button id="opener">天氣城市</button><main id="owner"></main><script src="' + new URL('js/weather-location.js', base) + '"></script></html>' }));
    await context.addInitScript(() => {
        window.weatherRequests = [];
        const original = window.fetch.bind(window);
        window.fetch = function (url, options) {
            if (!/https:\/\/(geocoding-api\.open-meteo\.com|get\.geojs\.io)\//.test(String(url))) return original(url, options);
            return new Promise((resolve, reject) => {
                const request = { url: String(url), credentials: options.credentials, referrerPolicy: options.referrerPolicy,
                    aborted: options.signal.aborted, respond: (value, status = 200) => resolve({ ok: status >= 200 && status < 300, status, json: async () => value }), fail: () => reject(new TypeError('Synthetic network failure')) };
                // Intentionally let this synthetic server finish after abort.
                // The UI must also fence late results, not rely on fetch alone.
                options.signal.addEventListener('abort', () => { request.aborted = true; }, { once: true });
                weatherRequests.push(request);
            });
        };
        window.weatherSelections = [];
        window.weatherOwnerExists = true;
        window.weatherSelectionFails = false;
    });
    const page = await context.newPage(); await page.goto(url);
    await page.waitForFunction(() => window.NewtabWeatherLocation);
    async function open() {
        await page.evaluate(() => {
            const opener = document.getElementById('opener'); opener.focus();
            NewtabWeatherLocation.open({ opener, city: '', isCurrent: () => weatherOwnerExists,
                focusTarget: () => document.getElementById('opener'),
                onSelect: location => { if (weatherSelectionFails) throw new Error('Synthetic apply failure'); weatherSelections.push(location); } });
        });
    }
    async function respond(index, value, status = 200) {
        await page.evaluate(({ index, value, status }) => weatherRequests[index].respond(value, status), { index, value, status });
    }
    await open();
    return { page, open, respond, input: page.getByLabel('城市名稱', { exact: true }),
        submit: page.getByRole('button', { name: '搜尋城市', exact: true }), network: page.locator('.weather-location-network-button'),
        results: page.locator('.weather-location-result'), status: page.locator('.weather-location-status') };
}

test('manual search is explicit, IME-safe, encoded, bounded and keyboard-selectable', async t => {
    const f = await fixture(t), { page } = f;
    assert.equal(await page.evaluate(() => weatherRequests.length), 0);
    await f.input.fill('台北 & 東京'); await page.waitForTimeout(80);
    assert.equal(await page.evaluate(() => weatherRequests.length), 0, 'Typing does not contact either service');
    await f.input.dispatchEvent('compositionstart'); await f.input.press('Enter');
    assert.equal(await page.evaluate(() => weatherRequests.length), 0);
    await f.input.dispatchEvent('compositionend'); await f.input.press('Enter');
    const request = await page.evaluate(() => ({ url: weatherRequests[0].url, credentials: weatherRequests[0].credentials, referrerPolicy: weatherRequests[0].referrerPolicy }));
    const query = new URL(request.url);
    assert.equal(query.searchParams.get('name'), '台北 & 東京'); assert.equal(query.searchParams.get('count'), '8');
    assert.equal(request.credentials, 'omit'); assert.equal(request.referrerPolicy, 'no-referrer');
    const values = [city('第一城市'), city('第一城市'), city('無效', { latitude: 100 }), city('', { latitude: 1 }), ...Array.from({ length: 10 }, (_, i) => city('其他城市' + i, { latitude: i }))];
    await f.respond(0, { results: values }); await f.results.first().waitFor();
    assert.equal(await f.results.count(), 8, 'Invalid/duplicate results are excluded and the list is capped');
    await f.input.focus(); await f.input.press('ArrowDown'); await page.keyboard.press('Enter');
    await page.locator('.weather-location-dialog').waitFor({ state: 'detached' });
    const selected = await page.evaluate(() => weatherSelections);
    assert.deepEqual(selected, [{ lat: 25, lon: 121, city: '第一城市', locationSource: 'manual', locationNotice: '' }]);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'opener');
});

test('network estimate requires a click and confirmation; IP and extra fields never enter selection', async t => {
    const f = await fixture(t), { page } = f;
    assert.match(await page.locator('.weather-location-network-note').textContent(), /GeoJS.*IP/);
    assert.equal(await page.evaluate(() => weatherRequests.length), 0);
    await f.network.click();
    assert.equal(await page.evaluate(() => weatherRequests[0].url), 'https://get.geojs.io/v1/ip/geo.json');
    await f.respond(0, { latitude: '24.2', longitude: '120.7', city: '估算城市', region: '估算地區', country: '測試國家', ip: '192.0.2.123', organization: 'SHOULD_NOT_COPY' });
    await f.results.first().waitFor();
    assert.equal(await page.evaluate(() => weatherSelections.length), 0, 'An estimate is not automatically adopted');
    await f.results.first().click();
    const selected = await page.evaluate(() => weatherSelections);
    assert.deepEqual(selected, [{ lat: 24.2, lon: 120.7, city: '估算城市', locationSource: 'network', locationNotice: '網路估算位置' }]);
    assert.ok(!JSON.stringify(selected).includes('192.0.2.123'));
    assert.ok(!JSON.stringify(selected).includes('SHOULD_NOT_COPY'));
});

test('changing input or request kind aborts and fences old responses', async t => {
    const f = await fixture(t), { page } = f;
    await f.input.fill('舊城市'); await f.submit.click();
    await f.input.fill('新城市');
    assert.equal(await page.evaluate(() => weatherRequests[0].aborted), true);
    await f.submit.click();
    await f.respond(0, { results: [city('過期城市')] });
    assert.equal(await f.results.count(), 0);
    await f.respond(1, { results: [city('有效城市')] }); await f.results.first().waitFor();
    assert.match(await f.results.first().textContent(), /有效城市/);
    await f.network.click();
    await f.submit.click();
    assert.equal(await page.evaluate(() => weatherRequests[2].aborted), true, 'Manual submit supersedes an in-progress estimate');
    await f.respond(2, { latitude: '1', longitude: '2', city: '過期估算' });
    assert.equal(await f.results.count(), 0);
    await f.respond(3, { results: [city('最後城市')] }); await f.results.first().waitFor();
    assert.match(await f.results.first().textContent(), /最後城市/);
});

test('close, replacement dialog and removed widget cannot adopt an abandoned request', async t => {
    const f = await fixture(t), { page } = f;
    await f.input.fill('關閉之前'); await f.submit.click(); await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => weatherRequests[0].aborted), true);
    await f.open(); await f.respond(0, { results: [city('舊對話城市')] });
    assert.equal(await f.results.count(), 0);
    await f.input.fill('移除之前'); await f.submit.click();
    await page.evaluate(() => { weatherOwnerExists = false; document.getElementById('owner').remove(); });
    await page.locator('.weather-location-dialog').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => weatherRequests[1].aborted), true);
    await f.respond(1, { results: [city('已移除組件城市')] });
    assert.equal(await page.evaluate(() => weatherSelections.length), 0);
});

test('malformed, empty and unavailable responses remain recoverable without inventing a city', async t => {
    const f = await fixture(t), { page } = f;
    await f.network.click(); await f.respond(0, { latitude: '', longitude: '121', city: '不完整' });
    await page.waitForFunction(() => !document.querySelector('.weather-location-network-button').disabled);
    assert.equal(await f.results.count(), 0); assert.match(await f.status.textContent(), /沒有可確認/);
    await f.input.fill('保留名稱'); await f.submit.click(); await f.respond(1, { results: 'wrong-shape' });
    await page.waitForFunction(() => document.querySelector('.weather-location-status').dataset.state === 'error');
    assert.equal(await f.input.inputValue(), '保留名稱'); assert.equal(await f.submit.isEnabled(), true);
    await f.submit.click(); await f.respond(2, { results: [] });
    await page.waitForFunction(() => document.querySelector('.weather-location-status').textContent.includes('沒有符合'));
    assert.equal(await f.results.count(), 0);
    await f.submit.click(); await f.respond(3, {}, 503);
    await page.waitForFunction(() => document.querySelector('.weather-location-status').dataset.state === 'error');
    assert.equal(await f.submit.isEnabled(), true); assert.equal(await page.evaluate(() => weatherSelections.length), 0);
});

test('request timeout aborts, preserves input and ignores a late response', async t => {
    const f = await fixture(t), { page } = f;
    await page.clock.install();
    await f.input.fill('等待城市'); await f.submit.click();
    await page.clock.fastForward(10001);
    assert.equal(await page.evaluate(() => weatherRequests[0].aborted), true);
    assert.match(await f.status.textContent(), /逾時/); assert.equal(await f.input.inputValue(), '等待城市');
    assert.equal(await f.submit.isEnabled(), true);
    await f.respond(0, { results: [city('太晚的城市')] });
    assert.equal(await f.results.count(), 0);
});

test('selection errors can retry and replacement opener receives focus after success', async t => {
    const f = await fixture(t), { page } = f;
    await f.input.fill('可重試城市'); await f.submit.click(); await f.respond(0, { results: [city('可重試城市')] });
    await f.results.first().waitFor();
    await page.evaluate(() => { weatherSelectionFails = true; }); await f.results.first().click();
    assert.match(await f.status.textContent(), /無法套用/); assert.equal(await f.results.first().isEnabled(), true);
    await page.evaluate(() => { weatherSelectionFails = false; const old = document.getElementById('opener'); const replacement = old.cloneNode(true); old.replaceWith(replacement); });
    await f.results.first().click(); await page.locator('.weather-location-dialog').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => document.activeElement.id), 'opener');
    assert.equal(await page.evaluate(() => weatherSelections.length), 1);
});

test('mobile and short-window results remain within the dialog and keyboard focus is contained', async t => {
    for (const [width, height] of [[320, 640], [390, 844], [844, 390]]) {
        const f = await fixture(t, { width, height }), { page } = f;
        await f.input.fill('城市清單'); await f.submit.click();
        await f.respond(0, { results: Array.from({ length: 8 }, (_, i) => city('城市' + i, { latitude: i })) });
        await f.results.first().waitFor();
        const box = await page.locator('.weather-location-dialog').boundingBox();
        assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height, JSON.stringify({ width, height, box }));
        await f.results.last().scrollIntoViewIfNeeded(); await f.results.last().focus();
        assert.equal(await page.evaluate(() => document.activeElement.className), 'weather-location-result');
        await page.locator('.weather-location-footer a').last().focus(); await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.className), 'weather-location-close');
        await page.keyboard.press('Shift+Tab');
        assert.equal(await page.locator('.weather-location-footer a').last().evaluate(node => node === document.activeElement), true);
        await page.keyboard.press('Escape'); assert.equal(await page.locator('.weather-location-dialog').count(), 0);
    }
});

test('city timezone is retained only when valid and unrelated fields are excluded', async t => {
    for (const timezone of ['Asia/Tokyo', 'not/a-timezone']) {
        const { page, input, submit, results, respond } = await fixture(t);
        await input.fill('東京'); await submit.click();
        await respond(0, { results: [city('東京', { timezone, secret: 'do-not-store' })] });
        await results.first().click();
        const selected = await page.evaluate(() => weatherSelections[0]);
        assert.equal(selected.timeZone, timezone === 'Asia/Tokyo' ? 'Asia/Tokyo' : undefined);
        assert.equal(selected.secret, undefined);
    }
});
