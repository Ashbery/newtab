/* Forecast presentation. Provider values stay in Celsius and m/s; view choices
 * never fetch data or change the widget's saved geometry. */
(function (global) {
    'use strict';
    function node(tag, cls, text) {
        var el = document.createElement(tag);
        if (cls) el.className = cls;
        if (text !== undefined) el.textContent = text;
        return el;
    }
    function number(value) { return typeof value === 'number' && Number.isFinite(value); }
    function decimal(value) { return Math.round(value * 10) / 10; }
    function dateKey(at, zone) { return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at); }
    function clock(at, zone) { return new Intl.DateTimeFormat('zh-TW', { timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false }).format(at); }
    function dayName(date, today) {
        if (date === today) return '今天';
        return new Intl.DateTimeFormat('zh-TW', { weekday: 'short', timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z'));
    }
    function direction(value) {
        return number(value) ? ['北', '東北', '東', '東南', '南', '西南', '西', '西北'][Math.round(((value % 360) + 360) % 360 / 45) % 8] + '風' : '風向未提供';
    }
    function render(body, data, options) {
        var state = body._weatherView || (body._weatherView = { metric: 'temp', date: '', index: 0, expanded: false });
        state.unit = options.unit === 'F' ? 'F' : 'C';
        var zone = global.NewtabWeatherData.normalizeTimeZone(data.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone);
        var today = dateKey(Date.now(), zone);
        var hours = (data.hourly || []).filter(function (h) { return number(h.at); });
        var days = (data.daily || []).filter(function (d) { return /^\d{4}-\d{2}-\d{2}$/.test(d.date) && d.date >= today; }).slice(0, 8);
        if (!days.some(function (d) { return d.date === state.date; })) state.date = days[0] && days[0].date || today;
        function temperature(value) { return number(value) ? Math.round(state.unit === 'F' ? value * 9 / 5 + 32 : value) + '°' : '—'; }
        var summary = node('div', 'weather-summary');
        var main = node('div', 'weather-main');
        var glyph = node('span', 'weather-glyph');
        glyph.innerHTML = options.glyph(data.code); glyph.setAttribute('role', 'img'); glyph.setAttribute('aria-label', options.label(data.code));
        var temp = node('span', 'weather-temp');
        var units = node('div', 'weather-units'); units.setAttribute('aria-label', '溫度單位');
        ['C', 'F'].forEach(function (unit) {
            var button = node('button', 'weather-unit', '°' + unit); button.type = 'button'; button.dataset.unit = unit;
            button.setAttribute('aria-label', unit === 'C' ? '攝氏' : '華氏');
            button.addEventListener('click', function () { state.unit = unit; options.onUnit(unit); updateTemperatures(); updateChart(); });
            units.appendChild(button);
        });
        main.append(glyph, temp, units);
        var meta = node('div', 'weather-meta');
        ['hi', 'lo', 'feels', 'rain', 'hum', 'wind'].forEach(function (key) { meta.appendChild(node('span', 'weather-' + key)); });
        meta.querySelector('.weather-rain').textContent = number(data.precipProbability) ? '降雨 ' + Math.round(data.precipProbability) + '%' :
            number(data.precipMm) ? (data.intervalHours || 1) + '小時雨量 ' + decimal(data.precipMm) + 'mm' : '';
        meta.querySelector('.weather-hum').textContent = number(data.humidity) ? '濕度 ' + data.humidity + '%' : '';
        meta.querySelector('.weather-wind').textContent = number(data.wind) ? '風 ' + decimal(data.wind) + 'm/s' : '';
        summary.append(main, meta);
        var status = body.querySelector('.weather-status');
        body.insertBefore(summary, status);
        var details = node('button', 'weather-details', '查看預報'); details.type = 'button';
        details.setAttribute('aria-expanded', String(state.expanded));
        body.classList.toggle('weather-expanded', state.expanded);
        details.addEventListener('click', function () {
            state.expanded = !state.expanded; body.classList.toggle('weather-expanded', state.expanded);
            details.setAttribute('aria-expanded', String(state.expanded)); details.textContent = state.expanded ? '收起預報' : '查看預報';
        });
        details.textContent = state.expanded ? '收起預報' : '查看預報';
        body.appendChild(details);
        var forecast = node('section', 'weather-forecast'); forecast.setAttribute('aria-label', '天氣預報');
        body.appendChild(forecast);
        var tabs = node('div', 'weather-metrics'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', '預報類型');
        var indicator = node('span', 'weather-metric-indicator'); indicator.setAttribute('aria-hidden', 'true'); tabs.appendChild(indicator);
        var hasProbability = hours.some(function (h) { return number(h.precipProbability); });
        var labels = { temp: '氣溫', rain: hasProbability ? '降雨機率' : '降雨量', wind: '風向／風速' };
        var uid = body.closest('.widget') ? body.closest('.widget').dataset.id || body.closest('.widget').id : 'forecast';
        var panelId = 'weather-plot-' + uid;
        ['temp', 'rain', 'wind'].forEach(function (metric) {
            var tab = node('button', 'weather-metric', labels[metric]); tab.type = 'button'; tab.dataset.metric = metric;
            tab.id = panelId + '-' + metric; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', panelId);
            tab.addEventListener('click', function () { state.metric = metric; state.index = 0; updateChart(); });
            tab.addEventListener('keydown', function (event) {
                var index = ['temp', 'rain', 'wind'].indexOf(metric);
                if (event.key === 'ArrowRight') index = (index + 1) % 3;
                else if (event.key === 'ArrowLeft') index = (index + 2) % 3;
                else if (event.key === 'Home') index = 0;
                else if (event.key === 'End') index = 2;
                else return;
                event.preventDefault(); var next = tabs.querySelectorAll('button')[index]; next.focus(); next.click();
            });
            tabs.appendChild(tab);
        });
        forecast.appendChild(tabs);
        var panel = node('div', 'weather-plot'); panel.id = panelId; panel.setAttribute('role', 'tabpanel'); forecast.appendChild(panel);
        var reading = node('div', 'weather-reading'); reading.setAttribute('aria-live', 'polite'); reading.setAttribute('aria-atomic', 'true'); panel.appendChild(reading);
        var chart = node('div', 'weather-chart'); chart.tabIndex = 0; chart.setAttribute('role', 'slider');
        chart.setAttribute('aria-label', '逐時預報時間'); chart.setAttribute('aria-orientation', 'horizontal');
        chart.setAttribute('aria-description', '使用左右方向鍵查看各時段，Home 與 End 跳至首末時段。');
        panel.appendChild(chart);
        var axis = node('div', 'weather-axis'); axis.setAttribute('aria-hidden', 'true'); panel.appendChild(axis);
        var notice = node('div', 'weather-forecast-note'); panel.appendChild(notice);
        var intervalNote = node('div', 'weather-interval-note'); panel.appendChild(intervalNote);
        var dayStrip = node('div', 'weather-days'); dayStrip.setAttribute('aria-label', '選擇預報日期'); forecast.appendChild(dayStrip);
        days.forEach(function (day) {
            var button = node('button', 'weather-day'); button.type = 'button'; button.dataset.date = day.date;
            var icon = node('span', 'weather-day-icon'); icon.innerHTML = options.glyph(day.code);
            button.append(node('span', 'weather-day-name', dayName(day.date, today)), icon, node('span', 'weather-day-range'));
            button.addEventListener('click', function () { state.date = day.date; state.index = 0; updateChart(); });
            dayStrip.appendChild(button);
        });
        var selected = [];
        function value(hour) {
            if (state.metric === 'temp') return number(hour.temp) ? (state.unit === 'F' ? hour.temp * 9 / 5 + 32 : hour.temp) : null;
            if (state.metric === 'wind') return hour.wind;
            return hasProbability ? hour.precipProbability : hour.precipMm;
        }
        function valueLabel(hour) {
            var val = value(hour);
            if (!number(val)) return '未提供';
            if (state.metric === 'temp') return temperature(hour.temp) + state.unit;
            if (state.metric === 'wind') return decimal(val) + ' m/s · ' + direction(hour.direction);
            return hasProbability ? Math.round(val) + '%' : decimal(val) + ' mm（' + (hour.intervalHours || 1) + ' 小時）';
        }
        function updateTemperatures() {
            temp.textContent = temperature(data.temp);
            units.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.unit === state.unit)); });
            var todayForecast = days.find(function (day) { return day.date === today; });
            var high = todayForecast ? todayForecast.high : data.high, low = todayForecast ? todayForecast.low : data.low;
            meta.querySelector('.weather-hi').textContent = number(high) ? '↑' + temperature(high) : '';
            meta.querySelector('.weather-lo').textContent = number(low) ? '↓' + temperature(low) : '';
            meta.querySelector('.weather-feels').textContent = number(data.feels) ? '體感 ' + temperature(data.feels) : '';
            dayStrip.querySelectorAll('button').forEach(function (b, index) {
                var d = days[index];
                b.querySelector('.weather-day-range').textContent = temperature(d.high) + ' / ' + temperature(d.low);
                b.setAttribute('aria-label', d.date + ' ' + options.label(d.code) + '，' + (d.sampled ? '預報時段範圍 ' : '高低溫 ') + temperature(d.high) + ' / ' + temperature(d.low) + (d.partial ? '，部分時段' : ''));
                b.title = d.date + (d.partial ? ' · 部分時段' : d.sampled ? ' · 預報時段溫度範圍' : '');
            });
        }
        function point(index) {
            var start = selected[0].at, end = selected[selected.length - 1].at;
            return end > start ? (selected[index].at - start) / (end - start) * 600 + 12 : 312;
        }
        function inspect(index, announce) {
            if (!selected.length) return;
            state.index = Math.max(0, Math.min(selected.length - 1, index));
            var h = selected[state.index];
            reading.textContent = clock(h.at, zone) + ' · ' + valueLabel(h);
            if (state.metric === 'rain' && !hasProbability && number(h.precipStart) && number(h.precipEnd)) {
                reading.textContent = clock(h.precipStart, zone) + '–' + clock(h.precipEnd, zone) + ' · ' + valueLabel(h);
            }
            chart.setAttribute('aria-valuenow', state.index); chart.setAttribute('aria-valuetext', state.date + ' ' + reading.textContent);
            var cursor = chart.querySelector('.weather-chart-cursor');
            if (cursor) { cursor.setAttribute('x1', point(state.index)); cursor.setAttribute('x2', point(state.index)); }
            var dot = chart.querySelector('.weather-chart-dot');
            if (dot) { dot.setAttribute('cx', point(state.index)); dot.setAttribute('cy', chart._weatherY(value(h))); dot.style.display = number(value(h)) ? '' : 'none'; }
            reading.setAttribute('aria-live', announce ? 'polite' : 'off');
        }
        function updateChart() {
            var metricIndex = ['temp', 'rain', 'wind'].indexOf(state.metric);
            intervalNote.textContent = state.metric === 'rain' && !hasProbability ? '雨量依各預報區間顯示，時長見上方數值。' : '';
            tabs.style.setProperty('--weather-tab', metricIndex);
            tabs.querySelectorAll('button').forEach(function (b) { var active = b.dataset.metric === state.metric; b.setAttribute('aria-selected', String(active)); b.tabIndex = active ? 0 : -1; });
            panel.setAttribute('aria-labelledby', panelId + '-' + state.metric);
            selected = hours.filter(function (h) { return dateKey(h.at, zone) === state.date && (state.date !== today || h.at >= Date.now() - 3600000); });
            dayStrip.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.date === state.date)); });
            var vals = selected.map(value).filter(number);
            chart.hidden = !vals.length; axis.hidden = !vals.length;
            notice.hidden = !!vals.length;
            if (!vals.length) {
                reading.textContent = '';
                notice.textContent = hours.length ? '這一天尚無此項預報。' : '詳細預報將於下次更新補齊。';
                return;
            }
            var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
            if (state.metric !== 'temp') min = 0;
            var span = Math.max(max - min, state.metric === 'rain' && hasProbability ? 20 : 2);
            var y = function (v) { return number(v) ? 84 - (v - min) / span * 64 : 84; }; chart._weatherY = y;
            var path = '', segment = false;
            selected.forEach(function (h, i) { if (!number(value(h))) { segment = false; return; } path += (segment ? 'L' : 'M') + point(i).toFixed(2) + ' ' + y(value(h)).toFixed(2) + ' '; segment = true; });
            var fill = '', group = [];
            function closeGroup() { if (!group.length) return; fill += 'M' + point(group[0]) + ' 100 ' + group.map(function (i) { return 'L' + point(i) + ' ' + y(value(selected[i])); }).join(' ') + ' L' + point(group[group.length - 1]) + ' 100 Z '; group = []; }
            selected.forEach(function (h, i) { if (number(value(h))) group.push(i); else closeGroup(); }); closeGroup();
            chart.innerHTML = '<svg viewBox="0 0 624 104" preserveAspectRatio="none" aria-hidden="true"><path class="weather-chart-grid" d="M12 84H612 M12 20H612"/><path class="weather-chart-fill" d="' + fill + '"/><path class="weather-chart-line" d="' + path + '"/><line class="weather-chart-cursor" y1="6" y2="100"/><circle class="weather-chart-dot" r="3.5"/></svg>';
            var range = node('span', 'weather-chart-range', (state.metric === 'temp' ? Math.round(max) + '° / ' + Math.round(min) + '°' : decimal(max) + (state.metric === 'wind' ? ' m/s' : hasProbability ? '%' : ' mm')));
            chart.appendChild(range);
            chart.setAttribute('aria-valuemin', '0'); chart.setAttribute('aria-valuemax', selected.length - 1);
            axis.replaceChildren();
            var ticks = Math.min(4, selected.length);
            var usedTicks = [];
            for (var i = 0; i < ticks; i++) {
                var targetAt = selected[0].at + i / Math.max(1, ticks - 1) * (selected[selected.length - 1].at - selected[0].at);
                var tickIndex = selected.reduce(function (best, h, index) { return Math.abs(h.at - targetAt) < Math.abs(selected[best].at - targetAt) ? index : best; }, 0);
                if (usedTicks.indexOf(tickIndex) >= 0) continue;
                usedTicks.push(tickIndex);
                var tick = node('span', '', clock(selected[tickIndex].at, zone));
                tick.style.left = point(tickIndex) / 624 * 100 + '%';
                tick.style.transform = 'translateX(' + (i === 0 ? 0 : i === ticks - 1 ? -100 : -50) + '%)';
                axis.appendChild(tick);
            }
            inspect(state.index, false);
        }
        chart.addEventListener('keydown', function (e) {
            var index = state.index;
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') index++;
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') index--;
            else if (e.key === 'Home') index = 0;
            else if (e.key === 'End') index = selected.length - 1;
            else return;
            e.preventDefault(); e.stopPropagation(); inspect(index, true);
        });
        function pointer(e) {
            if (!selected.length) return;
            var rect = chart.getBoundingClientRect(); var ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            var target = selected[0].at + ratio * (selected[selected.length - 1].at - selected[0].at);
            var nearest = selected.reduce(function (best, h, i) { return Math.abs(h.at - target) < Math.abs(selected[best].at - target) ? i : best; }, 0);
            inspect(nearest, false);
        }
        chart.addEventListener('pointerdown', function (e) { if (e.button !== 0) return; chart.focus({ preventScroll: true }); pointer(e); });
        chart.addEventListener('pointermove', pointer);
        updateTemperatures(); updateChart();
        if (data.provider === 'met-no' && days.some(function (d) { return d.sampled || d.partial; })) {
            forecast.appendChild(node('div', 'weather-sampling-note', '多日溫度為預報時段範圍；不完整日期不列高低溫。'));
        } else if (days.some(function (d) { return d.partial; })) {
            forecast.appendChild(node('div', 'weather-sampling-note', '日預報依資料來源的 24 小時區間；夏令時間切換日可能跨日。'));
        }
    }
    global.NewtabWeatherDashboard = { render: render };
})(window);
