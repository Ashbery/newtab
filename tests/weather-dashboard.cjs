// Real weather widget/controls with synthetic provider data; no external APIs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test, before, after } = require('node:test');
const { chromium } = require('playwright');
const base = process.env.NEWTAB_TEST_URL || 'http://127.0.0.1:4174/';
const origin = new URL(base).origin;
const place = { lat: 25.033, lon: 121.565, city: '測試城市', locationSource: 'manual', timeZone: 'UTC' };
const HOUR = 3600000;
const start = Math.floor(Date.now() / (24 * HOUR)) * 24 * HOUR;
const dates = Array.from({ length: 7 }, (_, i) => new Date(start + i * 24 * HOUR).toISOString().slice(0, 10));

function openForecast(temperature = 26) {
    const hours = Array.from({ length: 168 }, (_, i) => i);
    return { timezone: 'UTC', utc_offset_seconds: 0,
        current: { time: Math.floor(Date.now() / 1000), temperature_2m: temperature, weather_code: 2, apparent_temperature: 27,
            relative_humidity_2m: 64, wind_speed_10m: 3.4, wind_direction_10m: 90, is_day: 1 },
        hourly: { time: hours.map(i => (start + i * HOUR) / 1000),
            temperature_2m: hours.map(i => 18 + Math.floor(i / 24) + i % 24 / 10),
            weather_code: hours.map(() => 2), precipitation_probability: hours.map(i => i % 24 * 3),
            precipitation: hours.map(i => i % 8 / 10), wind_speed_10m: hours.map(i => 2 + i % 24 / 10),
            wind_direction_10m: hours.map(() => 90), is_day: hours.map(i => i % 24 >= 6 && i % 24 < 18 ? 1 : 0) },
        daily: { time: dates.map(date => Date.parse(date + 'T00:00:00Z') / 1000),
            temperature_2m_max: [28, 29, 30, 31, 32, 33, 34], temperature_2m_min: [20, 21, 22, 23, 24, 25, 26],
            weather_code: [2, 61, 3, 0, 2, 63, 1], precipitation_probability_max: [30, 60, 40, 0, 20, 70, 10],
            precipitation_sum: [1, 5, 2, 0, 1, 8, 0], wind_speed_10m_max: [4, 5, 6, 7, 8, 9, 10] } };
}

function metForecast() {
    return { properties: { timeseries: Array.from({ length: 57 }, (_, i) => ({
        time: new Date(start + i * 3 * HOUR).toISOString(), data: {
            instant: { details: { air_temperature: 23 + i % 6, relative_humidity: 70, wind_speed: 3.5, wind_from_direction: 180 } },
            next_6_hours: { summary: { symbol_code: 'rain_day' }, details: { precipitation_amount: 1.2 } }
        }
    })) } };
}

let browser;
before(async () => {
    const options = { headless: true };
    if (process.env.NEWTAB_BROWSER_PATH) options.executablePath = process.env.NEWTAB_BROWSER_PATH;
    else options.channel = process.env.PLAYWRIGHT_CHANNEL || 'msedge';
    browser = await chromium.launch(options);
    fs.mkdirSync('.impeccable/review', { recursive: true });
});
after(async () => { if (browser) await browser.close(); });

async function ready(page) {
    await page.waitForFunction(() => document.querySelector('.weather-temp') &&
        document.querySelector('.weather-body').getAttribute('aria-busy') === 'false');
}

async function fixture({ width = 640, height = 400, viewportWidth = 1920, viewportHeight = 1080,
    left = 80, top = 80, mode = 'full', temperature = 26, hasTouch = false } = {}) {
    const context = await browser.newContext({ viewport: { width: viewportWidth, height: viewportHeight },
        timezoneId: 'UTC', reducedMotion: 'reduce', serviceWorkers: 'block', hasTouch });
    const requests = { primary: 0, backup: 0 };
    await context.route(/^https?:\/\//, route => {
        const url = new URL(route.request().url());
        if (url.origin === origin) return route.continue();
        if (url.hostname === 'api.open-meteo.com') {
            requests.primary++;
            return mode === 'met' || mode === 'legacy' ? route.abort() : route.fulfill({ json: openForecast(temperature) });
        }
        if (url.hostname === 'api.met.no') { requests.backup++; return route.fulfill({ json: metForecast() }); }
        return route.abort();
    });
    if (mode === 'legacy') await context.addInitScript(place => {
        if (sessionStorage.getItem('__weather_legacy_seeded')) return;
        sessionStorage.setItem('__weather_legacy_seeded', '1');
        const now = Date.now();
        localStorage.setItem('nt_weather_met_cache_v1', JSON.stringify({
            [place.lat + ',' + place.lon]: { data: { temp: 19, code: 3, humidity: 80, wind: 2,
                provider: 'met-no', fetchedAt: now, refreshAfter: now + 10800000 } }
        }));
    }, place);
    const page = await context.newPage(); page.setDefaultTimeout(8000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.NewtabWidgets && NewtabWidgets.getLayout());
    assert.equal(await page.evaluate(place => NewtabWidgets.addFromCatalog('weather', { left: 80, top: 80, options: place }).ok, place), true);
    await ready(page);
    const saved = await page.evaluate(({ width, height, left, top }) => {
        const layout = NewtabWidgets.getLayout(), widget = layout.widgets.find(w => w.type === 'weather');
        const rect = { left, top, width, height }, grid = NewtabLayout.homeGrid(innerWidth, innerHeight);
        widget.options[innerWidth < 600 ? 'homeMobile' : 'homeDesktop'] = NewtabLayout.homePlacement(rect, 'weather', grid);
        widget.x = left / innerWidth; widget.y = top / innerHeight; widget.w = width / innerWidth; widget.h = height / innerHeight;
        layout.widgets = [widget]; layout.companionMigrated = true;
        NewtabLayout.saveLayout(layout);
        return { key: NewtabLayout.STORAGE_KEY, value: localStorage.getItem(NewtabLayout.STORAGE_KEY) };
    }, { width, height, left, top });
    // pagehide intentionally persists the live layout. Seed this independent
    // saved-profile fixture at the next document's start, once, instead.
    await context.addInitScript(saved => {
        if (localStorage.getItem('__weather_dashboard_seeded')) return;
        localStorage.setItem(saved.key, saved.value);
        localStorage.setItem('__weather_dashboard_seeded', '1');
    }, saved);
    await page.reload({ waitUntil: 'domcontentloaded' }); await ready(page);
    return { context, page, errors, requests };
}

async function hit(page, selector) {
    const target = page.locator(selector); await target.scrollIntoViewIfNeeded();
    assert.equal(await target.evaluate(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    }), true, selector + ' is not clipped or covered');
}

async function assertSourceInCityDialog(page, provider) {
    assert.equal(await page.locator('.weather-body .weather-source').count(), 0, 'Attribution stays out of the weather card');
    await page.locator('.weather-city-button').click();
    const source = page.locator('.weather-location-dialog [aria-label="天氣資料來源"] .weather-source');
    await source.waitFor({ state: 'visible' });
    assert.match(await source.innerText(), new RegExp(provider));
    await hit(page, '.weather-location-dialog [aria-label="天氣資料來源"] .weather-source a:first-child');
    assert.equal(await source.locator('a').nth(1).getAttribute('href'), 'https://creativecommons.org/licenses/by/4.0/');
    await page.keyboard.press('Escape');
    await page.locator('.weather-location-dialog').waitFor({ state: 'detached' });
}

test('forecast metrics, date selection, keyboard chart and temperature units change real values without refetch', async () => {
    const { context, page, requests, errors } = await fixture();
    try {
        assert.match(await page.locator('.weather-temp').innerText(), /^26/);
        assert.equal(await page.locator('.weather-day').count(), 7);
        const calls = { ...requests };
        await page.locator('.weather-unit[data-unit="F"]').click();
        assert.match(await page.locator('.weather-temp').innerText(), /^79/);
        assert.equal(await page.locator('.weather-unit[data-unit="F"]').getAttribute('aria-pressed'), 'true');
        assert.match(await page.locator('.weather-hi').innerText(), /82/);
        await page.locator('.weather-day[data-date="' + dates[1] + '"]').click();
        assert.equal(await page.locator('.weather-day[data-date="' + dates[1] + '"]').getAttribute('aria-pressed'), 'true');
        assert.equal(await page.locator('.weather-day[data-date="' + dates[1] + '"]').evaluate(el => document.activeElement === el), true);
        const chart = page.locator('.weather-chart');
        await chart.focus(); await page.keyboard.press('Home');
        const first = await chart.getAttribute('aria-valuetext');
        await page.keyboard.press('End');
        assert.notEqual(await chart.getAttribute('aria-valuetext'), first);
        assert.equal(await chart.evaluate(el => document.activeElement === el), true);
        await page.locator('.weather-metric[data-metric="rain"]').click();
        assert.equal(await page.locator('.weather-metric[data-metric="rain"]').getAttribute('aria-selected'), 'true');
        assert.match(await page.locator('.weather-reading').innerText(), /%/);
        await page.locator('.weather-metric[data-metric="wind"]').click();
        assert.match(await page.locator('.weather-reading').innerText(), /m\/s|公尺/);
        await page.keyboard.press('Home');
        assert.equal(await page.locator('.weather-metric[data-metric="temp"]').getAttribute('aria-selected'), 'true');
        await page.keyboard.press('ArrowRight');
        assert.equal(await page.locator('.weather-metric[data-metric="rain"]').getAttribute('aria-selected'), 'true');
        assert.equal(await page.evaluate(() => NewtabWidgets.isArranging()), false, 'forecast controls never enter widget editing');
        assert.deepEqual(requests, calls, 'view changes do not request provider data');
        await page.reload({ waitUntil: 'domcontentloaded' }); await ready(page);
        assert.equal(await page.locator('.weather-unit[data-unit="F"]').getAttribute('aria-pressed'), 'true');
        assert.match(await page.locator('.weather-temp').innerText(), /^79/);
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

for (const [width, height] of [[160, 160], [320, 360], [640, 400], [900, 440]]) {
    test(`weather content and recovery controls fit a ${width}×${height} card`, async () => {
        const { context, page, errors } = await fixture({ width, height });
        try {
            const card = await page.locator('.widget[data-type="weather"]').boundingBox();
            assert(Math.abs(card.width - width) <= 1 && Math.abs(card.height - height) <= 1, 'actual saved card dimensions match fixture');
            await page.screenshot({ path: `.impeccable/review/weather-dashboard-${width}x${height}.png` });
            await page.locator('.widget[data-type="weather"]').screenshot({ path: `.impeccable/review/weather-card-${width}x${height}.png` });
            const overflow = await page.locator('.weather-body').evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth,
                children: Array.from(el.children).map(child => ({ cls: child.className, width: child.getBoundingClientRect().width, scroll: child.scrollWidth })) }));
            assert(overflow.scroll <= overflow.width + 1, 'the card has no horizontal overflow: ' + JSON.stringify(overflow));
            if (width < 260 || height < 290) {
                assert.equal(await page.locator('.weather-forecast').isVisible(), false);
                await hit(page, '.weather-details'); await page.locator('.weather-details').click();
                await page.locator('.weather-chart').waitFor({ state: 'visible' });
            } else await page.locator('.weather-chart').waitFor({ state: 'visible' });
            if (width >= 640) for (const selector of ['.weather-feels', '.weather-hum', '.weather-wind']) {
                assert.equal(await page.locator(selector).isVisible(), true, selector + ' is shown at full size');
                assert.notEqual(await page.locator(selector).innerText(), '');
            }
            await hit(page, '.weather-city-button'); await assertSourceInCityDialog(page, 'Open-Meteo');
            assert.equal(await page.locator('.weather-city-button').evaluate(el => document.activeElement === el), true);
            await hit(page, '.weather-retry'); await hit(page, '.weather-locate');
            await page.locator('.weather-body').evaluate(el => { el.scrollTop = 0; });
            if (width < 260) await page.locator('.widget[data-type="weather"]').screenshot({ path: `.impeccable/review/weather-card-${width}x${height}-expanded.png` });
            assert.deepEqual(errors, []);
        } finally { await context.close(); }
    });
}

test('negative temperatures and touch targets remain inside a compact 160×160 card', async () => {
    const { context, page, errors } = await fixture({ width: 160, height: 160, temperature: -25, hasTouch: true });
    try {
        assert.match(await page.locator('.weather-temp').innerText(), /^-25/);
        await page.locator('.widget[data-type="weather"]').screenshot({ path: '.impeccable/review/weather-card-negative-touch.png' });
        const overflow = await page.locator('.weather-body').evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth,
            children: Array.from(el.querySelectorAll('*')).filter(child => child.getBoundingClientRect().right > el.getBoundingClientRect().right + 1).map(child => ({ cls: child.className, width: child.getBoundingClientRect().width, right: child.getBoundingClientRect().right, display: getComputedStyle(child).display })) }));
        assert(overflow.scroll <= overflow.width + 1, 'negative/touch content does not overflow: ' + JSON.stringify(overflow));
        await hit(page, '.weather-unit[data-unit="F"]');
        await page.locator('.weather-unit[data-unit="F"]').tap();
        assert.match(await page.locator('.weather-temp').innerText(), /^-13/);
        await hit(page, '.weather-details'); await page.locator('.weather-details').tap();
        await hit(page, '.weather-metric[data-metric="rain"]');
        await page.locator('.weather-metric[data-metric="rain"]').tap();
        assert.match(await page.locator('.weather-reading').innerText(), /%/);
        assert.equal(await page.locator('.weather-body').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true,
            'expanded compact forecast does not overflow horizontally');
        await hit(page, '.weather-locate'); await hit(page, '.weather-retry');
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('chart inspection does not drag the card, while long-press resize persists its actual geometry', async () => {
    const { context, page, errors } = await fixture();
    try {
        const card = page.locator('.widget[data-type="weather"]');
        const before = await card.boundingBox();
        const plot = await page.locator('.weather-chart').boundingBox();
        await page.mouse.move(plot.x + plot.width / 2, plot.y + plot.height / 2);
        await page.mouse.down(); await page.waitForTimeout(650); await page.mouse.move(plot.x + plot.width - 10, plot.y + plot.height / 2); await page.mouse.up();
        assert.equal(await page.evaluate(() => NewtabWidgets.isArranging()), false, 'holding the interactive plot does not arm dragging');
        assert.deepEqual(await card.boundingBox(), before);
        await page.mouse.click(before.x + 2, before.y + before.height / 2);
        assert.equal(await page.evaluate(() => NewtabWidgets.isArranging()), false, 'a normal card click does not start arranging');
        await page.mouse.move(before.x + 2, before.y + before.height / 2); await page.mouse.down();
        await page.waitForFunction(() => NewtabWidgets.isArranging()); await page.mouse.up();
        const handle = page.locator('.widget-handle[data-handle="se"]');
        await handle.waitFor(); const corner = await handle.boundingBox();
        await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2); await page.mouse.down();
        await page.mouse.move(corner.x + corner.width / 2 + 150, corner.y + corner.height / 2 + 110, { steps: 8 }); await page.mouse.up();
        const resized = await card.boundingBox();
        assert(resized.width > before.width + 50 && resized.height > before.height + 50, 'drag handle actually enlarges the card');
        await page.getByRole('button', { name: '完成主畫面編輯', exact: true }).click();
        await page.reload({ waitUntil: 'domcontentloaded' }); await ready(page);
        const restored = await card.boundingBox();
        for (const axis of ['x', 'y', 'width', 'height']) assert(Math.abs(restored[axis] - resized[axis]) <= 1, axis + ' survives reload');
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('legacy MET cache keeps current conditions when forecast upgrade is unavailable, without bypassing the provider interval', async () => {
    const { context, page, requests, errors } = await fixture({ mode: 'legacy' });
    try {
        assert.match(await page.locator('.weather-temp').innerText(), /^19/);
        assert.equal(await page.locator('.weather-day').count(), 0);
        assert.equal(await page.locator('.weather-chart').isVisible(), false);
        assert.deepEqual(requests, { primary: 1, backup: 0 }, 'Missing details attempt a primary upgrade while MET stays protected');
        await page.reload({ waitUntil: 'domcontentloaded' }); await ready(page);
        assert.deepEqual(requests, { primary: 1, backup: 0 }, 'Reload does not repeatedly request a failed automatic upgrade');
        await page.locator('.weather-retry').click(); await ready(page);
        assert.deepEqual(requests, { primary: 2, backup: 0 }, 'An explicit retry may contact primary but does not bypass MET cache');
        assert.equal(await page.locator('.weather-chart').isVisible(), false, 'Failed upgrade never invents a chart');
        await assertSourceInCityDialog(page, 'MET Norway');
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('MET rain chart labels interval amounts in millimetres instead of fabricated percentages', async () => {
    const { context, page, requests, errors } = await fixture({ mode: 'met' });
    try {
        await assertSourceInCityDialog(page, 'MET Norway');
        await page.locator('.weather-metric[data-metric="rain"]').click();
        assert.match(await page.locator('.weather-reading').innerText(), /mm|毫米/);
        assert.doesNotMatch(await page.locator('.weather-reading').innerText(), /%/);
        assert.equal(requests.primary, 1); assert.equal(requests.backup, 1);
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('a valid cached forecast crossing midnight skips yesterday and displays the current day range', async () => {
    const { context, page, errors, requests } = await fixture();
    try {
        const calls = { ...requests };
        const yesterday = new Date(start - 24 * HOUR).toISOString().slice(0, 10);
        await page.evaluate(({ raw, yesterday }) => {
            const data = NewtabWeatherData.parseOpenMeteo(raw);
            data.daily.unshift({ date: yesterday, high: 99, low: 98, code: 2 });
            data.high = 99; data.low = 98;
            const body = document.querySelector('.weather-body');
            body.replaceChildren(Object.assign(document.createElement('p'), { className: 'weather-status' }));
            body._weatherView = { metric: 'temp', date: yesterday, index: 0, expanded: false };
            NewtabWeatherDashboard.render(body, data, { glyph: () => '', label: () => '多雲', unit: 'C', onUnit() {} });
        }, { raw: openForecast(), yesterday });
        assert.equal(await page.locator('.weather-day[data-date="' + yesterday + '"]').count(), 0);
        assert.equal(await page.locator('.weather-day[aria-pressed="true"]').getAttribute('data-date'), dates[0]);
        assert.match(await page.locator('.weather-hi').innerText(), /28/);
        assert.match(await page.locator('.weather-lo').innerText(), /20/);
        assert.equal(await page.locator('.weather-chart').isVisible(), true);
        assert.deepEqual(requests, calls, 'cached view correction does not bypass provider intervals');
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('irregular forecast intervals keep time labels and chart points on the same elapsed-time scale', async () => {
    const { context, page, errors } = await fixture();
    try {
        const tomorrow = start + 24 * HOUR;
        await page.evaluate(({ tomorrow, date }) => {
            const data = { temp: 26, code: 2, timeZone: 'UTC', daily: [{ date, high: 28, low: 20, code: 2 }],
                hourly: [0, 1, 2, 3, 6, 12, 18].map((hour, i) => ({ at: tomorrow + hour * 3600000, temp: 20 + i, code: 2 })) };
            const body = document.querySelector('.weather-body');
            body.replaceChildren(Object.assign(document.createElement('p'), { className: 'weather-status' }));
            body._weatherView = null;
            NewtabWeatherDashboard.render(body, data, { glyph: () => '', label: () => '多雲', unit: 'C', onUnit() {} });
        }, { tomorrow, date: dates[1] });
        assert.deepEqual(await page.locator('.weather-axis span').allTextContents(), ['00:00', '06:00', '12:00', '18:00']);
        const alignment = await page.evaluate(() => {
            const chart = document.querySelector('.weather-chart'), axis = document.querySelector('.weather-axis');
            const bounds = chart.getBoundingClientRect(), left = axis.getBoundingClientRect().left;
            return Array.from(axis.children).map(el => ({ label: el.textContent,
                x: left + parseFloat(getComputedStyle(el).left) - bounds.left, width: bounds.width }));
        });
        alignment.forEach((tick, index) => {
            const expected = (12 + index / 3 * 600) / 624 * tick.width;
            assert(Math.abs(tick.x - expected) < 1, tick.label + ' uses the plotted elapsed-time coordinate');
        });
        await page.locator('.weather-chart').focus(); await page.keyboard.press('Home');
        await page.keyboard.press('ArrowRight');
        assert.match(await page.locator('.weather-chart').getAttribute('aria-valuetext'), /01:00/);
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('ultrawide edge placement preserves the dashboard and custom appearance', async () => {
    const { context, page, errors } = await fixture({ width: 900, height: 440, viewportWidth: 5120, viewportHeight: 1440, left: 4100 });
    try {
        const card = page.locator('.widget[data-type="weather"]');
        const bounds = await card.boundingBox();
        assert(bounds.x >= 4099 && bounds.x + bounds.width <= 5120, 'card uses the full ultrawide canvas');
        await card.focus(); await page.keyboard.press('Shift+F10');
        await page.getByRole('menuitem', { name: '自訂組件外觀', exact: true }).click();
        await page.getByLabel('組件背景色', { exact: true }).evaluate(el => { el.value = '#102030'; el.dispatchEvent(new Event('input', { bubbles: true })); });
        await page.getByRole('spinbutton', { name: '組件背景透明度', exact: true }).fill('70');
        await page.getByRole('combobox', { name: '組件文字顏色', exact: true }).selectOption('light');
        await page.getByRole('button', { name: '完成', exact: true }).click();
        assert.equal(await page.locator('.weather-body').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(16, 32, 48, 0.3)');
        assert.equal(await page.locator('.weather-reading').evaluate(el => getComputedStyle(el).color), 'rgb(244, 248, 252)');
        await hit(page, '.weather-metric[data-metric="wind"]');
        await page.screenshot({ path: '.impeccable/review/weather-dashboard-ultrawide.png' });
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('rapid forecast changes preserve visible curves and one current keyboard cursor, then clean up every inactive layer', async () => {
    const { context, page, errors, requests } = await fixture();
    try {
        const calls = { ...requests };
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        const result = await page.evaluate(async () => {
            const chart = document.querySelector('.weather-chart');
            const choose = metric => document.querySelector('.weather-metric[data-metric="' + metric + '"]').click();
            const layers = () => Array.from(chart.querySelectorAll('.weather-chart-curve'));
            choose('rain'); await new Promise(resolve => setTimeout(resolve, 55));
            const before = layers().map(layer => ({ layer, markup: layer.innerHTML, opacity: +getComputedStyle(layer).opacity }));
            choose('wind');
            const unchanged = before.every(record => record.layer.isConnected && record.markup === record.layer.innerHTML &&
                Math.abs(record.opacity - +getComputedStyle(record.layer).opacity) < .0001);
            const countAfterThird = layers().length;
            const incomingOpacity = +getComputedStyle(chart.querySelector('.weather-chart-curve[data-active="true"]')).opacity;
            chart.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
            const cursor = chart.querySelector('.weather-chart-cursor');
            const cursorState = { count: chart.querySelectorAll('.weather-chart-cursor').length,
                dotCount: chart.querySelectorAll('.weather-chart-dot').length, x: +cursor.getAttribute('x1'),
                opacity: +getComputedStyle(cursor.closest('svg')).opacity, now: +chart.getAttribute('aria-valuenow'),
                max: +chart.getAttribute('aria-valuemax'), label: chart.getAttribute('aria-valuetext') };
            let maxAlphaError = 0;
            for (let i = 0; i < 16; i++) {
                await new Promise(requestAnimationFrame);
                maxAlphaError = Math.max(maxAlphaError, Math.abs(layers().reduce((sum, layer) => sum + +getComputedStyle(layer).opacity, 0) - 1));
            }
            for (let i = 0; i < 60; i++) choose(['temp', 'rain', 'wind'][i % 3]);
            return { unchanged, countAfterThird, incomingOpacity, cursorState, maxAlphaError, repeatedCount: layers().length };
        });
        assert.equal(result.unchanged, true, 'a third target never replaces the paths or opacity of an already visible curve');
        assert.equal(result.countAfterThird, 3); assert.equal(result.incomingOpacity, 0, 'new curve begins transparently');
        assert.deepEqual({ count: result.cursorState.count, dotCount: result.cursorState.dotCount, x: result.cursorState.x,
            opacity: result.cursorState.opacity }, { count: 1, dotCount: 1, x: 612, opacity: 1 });
        assert.equal(result.cursorState.now, result.cursorState.max); assert.match(result.cursorState.label, /m\/s/);
        assert(result.maxAlphaError < .01, 'curve handoff keeps the total curve opacity stable');
        assert(result.repeatedCount <= 3, 'repeated reversals reuse finite state keys rather than accumulate snapshots');
        await page.waitForFunction(() => document.querySelectorAll('.weather-chart-curve').length === 1);
        await page.evaluate(() => {
            document.querySelector('.weather-metric[data-metric="temp"]').click();
            document.querySelector('.weather-metric[data-metric="rain"]').click();
        });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.waitForFunction(() => document.querySelectorAll('.weather-chart-curve').length === 1);
        assert.equal(await page.locator('.weather-chart-curve').getAttribute('data-active'), 'true');
        assert.equal(await page.locator('.weather-chart-overlay').count(), 1);
        assert.deepEqual(requests, calls, 'view transitions do not fetch additional provider data');
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});
