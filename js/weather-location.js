/* Manual city selection; only an explicit search contacts the geocoding service. */
(function (global) {
    'use strict';
    var active = null;
    var TIMEOUT_MS = 10000;

    function element(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }
    function cleanName(value) {
        return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 160) : '';
    }
    function locationFrom(result, source) {
        if (!result || typeof result.latitude !== 'number' || typeof result.longitude !== 'number' ||
            !Number.isFinite(result.latitude) || !Number.isFinite(result.longitude) ||
            result.latitude < -90 || result.latitude > 90 || result.longitude < -180 || result.longitude > 180) return null;
        var city = cleanName(result.name);
        if (!city) return null;
        return { lat: result.latitude, lon: result.longitude, city: city,
            locationSource: source === 'network' ? 'network' : 'manual', locationNotice: source === 'network' ? '網路估算位置' : '' };
    }
    function networkResult(data) {
        if (!data || typeof data.latitude !== 'string' || !data.latitude.trim() || typeof data.longitude !== 'string' || !data.longitude.trim()) return null;
        // Retain only city information; never copy or store the returned IP.
        var result = { latitude: Number(data.latitude), longitude: Number(data.longitude), name: cleanName(data.city), admin1: cleanName(data.region), country: cleanName(data.country || data.country_code) };
        return locationFrom(result, 'network') ? result : null;
    }
    function ownerExists(session) {
        try { return !session.isCurrent || session.isCurrent() !== false; }
        catch (_) { return false; }
    }
    function live(session) {
        return active === session && !session.closed && session.dialog.isConnected && session.dialog.open && ownerExists(session);
    }
    function cancelRequest(session) {
        session.request++;
        if (session.controller) session.controller.abort();
        session.controller = null;
        if (session.timer) clearTimeout(session.timer);
        session.timer = 0; session.busy = false; session.kind = null;
    }
    function dispose(session, restoreFocus) {
        if (!session || session.closed) return;
        session.closed = true; cancelRequest(session);
        if (session.observer) session.observer.disconnect();
        if (active === session) active = null;
        session.onSelect = null;
        if (session.dialog.open) session.dialog.close();
        session.dialog.remove();
        if (restoreFocus && !active && ownerExists(session)) {
            var target = session.opener;
            if ((!target || !target.isConnected) && session.focusTarget) {
                try { target = session.focusTarget(); } catch (_) { target = null; }
            }
            if (target && target.isConnected && typeof target.focus === 'function') target.focus({ preventScroll: true });
        }
    }
    function close() { if (active) dispose(active, true); }
    function controls(session) {
        session.submit.disabled = session.busy && session.kind === 'manual' || session.selecting || session.composing || session.input.value.trim().length < 2;
        session.submit.textContent = session.busy && session.kind === 'manual' ? '搜尋中…' : '搜尋城市';
        session.network.disabled = session.selecting || session.busy && session.kind === 'network';
        session.network.textContent = session.busy && session.kind === 'network' ? '估算中…' : '以網路估算城市';
        session.input.disabled = session.selecting;
        session.results.setAttribute('aria-busy', String(session.busy || session.selecting));
        session.results.querySelectorAll('button').forEach(function (button) { button.disabled = session.selecting; });
    }
    function message(session, text, kind) {
        session.status.textContent = text;
        session.status.dataset.state = kind || 'info';
    }
    async function choose(session, result, source) {
        if (!live(session) || session.selecting) return;
        var location = locationFrom(result, source);
        if (!location) { message(session, '這個地點的資料不完整，請選擇其他結果。', 'error'); return; }
        session.selecting = true; controls(session); message(session, '正在套用城市…');
        try {
            var applied = await session.onSelect(location);
            if (!live(session)) return;
            if (applied === false) throw new Error('not_applied');
            dispose(session, true);
        } catch (_) {
            if (!live(session)) return;
            session.selecting = false; controls(session); message(session, '無法套用這個城市，請再試一次。', 'error');
        }
    }
    function renderResults(session, results, source) {
        session.results.replaceChildren();
        var seen = Object.create(null), count = 0;
        results.forEach(function (result) {
            var location = locationFrom(result, source);
            if (!location || count >= 8) return;
            var key = location.city + ':' + location.lat + ':' + location.lon;
            if (seen[key]) return;
            seen[key] = true; count++;
            var item = element('li');
            var button = element('button', 'weather-location-result'); button.type = 'button';
            var name = element('span', 'weather-location-result-name', location.city);
            var parts = [result.admin1, result.admin2, result.country || result.country_code].map(cleanName).filter(function (part, index, all) {
                return part && part !== location.city && all.indexOf(part) === index;
            });
            var region = element('span', 'weather-location-result-region', parts.join(' · ') || '城市地點');
            var arrow = element('span', 'weather-location-result-arrow', '›'); arrow.setAttribute('aria-hidden', 'true');
            button.append(name, region, arrow);
            button.addEventListener('click', function () { choose(session, result, source); });
            item.appendChild(button); session.results.appendChild(item);
        });
        session.empty.hidden = count > 0;
        session.empty.textContent = count ? '' : source === 'network' ? '無法估算城市，請改用城市名稱搜尋。' : '找不到這個城市。試試完整名稱，或在城市後加上國家。';
        message(session, count ? source === 'network' ? '找到可能的城市，請確認後選取。' : '找到 ' + count + ' 個地點，請選擇一個。' : source === 'network' ? '沒有可確認的城市。' : '沒有符合的地點。');
        controls(session);
    }
    async function search(session, event, kind) {
        if (event) event.preventDefault();
        kind = kind === 'network' ? 'network' : 'manual';
        if (!live(session) || session.composing || session.selecting || session.busy && session.kind === kind) return;
        var query = session.input.value.trim();
        if (kind === 'manual' && query.length < 2) { message(session, '請輸入至少 2 個字元的城市名稱。'); session.input.focus(); return; }
        cancelRequest(session);
        var request = session.request, controller = new AbortController();
        session.controller = controller; session.busy = true; session.kind = kind;
        session.results.replaceChildren(); session.empty.hidden = true; controls(session); message(session, kind === 'network' ? '正在估算網路所在城市…' : '正在尋找符合的城市…');
        function current() { return live(session) && request === session.request && !controller.signal.aborted; }
        session.timer = setTimeout(function () {
            if (!current()) return;
            cancelRequest(session); controls(session);
            session.empty.hidden = false; session.empty.textContent = '保留了你輸入的城市名稱，可以再次搜尋。';
            message(session, kind === 'network' ? '網路城市估算逾時，請改用城市名稱搜尋或再試一次。' : '城市搜尋逾時，請再試一次。', 'error');
        }, TIMEOUT_MS);
        try {
            var params = new URLSearchParams({ name: query, count: '8', language: 'zh', format: 'json' });
            var url = kind === 'network' ? 'https://get.geojs.io/v1/ip/geo.json' : 'https://geocoding-api.open-meteo.com/v1/search?' + params.toString();
            var response = await fetch(url, {
                signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer'
            });
            if (!current()) return;
            if (!response.ok) throw new Error('service_error');
            var data = await response.json();
            if (!current()) return;
            if (!data || typeof data !== 'object' || data.error) throw new Error('invalid_response');
            if (kind === 'network') { var estimated = networkResult(data); renderResults(session, estimated ? [estimated] : [], kind); }
            else {
                if (data.results !== undefined && !Array.isArray(data.results)) throw new Error('invalid_response');
                renderResults(session, data.results || [], kind);
            }
        } catch (_) {
            if (!current()) return;
            session.empty.hidden = false; session.empty.textContent = '保留了你輸入的城市名稱，可以再次搜尋。';
            message(session, navigator.onLine === false ? '目前沒有網路連線。請連線後再搜尋。' : kind === 'network' ? '無法透過網路估算城市，請改用城市名稱搜尋。' : '城市搜尋暫時無法使用，請稍後再試。', 'error');
        } finally {
            if (request === session.request) {
                if (session.timer) clearTimeout(session.timer);
                session.timer = 0; session.controller = null; session.busy = false; session.kind = null;
                if (live(session)) controls(session);
            }
        }
    }
    function open(options) {
        options = options || {};
        if (typeof options.onSelect !== 'function') return false;
        if (active) dispose(active, false);
        var session = { onSelect: options.onSelect, opener: options.opener || document.activeElement,
            isCurrent: typeof options.isCurrent === 'function' ? options.isCurrent : null,
            focusTarget: typeof options.focusTarget === 'function' ? options.focusTarget : null,
            request: 0, controller: null, timer: 0, busy: false, selecting: false, composing: false, closed: false };
        if (!ownerExists(session)) return false;
        var dialog = element('dialog', 'weather-location-dialog'); session.dialog = dialog;
        dialog.setAttribute('aria-labelledby', 'weather-location-title'); dialog.setAttribute('aria-describedby', 'weather-location-hint');
        var header = element('header', 'weather-location-header');
        var title = element('h2', null, '選擇天氣城市'); title.id = 'weather-location-title';
        var dismiss = element('button', 'weather-location-close', '×'); dismiss.type = 'button'; dismiss.setAttribute('aria-label', '關閉城市選擇');
        dismiss.addEventListener('click', function () { dispose(session, true); }); header.append(title, dismiss);
        var hint = element('p', 'weather-location-hint', '選擇想查看天氣的城市，也可以用英文名稱搜尋。'); hint.id = 'weather-location-hint';
        var form = element('form', 'weather-location-form');
        var label = element('label', null, '城市名稱'); label.htmlFor = 'weather-location-query';
        var input = element('input'); session.input = input; input.id = 'weather-location-query'; input.type = 'search';
        input.placeholder = '例如：台中、Tokyo'; input.autocomplete = 'off'; input.maxLength = 100; input.enterKeyHint = 'search';
        input.value = cleanName(options.city).slice(0, 100); input.setAttribute('aria-describedby', 'weather-location-status');
        var submit = element('button', 'weather-location-submit', '搜尋城市'); submit.type = 'submit'; session.submit = submit;
        form.append(label, input, submit);
        var networkSection = element('div', 'weather-location-network');
        var networkNote = element('p', 'weather-location-network-note', '點選後由 GeoJS 依網路 IP 估算城市。VPN 可能影響結果；請確認城市後選取。'); networkNote.id = 'weather-location-network-note';
        var network = element('button', 'weather-location-network-button', '以網路估算城市'); network.type = 'button'; session.network = network;
        network.setAttribute('aria-describedby', networkNote.id); network.addEventListener('click', function () { search(session, null, 'network'); });
        networkSection.append(networkNote, network);
        var status = element('p', 'weather-location-status', '輸入城市名稱後，按「搜尋城市」。'); status.id = 'weather-location-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); session.status = status;
        var results = element('ul', 'weather-location-results'); results.setAttribute('aria-label', '城市搜尋結果'); session.results = results;
        var empty = element('p', 'weather-location-empty', '確認城市與地區後，點選結果即可套用。'); session.empty = empty;
        var footer = element('footer', 'weather-location-footer');
        footer.appendChild(document.createTextNode('地名資料：'));
        var source = element('a', null, 'Open-Meteo'); source.href = 'https://open-meteo.com/en/docs/geocoding-api'; source.target = '_blank'; source.rel = 'noopener noreferrer';
        var geonames = element('a', null, 'GeoNames'); geonames.href = 'https://www.geonames.org/'; geonames.target = '_blank'; geonames.rel = 'noopener noreferrer';
        var geojs = element('a', null, 'GeoJS'); geojs.href = 'https://www.geojs.io/'; geojs.target = '_blank'; geojs.rel = 'noopener noreferrer';
        footer.append(source, document.createTextNode(' · '), geonames, document.createTextNode(' · '), geojs);
        dialog.append(header, hint, form, networkSection, status, results, empty, footer);
        form.addEventListener('submit', function (event) { search(session, event); });
        input.addEventListener('input', function () {
            if (!live(session) || session.selecting) return;
            cancelRequest(session); results.replaceChildren(); empty.hidden = false; empty.textContent = '確認城市與地區後，點選結果即可套用。';
            controls(session); message(session, '輸入城市名稱後，按「搜尋城市」。');
        });
        input.addEventListener('compositionstart', function () { session.composing = true; controls(session); });
        input.addEventListener('compositionend', function () { session.composing = false; controls(session); });
        input.addEventListener('keydown', function (event) {
            if (event.key === 'ArrowDown' && !event.isComposing && !session.composing) {
                var first = results.querySelector('button:not(:disabled)');
                if (first) { event.preventDefault(); first.focus(); }
            }
        });
        results.addEventListener('keydown', function (event) {
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
            var buttons = Array.from(results.querySelectorAll('button:not(:disabled)'));
            var index = buttons.indexOf(document.activeElement);
            if (index < 0) return;
            event.preventDefault();
            if (index === 0 && event.key === 'ArrowUp') input.focus();
            else buttons[Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))].focus();
        });
        dialog.addEventListener('cancel', function (event) { event.preventDefault(); dispose(session, true); });
        dialog.addEventListener('close', function () { dispose(session, true); });
        dialog.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dispose(session, true); return; }
            if (event.key !== 'Tab') return;
            var targets = Array.from(dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),a[href]')).filter(function (node) { return node.getClientRects().length > 0; });
            var first = targets[0], last = targets[targets.length - 1];
            if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
        });
        dialog.addEventListener('click', function (event) {
            if (event.target !== dialog) return;
            var rect = dialog.getBoundingClientRect();
            if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dispose(session, true);
        });
        active = session; document.body.appendChild(dialog); dialog.showModal(); controls(session); input.focus(); input.select();
        session.observer = new MutationObserver(function () { if (!dialog.isConnected || !ownerExists(session)) dispose(session, false); });
        session.observer.observe(document.body, { childList: true, subtree: true });
        return true;
    }
    global.NewtabWeatherLocation = { open: open, close: close };
})(window);
