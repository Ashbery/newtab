/**
 * NewtabWidgets — v4 free layout + P0–P2 fix batch
 * free-axis resize, merge skipIds, five widgets, long-press, folders
 */
(function (global) {
    'use strict';

    var LONG_PRESS_MS = 560;
    var LONG_PRESS_MOVE_PX = 8;
    var SUPPRESS_BLANK_MS = 300;
    var LAYOUT_ATTR_DEBOUNCE_MS = 100;
    var HANDLE_DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
    var WEATHER_CACHE_KEY = 'nt_weather_cache';
    var WEATHER_TTL_MS = 30 * 60 * 1000;
    var WEATHER_FETCH_MS = 8000;
    var APPEARANCE_BG_MAX = 180000;
    var TAIPEI = { lat: 25.033, lon: 121.565, city: '台北' };
    var NOTES_MAX = 5000;
    var TODO_MAX = 20;
    var BOOKMARKS_MAX = 12;
    var SCALE_REF = {
        clock: { w: 280, h: 100 },
        search: { w: 420, h: 56 },
        app: { w: 72, h: 76 },
        folder: { w: 80, h: 88 },
        weather: { w: 220, h: 160 },
        notes: { w: 200, h: 144 },
        countdown: { w: 144, h: 112 },
        todo: { w: 200, h: 176 },
        bookmarks: { w: 360, h: 64 },
        companion: { w: 280, h: 360 }
    };

    var L = null;
    var SEARCH_ICON_ONLY_PX = 120;
    var state = {
        layout: null,
        arranging: false,
        drag: null,
        resize: null,
        longPress: null,
        blankLP: null,
        searchExpand: null,
        editor: null,
        suppressBlankUntil: 0,
        bound: false,
        renderedRects: Object.create(null)
    };

    function $(sel, root) {
        return (root || document).querySelector(sel);
    }

    function $$(sel, root) {
        return Array.prototype.slice.call((root || document).querySelectorAll(sel));
    }

    function emitChange() {
        try {
            document.dispatchEvent(new CustomEvent('newtab:layout-change', {
                detail: { layout: L.clone(state.layout) }
            }));
        } catch (e) { /* ignore */ }
    }

    function persist() {
        if (state.editor) { state.editor.dirty = true; emitChange(); return true; }
        var ok = L.saveLayout(state.layout);
        emitChange();
        return ok;
    }

    function findWidget(id) {
        var i;
        for (i = 0; i < state.layout.widgets.length; i++) {
            if (state.layout.widgets[i].id === id) return state.layout.widgets[i];
        }
        return null;
    }

    function otherPixelRects(excludeId) {
        return state.layout.widgets
            .filter(function (w) { return w.id !== excludeId; })
            .map(function (w) {
                // Collide with what is actually painted at this viewport, while
                // leaving the user's saved coordinates untouched by reflow.
                var px = Object.assign({}, state.renderedRects[w.id] || L.toPixels(w));
                px.id = w.id;
                return px;
            });
    }

    function isChromeTarget(t) {
        if (!t || !t.closest) return false;
        return !!(
            t.closest('.appearance-dialog') ||
            t.closest('.character-chat-dialog') ||
            t.closest('.home-header') ||
            t.closest('.home-footer') ||
            t.closest('#side-rail') ||
            t.closest('#side-rail-tab') ||
            t.closest('#side-rail-hotzone') ||
            t.closest('#side-rail-dim') ||
            t.closest('#arrange-done-bar') ||
            t.closest('#home-editor-toolbar') ||
            t.closest('.widget-options') ||
            t.closest('.ctx-menu') ||
            t.closest('.ctx-sub') ||
            t.closest('.folder-overlay') ||
            t.closest('.custom-app-modal') ||
            t.closest('.catalog-drag-ghost') ||
            t.closest('.layout-toast') ||
            t.closest('.about-page-container') ||
            t.closest('.video-upload-container') ||
            t.closest('.search-expand-layer') ||
            t.closest('.bookmark-modal') ||
            t.closest('.bookmark-add-pop')
        );
    }

    function computeLayoutMode(type, px) {
        if (type === 'search' && px.width < SEARCH_ICON_ONLY_PX) return 'icon-only';
        var ref = SCALE_REF[type] || { w: 100, h: 100 };
        var rw = Math.max(1, ref.w);
        var rh = Math.max(1, ref.h);
        var sizeRatio = Math.min(px.width / rw, px.height / rh);
        var aspect = px.width / Math.max(1, px.height);
        var refAspect = rw / rh;
        if (sizeRatio < 0.65) return 'compact';
        if (aspect > refAspect * 1.35) return 'wide';
        if (aspect < refAspect * 0.85) return 'stack';
        return 'regular';
    }

    function guardAppearance(opts) {
        if (global.NewtabAppearance) return NewtabAppearance.normalizeWidget(opts);
        if (!opts || typeof opts !== 'object') return {};
        var p = opts.preset;
        if (['glass', 'solid', 'clear'].indexOf(p) < 0) p = undefined;
        var alpha = typeof opts.alpha === 'number' ? Math.max(0, Math.min(1, opts.alpha)) : undefined;
        var bgAlpha = typeof opts.bgAlpha === 'number' ? Math.max(0, Math.min(1, opts.bgAlpha)) : undefined;
        var blur = [0, 8, 16].indexOf(opts.blur) >= 0 ? opts.blur : undefined;
        var tint = typeof opts.tint === 'string' ? opts.tint : undefined;
        var bgDataUrl;
        if (typeof opts.bgDataUrl === 'string' && opts.bgDataUrl.indexOf('data:image/') === 0) {
            if (opts.bgDataUrl.length <= APPEARANCE_BG_MAX) bgDataUrl = opts.bgDataUrl;
        }
        return {
            preset: p,
            tint: tint,
            alpha: alpha,
            blur: blur,
            bgDataUrl: bgDataUrl,
            bgAlpha: bgAlpha
        };
    }

    function applyAppearance(el, w) {
        if (!el || !w) return;
        if (global.NewtabAppearance) { NewtabAppearance.applyWidget(el, w); return; }
        var types = { bookmarks: 1, todo: 1, countdown: 1, notes: 1 };
        if (!types[w.type]) {
            el.removeAttribute('data-appearance-preset');
            return;
        }
        var a = guardAppearance(w.options && w.options.appearance);
        var preset = a.preset || 'glass';
        var alpha = typeof a.alpha === 'number' ? a.alpha : (preset === 'solid' ? 0.88 : preset === 'clear' ? 0.08 : 0.28);
        var blur = typeof a.blur === 'number' ? a.blur : (preset === 'glass' ? 12 : 0);
        el.setAttribute('data-appearance-preset', preset);
        el.style.setProperty('--app-surface-alpha', String(alpha));
        el.style.setProperty('--app-blur', blur + 'px');
        if (a.bgDataUrl) {
            el.style.setProperty('--app-bg-image', 'url("' + a.bgDataUrl.replace(/"/g, '') + '")');
        } else {
            el.style.setProperty('--app-bg-image', 'none');
        }
        if (typeof a.bgAlpha === 'number') {
            el.style.setProperty('--app-bg-alpha', String(a.bgAlpha));
        }
    }

    function handlesForType(type) {
        if (L && L.HANDLE_MATRIX && L.HANDLE_MATRIX[type]) {
            return L.HANDLE_MATRIX[type];
        }
        if (type === 'app' || type === 'folder') return [];
        return HANDLE_DIRS.slice();
    }

    function syncClockHour12Bridge() {
        var clock = (state.layout && state.layout.widgets || []).filter(function (w) {
            return w.type === 'clock';
        })[0];
        var hour12 = !(clock && clock.options && clock.options.hour12 === false);
        global.__nt_clock_hour12 = hour12;
        if (typeof global.updateClock === 'function') {
            try { global.updateClock(); } catch (e) { /* */ }
        }
    }

    function folderGridForSize(pxW, pxH, w) {
        var grid = w && w.options && w.options.grid;
        if (grid === 2 || grid === 3 || grid === 4) {
            var map = L && L.FOLDER_GRID_PX && L.FOLDER_GRID_PX[grid];
            if (map) return { cols: map.cols, rows: map.rows, max: map.max, grid: grid };
            return { cols: grid, rows: grid, max: grid * grid, grid: grid };
        }
        if (pxW < 130 || pxH < 130) return { cols: 2, rows: 2, max: 4, grid: 2 };
        if (pxW < 210 || pxH < 210) return { cols: 3, rows: 3, max: 9, grid: 3 };
        return { cols: 4, rows: 4, max: 16, grid: 4 };
    }

    function ensureShell(w) {
        var canvas = $('#widget-canvas');
        if (!canvas) return null;
        var el = document.querySelector('.widget[data-id="' + w.id + '"]');
        if (el) return el;

        el = document.createElement('div');
        el.className = 'widget';
        el.setAttribute('data-id', w.id);
        el.setAttribute('data-type', w.type);
        el.setAttribute('data-active', 'true');

        if (w.type === 'clock') {
            var existingClock = document.querySelector('#clock');
            var body = document.createElement('div');
            body.className = 'widget-body';
            if (existingClock) {
                var timeC = existingClock.closest('.time-container') || existingClock.parentElement;
                if (timeC && timeC.classList.contains('time-container')) {
                    body.appendChild(timeC);
                } else {
                    body.innerHTML = '<div class="time-container"><div class="clock-glass">' +
                        '<div class="clock" id="clock" aria-live="polite"></div>' +
                        '<div class="date" id="date"></div></div></div>';
                }
            } else {
                body.innerHTML = '<div class="time-container"><div class="clock-glass">' +
                    '<div class="clock" id="clock" aria-live="polite"></div>' +
                    '<div class="date" id="date"></div></div></div>';
            }
            el.appendChild(body);
        } else if (w.type === 'search') {
            var existingSearch = document.querySelector('#search-box');
            var bodyS = document.createElement('div');
            bodyS.className = 'widget-body';
            if (existingSearch) {
                var sc = existingSearch.closest('.search-container') || existingSearch.parentElement;
                if (sc && sc.classList.contains('search-container')) {
                    bodyS.appendChild(sc);
                } else {
                    bodyS.appendChild(existingSearch);
                }
            } else {
                bodyS.innerHTML =
                    '<div class="search-container">' +
                    '<div class="search-box" id="search-box">' +
                    '<div class="search-input-wrapper">' +
                    '<i class="fas fa-search search-icon" aria-hidden="true"></i>' +
                    '<input type="text" class="search-input" id="search-input" placeholder="搜尋 Google 或輸入網址" autocomplete="off" spellcheck="false">' +
                    '<button type="button" class="clear-btn" id="clear-btn" aria-label="清除" hidden>' +
                    '<i class="fas fa-times" aria-hidden="true"></i></button></div>' +
                    '<div class="suggestions-container" id="suggestions-container">' +
                    '<ul class="suggestions-list" id="suggestions-list"></ul></div></div></div>';
            }
            el.appendChild(bodyS);
        } else if (w.type === 'app') {
            el.appendChild(buildAppBody(w.options && w.options.appId));
        } else if (w.type === 'folder') {
            el.appendChild(buildFolderBody(w));
        } else if (w.type === 'weather') {
            el.appendChild(buildWeatherBody(w));
        } else if (w.type === 'notes') {
            el.appendChild(buildNotesBody(w));
        } else if (w.type === 'countdown') {
            el.appendChild(buildCountdownBody(w));
        } else if (w.type === 'todo') {
            el.appendChild(buildTodoBody(w));
        } else if (w.type === 'bookmarks') {
            el.appendChild(buildBookmarksBody(w));
        } else if (w.type === 'companion') {
            var companionBody = document.createElement('div');
            companionBody.className = 'widget-body companion-widget-body';
            el.appendChild(companionBody);
            mountCompanion(el, w);
        }

        // lock badge (visibility via CSS .is-pinned)
        var badge = document.createElement('span');
        badge.className = 'widget-lock-badge';
        badge.setAttribute('aria-hidden', 'true');
        badge.innerHTML = '<i class="fas fa-lock"></i>';
        el.appendChild(badge);

        canvas.appendChild(el);
        return el;
    }

    function mountCompanion(el, w) {
        if (!global.NewtabCompanion || !NewtabCompanion.mount) return;
        var optionsKey = JSON.stringify({ animation: !w.options || w.options.animation !== false, animationMode: w.options && w.options.animationMode || 'auto',
            greeting: w.options && w.options.greeting || '', chatUrl: w.options && w.options.chatUrl || '' });
        if (el._companionOptions === optionsKey) return;
        if (typeof el._companionCleanup === 'function') el._companionCleanup();
        el._companionOptions = optionsKey;
        el._companionCleanup = NewtabCompanion.mount(el.querySelector('.companion-widget-body'), w);
    }

    function buildAppBody(appId) {
        var body = document.createElement('div');
        body.className = 'widget-body app-tile-body';
        var meta = global.NewtabApps && NewtabApps.get(appId);
        var label = meta && meta.label != null ? String(meta.label) : '';
        var hasLabel = !!(label && label.trim());
        var href = meta ? meta.url : '#';
        var src = meta && NewtabApps.iconUrl ? NewtabApps.iconUrl(appId) : '';
        var cropMeta = meta && meta.cropMeta;
        var link = document.createElement('a');
        link.className = 'app-tile' + (hasLabel ? '' : ' is-icon-only');
        link.href = href;
        link.setAttribute('data-app-id', appId || '');
        link.draggable = false;
        var icon = document.createElement('span');
        icon.className = 'app-tile-icon';
        if (src && cropMeta && cropMeta.animated) {
            icon.classList.add('is-cropped');
            ['nx', 'ny', 'nw', 'nh'].forEach(function (key) {
                icon.style.setProperty('--crop-' + key, String(Number(cropMeta[key])));
            });
        }
        if (src) {
            var img = document.createElement('img');
            img.src = src;
            img.alt = '';
            img.width = 44;
            img.height = 44;
            img.decoding = 'async';
            icon.appendChild(img);
        }
        link.appendChild(icon);
        if (hasLabel) {
            var labelEl = document.createElement('span');
            labelEl.className = 'app-tile-label';
            labelEl.textContent = label;
            link.appendChild(labelEl);
        }
        body.appendChild(link);
        return body;
    }

    function buildFolderBody(w, pxHint) {
        var body = document.createElement('div');
        body.className = 'widget-body folder-tile-body';
        var children = (w.options && w.options.children) || [];
        var px = pxHint || (L ? L.toPixels(w) : { width: 80, height: 88 });
        var grid = folderGridForSize(px.width, px.height, w);
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'folder-tile';
        button.setAttribute('data-folder-id', w.id);
        var preview = document.createElement('span');
        preview.className = 'folder-preview';
        preview.setAttribute('data-cols', grid.cols);
        preview.setAttribute('data-rows', grid.rows);
        preview.style.setProperty('--folder-cols', String(grid.cols));
        preview.style.setProperty('--folder-rows', String(grid.rows));
        children.slice(0, grid.max).forEach(function (c) {
            var src = global.NewtabApps && NewtabApps.iconUrl(c.appId);
            var item = document.createElement(src ? 'img' : 'span');
            if (src) { item.src = src; item.alt = ''; item.decoding = 'async'; }
            else item.className = 'folder-dot';
            preview.appendChild(item);
        });
        var name = (w.options && w.options.name) || '資料夾';
        var label = document.createElement('span');
        label.className = 'folder-label';
        label.textContent = name;
        button.appendChild(preview);
        button.appendChild(label);
        body.appendChild(button);
        return body;
    }

    function refreshFolderBody(el, w) {
        if (!el) return;
        var body = el.querySelector('.widget-body');
        if (!body) return;
        var px = el.getBoundingClientRect();
        var next = buildFolderBody(w, { width: px.width, height: px.height });
        el.replaceChild(next, body);
    }

    /* ---------- Five widgets builders + weather data ---------- */
    function wmoGlyph(code) {
        var c = parseInt(code, 10);
        // Authored symbols share the character's ice-blue, silver and ribbon
        // details. Only these fixed paths enter the SVG; no API text is markup.
        var sun = '<circle cx="27" cy="25" r="12" fill="#d4eaf3"/><path d="M27 7v3m0 30v3M9 25h3m30 0h3M14 12l2 2m22 22 2 2m0-26-2 2M16 36l-2 2" fill="none"/>';
        var cloud = '<path d="M17 42a9 9 0 1 1 1-18 13 13 0 0 1 25-1 10 10 0 0 1 3 19Z" fill="#f8fbfd"/>';
        var ribbon = '<path d="m42 32-5-3v8l5-3 5 3v-8Z" fill="#a9cfdf" stroke-width="1.2"/><circle cx="42" cy="33" r="1.6" fill="#526b7b" stroke="none"/>';
        var rain = '<path d="m21 48-2 5m13-5-2 5m13-5-2 5" stroke="#79b6cf" stroke-width="3"/>';
        var shapes;
        if (isNaN(c)) {
            shapes = '<path d="M28 14a5 5 0 0 1 10 0v22a10 10 0 1 1-10 0Z" fill="#edf5f8"/><path d="M33 23v20" stroke="#87bdd3" stroke-width="4"/><circle cx="33" cy="44" r="4" fill="#87bdd3" stroke="none"/>';
        } else if (c === 0) {
            shapes = sun + '<path d="M22 28q5-7 10 0c2 4-2 5-5 3-3 2-7 1-5-3Z" fill="#fff" stroke="none"/><g fill="#fff" stroke="none"><ellipse cx="22" cy="22" rx="1.7" ry="2.2"/><ellipse cx="27" cy="20" rx="1.7" ry="2.2"/><ellipse cx="32" cy="22" rx="1.7" ry="2.2"/></g>';
        } else if (c === 1 || c === 2) {
            shapes = '<g transform="translate(12 -4) scale(.8)">' + sun + '</g>' + cloud + ribbon;
        } else if (c === 45 || c === 48) {
            shapes = cloud + ribbon + '<path d="M16 49h32m-26 6h22" stroke="#94adbc"/>';
        } else if ((c >= 71 && c <= 77) || c === 85 || c === 86) {
            shapes = cloud + ribbon + '<path d="M23 47v10m-4-7 8 4m0-4-8 4m22-7v10m-4-7 8 4m0-4-8 4" stroke="#86b3cb"/>';
        } else if (c >= 95) {
            shapes = cloud + ribbon + '<path d="m32 43-6 10h6l-2 8 11-13h-7l3-5" fill="#8ab7cc" stroke="#567e95"/>';
        } else if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) {
            shapes = cloud + ribbon + rain;
        } else {
            shapes = cloud + ribbon;
        }
        return '<svg class="weather-symbol" viewBox="0 0 64 64" fill="none" stroke="#66889c" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + shapes + '</svg>';
    }

    function wmoLabel(code) {
        var c = parseInt(code, 10);
        if (c === 0) return '晴';
        if (c === 1) return '晴時多雲';
        if (c === 2) return '多雲';
        if (c === 3) return '陰';
        if (c === 45 || c === 48) return '霧';
        if (c >= 51 && c <= 67) return '雨';
        if ((c >= 71 && c <= 77) || c === 85 || c === 86) return '雪';
        if (c >= 80 && c <= 82) return '陣雨';
        if (c >= 95) return '雷雨';
        return '狀況待更新';
    }

    function validWeatherCoordinates(lat, lon) {
        return typeof lat === 'number' && isFinite(lat) && Math.abs(lat) <= 90 &&
            typeof lon === 'number' && isFinite(lon) && Math.abs(lon) <= 180;
    }

    function validWeatherData(data) {
        return data && typeof data.temp === 'number' && isFinite(data.temp);
    }

    /** Cache entries never turn missing temperatures into a successful reading. */
    function readWeatherCache(lat, lon) {
        try {
            var raw = global.localStorage && localStorage.getItem(WEATHER_CACHE_KEY);
            if (!raw) return null;
            var c = JSON.parse(raw);
            if (!c || !validWeatherData(c.data) || !validWeatherCoordinates(c.lat, c.lon) ||
                typeof c.ts !== 'number' || !isFinite(c.ts) || c.ts > Date.now() + 60000 ||
                Date.now() - c.ts > 7 * 24 * 60 * 60 * 1000) return null;
            if (Math.abs(c.lat - lat) > 0.001 || Math.abs(c.lon - lon) > 0.001) return null;
            var stale = Date.now() - c.ts > WEATHER_TTL_MS;
            return { data: c.data, stale: stale };
        } catch (e) {
            return null;
        }
    }

    function writeWeatherCache(lat, lon, data) {
        try {
            if (global.localStorage) {
                localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({
                    lat: lat, lon: lon, ts: Date.now(), data: data
                }));
            }
        } catch (e) { /* ignore */ }
    }

    /** Return a cancellation function; only the current mounted caller may cache. */
    function fetchWeatherNetwork(lat, lon, cb) {
        var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + encodeURIComponent(lat) +
            '&longitude=' + encodeURIComponent(lon) +
            '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m' +
            '&daily=temperature_2m_max,temperature_2m_min&wind_speed_unit=ms&timezone=auto&forecast_days=1';
        var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var settled = false;
        function finish(err, data) {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            cb(err, data);
        }
        var timer = setTimeout(function () {
            finish(new Error('timeout'));
            if (ctrl) try { ctrl.abort(); } catch (e) { /* */ }
        }, WEATHER_FETCH_MS);
        var opts = ctrl ? { signal: ctrl.signal } : {};
        Promise.resolve().then(function () { return fetch(url, opts); }).then(function (res) {
            if (!res.ok) throw new Error('http ' + res.status);
            return res.json();
        }).then(function (json) {
            if (settled) return;
            var cur = json && json.current || {};
            if (!json || json.error || typeof cur.temperature_2m !== 'number' || !isFinite(cur.temperature_2m)) {
                throw new Error('invalid weather data');
            }
            var daily = json.daily || {};
            var data = {
                temp: Math.round(cur.temperature_2m),
                code: typeof cur.weather_code === 'number' && isFinite(cur.weather_code) ? cur.weather_code : null,
                feels: typeof cur.apparent_temperature === 'number' && isFinite(cur.apparent_temperature) ? Math.round(cur.apparent_temperature) : null,
                humidity: typeof cur.relative_humidity_2m === 'number' && isFinite(cur.relative_humidity_2m) ? Math.round(cur.relative_humidity_2m) : null,
                wind: typeof cur.wind_speed_10m === 'number' && isFinite(cur.wind_speed_10m) ? Math.round(cur.wind_speed_10m * 10) / 10 : null,
                high: daily.temperature_2m_max && typeof daily.temperature_2m_max[0] === 'number' && isFinite(daily.temperature_2m_max[0])
                    ? Math.round(daily.temperature_2m_max[0]) : null,
                low: daily.temperature_2m_min && typeof daily.temperature_2m_min[0] === 'number' && isFinite(daily.temperature_2m_min[0])
                    ? Math.round(daily.temperature_2m_min[0]) : null
            };
            finish(null, data);
        }).catch(function (err) {
            finish(err || new Error('fetch failed'));
        });
        return function () {
            settled = true;
            clearTimeout(timer);
            if (ctrl) try { ctrl.abort(); } catch (e) { /* */ }
        };
    }

    function resolveWeatherLocation(w, done, options) {
        options = options || {};
        var saved = w.options || {};
        var hasSaved = validWeatherCoordinates(saved.lat, saved.lon);
        if (options.useDefault || (hasSaved && !options.relocate)) {
            done(options.useDefault ? { lat: TAIPEI.lat, lon: TAIPEI.lon, city: TAIPEI.city, locationSource: 'default', locationNotice: '' } : {
                lat: saved.lat, lon: saved.lon, city: saved.city || '目前位置',
                locationSource: saved.locationSource || 'saved', locationNotice: saved.locationNotice || ''
            });
            return function () {};
        }
        var finished = false;
        var timer;
        function finish(location) {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            done(location);
        }
        function fallback(reason) {
            finish({ lat: hasSaved ? saved.lat : TAIPEI.lat, lon: hasSaved ? saved.lon : TAIPEI.lon,
                city: hasSaved ? saved.city || '先前位置' : TAIPEI.city,
                locationSource: hasSaved ? saved.locationSource || 'saved' : 'fallback',
                locationNotice: reason + (hasSaved ? '，保留原位置' : '，顯示台北') });
        }
        timer = setTimeout(function () { fallback('定位逾時'); }, WEATHER_FETCH_MS);
        if (!navigator.geolocation) fallback('瀏覽器不支援定位');
        else try {
            navigator.geolocation.getCurrentPosition(function (pos) {
                if (!pos || !pos.coords || !validWeatherCoordinates(pos.coords.latitude, pos.coords.longitude)) {
                    fallback('無法取得位置');
                    return;
                }
                finish({ lat: pos.coords.latitude, lon: pos.coords.longitude, city: '目前位置', locationSource: 'device', locationNotice: '' });
            }, function (err) {
                fallback(err && err.code === 1 ? '未允許定位' : err && err.code === 3 ? '定位逾時' : '無法取得位置');
            }, { timeout: WEATHER_FETCH_MS, maximumAge: 600000 });
        } catch (e) { fallback('無法取得位置'); }
        return function () { finished = true; clearTimeout(timer); };
    }

    function weatherActions(body, w, focusClass) {
        var locate = body.querySelector('.weather-locate');
        var retry = body.querySelector('.weather-retry');
        var fallback = body.querySelector('.weather-default');
        function bind(button, options) {
            if (!button) return;
            button.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                loadWeatherInto(body, w, options);
            });
        }
        bind(locate, { relocate: true, force: true });
        bind(retry, { force: true });
        bind(fallback, { useDefault: true, force: true });
        if (focusClass) {
            var next = body.querySelector('.' + focusClass);
            if (!next && focusClass === 'weather-default') next = retry;
            if (next) next.focus({ preventScroll: true });
        }
    }

    function weatherFocusClass(body) {
        var active = document.activeElement;
        if (!body.contains(active)) return '';
        return ['weather-retry', 'weather-locate', 'weather-default'].filter(function (name) {
            return active.classList.contains(name);
        })[0] || '';
    }

    function weatherHeading() {
        return '<div class="weather-heading"><span class="weather-city"></span>' +
            '<div class="weather-actions"><button type="button" class="weather-locate" title="重新定位" aria-label="重新定位">定位</button>' +
            '<button type="button" class="weather-retry" title="更新天氣" aria-label="更新天氣">更新</button></div></div>';
    }

    function paintWeatherReady(body, w, location, data, opts) {
        opts = opts || {};
        var focusClass = weatherFocusClass(body);
        var cls = 'widget-body weather-body widget-surface';
        if (opts.stale) cls += ' is-stale';
        if (opts.failed) cls += ' is-offline';
        body.className = cls;
        body.setAttribute('aria-busy', opts.loading ? 'true' : 'false');
        var temp = data.temp != null ? data.temp + '°' : '--°';
        var hi = data.high != null ? '↑' + data.high + '°' : '';
        var lo = data.low != null ? '↓' + data.low + '°' : '';
        var feels = data.feels != null ? '體感 ' + data.feels + '°' : '';
        var hum = data.humidity != null ? '濕度 ' + data.humidity + '%' : '';
        var wind = data.wind != null ? '風 ' + data.wind + 'm/s' : '';
        body.innerHTML = weatherHeading() +
            '<div class="weather-main">' +
            '<span class="weather-temp"></span>' +
            '<span class="weather-glyph"></span></div>' +
            '<div class="weather-status" role="status" aria-live="polite"></div>' +
            '<div class="weather-meta">' +
            '<span class="weather-hi"></span><span class="weather-lo"></span>' +
            '<span class="weather-feels"></span><span class="weather-hum"></span><span class="weather-wind"></span>' +
            '</div>';
        body.querySelector('.weather-city').textContent = location.city || '目前位置';
        body.querySelector('.weather-temp').textContent = temp;
        var glyph = body.querySelector('.weather-glyph');
        glyph.innerHTML = wmoGlyph(data.code);
        glyph.setAttribute('role', 'img');
        glyph.setAttribute('aria-label', wmoLabel(data.code));
        var status = opts.loading ? opts.message || '正在更新…' : opts.failed ? '更新失敗，顯示先前資料' :
            location.locationNotice || wmoLabel(data.code);
        body.querySelector('.weather-status').textContent = status;
        body.querySelector('.weather-status').title = status;
        body.querySelector('.weather-status').setAttribute('aria-label', wmoLabel(data.code) + '，' + status);
        body.querySelector('.weather-hi').textContent = hi;
        body.querySelector('.weather-lo').textContent = lo;
        body.querySelector('.weather-feels').textContent = feels;
        body.querySelector('.weather-hum').textContent = hum;
        body.querySelector('.weather-wind').textContent = wind;
        body.querySelector('.weather-retry').textContent = opts.failed ? '重試' : '更新';
        body.querySelector('.weather-retry').setAttribute('aria-label', opts.failed ? '重試天氣更新' : '更新天氣');
        weatherActions(body, w, focusClass);
    }

    function paintWeatherPending(body, w, location, message, failed) {
        var focusClass = weatherFocusClass(body);
        body.className = 'widget-body weather-body widget-surface ' + (failed ? 'is-error' : 'is-loading');
        body.setAttribute('aria-busy', failed ? 'false' : 'true');
        body.innerHTML = weatherHeading() + '<div class="weather-status" role="status" aria-live="polite"></div>' +
            (!failed ? '<div class="weather-skel sk-lg" aria-hidden="true"></div>' : '') +
            (!location ? '<button type="button" class="weather-default">先看台北天氣</button>' : '');
        body.querySelector('.weather-city').textContent = location ? location.city : '天氣';
        body.querySelector('.weather-status').textContent = message;
        body.querySelector('.weather-retry').textContent = failed ? '重試' : '更新';
        body.querySelector('.weather-retry').setAttribute('aria-label', failed ? '重試天氣更新' : '更新天氣');
        weatherActions(body, w, focusClass);
    }

    function loadWeatherInto(body, w, options) {
        options = options || {};
        w = findWidget(w.id) || w;
        if (body._weatherRun) body._weatherRun.cancel();
        var run = { cancelled: false, pending: true, cancelLocation: null, cancelFetch: null };
        run.cancel = function () {
            run.cancelled = true;
            if (run.cancelLocation) run.cancelLocation();
            if (run.cancelFetch) run.cancelFetch();
        };
        body._weatherRun = run;
        function active() { return !run.cancelled && body.isConnected && !!findWidget(w.id); }
        var shown = body._weatherShown || null;
        var saved = w.options || {};
        var locating = options.relocate || !validWeatherCoordinates(saved.lat, saved.lon);
        if (shown && body._weatherLocation) {
            paintWeatherReady(body, w, body._weatherLocation, shown, { stale: true, loading: true, message: locating ? '正在定位…' : '正在更新…' });
        } else paintWeatherPending(body, w, null, locating ? '正在定位…' : '正在取得天氣…', false);
        run.cancelLocation = resolveWeatherLocation(w, function (location) {
            if (!active()) return;
            var current = findWidget(w.id);
            current.options = Object.assign({}, current.options || {}, location);
            // Resolve onto current state: another widget operation can clone the
            // layout while location/network requests are still in flight.
            w = current;
            persist();
            var lat = location.lat;
            var lon = location.lon;
            var previous = body._weatherLocation;
            if (!previous || Math.abs(previous.lat - lat) > 0.001 || Math.abs(previous.lon - lon) > 0.001) shown = null;
            body._weatherLocation = location;
            var cached = readWeatherCache(lat, lon);
            if (cached && cached.data) {
                shown = cached.data;
                body._weatherShown = shown;
                if (!cached.stale && !options.force) {
                    run.pending = false;
                    paintWeatherReady(body, w, location, shown);
                    return;
                }
            }
            if (shown) paintWeatherReady(body, w, location, shown, { stale: true, loading: true });
            else {
                body._weatherShown = null;
                paintWeatherPending(body, w, location, '正在取得天氣…', false);
            }
            run.cancelFetch = fetchWeatherNetwork(lat, lon, function (err, data) {
                if (!active()) return;
                run.pending = false;
                if (err || !data) {
                    if (shown) paintWeatherReady(body, w, location, shown, { stale: true, failed: true });
                    else paintWeatherPending(body, w, location, navigator.onLine === false ? '目前離線，連線後可重試' :
                        err && err.message === 'timeout' ? '連線逾時，請重試' : '暫時無法取得天氣，請重試', true);
                    return;
                }
                writeWeatherCache(lat, lon, data);
                body._weatherShown = data;
                paintWeatherReady(body, w, location, data);
            });
        }, options);
    }

    var weatherRefreshBound = false;
    function bindWeatherRefresh() {
        if (weatherRefreshBound) return;
        weatherRefreshBound = true;
        function refresh(force) {
            if (document.hidden) return;
            $$('.weather-body').forEach(function (body) {
                if (body._weatherRun && body._weatherRun.pending) return;
                var el = body.closest('.widget');
                var w = el && findWidget(el.getAttribute('data-id'));
                if (!w) return;
                var opts = w.options || {};
                if (!validWeatherCoordinates(opts.lat, opts.lon)) return;
                var cached = readWeatherCache(opts.lat, opts.lon);
                if (force || !cached || cached.stale) loadWeatherInto(body, w, { force: true });
            });
        }
        global.addEventListener('online', function () { refresh(true); });
        document.addEventListener('visibilitychange', function () { refresh(false); });
        setInterval(function () { refresh(false); }, WEATHER_TTL_MS);
    }

    function buildWeatherBody(w) {
        var body = document.createElement('div');
        paintWeatherPending(body, w, null, '正在準備天氣…', false);
        bindWeatherRefresh();
        // Cached coordinates resolve synchronously, after this body is mounted.
        requestAnimationFrame(function () {
            if (body.isConnected) loadWeatherInto(body, w);
        });
        return body;
    }

    function buildNotesBody(w) {
        var body = document.createElement('div');
        body.className = 'widget-body notes-body widget-surface';
        var ta = document.createElement('textarea');
        ta.placeholder = '寫點什麼…';
        ta.setAttribute('aria-label', '備註內容');
        ta.maxLength = NOTES_MAX;
        ta.value = (w.options && w.options.content) || '';
        var saveTimer = null;
        ta.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
        ta.addEventListener('input', function () {
            var widget = findWidget(w.id);
            if (!widget) return;
            if (!widget.options) widget.options = {};
            widget.options.content = ta.value.slice(0, NOTES_MAX);
            widget.options.updatedAt = Date.now();
            clearTimeout(saveTimer);
            saveTimer = setTimeout(function () {
                saveTimer = null;
                persist();
            }, 500);
        });
        ta.addEventListener('blur', function () {
            if (!saveTimer) return;
            clearTimeout(saveTimer);
            saveTimer = null;
            persist();
        });
        body.appendChild(ta);
        return body;
    }

    function daysUntil(iso) {
        var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
        if (!match) return null;
        var year = Number(match[1]);
        var month = Number(match[2]) - 1;
        var day = Number(match[3]);
        var target = new Date(0);
        target.setUTCFullYear(year, month, day);
        target.setUTCHours(0, 0, 0, 0);
        if (target.getUTCFullYear() !== year || target.getUTCMonth() !== month || target.getUTCDate() !== day) return null;
        var now = new Date();
        var start = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
        return Math.round((target.getTime() - start) / 86400000);
    }

    function paintCountdown(body, targetDate) {
        var days = daysUntil(targetDate);
        body.querySelector('.countdown-days').textContent = days == null ? '—' : String(Math.abs(days));
        body.querySelector('.countdown-unit').textContent = days == null ? '設定日期' : (days < 0 ? '天前' : (days === 0 ? '今天' : '天'));
    }

    function refreshCountdowns() {
        if (!state.layout) return;
        state.layout.widgets.forEach(function (w) {
            if (w.type !== 'countdown') return;
            var el = document.querySelector('.widget[data-id="' + w.id + '"]');
            var body = el && el.querySelector('.countdown-body');
            if (body) paintCountdown(body, w.options && w.options.targetDate);
        });
    }

    function buildCountdownBody(w) {
        var body = document.createElement('div');
        body.className = 'widget-body countdown-body widget-surface';
        var opts = w.options || {};
        body.innerHTML =
            '<div class="countdown-days"></div>' +
            '<div class="countdown-unit"></div>' +
            '<input type="text" class="countdown-title-input" maxlength="24" placeholder="重要日子" />' +
            '<input type="date" class="countdown-date-input">';
        paintCountdown(body, opts.targetDate);
        var titleInput = body.querySelector('.countdown-title-input');
        titleInput.setAttribute('aria-label', '倒數標題');
        titleInput.value = opts.title || '';
        titleInput.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
        titleInput.addEventListener('input', function () {
            var widget = findWidget(w.id);
            if (!widget) return;
            if (!widget.options) widget.options = {};
            widget.options.title = String(titleInput.value || '').slice(0, 24);
            persist();
        });
        titleInput.addEventListener('keydown', function (e) {
            if (e.isComposing || e.keyCode === 229) return;
            if (e.key === 'Enter') {
                e.preventDefault();
                titleInput.blur();
            }
        });
        var input = body.querySelector('.countdown-date-input');
        input.setAttribute('aria-label', '倒數日期');
        if (opts.targetDate) input.value = String(opts.targetDate).slice(0, 10);
        input.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
        input.addEventListener('change', function () {
            var widget = findWidget(w.id);
            if (!widget) return;
            if (!widget.options) widget.options = {};
            widget.options.targetDate = input.value;
            if (!widget.options.title) widget.options.title = titleInput.value || '倒數';
            persist();
            paintCountdown(body, widget.options.targetDate);
        });
        return body;
    }

    function buildTodoBody(w) {
        var body = document.createElement('div');
        body.className = 'widget-body todo-body widget-surface';
        var items = (w.options && Array.isArray(w.options.items)) ? w.options.items : [];
        var ul = document.createElement('ul');
        ul.className = 'todo-list';
        items.slice(0, TODO_MAX).forEach(function (item, idx) {
            if (!item || typeof item !== 'object') return;
            var li = document.createElement('li');
            li.className = 'todo-item' + (item.done ? ' is-done' : '');
            var check = document.createElement('button');
            check.type = 'button';
            check.className = 'todo-check';
            check.textContent = item.done ? '✓' : '';
            check.setAttribute('aria-label', '切換完成狀態');
            check.setAttribute('aria-pressed', item.done ? 'true' : 'false');
            check.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
            check.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                var widget = findWidget(w.id);
                if (!widget || !widget.options || !widget.options.items[idx]) return;
                widget.options.items[idx].done = !widget.options.items[idx].done;
                var done = widget.options.items[idx].done;
                check.textContent = done ? '✓' : '';
                check.setAttribute('aria-pressed', done ? 'true' : 'false');
                li.classList.toggle('is-done', done);
                persist();
            });
            var text = document.createElement('input');
            text.className = 'todo-text';
            text.maxLength = 200;
            text.placeholder = '輸入待辦事項';
            text.setAttribute('aria-label', '待辦事項 ' + (idx + 1));
            text.value = item.text || '';
            text.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
            text.addEventListener('input', function () {
                var widget = findWidget(w.id);
                if (!widget || !widget.options || !widget.options.items[idx]) return;
                widget.options.items[idx].text = String(text.value || '').slice(0, 200);
                persist();
            });
            li.appendChild(check);
            li.appendChild(text);
            var remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'todo-remove';
            remove.textContent = '×';
            remove.setAttribute('aria-label', '刪除待辦事項 ' + (idx + 1));
            remove.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
            remove.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                var widget = findWidget(w.id);
                if (!widget || !widget.options || !widget.options.items[idx]) return;
                widget.options.items.splice(idx, 1);
                persist();
                var next = buildTodoBody(widget);
                if (body.parentNode) body.parentNode.replaceChild(next, body);
                var fields = next.querySelectorAll('.todo-text');
                var focus = fields[Math.min(idx, fields.length - 1)] || next.querySelector('.todo-add');
                if (focus) focus.focus();
            });
            li.appendChild(remove);
            ul.appendChild(li);
        });
        var add = document.createElement('button');
        add.type = 'button';
        add.className = 'todo-add';
        var empty = !ul.children.length;
        if (empty) {
            body.classList.add('is-empty');
            body.appendChild(buildWidgetEmptyCopy('今天想完成什麼？', '先記下一件小事。'));
        }
        add.textContent = empty ? '新增待辦' : '+ 新增';
        add.disabled = items.length >= TODO_MAX;
        if (add.disabled) add.textContent = '已達 20 項上限';
        add.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
        add.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            var widget = findWidget(w.id);
            if (!widget) return;
            if (!widget.options) widget.options = {};
            if (!Array.isArray(widget.options.items)) widget.options.items = [];
            if (widget.options.items.length >= TODO_MAX) return;
            widget.options.items.push({ text: '', done: false });
            persist();
            var el = document.querySelector('.widget[data-id="' + w.id + '"]');
            if (el) {
                var old = el.querySelector('.widget-body');
                if (old) {
                    var next = buildTodoBody(widget);
                    el.replaceChild(next, old);
                    var fields = next.querySelectorAll('.todo-text');
                    if (fields.length) fields[fields.length - 1].focus();
                }
            }
        });
        body.appendChild(ul);
        body.appendChild(add);
        return body;
    }

    function truncateUrlLabel(url) {
        var s = String(url || '');
        if (s.length <= 22) return s;
        return s.slice(0, 18) + '…';
    }

    function buildWidgetEmptyCopy(title, hint) {
        var copy = document.createElement('div');
        copy.className = 'widget-empty-copy';
        var heading = document.createElement('p');
        heading.className = 'widget-empty-title';
        heading.textContent = title;
        var description = document.createElement('p');
        description.className = 'widget-empty-hint';
        description.textContent = hint;
        copy.appendChild(heading);
        copy.appendChild(description);
        return copy;
    }

    function rebuildBookmarks(widgetId) {
        var widget = findWidget(widgetId);
        var el = document.querySelector('.widget[data-id="' + widgetId + '"]');
        if (!widget || !el) return;
        var old = el.querySelector('.widget-body');
        if (old) el.replaceChild(buildBookmarksBody(widget), old);
    }

    function buildBookmarksBody(w) {
        var body = document.createElement('div');
        body.className = 'widget-body bookmarks-body widget-surface';
        body.style.position = 'relative';
        var links = (w.options && Array.isArray(w.options.links)) ? w.options.links : [];
        links.slice(0, BOOKMARKS_MAX).forEach(function (link, idx) {
            if (!link || typeof link !== 'object') return;
            var a = document.createElement('a');
            a.className = 'bookmark-tile';
            a.href = link.url || '#';
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.draggable = false;
            a.setAttribute('data-idx', String(idx));
            var iconWrap = document.createElement('span');
            iconWrap.className = 'bookmark-icon';
            if (link.icon) {
                var img = document.createElement('img');
                img.src = link.icon;
                img.alt = '';
                iconWrap.appendChild(img);
            }
            var labelEl = document.createElement('span');
            labelEl.className = 'bookmark-label';
            var display = link.label || truncateUrlLabel(link.url) || '連結';
            labelEl.textContent = display;
            labelEl.title = link.label || link.url || '';
            a.appendChild(iconWrap);
            a.appendChild(labelEl);
            // Labels remain ordinary links. Editing lives in the visible
            // management dialog; a double-click editor on an anchor first
            // opened two tabs before it could cancel the navigation.
            a.addEventListener('keydown', function (e) {
                if (e.isComposing || e.keyCode === 229) return;
                if (e.key === 'F2') {
                    e.preventDefault();
                    e.stopPropagation();
                    openBookmarkModal(w.id, idx);
                }
            });
            a.addEventListener('contextmenu', function (e) {
                e.preventDefault();
                e.stopPropagation();
                openBookmarkModal(w.id, idx);
            });
            body.appendChild(a);
        });

        var add = document.createElement('button');
        add.type = 'button';
        add.className = 'bookmark-add-tile';
        add.setAttribute('aria-label', links.length ? '管理書籤' : '新增書籤');
        var empty = !body.querySelector('.bookmark-tile');
        if (empty) {
            body.classList.add('is-empty');
            body.appendChild(buildWidgetEmptyCopy('收藏常用網站', '把喜歡的連結留在手邊。'));
        }
        add.textContent = empty ? '新增書籤' : '管理書籤';
        add.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
        add.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            openBookmarkModal(w.id);
        });

        body.appendChild(add);
        return body;
    }

    function openBookmarkModal(widgetId, editIndex) {
        var modal = document.querySelector('.bookmark-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.className = 'bookmark-modal';
            modal.innerHTML =
                '<button type="button" class="bookmark-modal-backdrop" data-close="1" aria-label="關閉" tabindex="-1"></button>' +
                '<div class="bookmark-modal-panel" role="dialog" aria-modal="true" aria-labelledby="bookmark-modal-title">' +
                '<h3 id="bookmark-modal-title">新增書籤</h3>' +
                '<div class="bookmark-selector" hidden><label for="bookmark-select">選擇書籤</label>' +
                '<select id="bookmark-select" class="bookmark-select"></select></div>' +
                '<label for="bookmark-url-input">網址</label>' +
                '<input class="bookmark-url-input" id="bookmark-url-input" type="url" placeholder="https://…" aria-describedby="bookmark-error" />' +
                '<p id="bookmark-error" class="bookmark-error" role="status" hidden></p>' +
                '<label for="bookmark-name-input">名稱（可選）</label>' +
                '<input class="bookmark-name-input" id="bookmark-name-input" type="text" placeholder="名稱" maxlength="40" />' +
                '<div class="bookmark-modal-actions">' +
                '<button type="button" class="btn-danger" data-delete hidden>刪除此書籤</button>' +
                '<button type="button" class="btn-ghost" data-cancel>取消</button>' +
                '<button type="button" class="btn-primary" data-confirm>新增</button></div></div>';
            document.body.appendChild(modal);
            function closeModal() {
                modal.classList.remove('is-visible');
                modal.inert = true;
                modal._closeTimer = setTimeout(function () { modal.classList.remove('is-open'); }, 180);
                var target = modal._returnFocus;
                if (!target || !target.isConnected) {
                    var owner = document.querySelector('.widget[data-id="' + modal.getAttribute('data-widget-id') + '"]');
                    target = owner && owner.querySelector('.bookmark-add, .bookmark-add-tile');
                }
                if (target && target.isConnected) target.focus({ preventScroll: true });
            }
            modal._close = closeModal;
            modal._selectEntry = function (index) {
                var widget = findWidget(modal.getAttribute('data-widget-id'));
                var links = widget && widget.options && widget.options.links || [];
                var entry = index >= 0 && index < links.length ? links[index] : null;
                modal._editIndex = entry ? index : -1;
                modal.querySelector('.bookmark-select').value = String(modal._editIndex);
                modal.querySelector('#bookmark-modal-title').textContent = entry ? '編輯書籤' : '新增書籤';
                modal.querySelector('.bookmark-url-input').value = entry ? entry.url || '' : 'https://';
                modal.querySelector('.bookmark-name-input').value = entry ? entry.label || '' : '';
                modal.querySelector('.bookmark-url-input').removeAttribute('aria-invalid');
                var full = !entry && links.length >= BOOKMARKS_MAX;
                var error = modal.querySelector('#bookmark-error');
                error.textContent = full ? '已達 ' + BOOKMARKS_MAX + ' 個書籤，請先選擇並移除一個。' : '';
                error.hidden = !full;
                modal.querySelector('[data-confirm]').textContent = entry ? '儲存' : '新增';
                modal.querySelector('[data-confirm]').disabled = full;
                modal.querySelector('[data-delete]').hidden = !entry;
            };
            modal.querySelector('.bookmark-select').addEventListener('change', function (e) {
                modal._selectEntry(parseInt(e.target.value, 10));
            });
            modal.querySelector('[data-delete]').addEventListener('click', function () {
                var id = modal.getAttribute('data-widget-id');
                var widget = findWidget(id);
                if (!widget || !widget.options || !Array.isArray(widget.options.links) || modal._editIndex < 0) return;
                widget.options.links.splice(modal._editIndex, 1);
                persist();
                rebuildBookmarks(id);
                closeModal();
            });
            modal.addEventListener('keydown', function (e) {
                if (e.isComposing || e.keyCode === 229) return;
                if (e.key === 'Escape') {
                    e.preventDefault(); e.stopPropagation(); closeModal();
                } else if (e.key === 'Tab') {
                    var controls = Array.from(modal.querySelectorAll('.bookmark-modal-panel input, .bookmark-modal-panel select, .bookmark-modal-panel button:not(:disabled)')).filter(function (el) { return el.offsetWidth && el.offsetHeight; });
                    var first = controls[0], last = controls[controls.length - 1];
                    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
                } else if (e.key === 'Enter' && e.target.matches('input')) {
                    e.preventDefault(); modal.querySelector('[data-confirm]').click();
                }
            });
            modal.addEventListener('click', function (e) {
                if (e.target.getAttribute('data-close') || e.target.getAttribute('data-cancel') != null ||
                    (e.target.closest && e.target.closest('[data-cancel]'))) {
                    e.preventDefault();
                    closeModal();
                }
            });
            modal.querySelector('[data-confirm]').addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                var id = modal.getAttribute('data-widget-id');
                var urlRaw = modal.querySelector('.bookmark-url-input').value;
                var nameRaw = modal.querySelector('.bookmark-name-input').value;
                var norm = global.NewtabApps && NewtabApps.normalizeUrl
                    ? NewtabApps.normalizeUrl(urlRaw) : urlRaw;
                if (!norm) {
                    var error = modal.querySelector('#bookmark-error');
                    error.textContent = '請輸入有效的網站網址，例如 https://example.com。';
                    error.hidden = false;
                    var urlField = modal.querySelector('.bookmark-url-input');
                    urlField.setAttribute('aria-invalid', 'true');
                    urlField.focus();
                    return;
                }
                var label = String(nameRaw || '').trim();
                if (!label) {
                    try { label = new URL(norm).hostname.replace(/^www\./, ''); } catch (ex) {
                        label = truncateUrlLabel(norm);
                    }
                }
                var widget = findWidget(id);
                if (!widget) return;
                if (!widget.options) widget.options = {};
                if (!Array.isArray(widget.options.links)) widget.options.links = [];
                var editing = modal._editIndex >= 0 && modal._editIndex < widget.options.links.length;
                if (!editing && widget.options.links.length >= BOOKMARKS_MAX) return;
                var previous = editing ? widget.options.links[modal._editIndex] : null;
                var entry = { label: label, url: norm, icon: previous && previous.url === norm ? previous.icon || '' : '' };
                if (editing) widget.options.links[modal._editIndex] = entry;
                else widget.options.links.push(entry);
                persist();
                if (global.NewtabApps && NewtabApps.resolveFavicon) {
                    NewtabApps.resolveFavicon(norm, function (src) {
                        var ww = findWidget(id);
                        if (!ww || !ww.options || !ww.options.links) return;
                        var savedEntry = ww.options.links.filter(function (link) { return link === entry; })[0];
                        if (savedEntry && src) {
                            savedEntry.icon = src;
                            persist();
                            // A late favicon response must not replace the
                            // focused link or management button.
                            var index = ww.options.links.indexOf(savedEntry);
                            var owner = document.querySelector('.widget[data-id="' + id + '"]');
                            var icon = owner && owner.querySelector('.bookmark-tile[data-idx="' + index + '"] .bookmark-icon');
                            if (icon) {
                                var img = document.createElement('img');
                                img.src = src;
                                img.alt = '';
                                icon.textContent = '';
                                icon.appendChild(img);
                            }
                        }
                    });
                }
                rebuildBookmarks(id);
                closeModal();
            });
        }
        clearTimeout(modal._closeTimer);
        modal._returnFocus = document.activeElement;
        modal.inert = false;
        modal.setAttribute('data-widget-id', widgetId);
        var widget = findWidget(widgetId);
        var links = widget && widget.options && Array.isArray(widget.options.links) ? widget.options.links : [];
        var select = modal.querySelector('.bookmark-select');
        select.innerHTML = '';
        [{ label: '＋ 新增書籤', value: -1 }].concat(links.map(function (link, index) {
            return { label: link && (link.label || link.url) || '書籤 ' + (index + 1), value: index };
        })).forEach(function (item) {
            var option = document.createElement('option');
            option.value = String(item.value);
            option.textContent = item.label;
            select.appendChild(option);
        });
        modal.querySelector('.bookmark-selector').hidden = !links.length;
        modal._selectEntry(typeof editIndex === 'number' ? editIndex : -1);
        modal.classList.add('is-open');
        // Focus belongs to the open dialog immediately, including an Escape
        // pressed before the first animation frame.
        try { modal.querySelector('.bookmark-url-input').focus(); } catch (ex) { /* */ }
        requestAnimationFrame(function () {
            if (!modal.inert && modal.classList.contains('is-open')) modal.classList.add('is-visible');
        });
    }

    function ensureLockBadge(el) {
        if (el.querySelector('.widget-lock-badge')) return;
        var badge = document.createElement('span');
        badge.className = 'widget-lock-badge';
        badge.setAttribute('aria-hidden', 'true');
        badge.innerHTML = '<i class="fas fa-lock"></i>';
        el.appendChild(badge);
    }

    function clearHandles(el) {
        if (!el) {
            $$('.widget-handles').forEach(function (h) { h.remove(); });
            return;
        }
        var wrap = el.querySelector('.widget-handles');
        if (wrap) wrap.remove();
    }

    function syncHandles(el, w) {
        if (!el) return;
        clearHandles(el);
        if (!state.arranging || !w || w.pinned || !state.editor || state.editor.selected !== w.id) return;

        var wrap = document.createElement('div');
        wrap.className = 'widget-handles';
        wrap.setAttribute('aria-hidden', 'true');
        var ring = document.createElement('span');
        ring.className = 'widget-select-ring';
        wrap.appendChild(ring);
        var dirs = handlesForType(w.type);
        dirs.forEach(function (dir) {
            var h = document.createElement('span');
            h.className = 'widget-handle';
            h.setAttribute('data-handle', dir);
            wrap.appendChild(h);
        });
        el.appendChild(wrap);
    }

    function contentScale(type, px) {
        var ref = SCALE_REF[type] || { w: 100, h: 100 };
        var sx = px.width / ref.w;
        var sy = px.height / ref.h;
        var s = Math.min(sx, sy);
        if (s < 0.45) s = 0.45;
        if (s > 1.35) s = 1.35;
        return s;
    }

    function syncShells() {
        var present = {};
        state.layout.widgets.forEach(function (w) {
            present[w.id] = w;
            ensureShell(w);
        });
        $$('.widget[data-id]').forEach(function (el) {
            var id = el.getAttribute('data-id');
            if (!present[id]) {
                if (el.getAttribute('data-type') !== 'clock' && el.getAttribute('data-type') !== 'search') {
                    if (typeof el._companionCleanup === 'function') el._companionCleanup();
                    el.remove();
                    return;
                }
                el.hidden = true;
                el.style.display = 'none';
                el.setAttribute('data-active', 'false');
                clearHandles(el);
            } else {
                el.hidden = false;
                el.style.display = '';
                el.setAttribute('data-active', 'true');
                ensureLockBadge(el);
                var w = present[id];
                if (w.type === 'companion') mountCompanion(el, w);
                if (w.type === 'folder') refreshFolderBody(el, w);
                if (w.type === 'app') {
                    var body = el.querySelector('.widget-body');
                    if (body && !body.querySelector('[data-app-id="' + (w.options && w.options.appId) + '"]')) {
                        el.replaceChild(buildAppBody(w.options.appId), body);
                    }
                }
            }
        });
    }

    function compactWidgetRects(layout) {
        var vp = L.viewport();
        var width = Math.max(160, vp.vw - 40);
        var narrowShortcuts = vp.vw <= 350;
        var gap = narrowShortcuts ? 8 : 16;
        var rects = Object.create(null);
        var cursor = 100;
        ['clock', 'search'].forEach(function (type) {
            var w = layout.widgets.filter(function (item) { return item.type === type; })[0];
            if (!w) return;
            var rect = L.toPixels(w, vp);
            rect.left = (vp.vw - rect.width) / 2;
            rect.top = Math.max(cursor, rect.top);
            rects[w.id] = rect;
            cursor = rect.top + rect.height + 24;
        });

        var shortcuts = layout.widgets.filter(function (w) { return w.type === 'app' || w.type === 'folder'; });
        shortcuts.sort(function (a, b) { return (a.y - b.y) || (a.x - b.x) || ((a.z || 0) - (b.z || 0)); });
        var sizes = shortcuts.map(function (w) {
            var rect = L.toPixels(w, vp);
            // A standard app keeps its 48px icon; only its display slot narrows
            // enough for four shortcuts on a 320px phone. Folders and large
            // app presets retain their dimensions and may use fewer columns.
            if (narrowShortcuts && w.type === 'app' && rect.width <= 68) {
                rect.width = Math.min(64, rect.width);
            }
            return rect;
        });
        var cellWidth = sizes.reduce(function (max, rect) { return Math.max(max, rect.width); }, 0);
        var columns = Math.max(1, Math.min(4, Math.floor((width + gap) / (cellWidth + gap))));
        for (var i = 0; i < shortcuts.length; i += columns) {
            var count = Math.min(columns, shortcuts.length - i);
            var rowWidth = count * cellWidth + (count - 1) * gap;
            var start = (vp.vw - rowWidth) / 2;
            var rowHeight = 0;
            for (var col = 0; col < count; col++) {
                var rect = sizes[i + col];
                rect.left = start + col * (cellWidth + gap) + (cellWidth - rect.width) / 2;
                rect.top = cursor;
                rects[shortcuts[i + col].id] = rect;
                rowHeight = Math.max(rowHeight, rect.height);
            }
            cursor += rowHeight + 24;
        }

        // Desktop fractions become too narrow on phones. Readable minimums
        // affect only this projection; saved dimensions and larger custom
        // heights remain intact. The canvas scrolls to reach the whole stack.
        var minimumHeights = { notes: 144, todo: 176, weather: 160, countdown: 176, bookmarks: 88 };
        layout.widgets.filter(function (w) {
            return ['clock', 'search', 'app', 'folder'].indexOf(w.type) < 0;
        }).sort(function (a, b) { return (a.y - b.y) || (a.x - b.x); }).forEach(function (w) {
            var rect = L.toPixels(w, vp);
            rect.width = Math.min(width, Math.max(280, rect.width));
            rect.height = Math.max(minimumHeights[w.type] || 144, rect.height);
            rect.left = (vp.vw - rect.width) / 2;
            rect.top = cursor;
            rects[w.id] = rect;
            cursor += rect.height + 24;
        });
        return { rects: rects, height: Math.max(vp.vh, cursor + 88) };
    }

    function legacyProfileViewport(narrow) {
        var fallback = state.initialViewport || L.viewport();
        var source = { vw: fallback.vw, vh: fallback.vh };
        state.layout.widgets.some(function (w) {
            var p = w.options && w.options[narrow ? 'homeMobile' : 'homeDesktop'];
            if (w.type !== 'app' || !p || (p.v === 2 || p.v === 3) || !p.w || !p.h) return false;
            var preset = L.APP_SIZE_PX[w.options.size || 'm'] || L.APP_SIZE_PX.m;
            source.vw = Math.round(preset.w / p.w);
            if (narrow && source.vw <= 372 && preset.w === 68) source.vw = Math.round(64 / p.w);
            source.vh = narrow ? fallback.vh : Math.round(preset.h / p.h);
            return true;
        });
        return source;
    }

    function homeProfileRect(w, vp) {
        var narrow = vp.vw <= 600;
        var p = w.options && w.options[narrow ? 'homeMobile' : 'homeDesktop'];
        if (!p) return null;
        var grid = L.homeGrid(vp.vw, vp.vh);
        if (p.v === 2 || p.v === 3) return L.homePlacementRect(p, w.type, grid);
        if (!['x', 'y', 'w', 'h'].every(function (k) { return typeof p[k] === 'number' && isFinite(p[k]); }) || p.w <= 0 || p.h <= 0) return null;
        // Round-four profiles lacked their source viewport. Fixed launcher
        // dimensions recover it without rewriting the stored user's layout.
        var source = legacyProfileViewport(narrow);
        var original = { left: p.x * source.vw, top: narrow ? p.y : p.y * source.vh,
            width: p.w * source.vw, height: narrow ? p.h : p.h * source.vh };
        if (w.options.homeSeed !== undefined && !narrow) {
            var canonical = L.toPixels(w, source);
            if (['left', 'top', 'width', 'height'].every(function (key) { return Math.abs(original[key] - canonical[key]) < 1; })) return null;
        }
        return L.homePlacementRect(L.homePlacement(original, w.type, L.homeGrid(source.vw, source.vh)), w.type, grid);
    }

    function saveHomeRect(w, rect, grid) {
        if (!w.options) w.options = {};
        w.options[grid.narrow ? 'homeMobile' : 'homeDesktop'] = L.homePlacement(rect, w.type, grid);
    }

    function editorView(rects, grid) {
        var models = {}, dirty = {};
        state.layout.widgets.forEach(function (w) { if (rects[w.id]) models[w.id] = L.homePlacement(rects[w.id], w.type, grid); });
        return { models: models, dirty: dirty, initial: L.clone(rects), grid: grid, scrollTop: 0 };
    }

    function snapEditorRect(w, rect, resize) {
        var editor = state.editor;
        if (resize) return L.homeSnap(rect, w.type, editor.grid, true);
        var aligned = L.homeAlignedRect(rect, w.type, otherPixelRects(w.id), editor.grid, editor.rects[w.id] ? [editor.rects[w.id]] : []);
        var snapped = aligned.rect;
        editor.previewGuides = aligned.guides;
        // Existing freeform positions remain explicit return targets. This is
        // compatibility for legacy layouts, not a second grid for new defaults.
        var candidates = [editor.views[editor.family].initial[w.id], state.baselineRects && state.baselineRects[w.id]];
        candidates.forEach(function (anchor) {
            if (anchor && Math.abs(rect.width - anchor.width) < 1 && Math.abs(rect.height - anchor.height) < 1 &&
                Math.abs(rect.left - anchor.left) < 22 && Math.abs(rect.top - anchor.top) < 22 && L.homeFits(anchor, otherPixelRects(w.id)) &&
                Math.hypot(rect.left - anchor.left, rect.top - anchor.top) < Math.hypot(rect.left - snapped.left, rect.top - snapped.top)) {
                snapped = Object.assign({}, anchor); editor.previewGuides = [];
            }
        });
        return snapped;
    }

    function editorMessage(message) {
        var status = $('#editor-status');
        if (status && status.textContent !== message) status.textContent = message;
    }

    function revealEditorSelection() {
        if (!state.editor || state.drag || state.resize) return;
        var el = document.querySelector('.widget[data-id="' + state.editor.selected + '"]');
        var canvas = $('#widget-canvas');
        if (!el || !canvas) return;
        var r = el.getBoundingClientRect(), toolbar = $('#home-editor-toolbar');
        var bottom = toolbar && !toolbar.hidden ? toolbar.getBoundingClientRect().top - 24 : global.innerHeight - 24;
        if (r.bottom > bottom) canvas.scrollTop += r.bottom - bottom;
        else if (r.top < 32) canvas.scrollTop -= 32 - r.top;
    }

    function selectEditorWidget(id) {
        if (!state.editor) return;
        state.editor.selected = id;
        $$('.widget[data-active="true"]').forEach(function (el) {
            var w = findWidget(el.getAttribute('data-id'));
            el.classList.toggle('is-editor-selected', !!id && w && w.id === id);
            syncHandles(el, w);
        });
        var w = id && findWidget(id);
        var meta = w && global.NewtabCatalog && NewtabCatalog.get(w.type);
        editorMessage(w ? '已選擇' + (meta ? meta.label : w.type === 'folder' ? '資料夾' : '應用') + '；長按後拖移，方向鍵也能移動' : '長按項目後拖移；圖示重疊停留可建立資料夾');
        $$('#home-editor-toolbar [data-editor-resize]').forEach(function (button) {
            button.disabled = !w || w.pinned || !handlesForType(w.type).length;
        });
        var settings = $('#editor-widget-settings');
        if (settings) settings.disabled = !w;
    }

    function moveById(id, dx, dy) {
        var w = findWidget(id);
        if (!w || w.pinned) return { ok: false, error: 'locked' };
        if (!state.editor) enterArrange();
        selectEditorWidget(id);
        var rect = Object.assign({}, state.editor.rects[id]);
        rect.left += Math.sign(Number(dx) || 0) * state.editor.grid.pitchX;
        rect.top += Math.sign(Number(dy) || 0) * state.editor.grid.pitchY;
        var snapped = snapEditorRect(w, rect, false);
        if (!L.homeFits(snapped, otherPixelRects(id))) {
            editorMessage('這個方向已有項目');
            return { ok: false, error: 'occupied' };
        }
        commitEditorRect(id, snapped); applyPositions();
        editorMessage('已移動；完成後儲存');
        revealEditorSelection();
        return { ok: true };
    }

    function showAlignmentGuides(rect, visible) {
        var canvas = $('#widget-canvas');
        $$('.home-align-guide').forEach(function (line) { line.hidden = true; });
        if (!rect || !visible || !state.editor) return;
        (state.editor.previewGuides || []).forEach(function (guide) {
            var line = canvas.querySelector('.home-align-guide[data-axis="' + guide.axis + '"]');
            if (!line) { line = document.createElement('span'); line.className = 'home-align-guide'; line.dataset.axis = guide.axis; line.setAttribute('aria-hidden', 'true'); canvas.appendChild(line); }
            line.hidden = false;
            if (guide.axis === 'x') {
                var top = Math.min(guide.from, rect.top) - 10, bottom = Math.max(guide.to, rect.top + rect.height) + 10;
                line.style.left = guide.value + 'px'; line.style.top = top + 'px'; line.style.width = '1px'; line.style.height = (bottom - top) + 'px';
            } else {
                var left = Math.min(guide.from, rect.left) - 10, right = Math.max(guide.to, rect.left + rect.width) + 10;
                line.style.left = left + 'px'; line.style.top = guide.value + 'px'; line.style.width = (right - left) + 'px'; line.style.height = '1px';
            }
        });
    }

    function showEditorPreview(rect, kind, message) {
        var preview = $('#home-drop-preview');
        if (!preview) {
            preview = document.createElement('div'); preview.id = 'home-drop-preview';
            preview.setAttribute('aria-hidden', 'true');
            $('#widget-canvas').appendChild(preview);
        }
        preview.hidden = !rect;
        showAlignmentGuides(rect, kind === 'place' && !state.resize);
        if (!rect) return;
        preview.setAttribute('data-state', kind || 'place');
        preview.style.left = rect.left + 'px'; preview.style.top = rect.top + 'px';
        preview.style.width = rect.width + 'px'; preview.style.height = rect.height + 'px';
        // The live toolbar owns the instruction; small launcher footprints
        // must remain clean enough to show their exact landing position.
        preview.textContent = '';
        editorMessage(message || '放開即可放置');
    }

    function visibleProjection(layout) {
        var projectionSource = layout;
        if ((global.innerWidth || 1200) <= 600) {
            projectionSource = L.clone(layout);
            var compactClock, compactSearch;
            projectionSource.widgets.forEach(function (w) {
                if (w.type === 'clock') {
                    compactClock = w;
                    w.x = 0.15;
                    w.w = 0.7;
                } else if (w.type === 'search') {
                    compactSearch = w;
                    w.x = 0.075;
                    w.w = 0.85;
                }
            });
            if (compactClock && compactSearch) {
                var clockRect = L.toPixels(compactClock);
                var searchRect = L.toPixels(compactSearch);
                var clockBottom = clockRect.top + clockRect.height;
                if (searchRect.top < clockBottom + 24 && searchRect.top + searchRect.height > clockRect.top - 24) {
                    compactSearch.y = (clockBottom + 24) / (global.innerHeight || 800);
                }
            }
        }
        var compact = (global.innerWidth || 1200) <= 600 ? compactWidgetRects(projectionSource) : null;
        var projected = !compact && L.reflowLayout ? L.reflowLayout(projectionSource) : projectionSource;
        var projectedById = Object.create(null);
        projected.widgets.forEach(function (w) { projectedById[w.id] = w; });
        var rects = {}, baseline = {}, grid = L.homeGrid();
        layout.widgets.forEach(function (w) {
            var original = L.homeDefaultRect(w, grid) || compact && compact.rects[w.id] || L.toPixels(projectedById[w.id] || w);
            baseline[w.id] = original;
            rects[w.id] = homeProfileRect(w, L.viewport()) || original;
        });
        state.baselineRects = baseline;
        return resolveResponsiveRects(layout, rects, grid);
    }

    function resolveResponsiveRects(layout, rects, grid) {
        var placed = [], output = {}, managed = function (w) {
            return w.options && (w.options.homeSeed !== undefined || w.options[grid.narrow ? 'homeMobile' : 'homeDesktop']);
        };
        var ordered = layout.widgets.slice().sort(function (a, b) { return Number(!!managed(a)) - Number(!!managed(b)); });
        ordered.forEach(function (w) {
            var rect = rects[w.id];
            if (!rect) return;
            if (managed(w) && !L.homeFits(rect, placed)) rect = L.homeNearestFree(rect, w.type, placed, grid) || rect;
            output[w.id] = rect; placed.push(Object.assign({ id: w.id }, rect));
        });
        return output;
    }

    function applyPositions() {
        if (!state.layout) return;
        syncShells();
        // Responsive layout is a projection, never the persisted source. A
        // narrow window (or a phone keyboard) must not rewrite the desktop layout.
        var normalRects = visibleProjection(state.layout);
        var canvas = document.getElementById('widget-canvas');
        var contentHeight = state.editor ? (global.innerHeight || 800) : 0;
        if (canvas && state.editor) {
            canvas.style.setProperty('--editor-pitch-x', state.editor.grid.pitchX + 'px');
            canvas.style.setProperty('--editor-grid-left', state.editor.grid.left + 'px');
            canvas.style.setProperty('--editor-grid-top', state.editor.grid.top + 'px');
        }
        state.renderedRects = Object.create(null);
        state.layout.widgets.forEach(function (w) {
            var el = document.querySelector('.widget[data-id="' + w.id + '"]');
            if (!el) return;
            var px = state.editor && state.editor.rects[w.id] || normalRects[w.id];
            contentHeight = Math.max(contentHeight, px.top + px.height + (state.editor ? 180 : global.innerWidth <= 600 ? 96 : 16));
            state.renderedRects[w.id] = px;
            el.style.left = px.left + 'px';
            el.style.top = px.top + 'px';
            el.style.width = px.width + 'px';
            el.style.height = px.height + 'px';
            if (w.type === 'clock') el.style.setProperty('--clock-editor-options-top', (px.top >= 56 ? -48 : px.height + 8) + 'px');
            el.style.zIndex = String(20 + (w.z || 1));
            el.classList.toggle('is-pinned', !!w.pinned);
            el.setAttribute('data-pinned', w.pinned ? 'true' : 'false');
            el.classList.toggle('is-editor-selected', !!state.editor && state.editor.selected === w.id);
            var widgetBody = el.querySelector('.widget-body');
            if (widgetBody) widgetBody.inert = !!state.editor;
            if (state.editor) { el.setAttribute('tabindex', '0'); el.setAttribute('data-editor-focus', 'true'); }
            else if (el.getAttribute('data-editor-focus')) { el.removeAttribute('data-editor-focus'); el.removeAttribute('tabindex'); }

            var scale = contentScale(w.type, px);
            el.style.setProperty('--widget-w', Math.round(px.width) + 'px');
            el.style.setProperty('--widget-h', Math.round(px.height) + 'px');
            el.style.setProperty('--widget-scale', String(scale));
            var mode = computeLayoutMode(w.type, px);
            el.setAttribute('data-layout', mode);
            if (w.type === 'app') {
                var sz = (w.options && w.options.size) || 'm';
                el.setAttribute('data-app-size', sz);
                el.setAttribute('data-layout', 'regular');
                var appSize = L.APP_SIZE_PX[sz] || L.APP_SIZE_PX.m;
                el.style.setProperty('--app-icon-size', appSize.icon + 'px');
            } else {
                el.removeAttribute('data-app-size');
            }
            if (w.type === 'folder') {
                var preview = el.querySelector('.folder-preview');
                var grid = folderGridForSize(px.width, px.height, w);
                el.setAttribute('data-folder-grid', String(grid.grid || grid.cols || 2));
                if (preview) {
                    preview.style.setProperty('--folder-cols', String(grid.cols));
                    preview.style.setProperty('--folder-rows', String(grid.rows));
                    preview.setAttribute('data-cols', String(grid.cols));
                    preview.setAttribute('data-rows', String(grid.rows));
                }
            } else {
                el.removeAttribute('data-folder-grid');
            }
            applyAppearance(el, w);
            syncHandles(el, w);
        });
        if (state.editor && state.editor.grid.narrow) contentHeight = Math.max(contentHeight, global.innerHeight + 312);
        if (canvas) canvas.style.setProperty('--canvas-content-height', contentHeight + 'px');
    }

    function showLayoutToast(msg) {
        /* X2: bottom toast removed this round */
        return;
    }

    function syncArrangeBar() {
        var toolbar = $('#home-editor-toolbar');
        if (!toolbar) {
            toolbar = document.createElement('div'); toolbar.id = 'home-editor-toolbar';
            toolbar.setAttribute('role', 'toolbar'); toolbar.setAttribute('aria-label', '排列主畫面');
            toolbar.innerHTML = '<p id="editor-status" role="status" aria-live="polite">點選要移動的項目</p>' +
                '<div class="editor-actions"><button type="button" id="editor-widget-settings" disabled>設定</button><button type="button" data-editor-resize="-1" disabled>縮小</button><button type="button" data-editor-resize="1" disabled>放大</button>' +
                '<button type="button" id="arrange-cancel">取消</button></div>';
            toolbar.querySelector('#editor-widget-settings').addEventListener('click', function (e) {
                e.stopPropagation();
                var widget = state.editor && document.querySelector('.widget[data-id="' + state.editor.selected + '"]');
                if (widget && global.NewtabContextMenu && NewtabContextMenu.openWidget) NewtabContextMenu.openWidget(widget);
            });
            toolbar.querySelector('#arrange-cancel').addEventListener('click', function (e) { e.stopPropagation(); cancelArrange(); });
            toolbar.querySelectorAll('[data-editor-resize]').forEach(function (button) {
                button.addEventListener('click', function (e) { e.stopPropagation(); resizeSelected(Number(button.getAttribute('data-editor-resize'))); });
            });
            document.body.appendChild(toolbar);
        }
        var bar = $('#arrange-done-bar');
        if (!bar) {
            bar = document.createElement('button');
            bar.id = 'arrange-done-bar';
            bar.type = 'button';
            bar.textContent = '完成';
            bar.setAttribute('aria-label', '完成主畫面編輯');
            bar.addEventListener('click', function (event) {
                event.stopPropagation();
                exitArrange();
            });
            toolbar.querySelector('.editor-actions').appendChild(bar);
        }
        bar.hidden = !state.arranging;
        toolbar.hidden = !state.arranging;
    }

    function commitEditorRect(id, rect) {
        if (!state.editor) return;
        state.editor.rects[id] = Object.assign({}, rect);
        var view = state.editor.views[state.editor.family];
        var widget = findWidget(id);
        if (widget) view.models[id] = L.homePlacement(rect, widget.type, state.editor.grid);
        view.dirty[id] = true;
        state.editor.geometryDirty = true;
        state.editor.dirty = true;
    }

    function resizeSelected(amount, axis) {
        var editor = state.editor, w = editor && findWidget(editor.selected);
        if (!w || w.pinned || !handlesForType(w.type).length) return;
        var rect = Object.assign({}, editor.rects[w.id]);
        if (axis !== 'y') rect.width += editor.grid.pitchX * amount;
        if (axis !== 'x') rect.height += editor.grid.pitchY * amount;
        var next = L.homeSnap(rect, w.type, editor.grid, true);
        if (!L.homeFits(next, otherPixelRects(w.id))) { editorMessage('這個尺寸會重疊，請先移到空位'); return; }
        commitEditorRect(w.id, next); applyPositions();
        editorMessage('已調整尺寸；完成後儲存');
    }

    function setArranging(on, opts) {
        opts = opts || {};
        var next = !!on;
        var was = state.arranging;
        if (next && !was) {
            var snapshot = L.clone(state.layout);
            snapshot.rail.open = false;
            var grid = L.homeGrid(), family = grid.narrow ? 'mobile' : 'desktop', views = {};
            views[family] = editorView(state.renderedRects, grid);
            state.editor = { snapshot: snapshot, rects: L.clone(state.renderedRects), grid: grid, views: views, family: family, selected: null, dirty: false, geometryDirty: false };
        } else if (!next && was && state.editor) {
            var editor = state.editor;
            if (opts.cancel) { state.layout = L.clone(editor.snapshot); syncClockHour12Bridge(); }
            else if (editor.geometryDirty) Object.keys(editor.views).forEach(function (family) {
                var view = editor.views[family];
                state.layout.widgets.forEach(function (w) {
                    if (view.dirty[w.id] && view.models[w.id]) {
                        if (!w.options) w.options = {};
                        w.options[family === 'mobile' ? 'homeMobile' : 'homeDesktop'] = L.clone(view.models[w.id]);
                    }
                });
            });
            state.editor = null;
        }
        state.arranging = next;
        document.body.classList.toggle('is-arranging', next);
        document.body.classList.toggle('is-editing-layout', next);
        syncArrangeBar();

        if (next) {
            var legacy = $('#edit-layout-bar');
            if (legacy) legacy.style.display = 'none';
            $$('.widget-toolbar').forEach(function (t) { t.style.display = 'none'; });
            var ae = document.activeElement;
            if (ae && typeof ae.blur === 'function') ae.blur();
            var box = $('#search-box');
            if (box) box.classList.remove('active');
            if (global.NewtabSideRail && NewtabSideRail.isOpen && NewtabSideRail.isOpen()) {
                NewtabSideRail.close();
            }
        } else {
            if (state.drag) endDrag(true);
            if (state.resize) endResize(true);
            clearHandles();
            var preview = $('#home-drop-preview'); if (preview) preview.hidden = true;
            if (was) {
                persist();
                if (!opts.silent) showLayoutToast(opts.cancel ? '已取消變更' : '已儲存版面');
            }
        }
        applyPositions();
        emitChange();
    }

    function bringToFront(id) {
        var w = findWidget(id);
        if (!w) return;
        var maxZ = 0;
        state.layout.widgets.forEach(function (x) { if (x.z > maxZ) maxZ = x.z; });
        w.z = maxZ + 1;
        applyPositions();
    }

    function enterArrange() {
        setArranging(true);
    }

    function exitArrange(opts) {
        if (state.drag) endDrag(true);
        if (state.resize) endResize(true);
        setArranging(false, opts);
    }

    function cancelArrange() { exitArrange({ cancel: true }); }

    function isArranging() {
        return state.arranging;
    }

    /* ---------- Long-press (idle → arrange) ---------- */
    function clearLongPress() {
        if (state.longPress && state.longPress.timer) {
            clearTimeout(state.longPress.timer);
        }
        if (state.longPress && state.longPress.el) {
            state.longPress.el.classList.remove('is-longpress-hint');
        }
        state.longPress = null;
    }

    function armLongPress(el, e) {
        if (e.button != null && e.button !== 0) return;
        if (document.body.classList.contains('is-catalog-placing')) return;
        if (isChromeTarget(e.target)) return;
        // Form controls receive their complete pointer/click sequence without
        // arming arrange mode. App links retain a visual-only long-press hint.
        if (!state.arranging && e.target.closest && e.target.closest('input, textarea, select, button:not(.folder-tile):not(.companion-button), [contenteditable]:not([contenteditable="false"]), .suggestions-container, .suggestions-list') && !el.matches('[data-type="companion"]')) {
            return;
        }
        if (e.target.closest && e.target.closest(
            'button.todo-check, button.todo-add, button.bookmark-add, button.bookmark-add-tile, button.weather-retry, a.bookmark-chip, a.bookmark-tile, .bookmark-add-pop, .countdown-title-input, .countdown-date-input'
        )) {
            return;
        }

        var id = el.getAttribute('data-id');
        var widget = findWidget(id);
        if (!widget || widget.pinned) return;
        clearLongPress();
        state.longPress = {
            id: id,
            el: el,
            pointerId: e.pointerId,
            x: e.clientX,
            y: e.clientY,
            timer: null
        };
        el.classList.add('is-longpress-hint');
        state.longPress.timer = setTimeout(function () {
            if (!state.longPress || state.longPress.id !== id) return;
            var lp = state.longPress;
            var targetId = lp.id;
            var targetEl = lp.el;
            var pseudo = {
                pointerId: lp.pointerId,
                clientX: lp.x,
                clientY: lp.y,
                button: 0
            };
            // clear timer + hint without wiping pseudo coords mid-flight
            if (lp.timer) clearTimeout(lp.timer);
            if (targetEl) targetEl.classList.remove('is-longpress-hint');
            state.longPress = null;

            if (!state.arranging) enterArrange();
            bringToFront(targetId);
            state.suppressBlankUntil = Date.now() + SUPPRESS_BLANK_MS;
            if (targetEl) beginDrag(targetEl, pseudo);
        }, LONG_PRESS_MS);
    }

    function onLongPressMove(e) {
        if (!state.longPress || state.longPress.pointerId !== e.pointerId) return;
        var dx = e.clientX - state.longPress.x;
        var dy = e.clientY - state.longPress.y;
        if (Math.abs(dx) > LONG_PRESS_MOVE_PX || Math.abs(dy) > LONG_PRESS_MOVE_PX) {
            clearLongPress();
        }
    }

    function onLongPressUp(e) {
        if (!state.longPress) return;
        if (e.pointerId != null && state.longPress.pointerId !== e.pointerId) return;
        clearLongPress();
    }

    /* ---------- Drag ---------- */
    function beginDrag(el, e) {
        if (!state.arranging) return;
        if (!e) return;
        if (e.button != null && e.button !== 0) return;
        if (e.target && e.target.closest && e.target.closest('.widget-handle')) return;
        if (state.resize || state.drag) return;

        var id = el.getAttribute('data-id');
        var w = findWidget(id);
        if (!w || w.pinned) return;
        selectEditorWidget(id);
        el.focus({ preventScroll: true });

        if (typeof e.preventDefault === 'function') e.preventDefault();
        if (typeof e.stopPropagation === 'function') e.stopPropagation();

        var clientX = e.clientX;
        var clientY = e.clientY;
        var pointerId = e.pointerId;
        var rect = el.getBoundingClientRect();
        state.drag = {
            id: id,
            el: el,
            pointerId: pointerId,
            startX: clientX,
            startY: clientY,
            grabX: clientX - rect.left,
            grabY: clientY - rect.top,
            width: rect.width,
            height: rect.height,
            moved: false,
            type: w.type,
            options: w.options,
            pinned: w.pinned,
            z: w.z
        };
        state.drag.startRect = Object.assign({}, state.editor.rects[id]);
        state.drag.valid = false;
        el.classList.add('is-dragging');
        document.body.classList.add('is-dragging-widget');
        try { el.setPointerCapture(pointerId); } catch (err) { /* */ }

        el.addEventListener('pointermove', onDragMove);
        el.addEventListener('pointerup', onDragUp);
        el.addEventListener('pointercancel', onDragCancel);
        el.addEventListener('lostpointercapture', onDragCancel);
    }

    function scrollEditorDrag() {
        var d = state.drag, canvas = $('#widget-canvas');
        if (!d || !canvas) return;
        d.scrollFrame = null;
        var y = d.lastY, height = global.innerHeight;
        var speed = y < 56 ? -10 : y > height - 72 ? 10 : 0;
        // A quick edge drop belongs at the visible edge. Scroll only after
        // an intentional dwell, so approaching a corner cannot move the page.
        var direction = Math.sign(speed);
        if (direction !== d.scrollDirection) { d.scrollDirection = direction; d.scrollSince = performance.now(); }
        if (speed && performance.now() - d.scrollSince >= 320) {
            var before = canvas.scrollTop;
            canvas.scrollTop += speed;
            if (canvas.scrollTop !== before) onDragMove({ pointerId: d.pointerId, clientX: d.lastX, clientY: d.lastY });
        }
        if (state.drag === d && speed && !d.scrollFrame) d.scrollFrame = requestAnimationFrame(scrollEditorDrag);
    }

    function onDragMove(e) {
        if (!state.drag || state.drag.pointerId !== e.pointerId) return;
        var d = state.drag;
        var dx = e.clientX - d.startX;
        var dy = e.clientY - d.startY;
        if (!d.moved && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) d.moved = true;
        if (!d.moved) return;
        d.lastX = e.clientX; d.lastY = e.clientY;
        if (!d.scrollFrame) d.scrollFrame = requestAnimationFrame(scrollEditorDrag);

        var left = e.clientX - d.grabX;
        var canvas = $('#widget-canvas');
        var top = e.clientY - d.grabY + (canvas.scrollTop || 0);
        var grid = state.editor.grid;
        var raw = { left: left, top: top, width: d.width, height: d.height };
        d.el.style.left = Math.max(0, Math.min(grid.width - d.width, left)) + 'px';
        d.el.style.top = Math.max(0, top) + 'px';
        d.preview = snapEditorRect(findWidget(d.id), raw, false);
        d.valid = L.homeFits(d.preview, otherPixelRects(d.id));
        d.swapTarget = null;

        $$('.widget[data-type="app"], .widget[data-type="folder"]').forEach(function (o) {
            o.classList.remove('drop-target');
            o.classList.remove('is-drop-target');
            var tile = o.querySelector('.folder-tile');
            if (tile) tile.classList.remove('is-drop-target');
        });
        var target = d.type === 'app' && (hitAppMergeTarget(e.clientX, e.clientY, d.id) || hitFolderDropTarget(e.clientX, e.clientY, d.id));
        var targetId = target && target.getAttribute('data-id');
        var targetWidget = targetId && findWidget(targetId);
        if (targetWidget && targetWidget.pinned) { target = null; targetId = null; }
        if (d.hoverId !== targetId) {
            clearTimeout(d.dwellTimer); d.hoverId = targetId; d.folderReady = false;
            if (targetId) d.dwellTimer = setTimeout(function () {
                if (state.drag !== d || d.hoverId !== targetId) return;
                d.folderReady = true;
                showEditorPreview(state.editor.rects[targetId], 'folder', targetWidget.type === 'folder' ? '放開加入資料夾' : '放開建立資料夾');
            }, 650);
        }
        if (targetWidget && targetWidget.type === 'app') {
            var occupied = state.editor.rects[targetId];
            var swap = Object.assign({}, d.startRect, { width: occupied.width, height: occupied.height });
            var destination = Object.assign({}, occupied, { width: d.width, height: d.height });
            var others = otherPixelRects(d.id);
            if (L.homeFits(destination, others, [targetId]) && L.homeFits(swap, others, [targetId])) {
                d.swapTarget = targetId; d.preview = destination; d.valid = true;
            }
        }
        if (d.swapTarget || d.folderReady) state.editor.previewGuides = [];
        if (d.folderReady && targetId) showEditorPreview(state.editor.rects[targetId], 'folder', targetWidget.type === 'folder' ? '放開加入資料夾' : '放開建立資料夾');
        else showEditorPreview(d.preview, d.valid ? 'place' : 'blocked', targetId ? (d.swapTarget ? '放開交換位置；停留可建立資料夾' : '停留可加入資料夾') : d.valid ? '放開放置' : '這裡已有項目');
    }

    function hitAppMergeTarget(cx, cy, excludeId) {
        var nodes = $$('.widget[data-type="app"][data-active="true"]');
        var i, el, r, w;
        for (i = 0; i < nodes.length; i++) {
            el = nodes[i];
            if (el.getAttribute('data-id') === excludeId) continue;
            w = findWidget(el.getAttribute('data-id'));
            if (!w || w.type !== 'app') continue;
            r = el.getBoundingClientRect();
            var cx0 = r.left + r.width / 2;
            var cy0 = r.top + r.height / 2;
            var dist = Math.hypot(cx - cx0, cy - cy0);
            if (dist < Math.min(r.width, r.height) * 0.4) return el;
        }
        return null;
    }

    function hitFolderDropTarget(cx, cy, excludeId) {
        var nodes = $$('.widget[data-type="folder"][data-active="true"]');
        var i, el, r, pad;
        for (i = 0; i < nodes.length; i++) {
            el = nodes[i];
            if (el.getAttribute('data-id') === excludeId) continue;
            r = el.getBoundingClientRect();
            if (Math.hypot(cx - r.left - r.width / 2, cy - r.top - r.height / 2) < Math.min(r.width, r.height) * 0.4) {
                return el;
            }
        }
        return null;
    }

    function addAppToFolder(appWidgetId, folderId) {
        var appW = findWidget(appWidgetId);
        var folder = findWidget(folderId);
        if (!appW || !folder || appW.type !== 'app' || folder.type !== 'folder') return false;
        var appId = appW.options && appW.options.appId;
        if (!appId) return false;
        if (!folder.options) folder.options = {};
        if (!Array.isArray(folder.options.children)) folder.options.children = [];
        var exists = folder.options.children.some(function (c) { return c.appId === appId; });
        if (exists) return false;
        var grid = folder.options.grid || 2;
        var max = (L && L.FOLDER_GRID_PX && L.FOLDER_GRID_PX[grid] && L.FOLDER_GRID_PX[grid].max) || 16;
        if (folder.options.children.length >= max) return false;
        folder.options.children.push({ appId: appId });
        state.layout.widgets = state.layout.widgets.filter(function (x) { return x.id !== appWidgetId; });
        return true;
    }

    function onDragUp(e) {
        if (!state.drag || state.drag.pointerId !== e.pointerId) return;
        var d = state.drag;

        $$('.drop-target, .is-drop-target').forEach(function (n) {
            n.classList.remove('drop-target');
            n.classList.remove('is-drop-target');
        });

        if (!d.moved) {
            endDrag(true);
            revealEditorSelection();
            return;
        }

        state.suppressBlankUntil = Date.now() + SUPPRESS_BLANK_MS;

        if (d.folderReady && d.hoverId && d.type === 'app') {
            var target = findWidget(d.hoverId);
            var targetRect = Object.assign({}, state.editor.rects[d.hoverId]);
            if (target && target.type === 'folder') {
                if (addAppToFolder(d.id, target.id)) {
                    delete state.editor.rects[d.id]; state.editor.geometryDirty = true;
                    state.editor.selected = target.id; persist();
                } else editorMessage('資料夾已滿，請選擇其他位置');
            } else if (target && target.type === 'app') {
                mergeApps(d.id, target.id);
                var folder = state.layout.widgets[state.layout.widgets.length - 1];
                delete state.editor.rects[d.id]; delete state.editor.rects[target.id];
                commitEditorRect(folder.id, targetRect); state.editor.selected = folder.id; persist();
            }
        } else if (d.valid && d.preview) {
            if (d.swapTarget) {
                var swapRect = Object.assign({}, state.editor.rects[d.swapTarget], { left: d.startRect.left, top: d.startRect.top });
                commitEditorRect(d.swapTarget, swapRect);
            }
            commitEditorRect(d.id, d.preview);
        }
        endDrag(false);
        applyPositions();
        selectEditorWidget(state.editor.selected);
        editorMessage(d.folderReady ? '已整理資料夾；完成後儲存' : d.valid ? '已移動；完成後儲存' : '這個位置已有項目，已保留原位');
    }

    function endDrag(cancel) {
        if (!state.drag) return;
        var d = state.drag;
        state.drag = null;
        if (d.scrollFrame) cancelAnimationFrame(d.scrollFrame);
        clearTimeout(d.dwellTimer);
        showEditorPreview(null);
        d.el.removeEventListener('pointermove', onDragMove);
        d.el.removeEventListener('pointerup', onDragUp);
        d.el.removeEventListener('pointercancel', onDragCancel);
        d.el.removeEventListener('lostpointercapture', onDragCancel);
        try { d.el.releasePointerCapture(d.pointerId); } catch (err) { /* */ }
        d.el.classList.remove('is-dragging');
        document.body.classList.remove('is-dragging-widget');
        $$('.drop-target, .is-drop-target').forEach(function (el) {
            el.classList.remove('drop-target', 'is-drop-target');
        });
        if (cancel) applyPositions();
    }

    function onDragCancel(e) {
        if (state.drag && state.drag.pointerId === e.pointerId) endDrag(true);
    }

    /* ---------- Resize ---------- */
    function beginResize(handleEl, e) {
        if (!state.arranging) return;
        if (e.button != null && e.button !== 0) return;
        if (state.drag || state.resize) return;

        var widget = handleEl.closest('.widget');
        if (!widget) return;
        var id = widget.getAttribute('data-id');
        var w = findWidget(id);
        if (!w || w.pinned) return;

        var handle = handleEl.getAttribute('data-handle');
        if (!handle) return;

        e.preventDefault();
        e.stopPropagation();

        var rect = state.editor.rects[id];
        state.resize = {
            id: id,
            el: widget,
            handle: handle,
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            startRect: {
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height
            },
            type: w.type,
            options: w.options,
            pinned: w.pinned,
            z: w.z,
            moved: false
        };
        widget.classList.add('is-resizing');
        document.body.classList.add('is-dragging-widget');
        try { widget.setPointerCapture(e.pointerId); } catch (err) { /* */ }

        widget.addEventListener('pointermove', onResizeMove);
        widget.addEventListener('pointerup', onResizeUp);
        widget.addEventListener('pointercancel', onResizeCancel);
        widget.addEventListener('lostpointercapture', onResizeCancel);
    }

    function onResizeMove(e) {
        if (!state.resize || state.resize.pointerId !== e.pointerId) return;
        var r = state.resize;
        var dx = e.clientX - r.startX;
        var dy = e.clientY - r.startY;
        if (!r.moved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) r.moved = true;

        var raw = Object.assign({}, r.startRect);
        if (r.handle.indexOf('e') >= 0) raw.width += dx;
        if (r.handle.indexOf('s') >= 0) raw.height += dy;
        if (r.handle.indexOf('w') >= 0) { raw.left += dx; raw.width -= dx; }
        if (r.handle.indexOf('n') >= 0) { raw.top += dy; raw.height -= dy; }
        var next = L.homeSnap(raw, r.type, state.editor.grid, true);
        r.valid = L.homeFits(next, otherPixelRects(r.id));
        var painted = r.valid ? next : r.startRect;
        r.el.style.left = painted.left + 'px';
        r.el.style.top = painted.top + 'px';
        r.el.style.width = painted.width + 'px';
        r.el.style.height = painted.height + 'px';
        r.preview = next;
        showEditorPreview(next, r.valid ? 'place' : 'blocked', r.valid ? '放開套用這個尺寸' : '這個尺寸會重疊');

        var scale = contentScale(r.type, painted);
        r.el.style.setProperty('--widget-w', Math.round(painted.width) + 'px');
        r.el.style.setProperty('--widget-h', Math.round(painted.height) + 'px');
        r.el.style.setProperty('--widget-scale', String(scale));
        // Debounce data-layout attr to reduce thrash
        clearTimeout(r._layoutTimer);
        r._layoutTimer = setTimeout(function () {
            if (!state.resize || state.resize.id !== r.id) return;
            var mode = computeLayoutMode(r.type, painted);
            r.el.setAttribute('data-layout', mode);
        }, LAYOUT_ATTR_DEBOUNCE_MS);
    }

    function onResizeUp(e) {
        if (!state.resize || state.resize.pointerId !== e.pointerId) return;
        var r = state.resize;

        if (r.moved && r.valid) {
            state.suppressBlankUntil = Date.now() + SUPPRESS_BLANK_MS;
            var finalRect = r.preview || {
                left: r.el.getBoundingClientRect().left,
                top: r.el.getBoundingClientRect().top,
                width: r.el.getBoundingClientRect().width,
                height: r.el.getBoundingClientRect().height
            };
            commitEditorRect(r.id, finalRect);
        }
        endResize(false);
        applyPositions();
        editorMessage(r.moved && r.valid ? '已調整尺寸；完成後儲存' : '已保留原本尺寸');
    }

    function endResize(cancel) {
        if (!state.resize) return;
        var r = state.resize;
        state.resize = null;
        showEditorPreview(null);
        clearTimeout(r._layoutTimer);
        r.el.removeEventListener('pointermove', onResizeMove);
        r.el.removeEventListener('pointerup', onResizeUp);
        r.el.removeEventListener('pointercancel', onResizeCancel);
        r.el.removeEventListener('lostpointercapture', onResizeCancel);
        try { r.el.releasePointerCapture(r.pointerId); } catch (err) { /* */ }
        r.el.classList.remove('is-resizing');
        document.body.classList.remove('is-dragging-widget');
        if (cancel) applyPositions();
    }

    function onResizeCancel(e) {
        if (state.resize && state.resize.pointerId === e.pointerId) endResize(true);
    }

    function mergeApps(idA, idB) {
        var a = findWidget(idA);
        var b = findWidget(idB);
        if (!a || !b || a.type !== 'app' || b.type !== 'app') return;
        var appA = a.options.appId;
        var appB = b.options.appId;
        if (!appA || !appB || appA === appB) return;

        var folderId = 'folder-' + Date.now();
        var maxZ = 0;
        state.layout.widgets.forEach(function (w) { if (w.z > maxZ) maxZ = w.z; });
        var folder = L.enrichWidget({
            id: folderId,
            type: 'folder',
            x: b.x,
            y: b.y,
            w: Math.max(b.w, 0.09),
            h: Math.max(b.h, 0.12),
            pinned: false,
            z: maxZ + 1,
            options: {
                name: '資料夾',
                grid: 2,
                children: [{ appId: appB }, { appId: appA }]
            }
        });
        state.layout.widgets = state.layout.widgets.filter(function (w) {
            return w.id !== idA && w.id !== idB;
        });
        state.layout.widgets.push(folder);
    }

    function dissolveFolder(folderId) {
        var f = findWidget(folderId);
        if (!f || f.type !== 'folder') return;
        var children = (f.options && f.options.children) || [];
        var next = L.clone(state.layout), grid = state.editor ? state.editor.grid : L.homeGrid();
        var rects = L.clone(state.renderedRects), others = otherPixelRects(folderId);
        next.widgets = next.widgets.filter(function (w) { return w.id !== folderId; });
        delete rects[folderId];
        for (var i = 0; i < children.length; i++) {
            var res = L.addWidget(next, 'app', { appId: children[i].appId });
            if (!res.ok) return res;
            var placed = L.homeNextFree(L.toPixels(res.widget), 'app', others, grid);
            if (!placed) { editorMessage('需要更多空位才能解散資料夾'); return { ok: false, error: 'no-space' }; }
            next = res.layout; rects[res.widget.id] = placed;
            others.push(Object.assign({ id: res.widget.id }, placed));
        }
        state.layout = next;
        if (state.editor) { state.editor.rects = rects; state.editor.geometryDirty = true; state.editor.selected = null;
            state.layout.widgets.forEach(function (w) { if (!state.editor.views[state.editor.family].models[w.id]) commitEditorRect(w.id, rects[w.id]); });
        }
        else state.layout.widgets.forEach(function (w) { if (rects[w.id]) saveHomeRect(w, rects[w.id], grid); });
        applyPositions();
        persist();
        return { ok: true };
    }

    /* ---------- Public API ---------- */
    function previewCatalog(type, options, clientX, clientY) {
        if (!state.editor) return { valid: false };
        var res = L.addWidget(state.layout, type, options || {});
        if (!res.ok) { clearCatalogPreview(); return { valid: false, error: res.error }; }
        var grid = state.editor.grid;
        var rect = Object.assign(L.toPixels(res.widget), L.homeNewFootprint(type, res.widget.options, grid));
        rect.left = clientX - rect.width / 2;
        rect.top = clientY + ($('#widget-canvas').scrollTop || 0) - rect.height / 2;
        var aligned = L.homeAlignedRect(rect, type, otherPixelRects(null), grid);
        rect = aligned.rect; state.editor.previewGuides = aligned.guides;
        var valid = L.homeFits(rect, otherPixelRects(null));
        state.editor.catalogPreview = { type: type, rect: rect, valid: valid };
        showEditorPreview(rect, valid ? 'place' : 'blocked', valid ? '放開新增至此位置' : '這裡已有項目，請移到空位');
        return Object.assign({ valid: valid }, rect);
    }

    function clearCatalogPreview() {
        if (state.editor) state.editor.catalogPreview = null;
        showEditorPreview(null);
    }

    function commitCatalogPreview(type, options) {
        var preview = state.editor && state.editor.catalogPreview;
        if (!preview || !preview.valid || preview.type !== type) { clearCatalogPreview(); return { ok: false, error: 'occupied' }; }
        var opts = Object.assign({}, options || {}, { left: preview.rect.left, top: preview.rect.top, strictPlacement: true });
        clearCatalogPreview();
        var result = addFromCatalog(type, opts);
        if (result.ok) revealEditorSelection();
        return result;
    }

    function addFromCatalog(type, opts) {
        opts = opts || {};
        var res = L.addWidget(state.layout, type, opts);
        if (!res.ok) return res;
        var grid = state.editor ? state.editor.grid : L.homeGrid();
        var newRect = Object.assign(L.toPixels(res.widget), L.homeNewFootprint(type, res.widget.options, grid));
        var others = state.layout.widgets.map(function (w) { return Object.assign({ id: w.id }, state.renderedRects[w.id] || L.toPixels(w)); });
        var specified = typeof opts.left === 'number' && typeof opts.top === 'number';
        var requested = specified ? L.homeAlignedRect(Object.assign({}, newRect, { left: opts.left, top: opts.top }), type, others, grid).rect : null;
        var placed = requested && L.homeFits(requested, others) ? requested : opts.strictPlacement ? null : L.homeNextFree(newRect, type, others, grid);
        if (!placed) { editorMessage('畫面已滿，請先移動或移除一個項目'); return { ok: false, error: 'no-space' }; }
        if (state.editor) {
            state.layout = res.layout;
            commitEditorRect(res.widget.id, placed);
            state.editor.selected = res.widget.id;
        } else {
            res.layout.widgets.forEach(function (w) {
                var visible = w.id === res.widget.id ? placed : state.renderedRects[w.id];
                if (visible) saveHomeRect(w, visible, grid);
            });
        }
        state.layout = res.layout;
        applyPositions();
        persist();
        if (state.editor) { selectEditorWidget(res.widget.id); editorMessage('已新增；可調整位置，完成後儲存'); }
        if (res.widget && res.widget.id) {
            var freshEl = document.querySelector('.widget[data-id="' + res.widget.id + '"]');
            if (freshEl) {
                freshEl.classList.add('is-fresh');
                setTimeout(function () { freshEl.classList.remove('is-fresh'); }, 300);
            }
        }
        return res;
    }

    function addApp(appId, opts) {
        opts = opts || {};
        return addFromCatalog('app', {
            appId: appId,
            left: opts.left,
            top: opts.top
        });
    }

    function removeById(id) {
        var res = L.removeWidget(state.layout, id);
        state.layout = res.layout;
        if (state.editor) { delete state.editor.rects[id]; if (state.editor.selected === id) state.editor.selected = null; }
        applyPositions();
        if (state.editor) selectEditorWidget(state.editor.selected);
        persist();
        return { ok: true };
    }

    function removeAppByAppId(appId) {
        var root = state.layout.widgets.filter(function (w) {
            return w.type === 'app' && w.options && w.options.appId === appId;
        })[0];
        if (root) return removeById(root.id);

        var folders = state.layout.widgets.filter(function (w) { return w.type === 'folder'; });
        var i, f, before, after;
        for (i = 0; i < folders.length; i++) {
            f = folders[i];
            if (!f.options || !f.options.children) continue;
            before = f.options.children.length;
            f.options.children = f.options.children.filter(function (c) {
                return c.appId !== appId;
            });
            after = f.options.children.length;
            if (after === before) continue;
            if (after === 0) {
                removeById(f.id);
                return { ok: true };
            }
            if (after === 1) {
                var only = f.options.children[0].appId;
                removeById(f.id);
                addApp(only);
                return { ok: true };
            }
            applyPositions();
            persist();
            return { ok: true };
        }
        return { ok: false, error: 'not-found' };
    }

    function togglePin(id) {
        var w = findWidget(id);
        if (!w) return;
        w.pinned = !w.pinned;
        applyPositions();
        persist();
    }

    function renameFolder(id, name) {
        var w = findWidget(id);
        if (!w || w.type !== 'folder') return { ok: false, error: 'not-folder' };
        var n = String(name == null ? '' : name).trim();
        if (!n) n = '資料夾';
        if (n.length > 24) n = n.slice(0, 24);
        if (!w.options) w.options = {};
        w.options.name = n;
        refreshFolderBody(
            document.querySelector('.widget[data-id="' + id + '"]'),
            w
        );
        applyPositions();
        persist();
        return { ok: true, name: n };
    }

    function resetLayout() {
        state.layout = L.defaultLayout();
        migrateCompanionWidget(false);
        if (state.editor) { state.editor.rects = {}; state.editor.selected = null; state.editor.geometryDirty = true; }
        applyPositions();
        if (state.editor) { state.editor.rects = L.clone(state.renderedRects); state.layout.widgets.forEach(function (w) { commitEditorRect(w.id, state.editor.rects[w.id]); }); }
        persist();
    }

    function setRailState(partial) {
        if (!state.layout.rail) state.layout.rail = L.defaultRail();
        if (partial) {
            if (typeof partial.open === 'boolean') state.layout.rail.open = partial.open;
            if (typeof partial.width === 'number') state.layout.rail.width = partial.width;
            if (partial.tab) state.layout.rail.tab = partial.tab;
        }
        state.layout.rail = L.normalizeRail(state.layout.rail);
        if (!state.editor) L.saveLayout(state.layout);
        emitChange();
    }

    function getRailState() {
        return L.normalizeRail(state.layout && state.layout.rail);
    }

    function onViewportResize() {
        clearLongPress(); clearBlankLP();
        endDrag(true); endResize(true);
        if (state.editor) {
            var editor = state.editor, canvas = $('#widget-canvas');
            editor.views[editor.family].scrollTop = canvas.scrollTop;
            var nextGrid = L.homeGrid(), family = nextGrid.narrow ? 'mobile' : 'desktop';
            var switched = family !== editor.family;
            if (!editor.views[family]) editor.views[family] = editorView(visibleProjection(state.layout), nextGrid);
            var view = editor.views[family], rects = {}, normal = visibleProjection(state.layout);
            state.layout.widgets.forEach(function (w) {
                rects[w.id] = view.dirty[w.id] ? L.homePlacementRect(view.models[w.id], w.type, nextGrid) || normal[w.id] : normal[w.id];
            });
            editor.grid = nextGrid; editor.family = family; editor.rects = resolveResponsiveRects(state.layout, rects, nextGrid);
            if (switched) canvas.scrollTop = view.scrollTop;
        }
        applyPositions();
    }

    /* ---------- Inline desktop search; a focused sheet for compact layouts ---------- */
    function shouldExpandSearch(widget) {
        return (global.innerWidth || 1200) <= 600 ||
            !!(widget && widget.getAttribute('data-layout') === 'icon-only');
    }

    function focusSearch() {
        if (state.arranging) return false;
        var widget = document.querySelector('.widget[data-type="search"][data-active="true"]');
        var input = document.getElementById('search-input');
        if (!widget || widget.hidden || !input || input.disabled) return false;
        if (global.NewtabSideRail && NewtabSideRail.isOpen && NewtabSideRail.isOpen()) {
            NewtabSideRail.close();
        }
        if (shouldExpandSearch(widget)) openSearchExpand();
        else input.focus({ preventScroll: true });
        return true;
    }

    function ensureSearchExpandLayer() {
        var layer = document.getElementById('search-expand-layer');
        if (layer) return layer;
        layer = document.createElement('div');
        layer.id = 'search-expand-layer';
        layer.className = 'search-expand-layer';
        layer.innerHTML =
            '<div class="search-expand-backdrop" data-close="1"></div>' +
            '<div class="search-expand-panel" role="dialog" aria-modal="true" aria-label="Google 搜尋"></div>';
        document.body.appendChild(layer);
        layer.addEventListener('click', function (e) {
            if (e.target && (e.target.getAttribute('data-close') === '1' || e.target.closest('.search-back'))) {
                closeSearchExpand();
            }
        });
        return layer;
    }

    function openSearchExpand() {
        if (state.arranging || state.searchExpand) return;
        var box = document.getElementById('search-box');
        var searchWidget = document.querySelector('.widget[data-type="search"][data-active="true"]');
        if (!box || !searchWidget) return;
        var host = box.closest('.search-container') || box.parentElement;
        if (!host) return;

        var layer = ensureSearchExpandLayer();
        var panel = layer.querySelector('.search-expand-panel');
        if (!panel) return;

        state.searchExpand = {
            host: host,
            box: box,
            widget: searchWidget,
            nextSibling: host.nextSibling,
            parent: host.parentElement
        };

        // Move single DOM tree (no clone — keep #search-input id unique)
        panel.appendChild(host);
        searchWidget.classList.add('is-search-expanded');
        layer.classList.remove('is-closing');
        void layer.offsetWidth;
        layer.classList.add('is-open');

        var input = document.getElementById('search-input');
        if (input) {
            try { input.focus(); } catch (err) { /* */ }
            // Moving a focused input during focusin can let the original focus
            // operation clear focus again. Restore it after that operation ends.
            setTimeout(function () {
                if (state.searchExpand && !state.searchExpand.closing && document.activeElement !== input) input.focus();
            }, 40);
        }
    }

    function closeSearchExpand() {
        if (!state.searchExpand) {
            var layer0 = document.getElementById('search-expand-layer');
            if (layer0) layer0.classList.remove('is-open', 'is-closing');
            return;
        }
        var se = state.searchExpand;
        if (se.closing) return;
        se.closing = true;
        var input = document.getElementById('search-input');
        if (input) input.blur();
        var layer = document.getElementById('search-expand-layer');
        if (layer) {
            layer.classList.add('is-closing');
            layer.classList.remove('is-open');
        }
        setTimeout(function () {
            if (se.parent) {
                if (se.nextSibling && se.nextSibling.parentNode === se.parent) {
                    se.parent.insertBefore(se.host, se.nextSibling);
                } else {
                    se.parent.appendChild(se.host);
                }
            }
            if (se.widget) se.widget.classList.remove('is-search-expanded');
            if (layer) layer.classList.remove('is-closing');
            state.searchExpand = null;
            applyPositions();
            if (se.widget && !state.arranging) {
                se.widget.setAttribute('tabindex', '0');
                se.widget.focus({ preventScroll: true });
            }
        }, 200);
    }

    function clearBlankLP() {
        if (state.blankLP && state.blankLP.timer) clearTimeout(state.blankLP.timer);
        state.blankLP = null;
    }

    function armBlankLongPress(e) {
        if (state.arranging) return;
        if (e.button != null && e.button !== 0) return;
        if (document.body.classList.contains('is-catalog-placing')) return;
        if (isChromeTarget(e.target)) return;
        if (e.target.closest && (
            e.target.closest('.widget') ||
            e.target.closest('input, textarea, select, button, a') ||
            e.target.closest('.search-expand-layer')
        )) return;

        clearBlankLP();
        state.blankLP = {
            pointerId: e.pointerId,
            x: e.clientX,
            y: e.clientY,
            timer: setTimeout(function () {
                state.blankLP = null;
                enterArrange();
                state.suppressBlankUntil = Date.now() + SUPPRESS_BLANK_MS;
            }, LONG_PRESS_MS)
        };
    }

    function onBlankLPMove(e) {
        if (!state.blankLP || state.blankLP.pointerId !== e.pointerId) return;
        var dx = e.clientX - state.blankLP.x;
        var dy = e.clientY - state.blankLP.y;
        if (Math.abs(dx) > LONG_PRESS_MOVE_PX || Math.abs(dy) > LONG_PRESS_MOVE_PX) {
            clearBlankLP();
        }
    }

    function onBlankLPUp(e) {
        if (!state.blankLP) return;
        if (e.pointerId != null && state.blankLP.pointerId !== e.pointerId) return;
        clearBlankLP();
    }

    function bindEvents() {
        if (state.bound) return;
        state.bound = true;

        // The same hold gesture starts a drag both at rest and in the editor.
        document.addEventListener('pointerdown', function (e) {
            if (isChromeTarget(e.target)) return;

            // arrange: handle resize first
            if (state.arranging) {
                var handle = e.target.closest && e.target.closest('.widget-handle');
                if (handle) {
                    beginResize(handle, e);
                    return;
                }
                var widgetDrag = e.target.closest && e.target.closest('.widget[data-active="true"]');
                if (widgetDrag && (e.button == null || e.button === 0)) {
                    armLongPress(widgetDrag, e);
                }
                return;
            }

            // idle long-press on widget or blank canvas
            if (document.body.classList.contains('is-catalog-placing')) return;
            var widget = e.target.closest && e.target.closest('.widget[data-active="true"]');
            if (widget) {
                armLongPress(widget, e);
            } else {
                armBlankLongPress(e);
            }
        }, true);

        document.addEventListener('pointermove', function (e) {
            onLongPressMove(e);
            onBlankLPMove(e);
        }, true);
        document.addEventListener('pointerup', function (e) {
            onLongPressUp(e);
            onBlankLPUp(e);
        }, true);
        document.addEventListener('pointercancel', function (e) {
            onLongPressUp(e);
            onBlankLPUp(e);
        }, true);

        // suppress link clicks while arranging
        document.addEventListener('click', function (e) {
            if (!state.arranging) return;
            var a = e.target.closest && e.target.closest('a');
            if (a && a.closest('.widget')) {
                e.preventDefault();
                e.stopPropagation();
            }
        }, true);

        // Blank space clears selection; only a held drag or keyboard move changes geometry.
        document.addEventListener('click', function (e) {
            if (!state.arranging) return;
            if (Date.now() < state.suppressBlankUntil) return;
            if (isChromeTarget(e.target)) return;
            if (e.target.closest && (
                e.target.closest('.widget') ||
                e.target.closest('.widget-handle') ||
                e.target.closest('.ctx-menu') ||
                e.target.closest('.ctx-sub') ||
                e.target.closest('.custom-app-modal') ||
                e.target.closest('.folder-overlay') ||
                e.target.closest('.search-expand-layer') ||
                e.target.closest('.bookmark-add-pop')
            )) return;
            e.preventDefault();
            selectEditorWidget(null);
        }, true);

        document.addEventListener('focusin', function (e) {
            if (!state.editor || !e.target.matches || !e.target.matches('.widget')) return;
            if (state.editor.selected === e.target.getAttribute('data-id')) requestAnimationFrame(revealEditorSelection);
        });

        // Keep a normal text field on desktop. Compact capsules need the
        // larger sheet, but submit/clear buttons otherwise keep their own click.
        document.addEventListener('click', function (e) {
            if (state.arranging) return;
            if (state.searchExpand) return;
            var sw = e.target.closest && e.target.closest('.widget[data-type="search"]');
            if (!sw) return;
            if (shouldExpandSearch(sw)) {
                e.preventDefault();
                e.stopPropagation();
                openSearchExpand();
            } else if (!e.target.closest('input, button, a')) {
                e.preventDefault();
                focusSearch();
            }
        }, true);

        document.addEventListener('focusin', function (e) {
            if (e.target.id !== 'search-input') return;
            var widget = e.target.closest('.widget[data-type="search"]');
            if (shouldExpandSearch(widget)) openSearchExpand();
        });

        document.addEventListener('keydown', function (e) {
            if (state.editor && !e.isComposing && (e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.widget')) {
                e.preventDefault(); selectEditorWidget(e.target.getAttribute('data-id')); revealEditorSelection(); return;
            }
            if (state.editor && !e.isComposing && e.keyCode !== 229 && /^Arrow/.test(e.key) && e.target.matches && e.target.matches('.widget')) {
                e.preventDefault();
                var id = e.target.getAttribute('data-id');
                var w = findWidget(id);
                if (!w || w.pinned) return;
                selectEditorWidget(id);
                var amount = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
                var vertical = e.key === 'ArrowUp' || e.key === 'ArrowDown';
                if (e.shiftKey) { resizeSelected(amount, vertical ? 'y' : 'x'); return; }
                moveById(id, vertical ? 0 : amount, vertical ? amount : 0);
                return;
            }
            if (!e.isComposing && e.keyCode !== 229 && !e.defaultPrevented &&
                e.target && !(e.target.closest && e.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="dialog"]'))) {
                var shortcut = !e.altKey && (
                    ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'k') ||
                    (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.key === '/')
                );
                if (shortcut && focusSearch()) { e.preventDefault(); return; }
            }
            if (state.searchExpand && e.key === 'Tab') {
                var panel = document.querySelector('.search-expand-panel');
                var controls = Array.from(panel.querySelectorAll('button:not(:disabled), input')).filter(function (el) { return el.offsetWidth && el.tabIndex !== -1; });
                var first = controls[0], last = controls[controls.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
            if (!state.searchExpand && !state.arranging && (e.key === 'Enter' || e.key === ' ') && e.target.matches('.widget[data-type="search"]')) {
                e.preventDefault(); focusSearch(); return;
            }
            if (e.key !== 'Escape') return;
            if (state.searchExpand) {
                e.preventDefault();
                closeSearchExpand();
                return;
            }
            var about = $('#about-page-container');
            var upload = $('#video-upload-container');
            if (about && (about.style.display === 'flex' || getComputedStyle(about).display === 'flex')) return;
            if (upload && (upload.style.display === 'flex' || getComputedStyle(upload).display === 'flex')) return;
            if (document.querySelector('.folder-overlay.is-open')) return;
            if (state.arranging) {
                e.preventDefault();
                if (state.drag) endDrag(true);
                else if (state.resize) endResize(true);
                else cancelArrange();
            }
            clearLongPress();
            clearBlankLP();
        });

        window.addEventListener('resize', onViewportResize);
        window.addEventListener('blur', function () {
            clearLongPress();
            clearBlankLP();
            endDrag(true);
            endResize(true);
        });
        window.addEventListener('pagehide', function () { if (state.layout) persist(); });
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) {
                clearLongPress(); clearBlankLP(); endDrag(true); endResize(true);
                if (state.layout) persist();
            }
            else refreshCountdowns();
        });
        setInterval(refreshCountdowns, 60000);

        // folder open (idle) — capture so blank-exit / other handlers don't steal
        document.addEventListener('click', function (e) {
            if (state.arranging) return;
            var btn = e.target.closest && e.target.closest('.folder-tile');
            if (!btn) return;
            e.preventDefault();
            e.stopPropagation();
            var id = btn.getAttribute('data-folder-id');
            if (global.NewtabFolderUI) NewtabFolderUI.open(id);
        }, true);
    }

    function migrateDom() {
        var canvas = $('#widget-canvas');
        if (!canvas) {
            canvas = document.createElement('div');
            canvas.id = 'widget-canvas';
            canvas.className = 'widget-canvas';
            document.body.insertBefore(canvas, document.body.firstChild);
        }
        var ql = document.querySelector('.quick-links');
        if (ql) ql.style.display = 'none';
        var folder = document.getElementById('google-apps-folder');
        if (folder) folder.style.display = 'none';
        var bar = document.getElementById('edit-layout-bar');
        if (bar) bar.remove();
        syncArrangeBar();
        $$('.widget-toolbar').forEach(function (t) { t.remove(); });
    }

    function init() {
        L = global.NewtabLayout;
        if (!L) {
            console.error('[NewtabWidgets] NewtabLayout missing');
            return;
        }
        migrateDom();
        state.layout = L.loadLayout();
        state.initialViewport = L.viewport();
        migrateCompanionWidget();
        bindEvents();
        applyPositions();
        syncClockHour12Bridge();
        emitChange();
    }

    function migrateCompanionWidget(persistMigration) {
        if (state.layout.companionMigrated) return;
        state.layout.companionMigrated = true;
        if (!state.layout.widgets.some(function (w) { return w.type === 'companion'; })) {
            var added = L.addWidget(state.layout, 'companion', { options: { animationMode: 'auto' } });
            if (added.ok) {
                added.widget.options.homeSeed = 'companion';
                state.layout = added.layout;
            }
        }
        // Save the one-time marker with the layout, so removing the character
        // stays removed and layout export/import retains that decision.
        if (persistMigration !== false) L.saveLayout(state.layout);
    }

    function setCompanionOptions(id, partial) {
        var w = findWidget(id);
        if (!w || w.type !== 'companion') return { ok: false };
        if (!w.options) w.options = {};
        if (partial && typeof partial.chatUrl === 'string') {
            var chatUrl = partial.chatUrl.trim();
            if (chatUrl) {
                try {
                    var parsedChat = new URL(chatUrl);
                    if (parsedChat.origin !== 'https://chatgpt.com' || parsedChat.username || parsedChat.password) return { ok: false, error: 'invalid-chat-url' };
                    chatUrl = parsedChat.href;
                } catch (error) { return { ok: false, error: 'invalid-chat-url' }; }
            }
            w.options.chatUrl = chatUrl;
        }
        if (partial && typeof partial.animation === 'boolean') {
            w.options.animation = partial.animation;
            if (!partial.animationMode) w.options.animationMode = partial.animation ? 'on' : 'off';
        }
        if (partial && ['auto', 'on', 'off'].indexOf(partial.animationMode) >= 0) w.options.animationMode = partial.animationMode;
        if (partial && typeof partial.greeting === 'string') w.options.greeting = partial.greeting.slice(0, 100);
        applyPositions(); persist();
        return { ok: true };
    }

    function setClockHour12(hour12) {
        var clock = (state.layout.widgets || []).filter(function (w) { return w.type === 'clock'; })[0];
        if (!clock) return { ok: false };
        if (!clock.options) clock.options = {};
        clock.options.hour12 = hour12 !== false;
        persist();
        syncClockHour12Bridge();
        return { ok: true, hour12: clock.options.hour12 };
    }

    function updateFixedWidgetSize(w, property, value) {
        if (!w.options) w.options = {};
        var previous = w.options[property];
        w.options[property] = value;
        var fx = L.applyFixedSize(w, L.viewport());
        var current = state.renderedRects[w.id] || L.toPixels(w);
        var rect = Object.assign({}, current, { width: fx.width, height: fx.height });
        var grid = state.editor ? state.editor.grid : L.homeGrid();
        rect.left += (current.width - rect.width) / 2;
        var next = L.homeFits(rect, otherPixelRects(w.id)) ? rect : L.homeNextFree(rect, w.type, otherPixelRects(w.id), grid);
        if (!next) { w.options[property] = previous; editorMessage('需要更多空位才能調整尺寸'); return { ok: false, error: 'no-space' }; }
        if (state.editor) commitEditorRect(w.id, next);
        else saveHomeRect(w, next, grid);
        applyPositions(); persist();
        return { ok: true };
    }

    function setAppSize(id, size) {
        var w = findWidget(id);
        if (!w || w.type !== 'app') return { ok: false };
        if (size !== 's' && size !== 'm' && size !== 'l') size = 'm';
        var result = updateFixedWidgetSize(w, 'size', size);
        result.size = size;
        return result;
    }

    function setFolderGrid(id, grid) {
        var w = findWidget(id);
        if (!w || w.type !== 'folder') return { ok: false };
        grid = parseInt(grid, 10);
        if (grid !== 2 && grid !== 3 && grid !== 4) grid = 2;
        var result = updateFixedWidgetSize(w, 'grid', grid);
        var el = document.querySelector('.widget[data-id="' + id + '"]');
        if (el) refreshFolderBody(el, w);
        result.grid = grid;
        return result;
    }

    function setAppearance(id, partial) {
        var w = findWidget(id);
        if (!w) return { ok: false };
        if (!w.options) w.options = {};
        var prev = w.options.appearance || {};
        var merged = guardAppearance(Object.assign({}, prev, partial || {}));
        w.options.appearance = merged;
        applyPositions();
        persist();
        return { ok: true, appearance: merged };
    }

    function refreshWeather(id) {
        var w = findWidget(id);
        if (!w || w.type !== 'weather') return { ok: false };
        var el = document.querySelector('.widget[data-id="' + id + '"]');
        if (el) {
            var body = el.querySelector('.weather-body');
            if (body) loadWeatherInto(body, w, { relocate: true, force: true });
        }
        return { ok: true };
    }

    global.NewtabWidgets = {
        init: init,
        enterArrange: enterArrange,
        exitArrange: exitArrange,
        cancelArrange: cancelArrange,
        getEditorState: function () { return state.editor ? { selected: state.editor.selected, dirty: state.editor.dirty, rects: L.clone(state.editor.rects), grid: L.clone(state.editor.grid) } : null; },
        enterEditMode: enterArrange,
        exitEditMode: exitArrange,
        isArranging: isArranging,
        isEditing: isArranging,
        bringToFront: bringToFront,
        moveById: moveById,
        applyPositions: applyPositions,
        addFromCatalog: addFromCatalog,
        previewCatalog: previewCatalog,
        clearCatalogPreview: clearCatalogPreview,
        commitCatalogPreview: commitCatalogPreview,
        addApp: addApp,
        removeById: removeById,
        removeAppByAppId: removeAppByAppId,
        togglePin: togglePin,
        dissolveFolder: dissolveFolder,
        mergeApps: mergeApps,
        renameFolder: renameFolder,
        resetLayout: resetLayout,
        setRailState: setRailState,
        getRailState: getRailState,
        getLayout: function () { return state.layout ? L.clone(state.layout) : null; },
        persist: persist,
        setClockHour12: setClockHour12,
        setAppSize: setAppSize,
        setFolderGrid: setFolderGrid,
        setAppearance: setAppearance,
        setCompanionOptions: setCompanionOptions,
        addAppToFolder: addAppToFolder,
        refreshWeather: refreshWeather,
        openSearchExpand: openSearchExpand,
        closeSearchExpand: closeSearchExpand
    };
})(typeof window !== 'undefined' ? window : this);
