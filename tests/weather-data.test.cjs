const test = require('node:test');
const assert = require('node:assert/strict');
const Weather = require('../js/weather-data.js');
const HOUR = 3600000;
const NOW = Date.parse('2026-11-14T04:30:00Z');
const START = Date.parse('2026-11-13T16:00:00Z');

function openForecast() {
    return { timezone: 'Asia/Taipei', utc_offset_seconds: 28800,
        current: { time: NOW / 1000, temperature_2m: 23.4, weather_code: 2, relative_humidity_2m: 72,
            apparent_temperature: 24.6, wind_speed_10m: 2.34, wind_direction_10m: 90, is_day: 1 },
        hourly: { time: Array.from({ length: 168 }, (_, i) => (START + i * HOUR) / 1000),
            temperature_2m: Array.from({ length: 168 }, (_, i) => 20 + i % 24 / 10),
            weather_code: Array(168).fill(2), precipitation_probability: Array(168).fill(30), precipitation: Array(168).fill(.2),
            wind_speed_10m: Array(168).fill(2), wind_direction_10m: Array(168).fill(90), is_day: Array(168).fill(1) },
        daily: { time: Array.from({ length: 7 }, (_, i) => (START + i * 24 * HOUR) / 1000),
            temperature_2m_max: [25, 26, 27, 28, 29, 30, 31], temperature_2m_min: [15, 16, 17, 18, 19, 20, 21],
            weather_code: Array(7).fill(3), precipitation_probability_max: Array(7).fill(40),
            precipitation_sum: Array(7).fill(4.8), wind_speed_10m_max: Array(7).fill(4) } };
}
function metPoint(at, temp = 20, hours = 1, amount = .2, probability) {
    const data = { instant: { details: { air_temperature: temp, relative_humidity: 70, wind_speed: 2.34, wind_from_direction: 90 } } };
    if (hours) data['next_' + hours + '_hours'] = { summary: { symbol_code: 'partlycloudy_day' },
        details: { precipitation_amount: amount, ...(probability === undefined ? {} : { probability_of_precipitation: probability }) } };
    return { time: new Date(at).toISOString(), data };
}
function metForecast(points) { return { properties: { timeseries: points } }; }

test('Open-Meteo preserves current statistics and supplies seven local days and 168 real instants', () => {
    const input = openForecast(), before = JSON.stringify(input), value = Weather.parseOpenMeteo(input, NOW);
    assert.equal(value.temp, 23); assert.equal(value.feels, 25); assert.equal(value.humidity, 72); assert.equal(value.wind, 2.3);
    assert.equal(value.high, 25); assert.equal(value.low, 15); assert.equal(value.timeZone, 'Asia/Taipei');
    assert.equal(value.hourly.length, 168); assert.equal(value.daily.length, 7); assert.equal(value.daily[0].date, '2026-11-14');
    assert.equal(value.daily[6].date, '2026-11-20'); assert.equal(value.hourly[0].at, START);
    assert.equal(value.daily[0].partial, false); assert.equal(value.daily[0].sampled, false);
    assert.equal(value.forecastAt, NOW); assert.equal(value.provider, 'open-meteo'); assert.equal(value.fetchedAt, NOW);
    assert.equal(JSON.stringify(input), before, 'normalization never mutates provider payloads');
});

test('missing, invalid and zero values remain distinct in hourly and daily data', () => {
    const input = openForecast();
    input.hourly.temperature_2m = [0, null, Infinity, '0']; input.hourly.precipitation = [0, null, -1];
    input.hourly.precipitation_probability = [0, null, 101, -1]; input.hourly.wind_speed_10m = [0, null, -1];
    input.hourly.wind_direction_10m = [0, 360, null, 361]; input.hourly.is_day = [0, 1, null, '0'];
    input.daily.temperature_2m_max = [0, null]; input.daily.precipitation_sum = [0, null];
    const value = Weather.parseOpenMeteo(input, NOW);
    assert.equal(value.hourly[0].temp, 0); assert.equal(value.hourly[0].precipMm, 0); assert.equal(value.hourly[0].precipProbability, 0);
    assert.equal(value.hourly[0].wind, 0); assert.equal(value.hourly[0].direction, 0); assert.equal(value.hourly[0].isDay, false);
    assert.equal(value.hourly[1].direction, 360); assert.equal(value.hourly[1].isDay, true);
    for (const i of [1, 2, 3]) assert.equal(value.hourly[i].temp, null);
    assert.equal(value.hourly[2].precipMm, null); assert.equal(value.hourly[2].precipProbability, null); assert.equal(value.hourly[3].direction, null);
    assert.equal(value.daily[0].high, 0); assert.equal(value.daily[1].high, null); assert.equal(value.daily[1].precipMm, null);
});

test('Open-Meteo rain is the preceding interval, while current probability selects the containing hour', () => {
    const input = openForecast(); input.hourly.precipitation_probability[12] = 10; input.hourly.precipitation_probability[13] = 80;
    const value = Weather.parseOpenMeteo(input, NOW), row = value.hourly[13];
    assert.equal(row.precipStart, START + 12 * HOUR); assert.equal(row.precipEnd, START + 13 * HOUR);
    assert.equal(row.intervalHours, 1); assert.equal(value.precipProbability, 80);
});

test('Open-Meteo old current-only cache fixtures remain usable without invented forecast rows', () => {
    const value = Weather.parseOpenMeteo({ current: { temperature_2m: 0 }, daily: { temperature_2m_max: [4], temperature_2m_min: [-2] } }, NOW);
    assert.equal(value.temp, 0); assert.equal(value.high, 4); assert.equal(value.low, -2);
    assert.deepEqual(value.hourly, []); assert.deepEqual(value.daily, []); assert.equal(value.precipProbability, null);
    for (const current of [{}, { temperature_2m: null }, { temperature_2m: '20' }, { temperature_2m: NaN }]) {
        assert.throws(() => Weather.parseOpenMeteo({ current }, NOW), /invalid weather/);
    }
});

test('forecast availability distinguishes old current-only caches from usable provider series', () => {
    assert.equal(Weather.hasForecast({ temp: 23, provider: 'met-no' }), false);
    assert.equal(Weather.hasForecast({ hourly: [], daily: [] }), false);
    assert.equal(Weather.hasForecast({ hourly: [{ at: NOW, temp: null }], daily: [{ date: '2026-11-14' }] }), false);
    assert.equal(Weather.hasForecast({ hourly: [{ at: NOW, temp: 0 }], daily: [{ date: '2026-02-30' }] }), false);
    assert.equal(Weather.hasForecast({ hourly: [{ at: NOW, temp: 0 }], daily: [{ date: '2026-11-14' }] }), true);
    assert.equal(Weather.hasForecast(Weather.parseOpenMeteo(openForecast(), NOW)), true);
    assert.equal(Weather.hasForecast(Weather.parseMet(metForecast([metPoint(NOW, 20)]), { now: NOW, timeZone: 'Asia/Taipei' })), true);
});

test('timestamps are sorted/deduplicated without filling gaps or shifting array values', () => {
    const input = openForecast(); input.hourly = { time: [START / 1000 + 7200, 'invalid', START / 1000, START / 1000, '2026-02-30T00:00'], temperature_2m: [22, 99, 20, 88, 77] };
    const value = Weather.parseOpenMeteo(input, NOW);
    assert.deepEqual(value.hourly.map(row => [row.at, row.temp]), [[START, 20], [START + 2 * HOUR, 22]]);
});

test('offset ISO times use provider offset rather than the computer timezone', () => {
    const input = openForecast(); input.hourly.time = ['2026-11-14T00:00', '2026-11-14T01:00+08:00'];
    input.daily.time = ['2026-11-14'];
    const value = Weather.parseOpenMeteo(input, NOW);
    assert.deepEqual(value.hourly.map(row => row.at), [START, START + HOUR]);
    assert.equal(value.daily[0].date, '2026-11-14'); assert.equal(value.daily[0].periodStart, START);
    assert.equal(Weather.normalizeTimeZone('Invalid/Zone'), 'UTC'); assert.equal(Weather.normalizeTimeZone(null), 'UTC');
});

test('Open-Meteo fixed-offset daily boundaries retain the nominal date and flag a DST mismatch', () => {
    const now = Date.parse('2026-03-08T12:00:00Z');
    const value = Weather.parseOpenMeteo({ timezone: 'America/New_York', utc_offset_seconds: -18000,
        current: { temperature_2m: 10 }, daily: { time: [Date.parse('2026-03-08T05:00:00Z') / 1000, Date.parse('2026-03-09T05:00:00Z') / 1000],
            temperature_2m_max: [15, 16], temperature_2m_min: [5, 6] } }, now);
    assert.deepEqual(value.daily.map(day => day.date), ['2026-03-08', '2026-03-09']);
    assert(value.daily.every(day => day.partial), '24h provider aggregates are not falsely labelled as exact DST calendar days');
});

test('MET preserves sparse six-hour intervals, their total millimetres, and missing probabilities', () => {
    const input = metForecast([metPoint(START, 20, 6, 1.8), metPoint(START + 6 * HOUR, 22, 6, 0), metPoint(START + 12 * HOUR, 24, null)]);
    const before = JSON.stringify(input), value = Weather.parseMet(input, { now: START + HOUR, timeZone: 'Asia/Taipei' });
    assert.equal(value.hourly.length, 3); assert.equal(value.hourly[1].at - value.hourly[0].at, 6 * HOUR);
    assert.equal(value.hourly[0].precipMm, 1.8); assert.equal(value.hourly[0].intervalHours, 6);
    assert.equal(value.hourly[0].precipEnd - value.hourly[0].precipStart, 6 * HOUR);
    assert.equal(value.hourly[0].precipProbability, null); assert.equal(value.hourly[1].precipMm, 0);
    assert.equal(value.hourly[2].precipMm, null); assert.equal(value.hourly[2].intervalHours, null);
    assert.equal(value.high, null); assert.equal(value.low, null); assert.equal(value.feels, null);
    assert.equal(value.daily[0].partial, true); assert.equal(JSON.stringify(input), before);
});

test('MET marks partial first/last days and only exposes sampled ranges for fully covered days', () => {
    const start = START + 6 * HOUR;
    const points = Array.from({ length: 67 }, (_, i) => metPoint(start + i * HOUR, 10 + i % 24));
    const value = Weather.parseMet(metForecast(points), { now: start, timeZone: 'Asia/Taipei' });
    assert.equal(value.daily[0].date, '2026-11-14'); assert.equal(value.daily[0].partial, true); assert.equal(value.daily[0].high, null);
    const full = value.daily.find(day => day.date === '2026-11-15');
    assert.equal(full.partial, false); assert.equal(full.sampled, true); assert.equal(full.high, 33); assert.equal(full.low, 10);
    const last = value.daily.at(-1); assert.equal(last.partial, true); assert.equal(last.low, null);
});

test('MET daily precipitation sums nonoverlapping periods, never overlapping 1h and 6h products', () => {
    const points = Array.from({ length: 25 }, (_, i) => metPoint(START + i * HOUR, 20, i === 24 ? null : 1, .2, 40));
    points[0].data.next_6_hours = { details: { precipitation_amount: 99, probability_of_precipitation: 99 } };
    const value = Weather.parseMet(metForecast(points), { now: START, timeZone: 'Asia/Taipei' });
    assert.equal(value.daily[0].precipMm, 4.8); assert.equal(value.daily[0].precipProbability, 40); assert.equal(value.daily[0].precipPartial, false);
    delete points[5].data.next_1_hours.details.precipitation_amount;
    const missing = Weather.parseMet(metForecast(points), { now: START, timeZone: 'Asia/Taipei' });
    assert.equal(missing.daily[0].precipMm, null); assert.equal(missing.daily[0].precipProbability, 40, 'available probabilities survive missing amount data');
});

test('MET never prorates a six-hour precipitation interval across local midnight', () => {
    const start = Date.parse('2026-11-13T12:00:00Z');
    const points = Array.from({ length: 10 }, (_, i) => metPoint(start + i * 6 * HOUR, 20 + i, 6, 3));
    const value = Weather.parseMet(metForecast(points), { now: START, timeZone: 'Asia/Taipei' });
    const day = value.daily.find(row => row.date === '2026-11-14');
    assert.equal(day.partial, false); assert.equal(day.sampled, true); assert.equal(day.precipMm, null); assert.equal(day.precipPartial, true);
});

test('MET local-day aggregation respects a 25-hour daylight-saving day', () => {
    const start = Date.parse('2026-11-01T04:00:00Z');
    const points = Array.from({ length: 26 }, (_, i) => metPoint(start + i * HOUR, 20, i === 25 ? null : 1, 1));
    const value = Weather.parseMet(metForecast(points), { now: start, timeZone: 'America/New_York' });
    assert.equal(value.daily[0].date, '2026-11-01'); assert.equal(value.daily[0].periodEnd - value.daily[0].periodStart, 25 * HOUR);
    assert.equal(value.daily[0].precipMm, 25); assert.equal(value.daily[0].partial, false);
});

test('MET missing temperatures and sparse gaps prevent a fabricated daily range', () => {
    const points = Array.from({ length: 25 }, (_, i) => metPoint(START + i * HOUR, i === 8 ? null : 20));
    const missing = Weather.parseMet(metForecast(points), { now: START, timeZone: 'Asia/Taipei' });
    assert.equal(missing.daily[0].partial, true); assert.equal(missing.daily[0].high, null);
    const sparse = Weather.parseMet(metForecast([metPoint(START), metPoint(START + 12 * HOUR), metPoint(START + 24 * HOUR)]), { now: START, timeZone: 'Asia/Taipei' });
    assert.equal(sparse.daily[0].partial, true); assert.equal(sparse.daily[0].low, null);
});

test('MET known, unknown and night symbols preserve real conditions and nulls', () => {
    for (const [symbol, expected, day] of [['clearsky_day', 0, true], ['lightsleetshowers_night', 83, false],
        ['heavysnowandthunder', 95, null], ['lightssleetshowersandthunder_day', 95, true], ['lightssnowshowersandthunder_night', 95, false],
        ['fair_polartwilight', 1, null], ['unknown', null, null]]) {
        const point = metPoint(NOW); point.data.next_1_hours.summary.symbol_code = symbol;
        const value = Weather.parseMet(metForecast([point]), { now: NOW });
        assert.equal(value.code, expected); assert.equal(value.isDay, day);
    }
});

test('MET keeps the existing three-hour floor and honors a later Expires header', () => {
    const payload = metForecast([metPoint(NOW)]);
    assert.equal(Weather.parseMet(payload, { now: NOW, expires: new Date(NOW + HOUR).toUTCString() }).refreshAfter, NOW + 3 * HOUR);
    assert.equal(Weather.parseMet(payload, { now: NOW, expires: NOW + 5 * HOUR }).refreshAfter, NOW + 5 * HOUR);
    assert.equal(Weather.parseMet(payload, { now: NOW, expires: 'invalid' }).refreshAfter, NOW + 3 * HOUR);
    for (const payload of [null, {}, metForecast([]), metForecast([metPoint(NOW - 7 * HOUR)]), metForecast([metPoint(NOW, null)])]) {
        assert.throws(() => Weather.parseMet(payload, { now: NOW }), /invalid weather/);
    }
});

test('both provider adapters bound daily output to seven rows', () => {
    const points = Array.from({ length: 241 }, (_, i) => metPoint(START + i * HOUR));
    assert.equal(Weather.parseMet(metForecast(points), { now: START, timeZone: 'Asia/Taipei' }).daily.length, 7);
    assert(Object.isFrozen(Weather));
});

test('MET cached instants can be regrouped for a corrected city zone without changing cache age or current readings', () => {
    const points = Array.from({ length: 73 }, (_, i) => metPoint(START + i * HOUR, 10 + i % 24, 1, .2));
    const cached = Weather.parseMet(metForecast(points), { now: START + HOUR, timeZone: 'UTC', expires: START + 8 * HOUR });
    const before = JSON.stringify(cached);
    assert.equal(cached.daily[0].date, '2026-11-13'); assert.equal(cached.high, null);
    const corrected = Weather.rezoneMet(cached, 'Asia/Taipei', START + 2 * HOUR);
    assert.notEqual(corrected, cached); assert.equal(corrected.timeZone, 'Asia/Taipei');
    assert.equal(corrected.daily[0].date, '2026-11-14'); assert.equal(corrected.daily[0].partial, false);
    assert.equal(corrected.high, 33); assert.equal(corrected.low, 10); assert.equal(corrected.daily[0].precipMm, 4.8);
    for (const key of ['provider', 'fetchedAt', 'refreshAfter', 'forecastAt', 'temp', 'wind', 'humidity', 'code']) assert.equal(corrected[key], cached[key], key);
    assert.equal(corrected.hourly, cached.hourly, 'UTC instants and their original interval amounts are reused');
    assert.equal(JSON.stringify(cached), before, 'the stored source object is not mutated');
    const roundtrip = Weather.rezoneMet(corrected, 'UTC', START + 2 * HOUR);
    assert.equal(roundtrip.daily[0].date, '2026-11-13'); assert.equal(roundtrip.high, null); assert.equal(roundtrip.low, null);
    assert.equal(roundtrip.refreshAfter, cached.refreshAfter);
});

test('MET timezone reprojection respects a 25-hour local day', () => {
    const start = Date.parse('2026-11-01T04:00:00Z');
    const points = Array.from({ length: 26 }, (_, i) => metPoint(start + i * HOUR, 20, i === 25 ? null : 1, 1));
    const cached = Weather.parseMet(metForecast(points), { now: start, timeZone: 'UTC' });
    const corrected = Weather.rezoneMet(cached, 'America/New_York', start);
    assert.equal(corrected.daily[0].periodEnd - corrected.daily[0].periodStart, 25 * HOUR);
    assert.equal(corrected.daily[0].precipMm, 25); assert.equal(corrected.daily[0].partial, false);
    assert.equal(corrected.fetchedAt, cached.fetchedAt); assert.equal(corrected.refreshAfter, cached.refreshAfter);
});

test('MET reprojection leaves legacy, invalid, unchanged and other-provider caches untouched', () => {
    const cached = Weather.parseMet(metForecast([metPoint(NOW)]), { now: NOW, timeZone: 'UTC' });
    for (const target of ['UTC', 'Invalid/Zone', '', null, 8]) assert.equal(Weather.rezoneMet(cached, target, NOW), cached);
    const legacy = { provider: 'met-no', temp: 20, fetchedAt: NOW, refreshAfter: NOW + 3 * HOUR };
    assert.equal(Weather.rezoneMet(legacy, 'Asia/Taipei', NOW), legacy);
    const malformed = { ...cached, hourly: [{ at: NOW, temp: 20 }] };
    assert.equal(Weather.rezoneMet(malformed, 'Asia/Taipei', NOW), malformed);
    const open = Weather.parseOpenMeteo(openForecast(), NOW);
    assert.equal(Weather.rezoneMet(open, 'America/New_York', NOW), open);
});
