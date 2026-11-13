// Test artifacts stay local and are excluded from the published repository.
require('node:fs').mkdirSync('.impeccable/review', { recursive: true });
// Start the local server; run with Playwright in NODE_PATH.
// Fixtures use public Taipei coordinates and synthetic geolocation, never the user's location.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const base = process.env.NEWTAB_TEST_URL || 'http://127.0.0.1:4173';
const origin = new URL(base).origin;
const taipei = { lat: 25.033, lon: 121.565, city: '台北' };
const forecast = (temp = 24) => ({ current: { temperature_2m: temp, weather_code: 2, apparent_temperature: 26,
    relative_humidity_2m: 72, wind_speed_10m: 2.5 }, daily: { temperature_2m_max: [28], temperature_2m_min: [20] } });
const cachedData = { temp: 19, code: 3, feels: 18, humidity: 80, wind: 1, high: 23, low: 16 };
const failures = [];
let passed = 0;

async function hitTest(page, selector, touch = false) {
    const bounds = await page.locator(selector).boundingBox();
    assert(bounds, selector + ' has visible bounds');
    if (touch) assert(bounds.width >= 44 && bounds.height >= 44, selector + ' has a touch target');
    assert.equal(await page.locator(selector).evaluate(el => {
        const r = el.getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1 &&
            el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    }), true, selector + ' can receive a real click');
}

async function fixture(browser, { mobile = false, cache, controlledFetch = false } = {}) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
        isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.route(/^https?:\/\//, route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.addInitScript(({ cache, controlledFetch }) => {
        window.weatherGeoCalls = [];
        Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
            getCurrentPosition(success, error) { window.weatherGeoCalls.push({ success, error }); }
        } });
        if (cache && !sessionStorage.getItem('weather-fixture')) {
            sessionStorage.setItem('weather-fixture', '1');
            localStorage.setItem('nt_weather_cache', JSON.stringify(cache));
        }
        if (controlledFetch) {
            const original = window.fetch;
            window.weatherRequests = [];
            window.fetch = function (url, options) {
                if (!String(url).includes('api.open-meteo.com')) return original.apply(this, arguments);
                // Intentionally ignores AbortSignal to exercise the stale-result guard,
                // including providers that resolve after our own timeout/cancellation.
                return new Promise((resolve, reject) => window.weatherRequests.push({ url, options, resolve, reject }));
            };
        }
    }, { cache, controlledFetch });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.NewtabWidgets);
    return { page, context, errors };
}

async function addWeather(page, options) {
    const result = await page.evaluate(options => NewtabWidgets.addFromCatalog('weather', {
        left: innerWidth > 600 ? 900 : 16, top: innerWidth > 600 ? 200 : 100, options
    }), options);
    assert.equal(result.ok, true);
    await page.locator('.weather-body').waitFor();
    // This fixture adds through the host API rather than the catalog's Add
    // action. Scroll to its free slot, which may be below the character widget.
    await page.locator('.widget[data-type="weather"]').scrollIntoViewIfNeeded();
}

async function ready(page, value = '24°') {
    await page.waitForFunction(value => document.querySelector('.weather-temp')?.textContent === value &&
        document.querySelector('.weather-body')?.getAttribute('aria-busy') === 'false', value);
}

async function test(name, run) {
    try { await run(); passed++; console.log('PASS ' + name); }
    catch (error) { failures.push(name); console.error('FAIL ' + name + '\n' + error.stack); }
}

(async () => {
    const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
    try {
        await test('pending location has a usable fallback, ignores late GPS, and persists across reload', async () => {
            const { page, context, errors } = await fixture(browser);
            let requests = 0;
            await context.route('https://api.open-meteo.com/**', route => { requests++; return route.fulfill({ json: forecast() }); });
            await addWeather(page);
            await page.waitForFunction(() => weatherGeoCalls.length === 1);
            assert.match(await page.locator('.weather-status').innerText(), /正在定位/);
            await hitTest(page, '.weather-default');
            await page.locator('.weather-default').click();
            await ready(page);
            assert.equal(await page.locator('.weather-retry').evaluate(el => el === document.activeElement), true, 'removed fallback action hands focus to update');
            await page.evaluate(() => weatherGeoCalls[0].success({ coords: { latitude: 35.68, longitude: 139.76 } }));
            assert.equal(await page.locator('.weather-city').innerText(), '台北');
            assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('nt_weather_cache')).lat), taipei.lat);
            await page.reload();
            await ready(page);
            assert.equal(await page.evaluate(() => weatherGeoCalls.length), 0, 'saved choice does not prompt again');
            assert.equal(requests, 1, 'fresh valid cache avoids a duplicate request');
            assert.deepEqual(errors, []);
            await context.close();
        });

        await test('denied location gives an explicit fallback and re-location recovers through visible controls', async () => {
            const { page, context, errors } = await fixture(browser);
            await context.route('https://api.open-meteo.com/**', route => route.fulfill({ json: forecast() }));
            await addWeather(page);
            await page.waitForFunction(() => weatherGeoCalls.length === 1);
            await page.evaluate(() => weatherGeoCalls[0].error({ code: 1 }));
            await ready(page);
            assert.match(await page.locator('.weather-status').innerText(), /未允許定位.*顯示台北/);
            assert.equal(await page.evaluate(() => NewtabWidgets.getLayout().widgets.find(w => w.type === 'weather').options.locationSource), 'fallback');
            await hitTest(page, '.weather-locate');
            await page.locator('.weather-locate').click();
            assert.equal(await page.locator('.weather-temp').innerText(), '24°', 'old reading remains during re-location');
            await page.evaluate(() => weatherGeoCalls[1].success({ coords: { latitude: 35.68, longitude: 139.76 } }));
            await ready(page);
            assert.equal(await page.locator('.weather-city').innerText(), '目前位置');
            assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('nt_weather_cache')).lat), 35.68);
            assert.equal(await page.locator('.weather-locate').evaluate(el => el === document.activeElement), true, 'async repaint preserves action focus');
            await page.reload();
            await ready(page);
            assert.equal(await page.locator('.weather-city').innerText(), '目前位置');
            assert.deepEqual(errors, []);
            await context.close();
        });

        await test('invalid response fails visibly, retry recovers, and failed refresh keeps useful data', async () => {
            const { page, context, errors } = await fixture(browser);
            let response = {};
            let shouldFail = false;
            await context.route('https://api.open-meteo.com/**', route => shouldFail ? route.abort() : route.fulfill({ json: response }));
            await addWeather(page, taipei);
            await page.locator('.weather-body.is-error').waitFor();
            assert.match(await page.locator('.weather-status').innerText(), /無法取得/);
            assert.equal(await page.evaluate(() => localStorage.getItem('nt_weather_cache')), null, 'malformed success cannot poison cache');
            assert.equal(await page.evaluate(() => NewtabWidgets.getLayout().widgets.find(w => w.type === 'weather').options.lat), taipei.lat);
            response = forecast();
            await hitTest(page, '.weather-retry');
            await page.locator('.weather-retry').click();
            await ready(page);
            shouldFail = true;
            await page.locator('.weather-retry').click();
            await page.locator('.weather-body.is-offline').waitFor();
            assert.equal(await page.locator('.weather-temp').innerText(), '24°');
            assert.match(await page.locator('.weather-status').innerText(), /更新失敗.*先前資料/);
            assert.equal(await page.locator('.weather-body').getAttribute('aria-busy'), 'false');
            assert.equal(await page.locator('.weather-body').evaluate(el => getComputedStyle(el, '::after').content), 'none');
            assert.equal(await page.locator('.weather-retry').evaluate(el => el === document.activeElement), true);
            shouldFail = false;
            response = forecast(27);
            await page.evaluate(() => dispatchEvent(new Event('online')));
            await ready(page, '27°');
            assert.deepEqual(errors, []);
            await context.close();
        });

        await test('stale cache is labelled after failure and invalid cache cannot masquerade as weather', async () => {
            for (const valid of [true, false]) {
                const { page, context } = await fixture(browser, { cache: { ...taipei, ts: Date.now() - 3600000,
                    data: valid ? cachedData : { temp: null, code: 0 } } });
                await context.route('https://api.open-meteo.com/**', route => route.abort());
                await addWeather(page, taipei);
                await page.locator(valid ? '.weather-body.is-offline' : '.weather-body.is-error').waitFor();
                assert.equal(await page.locator('.weather-temp').count(), valid ? 1 : 0);
                if (valid) assert.equal(await page.locator('.weather-temp').innerText(), '19°');
                await context.close();
            }
        });

        await test('newest request owns the UI/cache and removed widgets cannot write a late result', async () => {
            const { page, context, errors } = await fixture(browser, { controlledFetch: true });
            await addWeather(page, taipei);
            await page.waitForFunction(() => weatherRequests.length === 1);
            await page.locator('.weather-retry').click();
            await page.waitForFunction(() => weatherRequests.length === 2);
            await page.evaluate(json => weatherRequests[1].resolve({ ok: true, json: () => Promise.resolve(json) }), forecast(27));
            await ready(page, '27°');
            await page.evaluate(json => weatherRequests[0].resolve({ ok: true, json: () => Promise.resolve(json) }), forecast(41));
            assert.equal(await page.locator('.weather-temp').innerText(), '27°');
            assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('nt_weather_cache')).data.temp), 27);
            await page.locator('.weather-retry').click();
            await page.waitForFunction(() => weatherRequests.length === 3);
            await page.evaluate(() => NewtabWidgets.removeById('weather-1'));
            await page.evaluate(json => weatherRequests[2].resolve({ ok: true, json: () => Promise.resolve(json) }), forecast(43));
            assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('nt_weather_cache')).data.temp), 27);
            assert.deepEqual(errors, []);
            await context.close();
        });

        await test('location/network timeouts recover and late responses cannot persist stale data', async () => {
            const { page, context, errors } = await fixture(browser, { controlledFetch: true });
            await addWeather(page);
            await page.waitForFunction(() => weatherRequests.length === 1, null, { timeout: 10000 });
            assert.equal(await page.locator('.weather-city').innerText(), '台北');
            await page.waitForFunction(() => document.querySelector('.weather-body.is-error'), null, { timeout: 10000 });
            assert.match(await page.locator('.weather-status').innerText(), /逾時/);
            const stored = await page.evaluate(() => NewtabWidgets.getLayout().widgets.find(w => w.type === 'weather').options);
            assert.equal(stored.locationSource, 'fallback');
            assert.match(stored.locationNotice, /定位逾時/);
            await page.evaluate(json => weatherRequests[0].resolve({ ok: true, json: () => Promise.resolve(json) }), forecast(41));
            assert.equal(await page.evaluate(() => localStorage.getItem('nt_weather_cache')), null);
            await page.locator('.weather-retry').click();
            await page.waitForFunction(() => weatherRequests.length === 2);
            await page.evaluate(json => weatherRequests[1].resolve({ ok: true, json: () => Promise.resolve(json) }), forecast());
            await ready(page);
            assert.deepEqual(errors, []);
            await context.close();
        });

        await test('phone weather recovery controls fit and accept touch input', async () => {
            const { page, context, errors } = await fixture(browser, { mobile: true });
            let fail = true;
            await context.route('https://api.open-meteo.com/**', route => fail ? route.abort() : route.fulfill({ json: forecast() }));
            await addWeather(page, taipei);
            await page.locator('.weather-body.is-error').waitFor();
            await hitTest(page, '.weather-locate', true);
            await hitTest(page, '.weather-retry', true);
            fail = false;
            await page.locator('.weather-retry').tap();
            await ready(page);
            await hitTest(page, '.weather-locate', true);
            await hitTest(page, '.weather-retry', true);
            assert.equal(await page.locator('.weather-body').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
            assert.equal(await page.locator('.weather-status').isVisible(), true);
            await page.screenshot({ path: '.impeccable/review/weather-current-mobile.png' });
            assert.deepEqual(errors, []);
            await context.close();
        });

        await test('small saved weather widget retains visible errors and recovery hit targets', async () => {
            const { page, context, errors } = await fixture(browser);
            await context.route('https://api.open-meteo.com/**', route => route.abort());
            await addWeather(page, taipei);
            await page.evaluate(() => {
                const layout = NewtabWidgets.getLayout();
                const widget = layout.widgets.find(w => w.type === 'weather');
                widget.w = 160 / innerWidth;
                widget.h = 160 / innerHeight;
                localStorage.setItem('nt_layout_v1', JSON.stringify(layout));
            });
            await page.reload();
            await page.locator('.weather-body.is-error').waitFor();
            await hitTest(page, '.weather-locate');
            await hitTest(page, '.weather-retry');
            assert.equal(await page.locator('.weather-status').evaluate(el => {
                const r = el.getBoundingClientRect();
                const p = el.closest('.weather-body').getBoundingClientRect();
                return r.height > 0 && r.top >= p.top && r.bottom <= p.bottom + 1;
            }), true, 'compact rules cannot hide failure text');
            assert.deepEqual(errors, []);
            await context.close();
        });
    } finally { await browser.close(); }
    console.log(`Weather: ${passed} passed, ${failures.length} failed`);
    if (failures.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
