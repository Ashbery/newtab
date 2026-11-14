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
const metForecast = (temp = 23.4, symbol = 'partlycloudy_day') => ({ properties: { timeseries: [{
    time: new Date().toISOString(), data: { instant: { details: { air_temperature: temp, relative_humidity: 72.2, wind_speed: 2.34 } },
        next_1_hours: { summary: { symbol_code: symbol } } }
}] } });
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

async function fixture(browser, { mobile = false, viewport, cache, controlledFetch = false, controlledMet = false, fastWeatherTimers = false, geolocationMode = 'controlled' } = {}) {
    const context = await browser.newContext({ viewport: viewport || (mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }),
        isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.route(/^https?:\/\//, route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.addInitScript(({ cache, controlledFetch, controlledMet, fastWeatherTimers, geolocationMode }) => {
        window.weatherGeoCalls = [];
        Object.defineProperty(navigator, 'geolocation', { configurable: true, value: geolocationMode === 'missing' ? undefined : {
            getCurrentPosition(success, error, options) {
                if (geolocationMode === 'throws') throw new Error('Synthetic location failure');
                window.weatherGeoCalls.push({ success, error, options });
            }
        } });
        if (fastWeatherTimers) {
            const timeout = window.setTimeout;
            window.setTimeout = function (callback, delay, ...args) {
                return timeout(callback, [8000,12000,30000].includes(delay) ? 150 : delay, ...args);
            };
        }
        if (cache && !sessionStorage.getItem('weather-fixture')) {
            sessionStorage.setItem('weather-fixture', '1');
            localStorage.setItem('nt_weather_cache', JSON.stringify(cache));
        }
        if (controlledFetch || controlledMet) {
            const original = window.fetch;
            window.weatherRequests = [];
            window.weatherMetCalls = [];
            window.fetch = function (url, options) {
                const calls = controlledFetch && String(url).includes('api.open-meteo.com') ? window.weatherRequests :
                    controlledMet && String(url).includes('api.met.no') ? window.weatherMetCalls : null;
                if (!calls) return original.apply(this, arguments);
                // Intentionally ignores AbortSignal to exercise the stale-result guard,
                // including providers that resolve after our own timeout/cancellation.
                return new Promise((resolve, reject) => calls.push({ url, options, resolve, reject }));
            };
        }
    }, { cache, controlledFetch, controlledMet, fastWeatherTimers, geolocationMode });
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

async function selectCity(page, location) {
    // The picker itself has a dedicated suite; exercise its real host callback.
    await page.evaluate(location => {
        const open = NewtabWeatherLocation.open;
        NewtabWeatherLocation.open = config => config.onSelect(location);
        document.querySelector('.weather-city-button').click();
        NewtabWeatherLocation.open = open;
    }, { ...location, locationSource: 'manual' });
}

async function test(name, run) {
    if (process.env.WEATHER_CASE && !name.includes(process.env.WEATHER_CASE)) return;
    try { await run(); passed++; console.log('PASS ' + name); }
    catch (error) { failures.push(name); console.error('FAIL ' + name + '\n' + error.stack); }
}

(async () => {
    const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
    try {
        await test('explicit Taipei choice cancels pending GPS and persists across reload', async () => {
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

        await test('denied location never silently selects Taipei; fresh re-location recovers through visible controls', async () => {
            const { page, context, errors } = await fixture(browser);
            let requests = 0;
            await context.route('https://api.open-meteo.com/**', route => { requests++; return route.fulfill({ json: forecast() }); });
            await addWeather(page);
            await page.waitForFunction(() => weatherGeoCalls.length === 1);
            await page.evaluate(() => weatherGeoCalls[0].error({ code: 1 }));
            await page.locator('.weather-body.is-error').waitFor();
            assert.match(await page.locator('.weather-status').innerText(), /未允許|權限|拒絕|允許/);
            assert.equal(await page.locator('.weather-temp').count(), 0);
            assert.equal(requests, 0, 'failed positioning makes no forecast request for a fabricated location');
            assert.equal(await page.evaluate(() => localStorage.getItem('nt_weather_cache')), null);
            assert.equal(await page.evaluate(() => NewtabWidgets.getLayout().widgets.find(w => w.type === 'weather').options.locationSource === 'fallback'), false);
            await hitTest(page, '.weather-locate');
            await page.locator('.weather-locate').click();
            assert.equal(await page.evaluate(() => weatherGeoCalls[1].options.maximumAge), 0, 'explicit relocation cannot reuse a ten-minute-old device fix');
            assert.equal(await page.evaluate(() => weatherGeoCalls[1].options.timeout), 12000);
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

        await test('legacy automatic fallback is not a saved city choice, even with a fresh cache', async () => {
            const { page, context, errors } = await fixture(browser, { cache: { ...taipei, ts: Date.now(), data: cachedData } });
            let requests = 0;
            await context.route('https://api.open-meteo.com/**', route => { requests++; return route.fulfill({ json: forecast(27) }); });
            await addWeather(page, { ...taipei, locationSource: 'fallback', locationNotice: '定位逾時，顯示台北' });
            await page.waitForFunction(() => weatherGeoCalls.length === 1);
            await page.evaluate(() => weatherGeoCalls[0].error({ code: 2 }));
            await page.locator('.weather-body.is-error').waitFor();
            assert.equal(await page.locator('.weather-temp').count(), 0, 'old fallback cache does not masquerade as local weather');
            assert.equal(requests, 0);
            await page.locator('.weather-retry').click(); await page.waitForFunction(() => weatherGeoCalls.length === 2);
            await page.evaluate(() => weatherGeoCalls[1].error({ code: 2 }));
            await page.reload(); await page.waitForFunction(() => weatherGeoCalls.length === 1);
            await page.evaluate(() => weatherGeoCalls[0].success({ coords: { latitude: 35.68, longitude: 139.76 } }));
            await ready(page, '27°'); assert.equal(requests, 1);
            assert.equal(await page.evaluate(() => NewtabWidgets.getLayout().widgets.find(w => w.type === 'weather').options.locationSource), 'device');
            assert.deepEqual(errors, []); await context.close();
        });

        await test('unavailable, timed-out, invalid and missing location providers leave actionable error states', async () => {
            for (const sample of [
                { code: 2, expected: /位置|定位/ }, { code: 3, expected: /逾時/ },
                { invalid: true, expected: /位置|定位/ }, { mode: 'missing', expected: /不支援|定位/ },
                { mode: 'throws', expected: /位置|定位/ }
            ]) {
                const { page, context, errors } = await fixture(browser, { geolocationMode: sample.mode || 'controlled' });
                let requests = 0;
                await context.route('https://api.open-meteo.com/**', route => { requests++; return route.fulfill({ json: forecast() }); });
                await addWeather(page);
                if (!sample.mode) {
                    await page.waitForFunction(() => weatherGeoCalls.length === 1);
                    await page.evaluate(sample => sample.invalid ? weatherGeoCalls[0].success({ coords: { latitude: 999, longitude: 0 } }) : weatherGeoCalls[0].error({ code: sample.code }), sample);
                }
                await page.locator('.weather-body.is-error').waitFor();
                assert.match(await page.locator('.weather-status').innerText(), sample.expected);
                assert.equal(await page.locator('.weather-body').getAttribute('aria-busy'), 'false');
                assert.equal(await page.locator('.weather-temp').count(), 0); assert.equal(requests, 0);
                await hitTest(page, '.weather-locate'); await hitTest(page, '.weather-city-button');
                assert.equal(await page.evaluate(() => localStorage.getItem('nt_weather_cache')), null);
                assert.deepEqual(errors, []); await context.close();
            }
        });

        await test('newest location attempt wins and a failed relocation preserves a reliable city without persisting its error', async () => {
            const { page, context, errors } = await fixture(browser);
            let requests = 0;
            await context.route('https://api.open-meteo.com/**', route => { requests++; return route.fulfill({ json: forecast() }); });
            await addWeather(page);
            await page.waitForFunction(() => weatherGeoCalls.length === 1);
            await page.locator('.weather-locate').click(); await page.waitForFunction(() => weatherGeoCalls.length === 2);
            await page.evaluate(() => weatherGeoCalls[0].success({ coords: { latitude: 25.033, longitude: 121.565 } }));
            assert.equal(requests, 0, 'cancelled GPS result cannot start a forecast');
            await page.evaluate(() => weatherGeoCalls[1].success({ coords: { latitude: 35.68, longitude: 139.76 } }));
            await ready(page); assert.equal(requests, 1);
            await page.locator('.weather-locate').click();
            assert.equal(await page.locator('.weather-temp').innerText(), '24°', 'prior weather remains useful during a new attempt');
            await page.evaluate(() => weatherGeoCalls[2].error({ code: 1 }));
            await ready(page);
            assert.match(await page.locator('.weather-status').innerText(), /保留|原位置|先前/);
            const saved = await page.evaluate(() => NewtabWidgets.getLayout().widgets.find(w => w.type === 'weather').options);
            assert.equal(saved.locationSource, 'device'); assert.equal(saved.locationNotice || '', '', 'temporary denial is not durable location metadata');
            assert.deepEqual(errors, []); await context.close();
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

        await test('network-estimated city stays labelled during loading, failure, recovery and cached reload', async () => {
            const { page, context, errors } = await fixture(browser, { controlledFetch: true });
            await addWeather(page, { ...taipei, locationSource: 'network', locationNotice: '網路估算位置' });
            await page.waitForFunction(() => weatherRequests.length === 1);
            assert.match(await page.locator('.weather-status').innerText(), /網路估算/, 'pending estimate is never presented as a device fix');
            await page.evaluate(() => weatherRequests[0].reject(new Error('Synthetic unavailable forecast')));
            await page.locator('.weather-body.is-error').waitFor();
            assert.match(await page.locator('.weather-status').innerText(), /網路估算/);
            await page.locator('.weather-retry').click();
            await page.waitForFunction(() => weatherRequests.length === 2);
            await page.evaluate(json => weatherRequests[1].resolve({ ok: true, json: () => Promise.resolve(json) }), forecast());
            await ready(page);
            assert.match(await page.locator('.weather-status').innerText(), /網路估算/);
            await page.locator('.weather-retry').click();
            await page.waitForFunction(() => weatherRequests.length === 3);
            assert.match(await page.locator('.weather-status').innerText(), /網路估算/, 'refresh retains the approximation marker beside old readings');
            await page.evaluate(() => weatherRequests[2].reject(new Error('Synthetic failed refresh')));
            await page.locator('.weather-body.is-offline').waitFor();
            assert.equal(await page.locator('.weather-temp').innerText(), '24°');
            assert.match(await page.locator('.weather-status').innerText(), /更新失敗.*網路估算/);
            await page.reload(); await ready(page);
            assert.match(await page.locator('.weather-status').innerText(), /網路估算/);
            assert.equal(await page.evaluate(() => weatherGeoCalls.length), 0);
            assert.equal(await page.evaluate(() => weatherRequests.length), 0, 'saved approximation reuses its own fresh cache');
            assert.deepEqual(errors, []); await context.close();
        });

        await test('MET fallback credits real forecast data and preserves three-hour cache through force, reload and city roundtrips', async () => {
            const { page, context, errors } = await fixture(browser);
            let primaryCalls = 0, backupCalls = 0;
            const location = { lat: 25.03312345, lon: 121.56598765, city: '測試甲' };
            await context.route('https://api.open-meteo.com/**', route => { primaryCalls++; return route.abort(); });
            await context.route('https://api.met.no/**', route => {
                backupCalls++;
                const url = new URL(route.request().url());
                assert.equal(url.pathname, '/weatherapi/locationforecast/2.0/compact');
                for (const key of ['lat', 'lon']) assert.match(url.searchParams.get(key), /^-?\d+(?:\.\d{1,4})?$/);
                assert.equal(route.request().headers()['if-modified-since'], undefined, 'browser request introduces no custom preflight header');
                return route.fulfill({ json: metForecast(), headers: { Expires: new Date(Date.now() + 3600000).toUTCString() } });
            });
            await addWeather(page, location); await ready(page, '23°');
            assert.equal(primaryCalls, 1); assert.equal(backupCalls, 1);
            assert.equal(await page.locator('.weather-source a').first().innerText(), 'MET Norway');
            assert.equal(await page.locator('.weather-source a').nth(1).getAttribute('href'), 'https://creativecommons.org/licenses/by/4.0/');
            assert.match(await page.locator('.weather-source-note').innerText(), /預報.*四捨五入/);
            assert.equal(await page.locator('.weather-hum').innerText(), '濕度 72%');
            assert.equal(await page.locator('.weather-wind').innerText(), '風 2.3m/s');
            assert.equal(await page.locator('.weather-hi').innerText(), '');
            assert.equal(await page.locator('.weather-lo').innerText(), '');
            assert.equal(await page.locator('.weather-feels').innerText(), '', 'no invented feels-like or daily extremes');
            const firstFetched = await page.locator('.weather-fetched').getAttribute('datetime');
            const stored = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('nt_weather_met_cache_v1')))[0].data);
            assert.equal(stored.provider, 'met-no'); assert.equal(stored.code, 2);
            assert(stored.refreshAfter - stored.fetchedAt >= 10800000, 'shorter Expires never reduces the three-hour floor');
            for (let i = 0; i < 3; i++) { await page.locator('.weather-retry').click(); await ready(page, '23°'); }
            await page.evaluate(() => dispatchEvent(new Event('online'))); await ready(page, '23°');
            assert.equal(primaryCalls, 1); assert.equal(backupCalls, 1);
            assert.equal(await page.locator('.weather-fetched').getAttribute('datetime'), firstFetched, 'Update does not pretend cached weather was just fetched');
            await selectCity(page, { lat: 35.68, lon: 139.76, city: '測試乙' }); await ready(page, '23°');
            assert.equal(primaryCalls, 2); assert.equal(backupCalls, 2);
            await selectCity(page, location); await ready(page, '23°');
            assert.equal(primaryCalls, 2); assert.equal(backupCalls, 2, 'A/B/A restores A from its own provider cache');
            await page.reload(); await ready(page, '23°');
            assert.equal(primaryCalls, 2); assert.equal(backupCalls, 2);
            assert.equal(await page.locator('.weather-fetched').getAttribute('datetime'), firstFetched);
            assert.deepEqual(errors, []); await context.close();
        });

        await test('MET honors a longer Expires header and permits refresh only after that boundary', async () => {
            const { page, context, errors } = await fixture(browser);
            let backupCalls = 0;
            const expires = Date.now() + 5 * 3600000;
            await context.route('https://api.met.no/**', route => {
                backupCalls++;
                const json = metForecast(21.7, 'unknown_provider_symbol');
                // The second synthetic response describes the advanced clock.
                json.properties.timeseries[0].time = new Date(Date.now() + (backupCalls > 1 ? 5 * 3600000 + 2000 : 0)).toISOString();
                return route.fulfill({ json, headers: { Expires: new Date(expires).toUTCString() } });
            });
            await addWeather(page, taipei); await ready(page, '22°');
            assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('nt_weather_cache')).data.code), null, 'unknown conditions are not reported as clear skies');
            await page.evaluate(() => { const now = Date.now; window.weatherClock = now; Date.now = () => now() + 4 * 3600000; });
            await page.locator('.weather-retry').click(); await ready(page, '22°'); assert.equal(backupCalls, 1);
            await page.evaluate(() => { Date.now = () => weatherClock() + 5 * 3600000 + 2000; });
            await page.locator('.weather-retry').click(); await ready(page, '22°'); assert.equal(backupCalls, 2);
            assert.deepEqual(errors, []); await context.close();
        });

        await test('MET memory cache still prevents repeat requests when browser storage rejects writes', async () => {
            const { page, context, errors } = await fixture(browser);
            let backupCalls = 0;
            await page.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException('Blocked', 'QuotaExceededError'); }; });
            await context.route('https://api.met.no/**', route => { backupCalls++; return route.fulfill({ json: metForecast() }); });
            await addWeather(page, taipei); await ready(page, '23°');
            await page.locator('.weather-retry').click(); await ready(page, '23°');
            await selectCity(page, { lat: 35.68, lon: 139.76, city: '測試乙' }); await ready(page, '23°');
            await selectCity(page, taipei); await ready(page, '23°');
            assert.equal(backupCalls, 2);
            assert.deepEqual(errors, []); await context.close();
        });

        await test('MET fallback starts after bounded primary timeout and malformed backup cannot poison caches', async () => {
            const { page, context, errors } = await fixture(browser, { controlledFetch: true, controlledMet: true, fastWeatherTimers: true });
            await addWeather(page, taipei);
            await page.waitForFunction(() => weatherMetCalls.length === 1);
            assert.equal(await page.evaluate(() => weatherRequests[0].options.signal.aborted), true);
            await page.evaluate(json => weatherMetCalls[0].resolve({ ok: true, json: () => Promise.resolve(json) }), metForecast());
            await ready(page, '23°');
            await page.evaluate(json => weatherRequests[0].resolve({ ok: true, json: () => Promise.resolve(json) }), forecast(99));
            assert.equal(await page.locator('.weather-temp').innerText(), '23°', 'late primary response cannot overwrite fallback');
            await selectCity(page, { lat: 35.68, lon: 139.76, city: '無效測試' });
            await page.waitForFunction(() => weatherMetCalls.length === 2);
            await page.evaluate(() => weatherMetCalls[1].resolve({ ok: true, json: () => Promise.resolve({ properties: { timeseries: [] } }) }));
            await page.locator('.weather-body.is-error').waitFor();
            assert.equal(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('nt_weather_met_cache_v1'))).length), 1);
            assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('nt_weather_cache')).lat), taipei.lat);
            assert.deepEqual(errors, []); await context.close();
        });

        await test('MET cancelled city and removed-widget responses cannot cache or repaint stale weather', async () => {
            const { page, context, errors } = await fixture(browser, { controlledMet: true });
            await addWeather(page, taipei); await page.waitForFunction(() => weatherMetCalls.length === 1);
            await selectCity(page, { lat: 35.68, lon: 139.76, city: '測試乙' });
            await page.waitForFunction(() => weatherMetCalls.length === 2);
            assert.equal(await page.evaluate(() => weatherMetCalls[0].options.signal.aborted), true);
            await page.evaluate(json => weatherMetCalls[0].resolve({ ok: true, json: () => Promise.resolve(json) }), metForecast(99));
            assert.equal(await page.evaluate(() => localStorage.getItem('nt_weather_met_cache_v1')), null);
            await page.evaluate(json => weatherMetCalls[1].resolve({ ok: true, json: () => Promise.resolve(json) }), metForecast(27));
            await ready(page, '27°');
            await selectCity(page, { lat: 40, lon: 140, city: '測試丙' });
            await page.waitForFunction(() => weatherMetCalls.length === 3);
            await page.evaluate(() => NewtabWidgets.removeById(NewtabWidgets.getLayout().widgets.find(w => w.type === 'weather').id));
            await page.evaluate(json => weatherMetCalls[2].resolve({ ok: true, json: () => Promise.resolve(json) }), metForecast(88));
            assert.equal(await page.locator('.weather-body').count(), 0);
            assert.equal(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('nt_weather_met_cache_v1'))).length), 1);
            assert.deepEqual(errors, []); await context.close();
        });

        await test('MET bounded cache retains all fresh places and only evicts expired entries', async () => {
            for (const oneExpired of [false, true]) {
                const { page, context, errors } = await fixture(browser);
                await page.evaluate(({ oneExpired, cachedData }) => {
                    const entries = {};
                    for (let i = 0; i < 50; i++) {
                        const fetchedAt = Date.now() - (oneExpired && i === 0 ? 4 * 3600000 : 60000);
                        entries[i + ',0'] = { data: { ...cachedData, provider: 'met-no', fetchedAt, refreshAfter: fetchedAt + 10800000 } };
                    }
                    localStorage.setItem('nt_weather_met_cache_v1', JSON.stringify(entries));
                }, { oneExpired, cachedData });
                let requests = 0;
                await context.route('https://api.met.no/**', route => { requests++; return route.fulfill({ json: metForecast() }); });
                await addWeather(page, taipei);
                if (oneExpired) await ready(page, '23°');
                else await page.locator('.weather-body.is-error').waitFor();
                assert.equal(requests, oneExpired ? 1 : 0, 'never retrieve a new forecast without space to retain its refresh boundary');
                const keys = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('nt_weather_met_cache_v1'))));
                assert.equal(keys.length, 50);
                assert.equal(keys.includes('0,0'), !oneExpired);
                for (let i = 1; i < 50; i++) assert(keys.includes(i + ',0'));
                assert.deepEqual(errors, []); await context.close();
            }
        });

        await test('MET reserves its final cache slot before concurrent requests begin', async () => {
            // The UI currently allows one weather widget. Exercise the actual
            // provider helpers independently so pending capacity is protected
            // if multiple consumers are introduced later.
            for (const withExpired of [false, true]) {
            const stored = {};
            const entries = {};
            for (let i = 0; i < 49; i++) entries[i + ',0'] = { data: { ...cachedData, provider: 'met-no', fetchedAt: Date.now(), refreshAfter: Date.now() + 10800000 } };
            if (withExpired) entries['49,0'] = { data: { ...cachedData, provider: 'met-no', fetchedAt: Date.now() - 4 * 3600000, refreshAfter: Date.now() - 3600000 } };
            stored.nt_weather_met_cache_v1 = JSON.stringify(entries);
            const requests = [];
            const sandbox = { setTimeout, clearTimeout, AbortController, Date, fetch: () => new Promise(resolve => requests.push(resolve)),
                localStorage: { getItem: key => stored[key] || null, setItem: (key, value) => { stored[key] = value; } } };
            sandbox.window = sandbox;
            const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../js/widget-host.js'), 'utf8')
                .replace('global.NewtabWidgets = {', 'global.weatherProviderTest = { fetch: fetchMetWeather, write: writeWeatherCache }; global.NewtabWidgets = {');
            require('node:vm').runInNewContext(source, sandbox);
            const api = sandbox.weatherProviderTest;
            let firstData, secondError;
            api.fetch(60, 10, (err, data) => { assert.ifError(err); firstData = data; api.write(60, 10, data); });
            api.fetch(61, 10, err => { secondError = err; });
            await new Promise(resolve => setImmediate(resolve));
            assert.equal(requests.length, 1, 'only one request can reserve the remaining cache slot');
            assert(secondError, 'second place must not start a forecast that cannot be retained');
            requests[0]({ ok: true, json: async () => metForecast() });
            await new Promise(resolve => setImmediate(resolve));
            assert(firstData); assert.equal(Object.keys(JSON.parse(stored.nt_weather_met_cache_v1)).length, 50);
            let cached;
            api.fetch(60, 10, (err, data) => { assert.ifError(err); cached = data; });
            assert.equal(cached.fetchedAt, firstData.fetchedAt); assert.equal(requests.length, 1);
            }
        });

        await test('MET sleet renders a mixed precipitation condition and exposes the forecast valid time', async () => {
            const { page, context, errors } = await fixture(browser);
            await context.route('https://api.met.no/**', route => route.fulfill({ json: metForecast(2.3, 'lightsleetshowers_day') }));
            await addWeather(page, taipei); await ready(page, '2°');
            assert.equal(await page.locator('.weather-glyph').getAttribute('aria-label'), '雨夾雪');
            assert.match(await page.locator('.weather-status').innerText(), /雨夾雪/);
            assert.equal(await page.locator('.weather-glyph svg path[stroke="#79b6cf"]').count(), 1, 'mixed precipitation contains rain');
            assert.equal(await page.locator('.weather-glyph svg path[stroke="#86b3cb"]').count(), 1, 'mixed precipitation contains snow');
            assert.match(await page.locator('.weather-fetched').getAttribute('title'), /更新間隔至少 3 小時.*預報有效時間/);
            assert.deepEqual(errors, []); await context.close();
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

        await test('location watchdog never fabricates a place and a late GPS callback cannot persist it', async () => {
            const { page, context, errors } = await fixture(browser, { controlledFetch: true, fastWeatherTimers: true });
            await addWeather(page);
            await page.locator('.weather-body.is-error').waitFor();
            assert.match(await page.locator('.weather-status').innerText(), /逾時/);
            assert.equal(await page.evaluate(() => weatherRequests.length), 0);
            const stored = await page.evaluate(() => NewtabWidgets.getLayout().widgets.find(w => w.type === 'weather').options);
            assert.equal(stored.lat, null); assert.equal(stored.lon, null);
            await page.evaluate(() => weatherGeoCalls[0].success({ coords: { latitude: 35.68, longitude: 139.76 } }));
            assert.equal(await page.evaluate(() => weatherRequests.length), 0);
            assert.equal(await page.evaluate(() => localStorage.getItem('nt_weather_cache')), null);
            assert.deepEqual(errors, []); await context.close();
        });

        await test('network timeout remains retryable and late responses cannot persist stale data', async () => {
            const { page, context, errors } = await fixture(browser, { controlledFetch: true, fastWeatherTimers: true });
            await addWeather(page, taipei);
            await page.waitForFunction(() => weatherRequests.length === 1);
            await page.locator('.weather-body.is-error').waitFor();
            assert.match(await page.locator('.weather-status').innerText(), /逾時/);
            await page.evaluate(json => weatherRequests[0].resolve({ ok: true, json: () => Promise.resolve(json) }), forecast(41));
            assert.equal(await page.evaluate(() => localStorage.getItem('nt_weather_cache')), null);
            await page.locator('.weather-retry').click();
            await page.waitForFunction(() => weatherRequests.length === 2);
            await page.evaluate(json => weatherRequests[1].resolve({ ok: true, json: () => Promise.resolve(json) }), forecast());
            await ready(page);
            assert.deepEqual(errors, []);
            await context.close();
        });

        await test('manual city selection cancels pending GPS, survives reload, and never reprompts for location', async () => {
            const { page, context, errors } = await fixture(browser, { mobile: true });
            let requests = 0;
            await context.route('https://api.open-meteo.com/**', route => { requests++; return route.fulfill({ json: forecast(27) }); });
            await context.route('https://geocoding-api.open-meteo.com/**', route => route.fulfill({ json: { results: [
                { id: 1, name: '測試城市', latitude: 35.68, longitude: 139.76, country: '測試地區', admin1: '測試行政區' }
            ] } }));
            await addWeather(page); await page.waitForFunction(() => weatherGeoCalls.length === 1);
            await hitTest(page, '.weather-city-button', true);
            assert.equal(await page.evaluate(() => typeof window.NewtabWeatherLocation?.open), 'function', 'the page includes the manual city picker');
            await page.getByRole('button', { name: '選擇天氣城市', exact: true }).tap();
            await page.locator('.weather-location-dialog').waitFor({ state: 'visible' });
            await page.getByLabel('城市名稱', { exact: true }).fill('測試城市');
            await page.getByRole('button', { name: '搜尋城市', exact: true }).tap();
            await page.locator('.weather-location-result').first().tap();
            await ready(page, '27°');
            assert.match(await page.locator('.weather-city').innerText(), /測試城市/);
            await page.evaluate(() => weatherGeoCalls[0].success({ coords: { latitude: 25.033, longitude: 121.565 } }));
            assert.equal(requests, 1); assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('nt_weather_cache')).lat), 35.68);
            assert.equal(await page.evaluate(() => NewtabWidgets.getLayout().widgets.find(w => w.type === 'weather').options.locationSource), 'manual');
            await page.reload(); await ready(page, '27°');
            assert.equal(await page.evaluate(() => weatherGeoCalls.length), 0);
            assert.equal(requests, 1, 'fresh cache for a deliberate city choice remains usable');
            assert.match(await page.locator('.weather-city').innerText(), /測試城市/);
            assert.deepEqual(errors, []); await context.close();
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
            await addWeather(page);
            const compact = await page.evaluate(() => {
                const layout = NewtabWidgets.getLayout();
                const widget = layout.widgets.find(w => w.type === 'weather');
                widget.w = 160 / innerWidth;
                widget.h = 160 / innerHeight;
                if (widget.options.homeDesktop) Object.assign(widget.options.homeDesktop, { width: 160, height: 160, spanX: null, spanY: null });
                return layout;
            });
            // The outgoing page saves live state on pagehide; seed the saved
            // profile before the next load rather than having that save undo it.
            await page.addInitScript(layout => localStorage.setItem('nt_layout_v1', JSON.stringify(layout)), compact);
            await page.reload();
            await page.waitForFunction(() => weatherGeoCalls.length === 1);
            await page.evaluate(() => weatherGeoCalls[0].error({ code: 1 }));
            await page.locator('.weather-body.is-error').waitFor();
            const size = await page.locator('.widget[data-type="weather"]').boundingBox();
            assert.equal(size.width, 160); assert.equal(size.height, 160, 'fixture really uses the saved small profile');
            await hitTest(page, '.weather-locate');
            await hitTest(page, '.weather-retry');
            await hitTest(page, '.weather-city-button');
            assert.equal(await page.locator('.weather-status').evaluate(el => {
                const r = el.getBoundingClientRect();
                const p = el.closest('.weather-body').getBoundingClientRect();
                return r.height > 0 && r.top >= p.top && r.bottom <= p.bottom + 1;
            }), true, 'compact rules cannot hide failure text');
            assert.deepEqual(errors, []);
            await context.close();
        });

        await test('long permission guidance and city recovery remain readable on a 320px phone', async () => {
            const { page, context, errors } = await fixture(browser, { mobile: true, viewport: { width: 320, height: 640 } });
            await addWeather(page); await page.waitForFunction(() => weatherGeoCalls.length === 1);
            await page.evaluate(() => weatherGeoCalls[0].error({ code: 1 }));
            await page.locator('.weather-body.is-error').waitFor();
            assert.match(await page.locator('.weather-status').innerText(), /Brave|權限/);
            assert(await page.locator('.weather-status').evaluate(el => {
                const r = el.getBoundingClientRect(), body = el.closest('.weather-body'), p = body.getBoundingClientRect();
                return r.width > 0 && r.height > 0 && el.scrollWidth <= el.clientWidth + 1 &&
                    el.scrollHeight <= el.clientHeight + 1 && r.top >= p.top && r.bottom <= p.bottom + 1;
            }), 'complete location guidance is visible, not clipped or replaced by a tooltip');
            await hitTest(page, '.weather-locate', true); await hitTest(page, '.weather-city-button', true); await hitTest(page, '.weather-default', true);
            await page.screenshot({ path: '.impeccable/review/weather-permission-320.png' });
            assert.deepEqual(errors, []); await context.close();
        });
    } finally { await browser.close(); }
    console.log(`Weather: ${passed} passed, ${failures.length} failed`);
    if (failures.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
