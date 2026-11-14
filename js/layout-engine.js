/**
 * NewtabLayout — schema v4 free coordinates + magnet + collision + resize
 */
(function (global) {
    'use strict';

    var STORAGE_KEY = 'nt_layout_v1';
    var SCHEMA_VERSION = 4;
    var NARROW_BP = 720;
    var MAGNET_PX = 18;
    var GAP_PX = 8;
    var EDGE = 8;
    /** Blue select-ring outer inset (matches CSS --select-ring-inset) */
    var RING_INSET = 10;
    /** Soft magnet: blend toward snap target while dragging (0=none, 1=hard) */
    var SOFT_SNAP_FACTOR = 0.45;
    /** Overlap push damping per iteration */
    var OVERLAP_DAMP = 0.70;
    var OVERLAP_ITERS = 24;

    function collisionGap() {
        return GAP_PX + RING_INSET * 2;
    }

    var WIDGET_TYPES = [
        'clock', 'search', 'app', 'folder',
        'weather', 'notes', 'countdown', 'todo', 'bookmarks', 'companion'
    ];

    // Default size fractions by type
    var DEFAULT_SIZE = {
        clock: { w: 0.22, h: 0.14 },
        search: { w: 0.36, h: 0.09 },
        app: { w: 0.07, h: 0.095 },
        folder: { w: 0.09, h: 0.105 },
        weather: { w: 0.18, h: 0.2 },
        notes: { w: 0.16, h: 0.18 },
        countdown: { w: 0.12, h: 0.14 },
        todo: { w: 0.16, h: 0.22 },
        bookmarks: { w: 0.3, h: 0.08 },
        companion: { w: 0.24, h: 0.45 }
    };

    // Absolute min sizes at ~1200×800 reference; scaled with viewport
    var MIN_PX_REF = {
        clock: { w: 220, h: 80 },
        search: { w: 48, h: 44 },
        app: { w: 52, h: 56 },
        folder: { w: 56, h: 66 },
        weather: { w: 160, h: 100 },
        notes: { w: 140, h: 100 },
        countdown: { w: 120, h: 80 },
        todo: { w: 140, h: 120 },
        bookmarks: { w: 200, h: 48 },
        companion: { w: 160, h: 200 }
    };

    /** Discrete size steps @1200×800 (3 tiers S/M/L) */
    var SIZE_STEPS = {
        search:     [{ w: 160, h: 56 }, { w: 320, h: 56 }, { w: 480, h: 56 }],
        clock:      [{ w: 160, h: 80 }, { w: 240, h: 100 }, { w: 320, h: 140 }],
        weather:    [{ w: 160, h: 120 }, { w: 220, h: 160 }, { w: 280, h: 220 }],
        notes:      [{ w: 160, h: 120 }, { w: 200, h: 160 }, { w: 280, h: 220 }],
        countdown:  [{ w: 120, h: 100 }, { w: 160, h: 130 }, { w: 200, h: 180 }],
        bookmarks:  [{ w: 280, h: 88 }, { w: 400, h: 88 }, { w: 560, h: 88 }],
        todo:       [{ w: 180, h: 140 }, { w: 200, h: 180 }, { w: 240, h: 240 }],
        companion:  [{ w: 192, h: 260 }, { w: 280, h: 360 }, { w: 376, h: 480 }]
    };

    var APP_SIZE_PX = {
        s: { w: 56, h: 66, icon: 36 },
        m: { w: 68, h: 80, icon: 48 },
        l: { w: 84, h: 98, icon: 64 }
    };

    var FOLDER_GRID_PX = {
        2: { w: 88, h: 96, cols: 2, rows: 2, max: 4 },
        3: { w: 104, h: 112, cols: 3, rows: 3, max: 9 },
        4: { w: 120, h: 128, cols: 4, rows: 4, max: 16 }
    };

    var FREE_RESIZE_HANDLES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
    var HANDLE_MATRIX = {
        search: FREE_RESIZE_HANDLES.slice(),
        bookmarks: FREE_RESIZE_HANDLES.slice(),
        todo: FREE_RESIZE_HANDLES.slice(),
        clock: FREE_RESIZE_HANDLES.slice(),
        weather: FREE_RESIZE_HANDLES.slice(),
        notes: FREE_RESIZE_HANDLES.slice(),
        countdown: FREE_RESIZE_HANDLES.slice(),
        companion: FREE_RESIZE_HANDLES.slice(),
        app: [],
        folder: []
    };

    var MAX_FRAC = {
        clock: { w: 0.7, h: 0.45 },
        search: { w: 0.85, h: 0.25 },
        app: { w: 0.2, h: 0.28 },
        folder: { w: 0.22, h: 0.3 },
        weather: { w: 0.5, h: 0.5 },
        notes: { w: 0.6, h: 0.5 },
        countdown: { w: 0.35, h: 0.35 },
        todo: { w: 0.5, h: 0.55 },
        bookmarks: { w: 0.8, h: 0.18 },
        companion: { w: 0.7, h: 0.9 }
    };

    var SINGLETON_TYPES = {
        clock: true,
        search: true,
        weather: true,
        bookmarks: true,
        companion: true
    };

    function clone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    function clamp01(n, min, max) {
        if (typeof min !== 'number') min = 0;
        if (typeof max !== 'number') max = 1;
        if (isNaN(n)) return min;
        if (n < min) return min;
        if (n > max) return max;
        return n;
    }

    function defaultRail() {
        return { open: false, width: 300, tab: 'personalize' };
    }

    function defaultLayout() {
        var viewWidth = global.innerWidth || 1440;
        var center = viewWidth >= 1100 ? 0.365 : 0.5;
        var clockWidth = Math.min(560, viewWidth * 0.7) / viewWidth;
        var searchWidth = Math.min(560, viewWidth * 0.85) / viewWidth;
        var shortcutGap = Math.min(92, viewWidth * 0.22);
        var layout = {
            v: SCHEMA_VERSION,
            rail: defaultRail(),
            widgets: [
                {
                    id: 'clock-1',
                    type: 'clock',
                    x: center - clockWidth / 2,
                    y: 0.24,
                    w: clockWidth,
                    h: 0.235,
                    pinned: false,
                    z: 1,
                    options: { hour12: false }
                },
                {
                    id: 'search-1',
                    type: 'search',
                    x: center - searchWidth / 2,
                    y: 0.505,
                    w: searchWidth,
                    h: 0.09,
                    pinned: false,
                    z: 2,
                    options: {}
                },
                {
                    id: 'app-images',
                    type: 'app',
                    x: center - (1.5 * shortcutGap + 34) / viewWidth,
                    y: 0.64,
                    w: 0.07,
                    h: 0.11,
                    pinned: false,
                    z: 3,
                    options: { appId: 'images' }
                },
                {
                    id: 'app-gmail',
                    type: 'app',
                    x: center - (0.5 * shortcutGap + 34) / viewWidth,
                    y: 0.64,
                    w: 0.07,
                    h: 0.11,
                    pinned: false,
                    z: 4,
                    options: { appId: 'gmail' }
                },
                {
                    id: 'app-youtube', type: 'app',
                    x: center + (0.5 * shortcutGap - 34) / viewWidth,
                    y: 0.64, w: 0.07, h: 0.11, pinned: false, z: 5,
                    options: { appId: 'youtube' }
                },
                {
                    id: 'app-maps', type: 'app',
                    x: center + (1.5 * shortcutGap - 34) / viewWidth,
                    y: 0.64, w: 0.07, h: 0.11, pinned: false, z: 6,
                    options: { appId: 'maps' }
                }
            ]
        };
        layout.widgets.forEach(function (w, index) {
            w.options.homeSeed = index < 2 ? w.type : index - 2;
            var rect = homeDefaultRect(w, homeGrid());
            w.x = rect.left / viewWidth; w.y = rect.top / (global.innerHeight || 900);
            w.w = rect.width / viewWidth; w.h = rect.height / (global.innerHeight || 900);
        });
        return layout;
    }

    function normalizeRail(rail) {
        var d = defaultRail();
        if (!rail || typeof rail !== 'object') return d;
        var w = parseInt(rail.width, 10);
        if (isNaN(w) || w < 240) w = d.width;
        if (w > 400) w = 400;
        var tab = rail.tab || d.tab;
        if (['components', 'apps', 'personalize', 'about', 'catalog', 'installed'].indexOf(tab) < 0) {
            tab = d.tab;
        }
        if (tab === 'catalog' || tab === 'installed') tab = 'components';
        return { open: !!rail.open, width: w, tab: tab };
    }

    function defaultSizeFor(type) {
        return DEFAULT_SIZE[type] || { w: 0.12, h: 0.12 };
    }

    function minPxFor(type, vp) {
        var ref = MIN_PX_REF[type] || { w: 48, h: 48 };
        var vw = (vp && vp.vw) || viewport().vw;
        var vh = (vp && vp.vh) || viewport().vh;
        // Scale mins with viewport so zoom/small screens still fit
        var scaleW = Math.max(0.55, Math.min(1.2, vw / 1200));
        var scaleH = Math.max(0.55, Math.min(1.2, vh / 800));
        var mw = Math.round(ref.w * scaleW);
        var mh = Math.round(ref.h * scaleH);
        // Never larger than half the usable area
        mw = Math.min(mw, Math.floor((vw - EDGE * 2) * 0.5));
        mh = Math.min(mh, Math.floor((vh - EDGE * 2) * 0.45));
        return { w: Math.max(40, mw), h: Math.max(36, mh) };
    }

    function maxPxFor(type, vp) {
        var frac = MAX_FRAC[type] || { w: 0.9, h: 0.9 };
        var vw = (vp && vp.vw) || viewport().vw;
        var vh = (vp && vp.vh) || viewport().vh;
        return {
            w: Math.floor((vw - EDGE * 2) * frac.w),
            h: Math.floor((vh - EDGE * 2) * frac.h)
        };
    }

    function enrichWidget(w) {
        var type = String(w.type || '');
        var ds = defaultSizeFor(type);
        var opts = w.options && typeof w.options === 'object' && !Array.isArray(w.options) ? clone(w.options) : {};
        if (type === 'app') {
            if (opts.size !== 's' && opts.size !== 'm' && opts.size !== 'l') opts.size = 'm';
        }
        if (type === 'folder') {
            var g = parseInt(opts.grid, 10);
            if (g !== 2 && g !== 3 && g !== 4) opts.grid = 2;
            else opts.grid = g;
            if (!Array.isArray(opts.children)) opts.children = [];
            var childIds = Object.create(null);
            opts.children = opts.children.filter(function (child) {
                if (!child || typeof child.appId !== 'string' || !child.appId || childIds[child.appId]) return false;
                childIds[child.appId] = true;
                return true;
            });
            if (typeof opts.name !== 'string' || !opts.name) opts.name = '資料夾';
            else opts.name = String(opts.name).trim().slice(0, 24) || '資料夾';
        }
        if (type === 'clock' && opts.hour12 === undefined) opts.hour12 = true;
        var out = {
            id: String(w.id || ''),
            type: type,
            x: isFinite(parseFloat(w.x)) ? clamp01(parseFloat(w.x), 0, 0.98) : 0.02,
            y: isFinite(parseFloat(w.y)) ? clamp01(parseFloat(w.y), 0, 0.98) : 0.02,
            w: isFinite(parseFloat(w.w)) ? clamp01(parseFloat(w.w), 0.04, 0.95) : ds.w,
            h: isFinite(parseFloat(w.h)) ? clamp01(parseFloat(w.h), 0.04, 0.95) : ds.h,
            pinned: !!(w.pinned || w.locked),
            z: parseInt(w.z, 10) || 1,
            options: opts
        };
        if (isNaN(out.x)) out.x = 0.02;
        if (isNaN(out.y)) out.y = 0.02;
        if (isNaN(out.w) || out.w < 0.04) out.w = ds.w;
        if (isNaN(out.h) || out.h < 0.04) out.h = ds.h;
        if (out.x + out.w > 1) out.x = Math.max(0, 1 - out.w);
        if (out.y + out.h > 1) out.y = Math.max(0, 1 - out.h);
        return out;
    }

    function scaleStepsForVp(type, vp) {
        vp = vp || viewport();
        var steps = SIZE_STEPS[type];
        if (!steps) return [];
        var scaleW = vp.vw / 1200;
        var scaleH = vp.vh / 800;
        return steps.map(function (s) {
            return {
                w: Math.max(40, Math.round(s.w * scaleW)),
                h: Math.max(36, Math.round(s.h * scaleH))
            };
        });
    }

    function nearestStep(type, rect, vp) {
        var steps = scaleStepsForVp(type, vp);
        if (!steps.length) {
            return { w: rect.width, h: rect.height };
        }
        var best = steps[0];
        var bestDist = Infinity;
        var i, s, dist;
        for (i = 0; i < steps.length; i++) {
            s = steps[i];
            if (type === 'search' || type === 'bookmarks') {
                dist = Math.abs(rect.width - s.w);
            } else if (type === 'todo') {
                dist = Math.abs(rect.height - s.h);
            } else {
                dist = Math.hypot(rect.width - s.w, rect.height - s.h);
            }
            if (dist < bestDist) {
                bestDist = dist;
                best = s;
            }
        }
        return best;
    }

    function snapRectToStep(type, rect, vp) {
        if (!SIZE_STEPS[type]) {
            return {
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height
            };
        }
        var step = nearestStep(type, rect, vp);
        var cx = rect.left + rect.width / 2;
        var cy = rect.top + rect.height / 2;
        return clampRect({
            left: cx - step.w / 2,
            top: cy - step.h / 2,
            width: step.w,
            height: step.h
        }, type, vp);
    }

    function applyFixedSize(widget, vp) {
        vp = vp || viewport();
        var scaleW = Math.max(0.7, vp.vw / 1200);
        var scaleH = Math.max(0.7, vp.vh / 800);
        var left = (widget.x || 0) * vp.vw;
        var top = (widget.y || 0) * vp.vh;
        if (widget.type === 'app') {
            var size = (widget.options && widget.options.size) || 'm';
            if (!APP_SIZE_PX[size]) size = 'm';
            var px = APP_SIZE_PX[size];
            return {
                left: left,
                top: top,
                width: px.w,
                height: px.h
            };
        }
        if (widget.type === 'folder') {
            var grid = (widget.options && widget.options.grid) || 2;
            if (!FOLDER_GRID_PX[grid]) grid = 2;
            var fpx = FOLDER_GRID_PX[grid];
            return {
                left: left,
                top: top,
                width: Math.round(fpx.w * scaleW),
                height: Math.round(fpx.h * scaleH)
            };
        }
        return null;
    }

    function resizeAxisFollow(startRect, handle, dx, dy, type, others) {
        var allowed = HANDLE_MATRIX[type] || [];
        if (!handle || allowed.indexOf(handle) < 0) {
            return {
                left: startRect.left,
                top: startRect.top,
                width: startRect.width,
                height: startRect.height
            };
        }
        // Every resizable component follows the chosen edge or corner freely.
        // Keep the legacy function name because the host calls this public API.
        return resizeFromHandle(startRect, handle, dx, dy, type, others || []);
    }

    /** Legacy grid helpers for v3 migration only */
    function legacyMetrics(vw, margin) {
        var COLS = 24;
        var GAP = 6;
        var ROW_HEIGHT = 24;
        var width = Math.max(0, vw - margin * 2);
        var cellW = (width - GAP * (COLS - 1)) / COLS;
        if (cellW < 1) cellW = 1;
        return { cols: COLS, gap: GAP, rowHeight: ROW_HEIGHT, margin: margin, cellWidth: cellW };
    }

    function legacyRect(widget, metrics) {
        var SIZE_MAP = {
            clock: { S: { w: 6, h: 2 }, M: { w: 8, h: 3 }, L: { w: 10, h: 4 } },
            search: { S: { w: 8, h: 2 }, M: { w: 12, h: 2 }, L: { w: 16, h: 2 } }
        };
        var map = SIZE_MAP[widget.type] || { M: { w: 4, h: 2 } };
        var size = widget.size && map[widget.size] ? widget.size : 'M';
        var dim = map[size] || map.M;
        var col = parseInt(widget.col, 10) || 0;
        var row = parseInt(widget.row, 10) || 0;
        var left = metrics.margin + col * (metrics.cellWidth + metrics.gap);
        var top = metrics.margin + row * (metrics.rowHeight + metrics.gap);
        var width = dim.w * metrics.cellWidth + (dim.w - 1) * metrics.gap;
        var height = dim.h * metrics.rowHeight + (dim.h - 1) * metrics.gap;
        return { left: left, top: top, width: width, height: height };
    }

    function migrateFromV3(raw, vw, vh) {
        var margin = 16;
        var metrics = legacyMetrics(vw || 1200, margin);
        var list = Array.isArray(raw.widgets) ? raw.widgets.filter(function (w) {
            return w && w.id && WIDGET_TYPES.indexOf(w.type) >= 0;
        }) : [];
        var widgets = list.map(function (w, i) {
            var px = legacyRect(w, metrics);
            return enrichWidget({
                id: w.id,
                type: w.type,
                x: px.left / (vw || 1200),
                y: px.top / (vh || 800),
                w: px.width / (vw || 1200),
                h: px.height / (vh || 800),
                pinned: !!w.locked,
                z: i + 1,
                options: w.options || {}
            });
        });
        var hasImages = widgets.some(function (w) {
            return w.type === 'app' && w.options && w.options.appId === 'images';
        });
        var hasGmail = widgets.some(function (w) {
            return w.type === 'app' && w.options && w.options.appId === 'gmail';
        });
        if (!hasImages) {
            widgets.push(enrichWidget({
                id: 'app-images', type: 'app', x: 0.84, y: 0.02, w: 0.07, h: 0.11,
                z: 50, options: { appId: 'images' }
            }));
        }
        if (!hasGmail) {
            widgets.push(enrichWidget({
                id: 'app-gmail', type: 'app', x: 0.92, y: 0.02, w: 0.07, h: 0.11,
                z: 51, options: { appId: 'gmail' }
            }));
        }
        var normalized = {
            v: SCHEMA_VERSION,
            rail: normalizeRail(raw.rail),
            widgets: widgets
        };
        if (raw.companionMigrated === true) normalized.companionMigrated = true;
        return normalized;
    }

    function migrateFromV1(raw) {
        var list = Array.isArray(raw.widgets) ? raw.widgets.filter(function (w) {
            return w && w.id && WIDGET_TYPES.indexOf(w.type) >= 0;
        }) : [];
        return {
            v: 3,
            rail: defaultRail(),
            widgets: list.map(function (w) {
                return {
                    id: w.id,
                    type: w.type,
                    col: Math.max(0, (parseInt(w.col, 10) || 0) * 2),
                    row: Math.max(0, (parseInt(w.row, 10) || 0) * 2),
                    size: w.size || 'M',
                    locked: !!w.locked,
                    options: w.options || {}
                };
            })
        };
    }

    function normalizeLayout(raw, vw, vh) {
        if (!raw || typeof raw !== 'object') return defaultLayout();

        if (raw.v === 1) {
            raw = migrateFromV1(raw);
        }
        if (raw.v === 2 || raw.v === 3) {
            raw = migrateFromV3(raw, vw || global.innerWidth || 1200, vh || global.innerHeight || 800);
        }
        if (raw.v !== 4 && !Array.isArray(raw.widgets)) {
            return defaultLayout();
        }

        var list = Array.isArray(raw.widgets) ? raw.widgets : [];
        var widgets = [];
        var seenIds = Object.create(null);
        var seenTypes = Object.create(null);
        list.forEach(function (w) {
            if (!w || !w.id || !w.type) return;
            if (WIDGET_TYPES.indexOf(w.type) < 0) return;
            if (seenIds[String(w.id)] || (SINGLETON_TYPES[w.type] && seenTypes[w.type])) return;
            seenIds[String(w.id)] = true;
            seenTypes[w.type] = true;
            if (typeof w.x !== 'number' && typeof w.col === 'number') {
                var m = migrateFromV3({ v: 3, widgets: [w], rail: raw.rail }, vw, vh);
                if (m.widgets[0]) widgets.push(m.widgets[0]);
                return;
            }
            widgets.push(enrichWidget(w));
        });

        // Normalize stored data, not rendered geometry. toPixels applies the
        // app/folder presets for each viewport. Baking those pixels into the
        // saved fractions here used to move right-edge shortcuts on mobile load
        // or even on an unrelated save (such as opening the settings panel).

        var normalized = {
            v: SCHEMA_VERSION,
            rail: normalizeRail(raw.rail),
            widgets: widgets
        };
        if (raw.companionMigrated === true) normalized.companionMigrated = true;
        return normalized;
    }

    function recognizePreviousDefault(layout) {
        var ids = ['clock-1', 'search-1', 'app-images', 'app-gmail', 'app-youtube', 'app-maps'];
        var widgets = ids.map(function (id) { return layout.widgets.filter(function (w) { return w.id === id; })[0]; });
        if (widgets.some(function (w) { return !w || w.pinned || w.options && w.options.homeSeed !== undefined; })) return layout;
        var clock = widgets[0], search = widgets[1];
        var near = function (a, b) { return Math.abs(a - b) < 0.000001; };
        if (!near(clock.y, 0.24) || !near(clock.h, 0.235) || !near(search.y, 0.505) || !near(search.h, 0.09) || !near(clock.w, search.w) || clock.w >= 0.7) return layout;
        var sourceWidth = 560 / clock.w, center = sourceWidth >= 1100 ? 0.365 : 0.5;
        if (!near(clock.x, center - clock.w / 2) || !near(search.x, clock.x)) return layout;
        var names = ['images', 'gmail', 'youtube', 'maps'];
        for (var i = 0; i < 4; i++) {
            var w = widgets[i + 2];
            if (w.type !== 'app' || !w.options || w.options.appId !== names[i] || !near(w.y, 0.64) || !near(w.w, 0.07) || !near(w.h, 0.11) || !near(w.x, center + ((i - 1.5) * 92 - 34) / sourceWidth)) return layout;
        }
        // Exact fingerprint only. Geometry and every user setting remain stored
        // verbatim; the marker selects the new responsive default projection.
        widgets.forEach(function (w, i) { w.options.homeSeed = i < 2 ? w.type : i - 2; });
        return layout;
    }

    function loadLayout() {
        try {
            var raw = global.localStorage.getItem(STORAGE_KEY);
            if (!raw) return defaultLayout();
            return recognizePreviousDefault(normalizeLayout(
                JSON.parse(raw),
                global.innerWidth || 1200,
                global.innerHeight || 800
            ));
        } catch (e) {
            console.warn('[NewtabLayout] load failed', e);
            return defaultLayout();
        }
    }

    function saveLayout(layout) {
        var normalized = normalizeLayout(
            layout,
            global.innerWidth || 1200,
            global.innerHeight || 800
        );
        var payload = {
            v: SCHEMA_VERSION,
            rail: normalizeRail(normalized.rail),
            widgets: normalized.widgets.map(function (w) {
                return {
                    id: w.id,
                    type: w.type,
                    x: w.x,
                    y: w.y,
                    w: w.w,
                    h: w.h,
                    pinned: !!w.pinned,
                    z: w.z || 1,
                    options: w.options || {}
                };
            })
        };
        if (normalized.companionMigrated) payload.companionMigrated = true;
        try {
            global.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
            return true;
        } catch (e) {
            console.warn('[NewtabLayout] save failed', e);
            return false;
        }
    }

    function viewport() {
        return {
            vw: global.innerWidth || 1200,
            vh: global.innerHeight || 800
        };
    }

    function toPixels(widget, vp) {
        vp = vp || viewport();
        var vw = vp.vw;
        var vh = vp.vh;
        var w = enrichWidget(widget);
        var left, top, width, height, fixed, min, max;
        if (w.type === 'app' || w.type === 'folder') {
            fixed = applyFixedSize(w, vp);
            width = fixed.width;
            height = fixed.height;
            left = fixed.left;
            top = fixed.top;
            if (left + width > vw - EDGE) left = Math.max(EDGE, vw - EDGE - width);
            if (top + height > vh - EDGE) top = Math.max(EDGE, vh - EDGE - height);
            if (left < EDGE) left = EDGE;
            if (top < EDGE) top = EDGE;
            return {
                left: left,
                top: top,
                width: width,
                height: height,
                id: w.id,
                type: w.type,
                pinned: w.pinned,
                z: w.z,
                options: w.options
            };
        }
        min = minPxFor(w.type, vp);
        max = maxPxFor(w.type, vp);
        width = Math.max(min.w, Math.min(max.w, w.w * vw));
        height = Math.max(min.h, Math.min(max.h, w.h * vh));
        // Keep inside viewport when min sizes force growth
        if (width > vw - EDGE * 2) width = Math.max(min.w, vw - EDGE * 2);
        if (height > vh - EDGE * 2) height = Math.max(min.h, vh - EDGE * 2);
        left = w.x * vw;
        top = w.y * vh;
        if (left + width > vw - EDGE) left = Math.max(EDGE, vw - EDGE - width);
        if (top + height > vh - EDGE) top = Math.max(EDGE, vh - EDGE - height);
        if (left < EDGE) left = EDGE;
        if (top < EDGE) top = EDGE;
        return {
            left: left,
            top: top,
            width: width,
            height: height,
            id: w.id,
            type: w.type,
            pinned: w.pinned,
            z: w.z,
            options: w.options
        };
    }

    function fromPixels(id, type, left, top, width, height, extra, vp) {
        vp = vp || viewport();
        var min = minPxFor(type, vp);
        var max = maxPxFor(type, vp);
        width = Math.max(min.w, Math.min(max.w, width));
        height = Math.max(min.h, Math.min(max.h, height));
        var o = extra || {};
        return enrichWidget({
            id: id,
            type: type,
            x: left / vp.vw,
            y: top / vp.vh,
            w: width / vp.vw,
            h: height / vp.vh,
            pinned: !!o.pinned,
            z: o.z || 1,
            options: o.options || {}
        });
    }

    function rectsIntersect(a, b, gap) {
        var g = typeof gap === 'number' ? gap : 0;
        return !(
            a.left + a.width + g <= b.left ||
            b.left + b.width + g <= a.left ||
            a.top + a.height + g <= b.top ||
            b.top + b.height + g <= a.top
        );
    }

    function magnetSnap(rect, others, opts) {
        opts = opts || {};
        var magnet = typeof opts.magnet === 'number' ? opts.magnet : MAGNET_PX;
        var r = {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height
        };
        var i, o, d;
        var bestX = null;
        var bestY = null;
        var bestXd = magnet + 1;
        var bestYd = magnet + 1;
        var vp = viewport();

        // Snap to viewport edges
        d = Math.abs(r.left - EDGE);
        if (d < bestXd) { bestXd = d; bestX = EDGE; }
        d = Math.abs((r.left + r.width) - (vp.vw - EDGE));
        if (d < bestXd) { bestXd = d; bestX = vp.vw - EDGE - r.width; }
        d = Math.abs(r.top - EDGE);
        if (d < bestYd) { bestYd = d; bestY = EDGE; }
        d = Math.abs((r.top + r.height) - (vp.vh - EDGE));
        if (d < bestYd) { bestYd = d; bestY = vp.vh - EDGE - r.height; }

        // Snap to other widgets (edges + centers)
        for (i = 0; i < others.length; i++) {
            o = others[i];
            // left to left
            d = Math.abs(r.left - o.left);
            if (d < bestXd) { bestXd = d; bestX = o.left; }
            // left to right+gap
            d = Math.abs(r.left - (o.left + o.width + GAP_PX));
            if (d < bestXd) { bestXd = d; bestX = o.left + o.width + GAP_PX; }
            // right to left-gap
            d = Math.abs((r.left + r.width) - (o.left - GAP_PX));
            if (d < bestXd) { bestXd = d; bestX = o.left - GAP_PX - r.width; }
            // right to right
            d = Math.abs((r.left + r.width) - (o.left + o.width));
            if (d < bestXd) { bestXd = d; bestX = o.left + o.width - r.width; }
            // centers X
            d = Math.abs((r.left + r.width / 2) - (o.left + o.width / 2));
            if (d < bestXd) { bestXd = d; bestX = o.left + o.width / 2 - r.width / 2; }

            d = Math.abs(r.top - o.top);
            if (d < bestYd) { bestYd = d; bestY = o.top; }
            d = Math.abs(r.top - (o.top + o.height + GAP_PX));
            if (d < bestYd) { bestYd = d; bestY = o.top + o.height + GAP_PX; }
            d = Math.abs((r.top + r.height) - (o.top - GAP_PX));
            if (d < bestYd) { bestYd = d; bestY = o.top - GAP_PX - r.height; }
            d = Math.abs((r.top + r.height) - (o.top + o.height));
            if (d < bestYd) { bestYd = d; bestY = o.top + o.height - r.height; }
            // centers Y
            d = Math.abs((r.top + r.height / 2) - (o.top + o.height / 2));
            if (d < bestYd) { bestYd = d; bestY = o.top + o.height / 2 - r.height / 2; }
        }

        var soft = opts.soft !== false;
        var factor = typeof opts.softFactor === 'number' ? opts.softFactor : SOFT_SNAP_FACTOR;
        if (bestXd <= magnet && bestX != null) {
            r.left = soft ? r.left + (bestX - r.left) * factor : bestX;
        }
        if (bestYd <= magnet && bestY != null) {
            r.top = soft ? r.top + (bestY - r.top) * factor : bestY;
        }
        return r;
    }

    function clampRect(rect, type, vp) {
        vp = vp || viewport();
        var r = {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height
        };
        if (type) {
            var min = minPxFor(type, vp);
            var max = maxPxFor(type, vp);
            r.width = Math.max(min.w, Math.min(max.w, r.width));
            r.height = Math.max(min.h, Math.min(max.h, r.height));
        }
        if (r.width > vp.vw - EDGE * 2) r.width = Math.max(40, vp.vw - EDGE * 2);
        if (r.height > vp.vh - EDGE * 2) r.height = Math.max(36, vhSafe(vp));
        if (r.left < EDGE) r.left = EDGE;
        if (r.top < EDGE) r.top = EDGE;
        if (r.left + r.width > vp.vw - EDGE) r.left = Math.max(EDGE, vp.vw - EDGE - r.width);
        if (r.top + r.height > vp.vh - EDGE) r.top = Math.max(EDGE, vp.vh - EDGE - r.height);
        return r;
    }

    function vhSafe(vp) {
        return Math.max(36, vp.vh - EDGE * 2);
    }

    function normalizeSkipIds(skipIds) {
        if (!skipIds) return {};
        var map = {};
        var list = Array.isArray(skipIds) ? skipIds : [skipIds];
        list.forEach(function (id) {
            if (id != null && id !== '') map[String(id)] = true;
        });
        return map;
    }

    function resolveOverlap(rect, others, skipIds) {
        var skip = normalizeSkipIds(skipIds);
        var r = {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height
        };
        var gap = collisionGap();
        var iter, i, o, overlap, pushL, pushR, pushT, pushB, minPush, candidates;
        for (iter = 0; iter < OVERLAP_ITERS; iter++) {
            overlap = false;
            for (i = 0; i < others.length; i++) {
                o = others[i];
                if (o && o.id != null && skip[String(o.id)]) continue;
                if (!rectsIntersect(r, o, gap)) continue;
                overlap = true;
                // Distance needed to clear each side (with ring-aware gap)
                pushL = (o.left - gap) - (r.left + r.width);
                pushR = (o.left + o.width + gap) - r.left;
                pushT = (o.top - gap) - (r.top + r.height);
                pushB = (o.top + o.height + gap) - r.top;

                candidates = [
                    { a: 'x', v: pushL },
                    { a: 'x', v: pushR },
                    { a: 'y', v: pushT },
                    { a: 'y', v: pushB }
                ];
                minPush = null;
                candidates.forEach(function (p) {
                    var vp = viewport();
                    var nextLeft = r.left + (p.a === 'x' ? p.v : 0);
                    var nextTop = r.top + (p.a === 'y' ? p.v : 0);
                    if (nextLeft < EDGE || nextTop < EDGE || nextLeft + r.width > vp.vw - EDGE || nextTop + r.height > vp.vh - EDGE) return;
                    if (minPush == null || Math.abs(p.v) < Math.abs(minPush.v)) minPush = p;
                });
                if (minPush) {
                    var damp = iter < OVERLAP_ITERS - 1 ? OVERLAP_DAMP : 1;
                    if (minPush.a === 'x') r.left += minPush.v * damp;
                    else r.top += minPush.v * damp;
                }
            }
            r = clampRect(r);
            if (!overlap) break;
        }
        // If adjacent obstacles trapped the local pushes, try their free edges.
        var obstacles = others.filter(function (o) { return o && !skip[String(o.id)]; });
        if (obstacles.some(function (o) { return rectsIntersect(r, o, gap); })) {
            var vp = viewport();
            var xs = [EDGE, vp.vw - EDGE - r.width, rect.left];
            var ys = [EDGE, vp.vh - EDGE - r.height, rect.top];
            obstacles.forEach(function (o) {
                xs.push(o.left - gap - r.width, o.left + o.width + gap);
                ys.push(o.top - gap - r.height, o.top + o.height + gap);
            });
            var best = null;
            var bestDistance = Infinity;
            xs.forEach(function (x) {
                if (x < EDGE || x + r.width > vp.vw - EDGE) return;
                ys.forEach(function (y) {
                    if (y < EDGE || y + r.height > vp.vh - EDGE) return;
                    var candidate = { left: x, top: y, width: r.width, height: r.height };
                    if (obstacles.some(function (o) { return rectsIntersect(candidate, o, gap); })) return;
                    var distance = Math.pow(x - rect.left, 2) + Math.pow(y - rect.top, 2);
                    if (distance < bestDistance) { best = candidate; bestDistance = distance; }
                });
            });
            if (best) r = best;
        }
        return r;
    }

    function placeRect(rect, others, type, opts) {
        opts = opts || {};
        var skipIds = opts.skipIds;
        var filtered = others;
        if (skipIds) {
            var skip = normalizeSkipIds(skipIds);
            filtered = (others || []).filter(function (o) {
                return !(o && o.id != null && skip[String(o.id)]);
            });
        }
        var r = clampRect(rect, type);
        // placeRect: hard snap (soft only during live drag)
        r = magnetSnap(r, filtered, { soft: false });
        r = clampRect(r, type);
        r = resolveOverlap(r, filtered, skipIds);
        return clampRect(r, type);
    }

    /**
     * Resize rect from a handle; keeps opposite corner/edge fixed.
     * handle: n|s|e|w|ne|nw|se|sw
     */
    function resizeFromHandle(startRect, handle, dx, dy, type, others) {
        var r = {
            left: startRect.left,
            top: startRect.top,
            width: startRect.width,
            height: startRect.height
        };
        var right = r.left + r.width;
        var bottom = r.top + r.height;

        if (handle.indexOf('e') >= 0) right = startRect.left + startRect.width + dx;
        if (handle.indexOf('w') >= 0) r.left = startRect.left + dx;
        if (handle.indexOf('s') >= 0) bottom = startRect.top + startRect.height + dy;
        if (handle.indexOf('n') >= 0) r.top = startRect.top + dy;

        r.width = right - r.left;
        r.height = bottom - r.top;

        // Normalize inverted drag
        if (r.width < 0) {
            r.left += r.width;
            r.width = Math.abs(r.width);
        }
        if (r.height < 0) {
            r.top += r.height;
            r.height = Math.abs(r.height);
        }

        r = clampRect(r, type);

        // Magnet size edges to neighbors while resizing
        r = magnetResize(r, handle, others);
        r = clampRect(r, type);
        r = resolveOverlap(r, others || []);
        return clampRect(r, type);
    }

    /**
     * Fixed-aspect resize from edge handles only (n|s|e|w).
     * Locks aspect = startRect.width / startRect.height for the gesture.
     * Opposite edge anchored; other axis centered. Corners unsupported.
     */
    function resizeWithRatio(startRect, handle, dx, dy, type, others) {
        if (!handle || handle.length !== 1 || 'nsew'.indexOf(handle) < 0) {
            return {
                left: startRect.left,
                top: startRect.top,
                width: startRect.width,
                height: startRect.height
            };
        }

        var aspect = startRect.width / Math.max(1, startRect.height);
        if (!isFinite(aspect) || aspect <= 0) aspect = 1;

        var r = {
            left: startRect.left,
            top: startRect.top,
            width: startRect.width,
            height: startRect.height
        };
        var cx = startRect.left + startRect.width / 2;
        var cy = startRect.top + startRect.height / 2;
        var newW;
        var newH;

        if (handle === 'e') {
            newW = Math.max(1, startRect.width + dx);
            newH = newW / aspect;
            r.left = startRect.left;
            r.width = newW;
            r.height = newH;
            r.top = cy - newH / 2;
        } else if (handle === 'w') {
            newW = Math.max(1, startRect.width - dx);
            newH = newW / aspect;
            r.width = newW;
            r.height = newH;
            r.left = (startRect.left + startRect.width) - newW;
            r.top = cy - newH / 2;
        } else if (handle === 's') {
            newH = Math.max(1, startRect.height + dy);
            newW = newH * aspect;
            r.top = startRect.top;
            r.height = newH;
            r.width = newW;
            r.left = cx - newW / 2;
        } else if (handle === 'n') {
            newH = Math.max(1, startRect.height - dy);
            newW = newH * aspect;
            r.height = newH;
            r.width = newW;
            r.top = (startRect.top + startRect.height) - newH;
            r.left = cx - newW / 2;
        }

        r = clampRect(r, type);
        // Re-project aspect after clamp (prefer width, recompute height centered)
        var clampedAspect = r.width / Math.max(1, r.height);
        if (Math.abs(clampedAspect - aspect) > 0.02) {
            var midX = r.left + r.width / 2;
            var midY = r.top + r.height / 2;
            if (handle === 'e' || handle === 'w') {
                r.height = r.width / aspect;
                r.top = midY - r.height / 2;
            } else {
                r.width = r.height * aspect;
                r.left = midX - r.width / 2;
            }
            r = clampRect(r, type);
        }

        // Optional edge magnet — re-project if aspect breaks badly
        var before = { left: r.left, top: r.top, width: r.width, height: r.height };
        r = magnetResize(r, handle, others || []);
        var a2 = r.width / Math.max(1, r.height);
        if (Math.abs(a2 - aspect) > 0.05) {
            r = before;
        }
        r = clampRect(r, type);
        r = resolveOverlap(r, others || []);
        return clampRect(r, type);
    }

    function magnetResize(rect, handle, others) {
        if (!others || !others.length) return rect;
        var r = {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height
        };
        var magnet = MAGNET_PX;
        var i, o, d, best, edge;

        if (handle.indexOf('e') >= 0) {
            edge = r.left + r.width;
            best = magnet + 1;
            var snapE = null;
            for (i = 0; i < others.length; i++) {
                o = others[i];
                d = Math.abs(edge - o.left + GAP_PX);
                if (d < best) { best = d; snapE = o.left - GAP_PX; }
                d = Math.abs(edge - (o.left + o.width));
                if (d < best) { best = d; snapE = o.left + o.width; }
            }
            if (snapE != null && best <= magnet) r.width = snapE - r.left;
        }
        if (handle.indexOf('w') >= 0) {
            edge = r.left;
            best = magnet + 1;
            var snapW = null;
            for (i = 0; i < others.length; i++) {
                o = others[i];
                d = Math.abs(edge - (o.left + o.width + GAP_PX));
                if (d < best) { best = d; snapW = o.left + o.width + GAP_PX; }
                d = Math.abs(edge - o.left);
                if (d < best) { best = d; snapW = o.left; }
            }
            if (snapW != null && best <= magnet) {
                var right = r.left + r.width;
                r.left = snapW;
                r.width = right - r.left;
            }
        }
        if (handle.indexOf('s') >= 0) {
            edge = r.top + r.height;
            best = magnet + 1;
            var snapS = null;
            for (i = 0; i < others.length; i++) {
                o = others[i];
                d = Math.abs(edge - o.top + GAP_PX);
                if (d < best) { best = d; snapS = o.top - GAP_PX; }
                d = Math.abs(edge - (o.top + o.height));
                if (d < best) { best = d; snapS = o.top + o.height; }
            }
            if (snapS != null && best <= magnet) r.height = snapS - r.top;
        }
        if (handle.indexOf('n') >= 0) {
            edge = r.top;
            best = magnet + 1;
            var snapN = null;
            for (i = 0; i < others.length; i++) {
                o = others[i];
                d = Math.abs(edge - (o.top + o.height + GAP_PX));
                if (d < best) { best = d; snapN = o.top + o.height + GAP_PX; }
                d = Math.abs(edge - o.top);
                if (d < best) { best = d; snapN = o.top; }
            }
            if (snapN != null && best <= magnet) {
                var bottom = r.top + r.height;
                r.top = snapN;
                r.height = bottom - r.top;
            }
        }
        return r;
    }

    /**
     * On viewport change: keep every widget inside and de-overlap lightly.
     */
    function reflowLayout(layout) {
        var base = normalizeLayout(layout);
        var vp = viewport();
        var placed = [];
        // Sort by z so lower layers settle first
        var sorted = base.widgets.slice().sort(function (a, b) {
            return (a.z || 0) - (b.z || 0);
        });
        sorted.forEach(function (w) {
            var px = toPixels(w, vp);
            var others = placed.slice();
            var next = placeRect(px, others, w.type);
            var updated = fromPixels(w.id, w.type, next.left, next.top, next.width, next.height, {
                pinned: w.pinned,
                z: w.z,
                options: w.options
            });
            // Write back into original widget objects by id
            var target = base.widgets.filter(function (x) { return x.id === w.id; })[0];
            if (target) {
                target.x = updated.x;
                target.y = updated.y;
                target.w = updated.w;
                target.h = updated.h;
            }
            placed.push(next);
        });
        return base;
    }

    function hasType(layout, type) {
        return (layout.widgets || []).some(function (w) { return w.type === type; });
    }

    function hasApp(layout, appId) {
        return (layout.widgets || []).some(function (w) {
            if (w.type === 'app' && w.options && w.options.appId === appId) return true;
            if (w.type === 'folder' && w.options && Array.isArray(w.options.children)) {
                return w.options.children.some(function (c) { return c.appId === appId; });
            }
            return false;
        });
    }

    function addWidget(layout, type, opts) {
        var base = normalizeLayout(layout);
        opts = opts || {};
        if (WIDGET_TYPES.indexOf(type) < 0) {
            return { ok: false, error: 'unknown-type', layout: base };
        }
        if (SINGLETON_TYPES[type] && hasType(base, type)) {
            return { ok: false, error: 'singleton', layout: base };
        }
        if (type === 'app') {
            var appId = opts.appId;
            if (!appId) return { ok: false, error: 'no-appId', layout: base };
            if (hasApp(base, appId)) return { ok: false, error: 'singleton', layout: base };
        }

        var ds = defaultSizeFor(type);
        var id;
        if (type === 'clock') id = 'clock-1';
        else if (type === 'search') id = 'search-1';
        else if (type === 'weather') id = 'weather-1';
        else if (type === 'bookmarks') id = 'bookmarks-1';
        else if (type === 'companion') id = 'companion-1';
        else if (type === 'app') id = 'app-' + opts.appId;
        else {
            var prefix = type + '-' + Date.now();
            id = prefix;
            var suffix = 1;
            while (base.widgets.some(function (w) { return w.id === id; })) id = prefix + '-' + suffix++;
        }

        var maxZ = 0;
        base.widgets.forEach(function (w) { if (w.z > maxZ) maxZ = w.z; });

        var vp = viewport();
        var width = ds.w * vp.vw;
        var height = ds.h * vp.vh;
        var left = typeof opts.left === 'number' ? opts.left : (vp.vw - width) / 2;
        var top = typeof opts.top === 'number' ? opts.top : vp.vh * 0.2;
        var others = base.widgets.map(function (w) {
            var px = toPixels(w);
            px.id = w.id;
            return px;
        });
        var placed = placeRect({ left: left, top: top, width: width, height: height }, others, type);
        var defaultOpts = {};
        if (type === 'app') defaultOpts = { appId: opts.appId };
        else if (type === 'notes') defaultOpts = { content: '', updatedAt: Date.now() };
        else if (type === 'countdown') defaultOpts = { title: '倒數', targetDate: '' };
        else if (type === 'todo') defaultOpts = { items: [] };
        else if (type === 'bookmarks') defaultOpts = { links: [] };
        else if (type === 'weather') defaultOpts = { lat: null, lon: null, city: '' };
        else if (type === 'folder') defaultOpts = { name: '資料夾', grid: 2, children: [] };
        else if (type === 'companion') defaultOpts = { animationMode: 'auto' };
        else defaultOpts = opts.options || {};
        if (type === 'app') {
            defaultOpts.size = (opts.options && opts.options.size) || 'm';
            defaultOpts.appId = opts.appId;
        }
        var placeW = placed.width;
        var placeH = placed.height;
        if (type === 'app' || type === 'folder') {
            var tmp = enrichWidget({
                id: id,
                type: type,
                x: placed.left / (viewport().vw),
                y: placed.top / (viewport().vh),
                w: 0.1,
                h: 0.1,
                options: opts.options ? Object.assign({}, defaultOpts, opts.options) : defaultOpts
            });
            var fx = applyFixedSize(tmp);
            if (fx) {
                placeW = fx.width;
                placeH = fx.height;
            }
        } else if (SIZE_STEPS[type]) {
            var sn = snapRectToStep(type, {
                left: placed.left,
                top: placed.top,
                width: placeW,
                height: placeH
            });
            placeW = sn.width;
            placeH = sn.height;
            placed.left = sn.left;
            placed.top = sn.top;
        }
        var widget = fromPixels(id, type, placed.left, placed.top, placeW, placeH, {
            pinned: false,
            z: maxZ + 1,
            options: opts.options ? Object.assign({}, defaultOpts, opts.options) : defaultOpts
        });
        base.widgets.push(widget);
        return { ok: true, layout: base, widget: widget };
    }

    function removeWidget(layout, id) {
        var base = normalizeLayout(layout);
        base.widgets = base.widgets.filter(function (w) { return w.id !== id; });
        return { ok: true, layout: base };
    }

    /** Home editing uses stable cells; existing saved rectangles are not migrated. */
    function homeGrid(vw, vh) {
        vw = vw || viewport().vw; vh = vh || viewport().vh;
        var narrow = vw <= 600;
        var cols = narrow ? 4 : Math.max(1, Math.floor((vw - 48) / 96));
        // Extend the original centered lattice in paired columns. Its phase
        // stays identical, so old placements and the default composition do
        // not shift by half a cell on wide screens. Edges remain usable below.
        if (!narrow && cols > 14) cols -= cols % 2;
        var pitch = narrow ? (vw - 40) / cols : 96;
        return { width: vw, height: vh, columns: cols, pitchX: pitch, pitchY: 104, stepX: pitch / 8, stepY: 13,
            left: (vw - cols * pitch) / 2, top: narrow ? 96 : Math.max(0, (vh - 760) / 2) + 24, gap: 8, narrow: narrow };
    }

    function homeStepX(grid) { return grid.stepX || grid.pitchX / 8; }
    function homeStepY(grid) { return grid.stepY || grid.pitchY / 8; }

    function homeDefaultRect(widget, grid) {
        var seed = widget.options && widget.options.homeSeed;
        // The initial arrangement is centered; the editable canvas is not
        // limited to this composition. Keep this separate from homeGrid.
        if (!grid.narrow && grid.columns > 14) grid = Object.assign({}, grid, { columns: 14, left: (grid.width - 14 * grid.pitchX) / 2 });
        if (seed === 'companion') {
            var character = homeNewFootprint('companion', widget.options, grid);
            var clockSpan = Math.min(grid.columns, 6);
            var clockCol = grid.width < 1100 ? Math.floor((grid.columns - clockSpan) / 2) : Math.max(0, Math.floor(grid.columns * 0.365 - clockSpan / 2));
            var companionCol = clockCol + clockSpan + 1;
            var besideClock = !grid.narrow && companionCol + 3 <= grid.columns;
            return { left: besideClock ? grid.left + companionCol * grid.pitchX + 4 : (grid.width - character.width) / 2,
                top: grid.top + (besideClock ? 1 : grid.narrow && grid.height < 760 ? 4 : 5) * grid.pitchY,
                width: character.width, height: character.height };
        }
        if (seed !== 'clock' && seed !== 'search' && !(typeof seed === 'number' && seed >= 0 && seed < 4)) return null;
        var span = Math.min(grid.columns, grid.narrow ? 4 : 6);
        var base = grid.narrow ? 0 : grid.width < 1100 ? Math.floor((grid.columns - span) / 2) : Math.max(0, Math.floor(grid.columns * 0.365 - span / 2));
        var firstRow = grid.narrow ? (grid.height >= 760 ? 1 : 0) : 1;
        var width = span * grid.pitchX - grid.gap;
        if (seed === 'clock') return { left: grid.left + base * grid.pitchX + 4, top: grid.top + firstRow * 104, width: width, height: 200 };
        if (seed === 'search') return { left: grid.left + base * grid.pitchX + 4, top: grid.top + (firstRow + 2) * 104, width: width, height: 96 };
        var preset = APP_SIZE_PX[widget.options.size || 'm'] || APP_SIZE_PX.m;
        var appWidth = grid.width <= 350 && preset.w <= 68 ? Math.min(preset.w, 64) : preset.w;
        var appCol = base + Math.max(0, Math.floor((span - 4) / 2)) + seed;
        return { left: grid.left + appCol * grid.pitchX + (grid.pitchX - appWidth) / 2,
            top: grid.top + (firstRow + 3) * 104, width: appWidth, height: preset.h };
    }

    function homeColumnSpan(width, type, grid) {
        return Math.max(1, Math.ceil((width + (type === 'app' || type === 'folder' ? 6 : grid.gap) - 0.01) / grid.pitchX));
    }

    function homeNewFootprint(type, options, grid) {
        options = options || {};
        if (type === 'companion') return { width: grid.narrow ? 160 : Math.min(280, grid.columns * grid.pitchX - grid.gap), height: grid.narrow ? 208 : 360 };
        if (type === 'app') {
            var app = APP_SIZE_PX[options.size || 'm'] || APP_SIZE_PX.m;
            return { width: grid.narrow && grid.width <= 350 && app.w <= 68 ? Math.min(64, app.w) : app.w, height: app.h };
        }
        if (type === 'folder') {
            var folder = FOLDER_GRID_PX[options.grid || 2] || FOLDER_GRID_PX[2];
            return { width: folder.w, height: folder.h };
        }
        // New cards use semantic spans of the home grid. The old catalogue
        // size fractions scale with the entire monitor and would produce
        // 850–950px cards on a 5120px display. Canvas width is not card size.
        var spans = { clock: [6, 2], search: [6, 1], notes: [3, 2], weather: [4, 4],
            todo: [3, 2], countdown: [3, 2], bookmarks: [4, 1] };
        var span = spans[type] || [3, 2];
        return { width: Math.min(grid.columns, grid.narrow ? 4 : span[0]) * grid.pitchX - grid.gap,
            height: span[1] * grid.pitchY - grid.gap };
    }

    function homeColumnOffset(width, type, grid) {
        return type === 'app' || type === 'folder' ? (homeColumnSpan(width, type, grid) * grid.pitchX - width) / 2 : grid.gap / 2;
    }

    function homePlacement(rect, type, grid) {
        var offset = homeColumnOffset(rect.width, type, grid);
        var colSpan = (rect.width + grid.gap) / grid.pitchX;
        var rowSpan = (rect.height + grid.gap) / grid.pitchY;
        return { v: 3, columns: grid.columns, col: (rect.left - grid.left - offset) / grid.pitchX,
            edge: Math.abs(rect.left - 16) < 0.1 ? 'left' : Math.abs(rect.left + rect.width - grid.width + 16) < 0.1 ? 'right' : null,
            edgeY: !grid.narrow && Math.abs(rect.top - 16) < 0.1 ? 'top' : !grid.narrow && Math.abs(rect.top + rect.height - grid.height + 16) < 0.1 ? 'bottom' : null,
            row: (rect.top - grid.top) / grid.pitchY, width: rect.width, height: rect.height,
            spanX: type !== 'app' && type !== 'folder' && Math.abs(colSpan - Math.round(colSpan)) < 0.01 ? Math.round(colSpan) : null,
            spanY: type !== 'app' && type !== 'folder' && Math.abs(rowSpan - Math.round(rowSpan)) < 0.01 ? Math.round(rowSpan) : null };
    }

    function homePlacementRect(placement, type, grid) {
        var p = placement;
        if (!p || (p.v !== 2 && p.v !== 3) || !['columns', 'col', 'row', 'width', 'height'].every(function (k) { return typeof p[k] === 'number' && isFinite(p[k]); }) || p.width <= 0 || p.height <= 0) return null;
        var width = p.spanX ? Math.min(grid.columns, p.spanX) * grid.pitchX - grid.gap : p.width;
        if (type === 'app' && grid.narrow && grid.width <= 350 && width <= 68) width = Math.min(width, 64);
        width = Math.min(width, p.v === 3 ? grid.width - 32 : Math.min(grid.columns, p.columns > 14 ? grid.columns : 14) * grid.pitchX - grid.gap);
        var height = p.spanY ? p.spanY * grid.pitchY - grid.gap : p.height;
        var offset = homeColumnOffset(width, type, grid);
        var projectionColumns = p.v === 2 ? Math.min(14, grid.columns) : grid.columns;
        var projectionLeft = (grid.width - projectionColumns * grid.pitchX) / 2;
        var col = p.col + Math.floor((projectionColumns - p.columns) / 2);
        var maxCol = Math.max(0, projectionColumns - homeColumnSpan(width, type, grid));
        var left;
        if (p.v === 2) {
            // Existing saved profiles retain their exact original projection.
            col = Math.max(0, Math.min(maxCol, col));
            left = projectionLeft + col * grid.pitchX + offset;
        } else {
            left = grid.left + col * grid.pitchX + offset;
            if (p.edge === 'left') left = 16;
            if (p.edge === 'right') left = grid.width - width - 16;
            left = Math.max(16, Math.min(grid.width - width - 16, left));
        }
        var top = grid.top + p.row * grid.pitchY;
        if (p.v === 3 && p.edgeY === 'top') top = 16;
        if (p.v === 3 && p.edgeY === 'bottom') top = grid.height - height - 16;
        return { left: left, top: Math.max(16, top), width: width, height: height };
    }

    function homeSnap(rect, type, grid, resize) {
        var r = Object.assign({}, rect);
        // Keep all four normal launcher cells usable on the smallest phones.
        // Large icons deliberately retain their larger footprint.
        if (type === 'app' && grid.narrow && grid.width <= 350 && r.width <= 68) r.width = Math.min(r.width, 64);
        var min = minPxFor(type, { vw: grid.width, vh: grid.height });
        var stepX = homeStepX(grid), stepY = homeStepY(grid);
        if (resize) {
            var minimumRows = ['notes', 'todo', 'countdown', 'weather'].indexOf(type) >= 0 ? 2 : 1;
            var minimumCols = grid.narrow ? 4 : 2;
            var minWidth = Math.max(minimumCols, Math.ceil((min.w + grid.gap) / grid.pitchX)) * grid.pitchX - grid.gap;
            var minHeight = Math.max(minimumRows, Math.ceil((min.h + grid.gap) / grid.pitchY)) * grid.pitchY - grid.gap;
            r.width = Math.min(grid.width - 32, Math.max(minWidth, Math.round((r.width + grid.gap) / stepX) * stepX - grid.gap));
            r.height = Math.max(minHeight, Math.round((r.height + grid.gap) / stepY) * stepY - grid.gap);
        }
        r.width = Math.min(r.width, grid.width - 32);
        var centerOffset = homeColumnOffset(r.width, type, grid);
        var origin = grid.left + centerOffset;
        var right = grid.width - r.width - 16;
        var minCol = Math.ceil((16 - origin) / stepX), maxCol = Math.floor((right - origin) / stepX);
        var col = Math.max(minCol, Math.min(maxCol, Math.round((r.left - origin) / stepX)));
        var minimumRow = grid.narrow ? 0 : Math.ceil((16 - grid.top) / stepY);
        var row = Math.max(minimumRow, Math.round((r.top - grid.top) / stepY));
        var snappedLeft = minCol > maxCol ? 16 : origin + col * stepX;
        // Edges are additional slots, not a separate coarse snapping region.
        // This also leaves the original lattice phase and all seeded slots intact.
        if (Math.abs(r.left - 16) < Math.abs(r.left - snappedLeft)) snappedLeft = 16;
        if (Math.abs(r.left - right) < Math.abs(r.left - snappedLeft)) snappedLeft = right;
        snappedLeft = Math.min(right, snappedLeft);
        r.left = Math.max(16, snappedLeft);
        var snappedTop = grid.top + row * stepY;
        if (!grid.narrow) {
            var bottom = grid.height - r.height - 16;
            if (Math.abs(r.top - 16) < Math.abs(r.top - snappedTop)) snappedTop = 16;
            // A viewport-bottom slot is optional. Scrolled placements beyond
            // this view remain valid instead of being clamped back on screen.
            if (bottom >= 16 && r.top >= bottom - 8 && r.top < grid.height) snappedTop = bottom;
        }
        r.top = Math.max(16, snappedTop);
        return r;
    }

    /** Align new and moved items to the geometry the user can actually see. */
    function homeAlignedRect(raw, type, others, grid, referenceRects) {
        var snapped = homeSnap(raw, type, grid, false);
        var references = others.concat(referenceRects || []);
        var width = snapped.width, height = snapped.height;
        var thresholdX = Math.min(5, homeStepX(grid) * 0.4), thresholdY = Math.min(5, homeStepY(grid) * 0.4);
        var xs = [{ value: snapped.left, guide: null, priority: 0 }], ys = [{ value: snapped.top, guide: null, priority: 0 }];
        function add(list, value, origin, guide, priority, rowTop) {
            if (Math.abs(value - origin) > (list === xs ? thresholdX : thresholdY)) return;
            var existing = list.filter(function (c) { return Math.abs(c.value - value) < 0.05; })[0];
            priority = priority || 1;
            if (existing) {
                if (priority > existing.priority) { existing.priority = priority; existing.rowTop = rowTop; }
                if (!existing.guide) existing.guide = guide;
                return;
            }
            list.push({ value: value, guide: guide, priority: priority, rowTop: rowTop });
        }
        references.forEach(function (other) {
            var sameWidth = Math.abs(other.width - width) < 1;
            var sameHeight = Math.abs(other.height - height) < 1;
            var priority = sameWidth && sameHeight ? 2 : 1;
            add(xs, other.left, raw.left, { axis: 'x', value: other.left, from: other.top, to: other.top + other.height }, priority);
            add(xs, other.left + other.width - width, raw.left, { axis: 'x', value: other.left + other.width, from: other.top, to: other.top + other.height }, priority);
            if (sameWidth) add(xs, other.left + (other.width - width) / 2, raw.left, { axis: 'x', value: other.left + other.width / 2, from: other.top, to: other.top + other.height }, priority);
            add(ys, other.top, raw.top, { axis: 'y', value: other.top, from: other.left, to: other.left + other.width }, priority);
            add(ys, other.top + other.height - height, raw.top, { axis: 'y', value: other.top + other.height, from: other.left, to: other.left + other.width }, priority);
            // A column can continue below a legacy row without switching back
            // to the default grid's different vertical phase.
            if (sameWidth && sameHeight && Math.abs(raw.left - other.left) <= thresholdX) {
                var row = Math.round((raw.top - other.top) / homeStepY(grid));
                add(ys, other.top + row * homeStepY(grid), raw.top, null, 2);
            }
        });
        // Continue an existing evenly spaced launcher row, including older
        // 92px rows. This prevents a new shortcut introducing a 96px gap.
        if (type === 'app' || type === 'folder') references.forEach(function (anchor) {
            if (Math.abs(raw.top - anchor.top) > thresholdY || Math.abs(anchor.width - width) >= 1 || Math.abs(anchor.height - height) >= 1) return;
            var row = references.filter(function (other) { return Math.abs(other.top - anchor.top) < 1 && Math.abs(other.width - width) < 1 && Math.abs(other.height - height) < 1; })
                .sort(function (a, b) { return a.left - b.left; });
            if (row.length < 2) return;
            var pitch = row[1].left - row[0].left;
            if (pitch < width + 6 || pitch > grid.pitchX * 2 || row.some(function (other, i) { return i > 0 && Math.abs(other.left - row[i - 1].left - pitch) > 1; })) return;
            var index = Math.round((raw.left - row[0].left) / pitch);
            add(xs, row[0].left + index * pitch, raw.left, null, row.length >= 3 ? 3 : 2, anchor.top);
            add(ys, anchor.top, raw.top, { axis: 'y', value: anchor.top, from: row[0].left, to: row[row.length - 1].left + width }, 2);
        });
        var result = snapped, guides = [], score = Infinity, bestPriority = -1, bestAxes = -1, bestExact = false;
        xs.forEach(function (x) { ys.forEach(function (y) {
            var candidate = { left: x.value, top: y.value, width: width, height: height };
            if (candidate.left < 16 || candidate.left + width > grid.width - 16 || candidate.top < 16 || !homeFits(candidate, others)) return;
            var distance = Math.pow(candidate.left - raw.left, 2) + Math.pow(candidate.top - raw.top, 2);
            var xPriority = x.rowTop == null || Math.abs(y.value - x.rowTop) < 1 ? x.priority : 0;
            var priority = Math.max(xPriority, y.priority), axes = xPriority + y.priority;
            var exact = distance < 0.000001;
            // Repeated launcher rows outrank same-size item alignment, then
            // generic widget edges. An exact valid position wins over a new
            // nearby magnet, so committing a preview cannot snap it again.
            if (bestExact && !exact || exact === bestExact && (priority < bestPriority || priority === bestPriority && (axes < bestAxes || axes === bestAxes && distance >= score))) return;
            bestExact = exact; bestPriority = priority; bestAxes = axes; score = distance; result = candidate; guides = [x.guide, y.guide].filter(Boolean);
        }); });
        return { rect: result, guides: guides };
    }

    function homeFits(rect, others, skipIds) {
        var skip = normalizeSkipIds(skipIds);
        return !others.some(function (other) { return !skip[other.id] && rectsIntersect(rect, other, 6); });
    }

    // At a fixed Y, a closest free X is either the requested lattice point,
    // a canvas edge, or the first lattice point beyond an occupied interval.
    // Check those boundaries rather than every 12px column on wide monitors.
    function homeFreeAtRow(rect, type, others, grid, top, targetLeft) {
        var base = homeSnap(Object.assign({}, rect, { left: targetLeft, top: top }), type, grid, false);
        if (homeFits(base, others)) return base;
        var origin = grid.left + homeColumnOffset(base.width, type, grid), step = homeStepX(grid);
        var right = grid.width - base.width - 16;
        var xs = [];
        function add(left) {
            if (left < 16 || left > right || xs.indexOf(left) >= 0) return;
            xs.push(left);
        }
        add(16); add(right);
        others.forEach(function (other) {
            if (base.top + base.height + 6 <= other.top || other.top + other.height + 6 <= base.top) return;
            add(origin + Math.floor((other.left - base.width - 6 - origin) / step) * step);
            add(origin + Math.ceil((other.left + other.width + 6 - origin) / step) * step);
        });
        xs.sort(function (a, b) { return Math.abs(a - targetLeft) - Math.abs(b - targetLeft) || a - b; });
        for (var i = 0; i < xs.length; i++) {
            var candidate = Object.assign({}, base, { left: xs[i] });
            if (homeFits(candidate, others)) return candidate;
        }
        return null;
    }

    function homeNextFree(rect, type, others, grid) {
        var maxRows = grid.narrow ? 100 : Math.max(1, Math.floor((grid.height - grid.top - 132) / grid.pitchY));
        var offset = homeColumnOffset(homeSnap(rect, type, grid, false).width, type, grid);
        for (var row = 0; row < maxRows; row++) {
            for (var col = 0; col < grid.columns; col++) {
                var candidate = homeSnap(Object.assign({}, rect, {
                    left: grid.left + col * grid.pitchX + offset, top: grid.top + row * grid.pitchY
                }), type, grid, false);
                if (homeFits(candidate, others)) return candidate;
            }
        }
        // Keep established catalogue rows first; use fine gaps only when the
        // semantic cells are full. Collision-boundary X candidates bound work.
        var stepY = homeStepY(grid);
        for (var fineRow = 0; fineRow < Math.ceil(maxRows * grid.pitchY / stepY); fineRow++) {
            var fine = homeFreeAtRow(rect, type, others, grid, grid.top + fineRow * stepY, 16);
            if (fine) return fine;
        }
        // A full forecast needs more room than the original compact weather
        // card. If no visible slot fits it, append on the same scrolling grid
        // without moving or resizing the user's existing widgets.
        if (type === 'weather' && !grid.narrow) {
            var occupiedBottom = others.reduce(function (bottom, other) {
                return Math.max(bottom, other.top + other.height + 6);
            }, grid.height);
            var nextRow = Math.max(maxRows, Math.ceil((occupiedBottom - grid.top) / grid.pitchY));
            var overflow = homeSnap(Object.assign({}, rect, {
                left: grid.left, top: grid.top + nextRow * grid.pitchY
            }), type, grid, false);
            if (homeFits(overflow, others)) return overflow;
        }
        return null;
    }

    function homeNearestFree(rect, type, others, grid) {
        var snapped = homeSnap(rect, type, grid, false);
        if (homeFits(snapped, others)) return snapped;
        var closest = null, distance = Infinity, stepY = homeStepY(grid), ys = [];
        var rows = Math.min(60, Math.max(8, Math.ceil((rect.top + rect.height - grid.top) / grid.pitchY) + 4));
        var firstRow = grid.narrow ? 0 : Math.ceil((16 - grid.top) / stepY);
        for (var row = firstRow; row < Math.ceil(rows * grid.pitchY / stepY); row++) {
            ys.push(grid.top + row * stepY);
        }
        if (!grid.narrow) {
            ys.push(16);
            if (grid.height - snapped.height - 16 >= 16) ys.push(grid.height - snapped.height - 16);
        }
        ys.sort(function (a, b) { return Math.abs(a - rect.top) - Math.abs(b - rect.top) || a - b; });
        for (var i = 0; i < ys.length; i++) {
            if (Math.pow(ys[i] - rect.top, 2) > distance) break;
            var candidate = homeFreeAtRow(snapped, type, others, grid, ys[i], rect.left);
            if (!candidate) continue;
            var delta = Math.pow(candidate.left - rect.left, 2) + Math.pow(candidate.top - rect.top, 2);
            if (delta < distance) { closest = candidate; distance = delta; }
        }
        return closest;
    }

    function isNarrow(vw) {
        return (vw || global.innerWidth || 0) < NARROW_BP;
    }

    global.NewtabLayout = {
        homeGrid: homeGrid,
        homeColumnOffset: homeColumnOffset,
        homeNewFootprint: homeNewFootprint,
        homeDefaultRect: homeDefaultRect,
        homePlacement: homePlacement,
        homePlacementRect: homePlacementRect,
        homeSnap: homeSnap,
        homeAlignedRect: homeAlignedRect,
        homeFits: homeFits,
        homeNextFree: homeNextFree,
        homeNearestFree: homeNearestFree,
        STORAGE_KEY: STORAGE_KEY,
        SCHEMA_VERSION: SCHEMA_VERSION,
        NARROW_BP: NARROW_BP,
        MAGNET_PX: MAGNET_PX,
        GAP_PX: GAP_PX,
        RING_INSET: RING_INSET,
        SOFT_SNAP_FACTOR: SOFT_SNAP_FACTOR,
        OVERLAP_DAMP: OVERLAP_DAMP,
        OVERLAP_ITERS: OVERLAP_ITERS,
        collisionGap: collisionGap,
        WIDGET_TYPES: WIDGET_TYPES,
        SINGLETON_TYPES: SINGLETON_TYPES,
        SIZE_STEPS: SIZE_STEPS,
        APP_SIZE_PX: APP_SIZE_PX,
        FOLDER_GRID_PX: FOLDER_GRID_PX,
        HANDLE_MATRIX: HANDLE_MATRIX,
        defaultLayout: defaultLayout,
        defaultRail: defaultRail,
        normalizeLayout: normalizeLayout,
        normalizeRail: normalizeRail,
        enrichWidget: enrichWidget,
        loadLayout: loadLayout,
        saveLayout: saveLayout,
        toPixels: toPixels,
        fromPixels: fromPixels,
        placeRect: placeRect,
        magnetSnap: magnetSnap,
        resolveOverlap: resolveOverlap,
        clampRect: clampRect,
        resizeFromHandle: resizeFromHandle,
        resizeWithRatio: resizeWithRatio,
        resizeAxisFollow: resizeAxisFollow,
        nearestStep: nearestStep,
        snapRectToStep: snapRectToStep,
        applyFixedSize: applyFixedSize,
        scaleStepsForVp: scaleStepsForVp,
        reflowLayout: reflowLayout,
        rectsIntersect: rectsIntersect,
        hasType: hasType,
        hasApp: hasApp,
        addWidget: addWidget,
        removeWidget: removeWidget,
        isNarrow: isNarrow,
        clone: clone,
        viewport: viewport,
        defaultSizeFor: defaultSizeFor,
        minPxFor: minPxFor,
        maxPxFor: maxPxFor
    };
})(typeof window !== 'undefined' ? window : this);
