// Isolated weather/clock fixtures, never the user's location or provider account.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = process.env.NEWTAB_TEST_URL || 'http://127.0.0.1:4174/';
const taipei = { lat: 25.033, lon: 121.565, city: '台北', timeZone: 'Asia/Taipei', locationSource: 'manual' };
const tokyo = { lat: 35.68, lon: 139.76, city: '東京', timeZone: 'Asia/Tokyo', locationSource: 'manual' };
function forecast() {
    const start = Math.floor(Date.now() / 3600000) * 3600000;
    return { timezone: 'Asia/Taipei', utc_offset_seconds: 28800,
        current: { temperature_2m: 24, weather_code: 2, wind_speed_10m: 2, relative_humidity_2m: 65 },
        hourly: { time: Array.from({ length: 48 }, (_, i) => start / 1000 + i * 3600), temperature_2m: Array(48).fill(24), weather_code: Array(48).fill(2) },
        daily: { time: [start / 1000, start / 1000 + 86400], temperature_2m_max: [27, 28], temperature_2m_min: [21, 22], weather_code: [2, 2] } };
}
function layout(options = taipei) {
    return { v: 4, companionMigrated: true, rail: { open: false, tab: 'personalize', width: 320 }, widgets: [
        { id: 'weather-1', type: 'weather', x: .12, y: .1, w: .3, h: .45, z: 1, options },
        { id: 'notes-1', type: 'notes', x: .6, y: .1, w: .2, h: .2, z: 2, options: { content: '原筆記' } },
        { id: 'notes-remove', type: 'notes', x: .6, y: .4, w: .2, h: .2, z: 3, options: { content: '可移除' } }
    ] };
}
async function fixture(browser, { options, viewport = { width: 1440, height: 900 }, mobile = false } = {}) {
    const context = await browser.newContext({ viewport, hasTouch: mobile, isMobile: mobile, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const count = { primary: 0 }, errors = [];
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    await context.route(/^https?:\/\//, route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
    // This suite exercises weather and native controls, not large wallpaper/Live2D assets.
    await context.route(/\/assets\/(character|nachoneko)\//, route => route.abort());
    await context.route('https://api.open-meteo.com/**', async route => { count.primary++; await new Promise(resolve => setTimeout(resolve, 80)); await route.fulfill({ json: forecast() }); });
    await context.addInitScript(seed => {
        if (location.protocol === 'about:') return;
        if (!localStorage.getItem('nt_layout_v1')) localStorage.setItem('nt_layout_v1', JSON.stringify(seed));
        window.weatherGeoCalls = [];
        Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
            getCurrentPosition(success, error) { weatherGeoCalls.push({ success, error }); }
        } });
        window.weatherTicks = []; const interval = window.setInterval;
        window.setInterval = function (callback, delay, ...rest) { if (delay === 60000) weatherTicks.push(callback); return interval(callback, delay, ...rest); };
    }, layout(options));
    const page = await context.newPage(); await page.goto(base); await page.waitForFunction(() => window.NewtabWidgets && document.querySelector('.weather-body'));
    return { context, page, count, errors };
}
async function ready(page) { await page.waitForFunction(() => document.querySelector('.weather-temp')?.textContent === '24°' && document.querySelector('.weather-body')?.getAttribute('aria-busy') === 'false'); }
async function choose(page, location = tokyo) {
    return page.evaluate(location => {
        const open = NewtabWeatherLocation.open; let saved;
        NewtabWeatherLocation.open = config => { saved = config.onSelect(location); };
        document.querySelector('.weather-city-button').click(); NewtabWeatherLocation.open = open; return saved;
    }, location);
}
async function stored(page) { return page.evaluate(() => JSON.parse(localStorage.getItem('nt_layout_v1'))); }
const widget = (data, id) => data.widgets.find(w => w.id === id);
async function saveSettings(page, onOpen, minutes) {
    await page.getByRole('button', { name: '天氣設定', exact: true }).click();
    await page.locator('#weather-refresh-on-open').setChecked(onOpen);
    await page.locator('#weather-refresh-minutes').selectOption(String(minutes));
    await page.getByRole('button', { name: '儲存設定', exact: true }).click();
    await page.locator('.weather-settings-dialog').waitFor({ state: 'detached' });
}
(async () => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.NEWTAB_BROWSER_PATH || 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe' });
    async function test(name, options, run) {
        if (process.env.WEATHER_CASE && !new RegExp(process.env.WEATHER_CASE).test(name)) return;
        const data = await fixture(browser, options);
        try { await run(data); assert.deepEqual(data.errors, []); console.log('PASS ' + name); }
        finally { await data.context.close(); }
    }
    try {
        await test('location saves during arrangement and survives Cancel and immediate reload', { options: { lat: null, lon: null, city: '' } }, async ({ page }) => {
            await page.waitForFunction(() => weatherGeoCalls.length === 1);
            const before = await stored(page);
            await page.evaluate(() => NewtabWidgets.enterArrange());
            await page.evaluate(() => weatherGeoCalls[0].success({ coords: { latitude: 35.68, longitude: 139.76 } })); await ready(page);
            const during = await stored(page);
            assert.equal(widget(during, 'weather-1').options.lat, 35.68);
            assert.equal(await page.evaluate(() => NewtabWidgets.isArranging()), true);
            for (const key of ['x', 'y', 'w', 'h']) assert.equal(widget(during, 'weather-1')[key], widget(before, 'weather-1')[key], 'uncommitted geometry stays out of storage');
            await page.evaluate(() => NewtabWidgets.cancelArrange());
            assert.equal(widget(await stored(page), 'weather-1').options.lat, 35.68);
            await page.reload(); await ready(page);
            assert.equal(await page.evaluate(() => weatherGeoCalls.length), 0, 'saved coordinates never require permission again');
        });
        await test('a GPS callback preserves note text still waiting for its save debounce', { options: { lat: null, lon: null, city: '' } }, async ({ page }) => {
            await page.waitForFunction(() => weatherGeoCalls.length === 1);
            await page.locator('.widget[data-id="notes-1"] textarea').fill('定位期間仍在輸入的筆記');
            await page.evaluate(() => weatherGeoCalls[0].success({ coords: { latitude: 35.68, longitude: 139.76 } })); await ready(page);
            assert.equal(await page.evaluate(() => NewtabWidgets.getLayout().widgets.find(w => w.id === 'notes-1').options.content), '定位期間仍在輸入的筆記');
            await page.waitForTimeout(550); assert.equal(widget(await stored(page), 'notes-1').options.content, '定位期間仍在輸入的筆記');
            await page.reload(); await ready(page); assert.equal(await page.locator('.widget[data-id="notes-1"] textarea').inputValue(), '定位期間仍在輸入的筆記');
        });
        for (const ending of ['exitArrange', 'cancelArrange']) await test('note typing immediately before arrangement survives ' + ending, {}, async ({ page }) => {
            await ready(page);
            await page.locator('.widget[data-id="notes-1"] textarea').fill('排列開始前的未儲存筆記');
            await page.evaluate(ending => { NewtabWidgets.enterArrange(); NewtabWidgets[ending](); }, ending);
            assert.equal(widget(await stored(page), 'notes-1').options.content, '排列開始前的未儲存筆記');
        });
        for (const action of ['close', 'reload', 'note-save-and-hide']) await test('a stale tab cannot overwrite another tab’s location/preferences on ' + action, {}, async ({ page, context }) => {
            await ready(page);
            const other = await context.newPage(); await other.goto(base); await ready(other);
            await choose(other); await ready(other); await saveSettings(other, false, 120);
            if (action === 'close') await page.close();
            else if (action === 'reload') { await page.reload(); await ready(page); }
            else {
                await page.bringToFront(); await page.locator('.widget[data-id="notes-1"] textarea').fill('只更新筆記');
                await page.waitForTimeout(550); await other.bringToFront();
                await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide')));
            }
            const result = await stored(other); const weather = widget(result, 'weather-1').options;
            assert.equal(weather.city, '東京'); assert.equal(weather.lat, tokyo.lat);
            assert.equal(weather.weatherRefreshOnOpen, false); assert.equal(weather.weatherRefreshMinutes, 120);
            if (action === 'note-save-and-hide') assert.equal(widget(result, 'notes-1').options.content, '只更新筆記');
        });
        for (const ending of ['cancelArrange', 'exitArrange']) await test('legacy weather save preserves another tab’s edits/additions/removals through ' + ending, {}, async ({ page, context }) => {
            await ready(page);
            if (ending === 'exitArrange') await page.evaluate(() => {
                const set = Storage.prototype.setItem;
                Storage.prototype.setItem = function (key, value) {
                    if (key === 'nt_layout_profiles_v1') throw new DOMException('Blocked', 'QuotaExceededError'); return set.call(this, key, value);
                };
                NewtabLayoutProfiles.enable('prepared-profile', '未完成的版面'); Storage.prototype.setItem = set;
                if (localStorage.getItem('nt_layout_profiles_v1') || !NewtabLayoutProfiles.getState().profiles.length) throw new Error('Expected prepared records without published profile config');
            });
            await page.evaluate(() => NewtabWidgets.enterArrange());
            const other = await context.newPage(); await other.goto(base); await ready(other);
            await other.evaluate(() => {
                const value = JSON.parse(localStorage.getItem('nt_layout_v1'));
                value.widgets.find(w => w.id === 'notes-1').options.content = '另一分頁的新筆記';
                value.widgets = value.widgets.filter(w => w.id !== 'notes-remove');
                value.widgets.push({ id: 'remote-added', type: 'notes', x: .7, y: .5, w: .1, h: .2, z: 4, options: { content: '遠端新增' } });
                localStorage.setItem('nt_layout_v1', JSON.stringify(value));
            });
            await choose(page); await ready(page);
            assert.equal(widget(await stored(page), 'notes-1').options.content, '另一分頁的新筆記');
            assert.equal(widget(await stored(page), 'weather-1').options.city, '東京');
            await other.evaluate(() => {
                const value = JSON.parse(localStorage.getItem('nt_layout_v1')); value.widgets.find(w => w.id === 'notes-1').options.content = '定位儲存後的更新';
                localStorage.setItem('nt_layout_v1', JSON.stringify(value));
            });
            await page.evaluate(ending => NewtabWidgets[ending](), ending);
            const result = await stored(page);
            assert.equal(widget(result, 'notes-1').options.content, '定位儲存後的更新');
            assert.equal(widget(result, 'remote-added').options.content, '遠端新增');
            assert.equal(widget(result, 'notes-remove'), undefined);
            assert.equal(widget(result, 'weather-1').options.city, '東京');
        });
        await test('late geolocation cannot replace another tab’s deliberate city', { options: { lat: null, lon: null, city: '' } }, async ({ page, context }) => {
            await page.waitForFunction(() => weatherGeoCalls.length === 1);
            const other = await context.newPage(); await other.goto(base); await other.waitForFunction(() => window.NewtabWidgets && document.querySelector('.weather-city-button'));
            await choose(other); await ready(other);
            await page.evaluate(() => weatherGeoCalls[0].success({ coords: { latitude: 40.71, longitude: -74 } })); await ready(page);
            assert.equal(await page.locator('.weather-city').innerText(), '東京');
            assert.equal(widget(await stored(page), 'weather-1').options.lat, tokyo.lat);
            await choose(other, { lat: 47.6, lon: -122.3, city: '西雅圖', timeZone: 'America/Los_Angeles', locationSource: 'manual' }); await ready(other);
            await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide')));
            assert.equal(widget(await stored(other), 'weather-1').options.city, '西雅圖', 'adopted remote values must not become local edits at the next save');
        });
        await test('a late location cannot resurrect a weather widget removed in another tab', { options: { lat: null, lon: null, city: '' } }, async ({ page, context, count }) => {
            await page.waitForFunction(() => weatherGeoCalls.length === 1); await page.evaluate(() => NewtabWidgets.enterArrange());
            const other = await context.newPage(); await other.goto(base); await other.waitForFunction(() => window.NewtabWidgets);
            await other.evaluate(() => NewtabWidgets.removeById('weather-1'));
            await page.evaluate(() => weatherGeoCalls[0].success({ coords: { latitude: 35.68, longitude: 139.76 } }));
            await page.waitForTimeout(100);
            assert.equal(widget(await stored(page), 'weather-1'), undefined);
            assert.equal(count.primary, 0, 'abandoned location does not issue a forecast request');
            await page.evaluate(() => NewtabWidgets.cancelArrange()); assert.equal(widget(await stored(page), 'weather-1'), undefined);
        });
        await test('settings persist; manual-only mode stays quiet; explicit refresh never relocates; reset keeps city', {}, async ({ page, count }) => {
            await ready(page); await saveSettings(page, false, 0);
            await page.reload(); await ready(page); const start = count.primary;
            await page.evaluate(() => {
                const now = Date.now; Date.now = () => now() + 2 * 3600000;
                weatherTicks.forEach(callback => callback()); dispatchEvent(new Event('online')); document.dispatchEvent(new Event('visibilitychange'));
            }); await page.waitForTimeout(180);
            assert.equal(count.primary, start);
            await page.evaluate(() => NewtabWidgets.refreshWeather('weather-1')); await ready(page);
            assert.equal(count.primary, start + 1); assert.equal(await page.evaluate(() => weatherGeoCalls.length), 0);
            await page.getByRole('button', { name: '天氣設定', exact: true }).click();
            assert.equal(await page.locator('#weather-refresh-minutes').inputValue(), '0');
            await page.getByRole('button', { name: '恢復預設', exact: true }).click();
            assert.equal(await page.locator('#weather-refresh-on-open').isChecked(), true); assert.equal(await page.locator('#weather-refresh-minutes').inputValue(), '30');
            await page.getByRole('button', { name: '儲存設定', exact: true }).click();
            const options = widget(await stored(page), 'weather-1').options;
            assert.equal(options.city, '台北'); assert.equal(options.weatherRefreshMinutes, 30);
        });
        await test('new tabs revalidate cached weather and concurrent automatic checks share one request', {}, async ({ page, context, count }) => {
            await ready(page);
            await page.evaluate(() => {
                const cache = JSON.parse(localStorage.getItem('nt_weather_cache')); cache.ts -= 5 * 60000; cache.data.fetchedAt = cache.ts;
                localStorage.setItem('nt_weather_cache', JSON.stringify(cache));
            }); const start = count.primary;
            const tabs = await Promise.all([context.newPage(), context.newPage()]);
            await Promise.all(tabs.map(async tab => { await tab.goto(base); await ready(tab); }));
            assert.equal(count.primary, start + 1);
        });
        await test('selected interval triggers only when due; failed location saves remain visible and preserve original', {}, async ({ page, count }) => {
            await ready(page); await saveSettings(page, false, 15);
            const start = count.primary;
            await page.evaluate(() => { const now = Date.now; window.weatherOffset = 14 * 60000; Date.now = () => now() + weatherOffset; weatherTicks.forEach(callback => callback()); });
            await page.waitForTimeout(120); assert.equal(count.primary, start);
            await page.evaluate(() => { weatherOffset = 16 * 60000; weatherTicks.forEach(callback => callback()); }); await ready(page); assert.equal(count.primary, start + 1);
            await page.evaluate(() => {
                const set = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) {
                    if (key === 'nt_layout_v1') throw new DOMException('Blocked', 'QuotaExceededError'); return set.call(this, key, value);
                };
            });
            assert.equal(await choose(page), false);
            assert.match(await page.locator('.weather-status').innerText(), /無法儲存新位置/);
            assert.equal(widget(await stored(page), 'weather-1').options.city, '台北');
        });
        for (const viewport of [{ width: 320, height: 480 }, { width: 390, height: 844 }, { width: 3440, height: 1440 }, { width: 5120, height: 1440 }]) {
            await test('gear/focus/appearance and settings fit ' + viewport.width, { viewport, mobile: viewport.width < 600 }, async ({ page }) => {
                await ready(page);
                await page.evaluate(() => NewtabWidgets.setAppearance('weather-1', { weatherButtonTint: '#b2d7ee', weatherButtonAlpha: .43, weatherButtonText: '#245167', weatherButtonRadius: 9 }));
                const visual = await page.locator('.weather-actions').evaluate(el => Array.from(el.querySelectorAll('button')).map(button => {
                    const s = getComputedStyle(button); return { background: s.backgroundColor, color: s.color, radius: s.borderRadius };
                }));
                assert.deepEqual(visual[2], visual[1], 'gear shares the existing editable action appearance');
                await page.getByRole('button', { name: '天氣設定', exact: true }).click();
                const box = await page.locator('.weather-settings-dialog').boundingBox();
                assert(box.x >= 11 && box.y >= 11 && box.x + box.width <= viewport.width - 11 && box.y + box.height <= viewport.height - 11);
                assert.equal(await page.locator('.weather-settings-dialog').evaluate(el => getComputedStyle(el, '::backdrop').backgroundColor), 'rgba(0, 0, 0, 0)');
                const heading = await page.locator('.weather-settings-header h2').boundingBox();
                await page.mouse.move(heading.x + 8, heading.y + 8); await page.mouse.down(); await page.waitForTimeout(610); await page.mouse.up();
                assert.equal(await page.evaluate(() => NewtabWidgets.isArranging()), false, 'holding sheet copy never starts desktop arrangement');
                await page.keyboard.press('Shift+Tab'); assert(await page.evaluate(() => document.activeElement.closest('.weather-settings-dialog') !== null));
                await page.keyboard.press('Escape'); await page.locator('.weather-settings-dialog').waitFor({ state: 'detached' });
                assert.equal(await page.evaluate(() => document.activeElement.classList.contains('weather-settings')), true);
                if (viewport.width < 600) {
                    await page.locator('.widget[data-type="weather"]').evaluate(el => { el.style.width = '160px'; el.style.height = '240px'; });
                    const targets = await page.locator('.weather-actions button').evaluateAll(buttons => buttons.map(button => {
                        const r = button.getBoundingClientRect(), host = button.closest('.widget').getBoundingClientRect();
                        return { width: r.width, height: r.height, inside: r.left >= host.left && r.right <= host.right,
                            hit: button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) };
                    }));
                    targets.forEach(target => { assert(target.width >= 44 && target.height >= 44); assert(target.inside && target.hit, 'all three actions remain usable inside a 160px card'); });
                }
            });
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
