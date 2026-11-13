/**
 * NewtabApps — unified app shortcuts (built-in + custom)
 * Custom apps: localStorage nt_custom_apps (separate from layout schema v4)
 */
(function (global) {
    'use strict';

    var CUSTOM_KEY = 'nt_custom_apps';
    var ICON_MAX_CHARS = 32000;

    var APPS = {
        images: {
            appId: 'images',
            label: '圖片',
            url: 'https://www.google.com/imghp',
            icon: 'on_icon_03'
        },
        gmail: {
            appId: 'gmail',
            label: 'Gmail',
            url: 'https://mail.google.com',
            icon: 'on_icon_01'
        },
        maps: {
            appId: 'maps',
            label: '地圖',
            url: 'https://maps.google.com',
            icon: 'on_icon_08'
        },
        youtube: {
            appId: 'youtube',
            label: 'YouTube',
            url: 'https://www.youtube.com',
            icon: 'on_icon_02'
        },
        play: {
            appId: 'play',
            label: 'Play',
            url: 'https://play.google.com',
            icon: 'on_icon_05'
        },
        news: {
            appId: 'news',
            label: '新聞',
            url: 'https://news.google.com',
            icon: 'on_icon_06'
        },
        drive: {
            appId: 'drive',
            label: '雲端硬碟',
            url: 'https://drive.google.com',
            icon: 'on_icon_07'
        },
        calendar: {
            appId: 'calendar',
            label: '日曆',
            url: 'https://calendar.google.com',
            icon: 'on_icon_04'
        },
        translate: {
            appId: 'translate',
            label: '翻譯',
            url: 'https://translate.google.com',
            icon: 'on_icon_09'
        }
    };

    var ORDER = [
        'images', 'gmail', 'maps', 'youtube', 'play',
        'news', 'drive', 'calendar', 'translate'
    ];

    var customCache = null;

    function emptyCustom() {
        return { v: 1, apps: {}, order: [] };
    }

    function loadCustom() {
        if (customCache) return customCache;
        try {
            var raw = global.localStorage && localStorage.getItem(CUSTOM_KEY);
            if (!raw) {
                customCache = emptyCustom();
                return customCache;
            }
            var data = JSON.parse(raw);
            var clean = emptyCustom();
            var apps = data && data.apps && typeof data.apps === 'object' ? data.apps : {};
            var order = data && Array.isArray(data.order) ? data.order : [];
            order.concat(Object.keys(apps)).forEach(function (id) {
                if (typeof id !== 'string' || !/^custom-[a-z0-9_-]+$/i.test(id) || clean.apps[id]) return;
                var entry = Object.prototype.hasOwnProperty.call(apps, id) && apps[id];
                var url = entry && normalizeUrl(entry.url);
                if (!entry || typeof entry !== 'object' || !url) return;
                clean.apps[id] = {
                    appId: id,
                    label: String(entry.label || '自訂應用').slice(0, 40),
                    url: url,
                    icon: normalizeIcon(entry.icon),
                    custom: true
                };
                var cropMeta = normalizeCropMeta(entry.cropMeta);
                if (cropMeta) clean.apps[id].cropMeta = cropMeta;
                clean.order.push(id);
            });
            customCache = clean;
            return customCache;
        } catch (e) {
            customCache = emptyCustom();
            return customCache;
        }
    }

    function saveCustom(data) {
        var next = data || emptyCustom();
        try {
            if (!global.localStorage) return false;
            localStorage.setItem(CUSTOM_KEY, JSON.stringify(next));
            customCache = next;
            return true;
        } catch (e) {
            return false;
        }
    }

    function defaultGlyphDataUrl(label) {
        var ch = (label && String(label).trim().charAt(0)) || '☆';
        ch = ch.toUpperCase();
        // Escape for SVG text
        ch = ch.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        var svg =
            '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">' +
            '<rect x="1" y="1" width="62" height="62" rx="16" fill="#edf4f9" stroke="#c4d5e3"/>' +
            '<text x="32" y="38" text-anchor="middle" font-size="28" font-family="system-ui,sans-serif" ' +
            'font-weight="600" fill="#405f76">' + ch + '</text></svg>';
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    function normalizeUrl(url) {
        var u = String(url || '').trim();
        if (!u || /[\s\\]/.test(u) || /^[/?#]/.test(u)) return '';
        // Reject other schemes before adding the convenient HTTPS default.
        if (/^[a-z][a-z0-9+.-]*:/i.test(u) && !/^https?:\/\//i.test(u) &&
            !/^[^/?#:]+:\d+(?:[/?#]|$)/.test(u)) return '';
        if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
        try {
            var parsed = new URL(u);
            if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
                !parsed.hostname || parsed.username || parsed.password) return '';
            return parsed.href;
        } catch (e) {
            return '';
        }
    }

    function normalizeIcon(icon) {
        var src = icon == null ? '' : String(icon);
        if (src.length > ICON_MAX_CHARS) return '';
        if (/^data:image\/(?:png|jpeg|webp|gif|svg\+xml|x-icon|vnd\.microsoft\.icon)[;,]/i.test(src)) return src;
        if (/^https?:\/\//i.test(src)) return normalizeUrl(src);
        return '';
    }

    function copyCustom() {
        return JSON.parse(JSON.stringify(loadCustom()));
    }

    function get(appId) {
        if (Object.prototype.hasOwnProperty.call(APPS, appId)) return APPS[appId];
        var c = loadCustom();
        return Object.prototype.hasOwnProperty.call(c.apps, appId) ? c.apps[appId] : null;
    }

    function list() {
        var c = loadCustom();
        var built = ORDER.map(function (id) { return APPS[id]; }).filter(Boolean);
        var customs = (c.order || []).map(function (id) { return c.apps[id]; }).filter(Boolean);
        return built.concat(customs);
    }

    function iconUrl(appId) {
        var meta = get(appId);
        if (!meta) return defaultGlyphDataUrl('?');
        // One cached character atlas; fragment views keep all image consumers intact.
        // Uploaded custom icons retain their own source and crop metadata.
        if (Object.prototype.hasOwnProperty.call(APPS, appId)) {
            return 'assets/character/launcher-icons.svg#' + appId;
        }
        if (meta.icon && String(meta.icon).indexOf('data:') === 0) return meta.icon;
        if (meta.icon && /^https?:\/\//i.test(meta.icon)) return meta.icon;
        if (meta.icon && global.NACHONEKO_ASSETS && global.NACHONEKO_ASSETS.icons &&
            global.NACHONEKO_ASSETS.icons[meta.icon]) {
            return global.NACHONEKO_ASSETS.icons[meta.icon];
        }
        if (meta.custom || (appId && String(appId).indexOf('custom-') === 0)) {
            return meta.icon || defaultGlyphDataUrl(meta.label);
        }
        return defaultGlyphDataUrl(meta.label || appId);
    }

    function normalizeCropMeta(meta) {
        if (!meta || typeof meta !== 'object') return null;
        var nx = Number(meta.nx);
        var ny = Number(meta.ny);
        var nw = Number(meta.nw);
        var nh = Number(meta.nh);
        if (!(nw > 0) || !(nh > 0)) return null;
        if (!isFinite(nx) || !isFinite(ny) || !isFinite(nw) || !isFinite(nh)) return null;
        return {
            nx: Math.max(0, Math.min(1, nx)),
            ny: Math.max(0, Math.min(1, ny)),
            nw: Math.max(0.01, Math.min(1, nw)),
            nh: Math.max(0.01, Math.min(1, nh)),
            animated: !!meta.animated
        };
    }

    function addCustom(opts) {
        opts = opts || {};
        var label = String(opts.label || '').trim() || '自訂應用';
        var url = normalizeUrl(opts.url);
        if (!url) return null;
        var icon = normalizeIcon(opts.icon);
        var cropMeta = normalizeCropMeta(opts.cropMeta);

        /* animated GIF path: prefer source under size cap */
        if (cropMeta && cropMeta.animated && opts.sourceDataUrl) {
            var srcGif = String(opts.sourceDataUrl);
            if (/^data:image\/gif[;,]/i.test(srcGif) && srcGif.length <= ICON_MAX_CHARS) {
                icon = srcGif;
            } else {
                cropMeta.animated = false;
            }
        }

        var id = 'custom-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e4).toString(36);
        var c = copyCustom();
        var entry = {
            appId: id,
            label: label.slice(0, 40),
            url: url,
            icon: icon,
            custom: true
        };
        if (cropMeta) entry.cropMeta = cropMeta;
        c.apps[id] = entry;
        c.order.push(id);
        return saveCustom(c) ? id : null;
    }

    function removeCustom(appId) {
        var c = copyCustom();
        if (!Object.prototype.hasOwnProperty.call(c.apps, appId)) return false;
        delete c.apps[appId];
        c.order = (c.order || []).filter(function (id) { return id !== appId; });
        return saveCustom(c);
    }

    function updateCustomIcon(appId, icon, cropMeta) {
        var c = copyCustom();
        if (!Object.prototype.hasOwnProperty.call(c.apps, appId)) return false;
        var s = normalizeIcon(icon);
        c.apps[appId].icon = s;
        if (cropMeta === null) {
            delete c.apps[appId].cropMeta;
        } else if (cropMeta !== undefined) {
            var nm = normalizeCropMeta(cropMeta);
            if (nm) c.apps[appId].cropMeta = nm;
            else delete c.apps[appId].cropMeta;
        }
        return saveCustom(c);
    }

    function probeImage(src, timeoutMs) {
        return new Promise(function (resolve) {
            var img = new Image();
            var done = false;
            var t = setTimeout(function () {
                if (done) return;
                done = true;
                resolve(false);
            }, timeoutMs || 2500);
            img.onload = function () {
                if (done) return;
                done = true;
                clearTimeout(t);
                resolve(true);
            };
            img.onerror = function () {
                if (done) return;
                done = true;
                clearTimeout(t);
                resolve(false);
            };
            img.referrerPolicy = 'no-referrer';
            img.src = src;
        });
    }

    function resolveFavicon(url, cb) {
        var href = normalizeUrl(url);
        var label = '';
        try {
            label = href ? new URL(href).hostname.replace(/^www\./, '') : '';
        } catch (e) { label = ''; }

        if (!href) {
            var g0 = defaultGlyphDataUrl(label || '?');
            if (cb) cb(g0);
            return Promise.resolve(g0);
        }

        var host;
        var origin;
        try {
            var u = new URL(href);
            host = u.hostname;
            origin = u.origin;
        } catch (e2) {
            var g1 = defaultGlyphDataUrl(label || '?');
            if (cb) cb(g1);
            return Promise.resolve(g1);
        }

        var google = 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(host) + '&sz=64';
        var direct = origin + '/favicon.ico';

        return probeImage(google, 2800).then(function (ok) {
            if (ok) return google;
            return probeImage(direct, 2000).then(function (ok2) {
                if (ok2) return direct;
                return defaultGlyphDataUrl(label || host);
            });
        }).then(function (src) {
            if (cb) cb(src);
            return src;
        }).catch(function () {
            var g = defaultGlyphDataUrl(label || host);
            if (cb) cb(g);
            return g;
        });
    }

    global.NewtabApps = {
        APPS: APPS,
        ORDER: ORDER,
        CUSTOM_KEY: CUSTOM_KEY,
        get: get,
        list: list,
        iconUrl: iconUrl,
        addCustom: addCustom,
        removeCustom: removeCustom,
        updateCustomIcon: updateCustomIcon,
        loadCustom: loadCustom,
        saveCustom: saveCustom,
        resolveFavicon: resolveFavicon,
        defaultGlyphDataUrl: defaultGlyphDataUrl,
        normalizeUrl: normalizeUrl
    };
})(typeof window !== 'undefined' ? window : this);
