const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Weather = require('../js/weather-data.js');
const NOW = Date.parse('2026-11-14T04:30:00Z');
const HOUR = 3600000;
const incomplete = { temp: 20, provider: 'met-no', fetchedAt: NOW - HOUR, refreshAfter: NOW + 2 * HOUR };
const complete = { temp: 24, hourly: [{ at: NOW, temp: 24 }], daily: [{ date: '2026-11-14' }] };

function host(primary, met = incomplete) {
    const stored = {};
    if (met) stored.nt_weather_met_cache_v1 = JSON.stringify({ '25.033,121.565': { data: met } });
    if (primary) stored.nt_weather_cache = JSON.stringify({ lat: 25.033, lon: 121.565, ts: primary.fetchedAt, data: primary });
    class Clock extends Date { static now() { return NOW; } }
    const sandbox = { Date: Clock, setTimeout, clearTimeout, AbortController, NewtabWeatherData: Weather,
        localStorage: { getItem: key => stored[key] || null, setItem: (key, value) => { stored[key] = value; } } };
    sandbox.window = sandbox;
    const source = fs.readFileSync(path.join(__dirname, '../js/widget-host.js'), 'utf8').replace('global.NewtabWidgets = {',
        'global.cacheTest = { read: readWeatherCache, met: readMetCache, due: weatherForecastDue, defer: deferWeatherForecast, write: writeWeatherCache }; global.NewtabWidgets = {');
    vm.runInNewContext(source, sandbox);
    return { api: sandbox.cacheTest, stored };
}

test('a fresh complete primary forecast survives an older protected current-only MET cache', () => {
    const { api } = host({ ...complete, provider: 'open-meteo', fetchedAt: NOW - 60000 });
    assert.equal(api.read(25.033, 121.565).data.provider, 'open-meteo');
    assert.equal(api.met(25.033, 121.565).data.refreshAfter, incomplete.refreshAfter, 'provider throttle record remains intact');
});

test('fresh complete forecasts take precedence over incomplete readings, even if the latter were fetched later', () => {
    const newerIncomplete = { ...incomplete, fetchedAt: NOW, refreshAfter: NOW + 3 * HOUR };
    const { api } = host({ ...complete, provider: 'open-meteo', fetchedAt: NOW - 60000 }, newerIncomplete);
    assert.equal(api.read(25.033, 121.565).data.provider, 'open-meteo');
    const fullMet = { ...incomplete, ...complete };
    assert.equal(host({ temp: 99, fetchedAt: NOW, provider: 'open-meteo' }, fullMet).api.read(25.033, 121.565).data.provider, 'met-no');
});

test('the newest complete fresh forecast wins, while expired primary data cannot mask protected MET', () => {
    const fullMet = { ...incomplete, ...complete };
    assert.equal(host({ ...complete, provider: 'open-meteo', fetchedAt: NOW - 60000 }, fullMet).api.read(25.033, 121.565).data.provider, 'open-meteo');
    assert.equal(host({ ...complete, provider: 'open-meteo', fetchedAt: NOW - HOUR }, fullMet).api.read(25.033, 121.565).data.provider, 'met-no');
});

test('a complete stale primary forecast remains available instead of a protected current-only MET reading', () => {
    const { api } = host({ ...complete, provider: 'open-meteo', fetchedAt: NOW - HOUR });
    const cached = api.read(25.033, 121.565);
    assert.equal(cached.data.provider, 'open-meteo'); assert.equal(cached.stale, true);
    assert.equal(Weather.hasForecast(cached.data), true);
    assert.equal(api.met(25.033, 121.565).stale, false, 'retaining the useful forecast never erases MET request protection');
});

test('an older complete MET display cache survives a newer partial MET record using only the exact coordinate key', () => {
    const { api, stored } = host({ ...complete, provider: 'met-no', fetchedAt: NOW - 4 * HOUR, refreshAfter: NOW - HOUR });
    const cached = api.read(25.033, 121.565);
    assert.equal(cached.data.temp, complete.temp); assert.equal(cached.stale, true);
    assert.equal(Weather.hasForecast(cached.data), true);
    assert.equal(api.met(25.033, 121.565).data.refreshAfter, incomplete.refreshAfter, 'dedicated new deadline remains authoritative');
    const generic = JSON.parse(stored.nt_weather_cache); generic.lat += .0001;
    stored.nt_weather_cache = JSON.stringify(generic);
    assert.equal(Weather.hasForecast(api.read(25.033, 121.565).data), false, 'nearby coordinates cannot borrow a different MET request key');
});

test('legacy migration retries are bounded without changing weather or MET refresh timestamps', () => {
    const { api } = host();
    assert.equal(api.due(incomplete), true);
    const deferred = api.defer(incomplete);
    assert.equal(deferred.forecastRetryAfter, NOW + HOUR / 2);
    assert.equal(deferred.fetchedAt, incomplete.fetchedAt);
    assert.equal(deferred.refreshAfter, incomplete.refreshAfter);
    assert.equal(api.due(deferred), false);
    assert.equal(api.due({ ...deferred, forecastRetryAfter: NOW - 1 }), true);
    assert.equal(api.due({ ...deferred, forecastRetryAfter: NOW + HOUR }), true, 'invalid future metadata cannot suppress upgrades indefinitely');
    assert.equal(api.defer({ ...incomplete, refreshAfter: NOW + 10000 }).forecastRetryAfter, NOW + 10000);
    assert.equal(api.due(complete), false);
    api.write(25.033, 121.565, deferred);
    assert.equal(api.read(25.033, 121.565).data.forecastRetryAfter, deferred.forecastRetryAfter);
});

test('an already-open tab adopts a bounded retry from another tab with the same MET fetchedAt', () => {
    const { api, stored } = host();
    assert.equal(api.due(api.read(25.033, 121.565).data), true, 'populate this tab\'s original memory');
    const anotherTab = { ...incomplete, forecastRetryAfter: NOW + HOUR / 2 };
    stored.nt_weather_met_cache_v1 = JSON.stringify({ '25.033,121.565': { data: anotherTab } });
    const shared = api.read(25.033, 121.565).data;
    assert.equal(api.due(shared), false);
    assert.equal(shared.forecastRetryAfter, anotherTab.forecastRetryAfter);
    assert.equal(shared.fetchedAt, incomplete.fetchedAt); assert.equal(shared.refreshAfter, incomplete.refreshAfter);
    stored.nt_weather_met_cache_v1 = JSON.stringify({ '25.033,121.565': { data: { ...anotherTab, forecastRetryAfter: NOW + 24 * HOUR } } });
    assert.equal(api.read(25.033, 121.565).data.forecastRetryAfter, anotherTab.forecastRetryAfter, 'invalid long suppression is not imported');
});
