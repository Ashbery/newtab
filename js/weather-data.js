/* Provider adapters: Celsius, m/s, mm, UTC instants and explicit local day keys.
 * Sources: https://open-meteo.com/en/docs
 * https://docs.api.met.no/doc/ForecastJSON.html
 * Interval totals are never interpolated into fabricated hourly observations.
 */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.NewtabWeatherData = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';
    var HOUR = 3600000;
    var formatters = Object.create(null);

    function number(value, min, max) {
        return typeof value === 'number' && isFinite(value) &&
            (min === undefined || value >= min) && (max === undefined || value <= max) ? value : null;
    }
    function rounded(value, precision) {
        if (value === null) return null;
        var scale = precision === 1 ? 10 : 1;
        return Math.round(value * scale) / scale;
    }
    function valueAt(group, key, index) { return Array.isArray(group[key]) ? group[key][index] : undefined; }
    function nowValue(value) { return number(value) === null ? Date.now() : value; }
    function zone(value) {
        if (typeof value === 'string' && value.length <= 100) {
            try { return new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions().timeZone; } catch (_) { /* use explicit UTC */ }
        }
        return 'UTC';
    }
    function dateAt(at, timeZone) {
        var formatter = formatters[timeZone];
        if (!formatter) formatter = formatters[timeZone] = new Intl.DateTimeFormat('en-CA', {
            timeZone: timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
        });
        var parts = {};
        formatter.formatToParts(at).forEach(function (part) { parts[part.type] = part.value; });
        return parts.year + '-' + parts.month + '-' + parts.day;
    }
    function validDate(value) {
        return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
            isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
    }
    function timestamp(value, offset) {
        if (number(value) !== null) {
            var at = value * 1000;
            return Math.abs(at) <= 8640000000000000 ? at : null;
        }
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(value)) return null;
        if (!validDate(value.slice(0, 10))) return null;
        var explicit = /(?:Z|[+-]\d{2}:\d{2})$/.test(value);
        var parsed = Date.parse(explicit ? value : value + 'Z');
        return isFinite(parsed) ? parsed - (explicit ? 0 : offset * 1000) : null;
    }
    function dayStart(date, timeZone) {
        // A local day can be 23 or 25 hours. Binary search also handles zones
        // that change their UTC offset at midnight, without using the PC zone.
        var center = Date.parse(date + 'T00:00:00Z');
        var low = center - 36 * HOUR, high = center + 36 * HOUR;
        while (high - low > 1) {
            var middle = Math.floor((low + high) / 2);
            if (dateAt(middle, timeZone) < date) low = middle;
            else high = middle;
        }
        return high;
    }
    function nextDate(date) { return new Date(Date.parse(date + 'T00:00:00Z') + 24 * HOUR).toISOString().slice(0, 10); }
    function daylight(value) { return value === 1 || value === true ? true : value === 0 || value === false ? false : null; }
    function code(value) { return number(value, 0, 99) !== null && Number.isInteger(value) ? value : null; }
    function sortedUnique(rows) {
        var seen = Object.create(null);
        return rows.sort(function (a, b) { return a.at - b.at; }).filter(function (row) {
            if (seen[row.at]) return false;
            seen[row.at] = true; return true;
        });
    }
    function nearest(rows, at, requireTemperature) {
        var best = null;
        rows.forEach(function (row) {
            if (requireTemperature && row.temp === null) return;
            if (!best || Math.abs(row.at - at) < Math.abs(best.at - at)) best = row;
        });
        return best;
    }
    function currentPrecip(rows, at) {
        return rows.find(function (row) { return row.precipStart !== null && row.precipStart <= at && row.precipEnd > at; }) || nearest(rows, at);
    }
    function hasForecast(data) {
        // Current-only caches predate the dashboard. A valid temperature alone
        // cannot establish that the saved response contains a usable forecast.
        return !!data && Array.isArray(data.hourly) && data.hourly.some(function (row) {
            return row && number(row.at) !== null && Math.abs(row.at) <= 8640000000000000 &&
                ['temp', 'wind', 'precipMm', 'precipProbability'].some(function (key) { return number(row[key]) !== null; });
        }) && Array.isArray(data.daily) && data.daily.some(function (day) { return day && validDate(day.date); });
    }
    function parseOpenMeteo(json, suppliedNow) {
        var now = nowValue(suppliedNow), current = json && json.current || {};
        if (!json || json.error || number(current.temperature_2m) === null) throw new Error('invalid weather data');
        var timeZone = zone(json.timezone), offset = number(json.utc_offset_seconds, -86400, 86400) || 0;
        var source = json.hourly || {}, times = Array.isArray(source.time) ? source.time : [];
        var hourly = sortedUnique(times.slice(0, 384).map(function (time, i) {
            var at = timestamp(time, offset);
            if (at === null) return null;
            return { at: at, temp: number(valueAt(source, 'temperature_2m', i)), code: code(valueAt(source, 'weather_code', i)),
                precipProbability: number(valueAt(source, 'precipitation_probability', i), 0, 100),
                precipMm: number(valueAt(source, 'precipitation', i), 0), wind: number(valueAt(source, 'wind_speed_10m', i), 0),
                direction: number(valueAt(source, 'wind_direction_10m', i), 0, 360), isDay: daylight(valueAt(source, 'is_day', i)),
                intervalHours: 1, precipStart: at - HOUR, precipEnd: at };
        }).filter(Boolean));
        var rawDaily = json.daily || {}, dailyTimes = Array.isArray(rawDaily.time) ? rawDaily.time : [];
        var today = dateAt(now, timeZone), usedDates = Object.create(null);
        var daily = dailyTimes.slice(0, 16).map(function (time, i) {
            var at = timestamp(time, offset);
            // Open-Meteo daily boundaries use the response's fixed UTC offset,
            // even across DST. Preserve its nominal date rather than silently
            // assigning that 24h aggregate to the previous local calendar day.
            var date = validDate(time) ? time : at !== null ? new Date(at + offset * 1000).toISOString().slice(0, 10) : null;
            if (!date || date < today || usedDates[date]) return null;
            usedDates[date] = true;
            var start = at !== null ? at : Date.parse(date + 'T00:00:00Z') - offset * 1000;
            return { date: date, high: number(valueAt(rawDaily, 'temperature_2m_max', i)), low: number(valueAt(rawDaily, 'temperature_2m_min', i)),
                code: code(valueAt(rawDaily, 'weather_code', i)), precipProbability: number(valueAt(rawDaily, 'precipitation_probability_max', i), 0, 100),
                precipMm: number(valueAt(rawDaily, 'precipitation_sum', i), 0), wind: number(valueAt(rawDaily, 'wind_speed_10m_max', i), 0),
                partial: start !== dayStart(date, timeZone) || start + 24 * HOUR !== dayStart(nextDate(date), timeZone),
                sampled: false, periodStart: start, periodEnd: start + 24 * HOUR };
        }).filter(Boolean).sort(function (a, b) { return a.date.localeCompare(b.date); }).slice(0, 7);
        var todayData = daily.find(function (day) { return day.date === today; });
        var precipitation = currentPrecip(hourly, now);
        var legacyHigh = !dailyTimes.length ? number(valueAt(rawDaily, 'temperature_2m_max', 0)) : null;
        var legacyLow = !dailyTimes.length ? number(valueAt(rawDaily, 'temperature_2m_min', 0)) : null;
        return { temp: rounded(number(current.temperature_2m)), code: code(current.weather_code), feels: rounded(number(current.apparent_temperature)),
            humidity: rounded(number(current.relative_humidity_2m, 0, 100)), wind: rounded(number(current.wind_speed_10m, 0), 1),
            direction: number(current.wind_direction_10m, 0, 360), isDay: daylight(current.is_day),
            high: rounded(todayData ? todayData.high : legacyHigh), low: rounded(todayData ? todayData.low : legacyLow),
            precipProbability: precipitation ? precipitation.precipProbability : null, precipMm: precipitation ? precipitation.precipMm : null,
            intervalHours: precipitation ? precipitation.intervalHours : null,
            hourly: hourly, daily: daily, timeZone: timeZone, provider: 'open-meteo', fetchedAt: now,
            forecastAt: timestamp(current.time, offset) };
    }

    function metCode(symbol) {
        var name = typeof symbol === 'string' ? symbol.replace(/_(day|night|polartwilight)$/, '') : '';
        var exact = { clearsky: 0, fair: 1, partlycloudy: 2, cloudy: 3, fog: 45,
            lightrain: 61, rain: 63, heavyrain: 65, lightrainshowers: 80, rainshowers: 81, heavyrainshowers: 82,
            lightsnow: 71, snow: 73, heavysnow: 75, lightsnowshowers: 85, snowshowers: 86, heavysnowshowers: 86,
            lightsleet: 68, sleet: 69, heavysleet: 69, lightsleetshowers: 83, sleetshowers: 84, heavysleetshowers: 84 };
        // These two extra-s spellings are retained by MET for API compatibility.
        if (name === 'lightssleetshowersandthunder' || name === 'lightssnowshowersandthunder') return 95;
        if (/^(light|heavy)?(rain|snow|sleet)(showers)?andthunder$/.test(name)) return 95;
        return Object.prototype.hasOwnProperty.call(exact, name) ? exact[name] : null;
    }
    function severity(value) {
        if (value === null) return -1;
        return value >= 95 ? 800 + value : value >= 71 && value <= 77 || value >= 85 ? 700 + value :
            value === 68 || value === 69 || value === 83 || value === 84 ? 600 + value : value >= 51 ? 500 + value : value;
    }
    function precipitationTotal(rows, start, end) {
        var cursor = start, total = 0, maximum = null, completeProbability = true, completeAmount = true;
        for (var i = 0; i < rows.length && cursor < end; i++) {
            var row = rows[i];
            if (row.precipStart === null || row.precipEnd <= cursor || row.precipStart < start || row.precipEnd > end) continue;
            if (row.precipStart !== cursor) return { amount: null, probability: null };
            if (row.precipMm === null) completeAmount = false;
            else total += row.precipMm;
            cursor = row.precipEnd;
            if (row.precipProbability === null) completeProbability = false;
            else maximum = maximum === null ? row.precipProbability : Math.max(maximum, row.precipProbability);
        }
        return cursor === end ? { amount: completeAmount ? Math.round(total * 1000) / 1000 : null, probability: completeProbability ? maximum : null } : { amount: null, probability: null };
    }
    function metDays(hourly, timeZone, now) {
        var today = dateAt(now, timeZone), dates = [];
        hourly.forEach(function (row) { var date = dateAt(row.at, timeZone); if (date >= today && dates.indexOf(date) < 0) dates.push(date); });
        return dates.slice(0, 7).map(function (date) {
            var start = dayStart(date, timeZone), end = dayStart(nextDate(date), timeZone);
            var points = hourly.filter(function (row) { return row.at >= start && row.at < end; });
            var before = hourly.filter(function (row) { return row.at <= start; }).pop();
            var after = hourly.find(function (row) { return row.at >= end; });
            var coverage = !!before && !!after;
            var span = before && after ? hourly.filter(function (row) { return row.at >= before.at && row.at <= after.at; }) : [];
            if (coverage) span.forEach(function (row, i) {
                if (row.temp === null || i && row.at - span[i - 1].at > 6 * HOUR) coverage = false;
            });
            var temperatures = points.map(function (row) { return row.temp; }).filter(function (v) { return v !== null; });
            var winds = points.map(function (row) { return row.wind; });
            var condition = null;
            points.forEach(function (row) { if (severity(row.code) > severity(condition)) condition = row.code; });
            var precipitation = precipitationTotal(hourly, start, end);
            return { date: date, high: coverage && temperatures.length ? Math.max.apply(null, temperatures) : null,
                low: coverage && temperatures.length ? Math.min.apply(null, temperatures) : null, code: condition,
                precipProbability: precipitation.probability, precipMm: precipitation.amount,
                wind: coverage && winds.length && winds.every(function (value) { return value !== null; }) ? Math.max.apply(null, winds) : null,
                partial: !coverage, sampled: true, precipPartial: precipitation.amount === null, periodStart: start, periodEnd: end };
        });
    }
    function parseMet(json, options) {
        options = options || {};
        var now = nowValue(options.now), timeZone = zone(options.timeZone);
        var series = json && json.properties && json.properties.timeseries;
        if (!Array.isArray(series) || !series.length) throw new Error('invalid weather data');
        var hourly = sortedUnique(series.slice(0, 500).map(function (item) {
            if (!item || typeof item !== 'object') return null;
            var at = timestamp(item.time, 0);
            if (at === null || at === undefined) return null;
            var data = item.data || {}, details = data.instant && data.instant.details || {};
            var hours = [1, 6, 12].find(function (h) { return data['next_' + h + '_hours'] && typeof data['next_' + h + '_hours'] === 'object'; });
            var period = hours ? data['next_' + hours + '_hours'] : {}, summary = period.summary || {}, rain = period.details || {};
            return { at: at, temp: number(details.air_temperature), code: metCode(summary.symbol_code),
                humidity: number(details.relative_humidity, 0, 100), precipProbability: number(rain.probability_of_precipitation, 0, 100),
                precipMm: number(rain.precipitation_amount, 0), wind: number(details.wind_speed, 0), direction: number(details.wind_from_direction, 0, 360),
                isDay: typeof summary.symbol_code === 'string' && /_day$/.test(summary.symbol_code) ? true :
                    typeof summary.symbol_code === 'string' && /_night$/.test(summary.symbol_code) ? false : null,
                intervalHours: hours || null, precipStart: hours ? at : null, precipEnd: hours ? at + hours * HOUR : null };
        }).filter(Boolean));
        var current = nearest(hourly, now, true);
        if (!current || Math.abs(current.at - now) > 6 * HOUR) throw new Error('invalid weather data');
        var daily = metDays(hourly, timeZone, now), today = daily.find(function (day) { return day.date === dateAt(now, timeZone); });
        var expires = typeof options.expires === 'number' ? options.expires : Date.parse(options.expires);
        return { temp: rounded(current.temp), code: current.code, feels: null, humidity: rounded(current.humidity), wind: rounded(current.wind, 1),
            direction: current.direction, isDay: current.isDay, high: today ? rounded(today.high) : null, low: today ? rounded(today.low) : null,
            precipProbability: current.precipProbability, precipMm: current.precipMm, intervalHours: current.intervalHours,
            hourly: hourly, daily: daily, timeZone: timeZone, provider: 'met-no', fetchedAt: now, forecastAt: current.at,
            refreshAfter: Math.max(now + 3 * HOUR, isFinite(expires) ? expires : 0) };
    }
    function rezoneMet(data, timeZone, suppliedNow) {
        // A corrected city timezone changes calendar grouping, never the
        // provider instants or the protected refresh deadline of cached data.
        if (!data || data.provider !== 'met-no' || !Array.isArray(data.hourly) || !data.hourly.length ||
            typeof timeZone !== 'string' || timeZone.length > 100) return data;
        var target;
        try { target = new Intl.DateTimeFormat('en', { timeZone: timeZone }).resolvedOptions().timeZone; }
        catch (_) { return data; }
        if (target === data.timeZone) return data;
        var fields = ['temp', 'wind', 'code', 'precipMm', 'precipProbability', 'precipStart', 'precipEnd'];
        if (!data.hourly.every(function (row) {
            return row && number(row.at) !== null && Math.abs(row.at) <= 8640000000000000 &&
                fields.every(function (key) { return row[key] === null || number(row[key]) !== null; });
        })) return data;
        var now = nowValue(suppliedNow), daily = metDays(data.hourly, target, now);
        var today = daily.find(function (day) { return day.date === dateAt(now, target); });
        return Object.assign({}, data, { timeZone: target, daily: daily,
            high: today ? rounded(today.high) : null, low: today ? rounded(today.low) : null });
    }
    return Object.freeze({ parseOpenMeteo: parseOpenMeteo, parseMet: parseMet, rezoneMet: rezoneMet, normalizeTimeZone: zone,
        hasForecast: hasForecast });
});
