/* Per-screen placement, shared widget contents. No display-identification permission here. */
(function (global) {
    'use strict';
    var CONFIG = 'nt_layout_profiles_v1', PROFILE = 'nt_layout_profile_v1:', FIELD = 'nt_layout_shared_v1:';
    var GEOMETRY = 'nt_layout_geometry_v1:', VISIBLE = 'nt_layout_visible_v1:', RAIL = 'nt_layout_rail_v1:';
    var SESSION = 'nt_layout_active_profile_v1', BACKUP = 'nt_layout_before_profiles_v1';
    var geometryOptions = ['homeDesktop', 'homeMobile', 'homeSeed', 'size', 'grid'];
    var enabled = false, activeId = null, baseline = null, host = null, pending = null, remote = false;
    var loadLegacy = null, saveLegacy = null, retryTimer = null, applying = false, listeners = [], counter = 0;
    var writer = Math.random().toString(36).slice(2), initialized = false;
    var introduced = Object.create(null);
    var lastError = null;

    function copy(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
    function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
    function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
    function safeKey(key) { return key !== '__proto__' && key !== 'constructor' && key !== 'prototype'; }
    function validId(id) { return typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id); }
    function label(name) { return String(name || '螢幕版面').trim().slice(0, 80) || '螢幕版面'; }
    function read(key) { try { return JSON.parse(global.localStorage.getItem(key) || 'null'); } catch (_) { return null; } }
    function write(key, value) { global.localStorage.setItem(key, JSON.stringify(value)); }
    function revision() { return Date.now().toString(36) + ':' + writer + ':' + (++counter); }
    function put(key, value) {
        var old = read(key);
        if (old && same(old.value, value)) return;
        write(key, { v: 1, revision: revision(), value: value });
    }
    function keys(prefix) {
        var result = [];
        try {
            for (var i = 0; i < global.localStorage.length; i++) {
                var key = global.localStorage.key(i);
                if (key && key.indexOf(prefix) === 0) result.push(key);
            }
        } catch (_) { /* unavailable storage is reported on a write */ }
        return result.sort();
    }
    function profiles() {
        return keys(PROFILE).map(read).filter(function (p) { return p && p.v === 1 && validId(p.id); })
            .map(function (p) { return { id: p.id, name: label(p.name) }; });
    }
    function remember() { try { if (activeId) global.sessionStorage.setItem(SESSION, activeId); else global.sessionStorage.removeItem(SESSION); } catch (_) {} }
    function initialize() {
        if (initialized) return;
        initialized = true;
        var config = read(CONFIG), list = profiles();
        enabled = !!(config && config.enabled && list.length);
        var saved = null;
        try { saved = global.sessionStorage.getItem(SESSION); } catch (_) {}
        activeId = enabled ? (list.some(function (p) { return p.id === saved; }) ? saved :
            list.some(function (p) { return p.id === config.defaultId; }) ? config.defaultId : list[0].id) : null;
    }
    function getState() {
        initialize();
        return { enabled: enabled, activeId: activeId, profiles: profiles(), pendingId: pending && pending.id || null,
            pendingAction: pending && pending.kind || null, pendingOwner: pending && pending.owner || null, error: lastError };
    }
    function notify() {
        var state = getState();
        listeners.slice().forEach(function (fn) { try { fn(copy(state)); } catch (_) {} });
        if (global.document && global.CustomEvent) global.document.dispatchEvent(new CustomEvent('newtab:profiles-change', { detail: state }));
    }
    function parts(widget) {
        var shared = { type: widget.type, options: {} }, geometry = { options: {} };
        ['x', 'y', 'w', 'h', 'pinned', 'z'].forEach(function (key) { if (widget[key] !== undefined) geometry[key] = copy(widget[key]); });
        Object.keys(widget.options || {}).filter(safeKey).forEach(function (key) {
            (geometryOptions.indexOf(key) >= 0 ? geometry.options : shared.options)[key] = copy(widget.options[key]);
        });
        return { shared: shared, geometry: geometry };
    }
    function flatten(value, path, result) {
        if (object(value)) {
            Object.keys(value).filter(safeKey).forEach(function (key) { flatten(value[key], path.concat(key), result); });
        } else result[JSON.stringify(path)] = copy(value);
        return result;
    }
    function fieldKey(id, path) { return FIELD + encodeURIComponent(id) + ':' + encodeURIComponent(path); }
    // Each shared field is an atomic storage record. Two tabs editing unrelated
    // fields never read-modify-write the same registry object or profile map.
    function saveShared(id, next, before, seedOnly) {
        var fields = flatten(next, [], {}), previous = flatten(before || {}, [], {});
        Object.keys(fields).forEach(function (path) {
            var key = fieldKey(id, path);
            if (seedOnly ? !read(key) : !same(fields[path], previous[path])) put(key, { present: true, data: fields[path] });
        });
        if (!seedOnly) Object.keys(previous).forEach(function (path) {
            if (!(path in fields)) put(fieldKey(id, path), { present: false });
        });
    }
    function registry() {
        var result = Object.create(null);
        keys(FIELD).forEach(function (key) {
            try {
                var pieces = key.slice(FIELD.length).split(':'), id = decodeURIComponent(pieces[0]);
                var path = JSON.parse(decodeURIComponent(pieces.slice(1).join(':'))), record = read(key);
                if (!record || !record.value || !record.value.present || !Array.isArray(path) || !path.length || !path.every(safeKey)) return;
                var target = result[id] || (result[id] = { id: id });
                path.forEach(function (part, i) {
                    if (i === path.length - 1) target[part] = copy(record.value.data);
                    else { if (!object(target[part])) target[part] = {}; target = target[part]; }
                });
            } catch (_) { /* skip only the malformed record */ }
        });
        return result;
    }
    function slot(prefix, profileId, widgetId) { return prefix + encodeURIComponent(profileId) + ':' + encodeURIComponent(widgetId); }
    function compose(id) {
        var widgets = [], shared = registry();
        Object.keys(shared).forEach(function (widgetId) {
            var visible = read(slot(VISIBLE, id, widgetId)), saved = read(slot(GEOMETRY, id, widgetId));
            if (!visible || visible.value !== true || !saved || !object(saved.value) || !shared[widgetId].type) return;
            var widget = Object.assign({}, copy(saved.value), shared[widgetId]);
            widget.options = Object.assign({}, shared[widgetId].options || {}, saved.value.options || {});
            widgets.push(widget);
        });
        widgets.sort(function (a, b) { return (a.z || 0) - (b.z || 0) || a.id.localeCompare(b.id); });
        var rail = read(RAIL + id);
        return { v: 4, widgets: widgets, rail: rail && rail.value || { open: false, tab: 'personalize', width: 300 }, companionMigrated: true };
    }
    function normalize(layout) { return global.NewtabLayout ? global.NewtabLayout.normalizeLayout(layout) : copy(layout); }
    function sharedLegacy(layout) {
        var shared = registry(), result = copy(layout);
        result.widgets.forEach(function (widget) {
            if (shared[widget.id] && shared[widget.id].type === widget.type) widget.options = Object.assign({}, shared[widget.id].options || {}, parts(widget).geometry.options);
        });
        return result;
    }
    function currentLayout() { return host && host.getLayout ? host.getLayout() : baseline; }
    function load(legacyLoader) {
        loadLegacy = legacyLoader; initialize();
        var layout = enabled ? compose(activeId) : legacyLoader();
        if (!enabled && read(CONFIG)) layout = sharedLegacy(layout);
        baseline = normalize(layout);
        return copy(baseline);
    }
    function save(layout, legacySaver) {
        if (legacySaver) saveLegacy = legacySaver;
        initialize();
        if (!enabled) {
            // Before first opt-in the original storage behavior remains exact.
            if (!read(CONFIG)) { var legacyOK = saveLegacy(layout); if (legacyOK) baseline = copy(layout); return legacyOK; }
            try {
                saveContents(layout, baseline);
                var merged = sharedLegacy(layout), ok = saveLegacy(merged);
                if (ok) baseline = copy(layout);
                return ok;
            } catch (_) { return false; }
        }
        var boundId = activeId;
        try {
            var previous = Object.create(null), visible = Object.create(null);
            (baseline && baseline.widgets || []).forEach(function (w) { previous[w.id] = w; });
            saveContents(layout, baseline);
            layout.widgets.forEach(function (widget) {
                visible[widget.id] = true;
                if (!previous[widget.id]) put(slot(VISIBLE, boundId, widget.id), true);
                var next = parts(widget).geometry;
                if (!previous[widget.id] || !same(next, parts(previous[widget.id]).geometry)) put(slot(GEOMETRY, boundId, widget.id), next);
            });
            Object.keys(previous).forEach(function (id) { if (!visible[id]) put(slot(VISIBLE, boundId, id), false); });
            if (!baseline || !same(layout.rail, baseline.rail)) put(RAIL + boundId, layout.rail || {});
            baseline = copy(layout);
            return true;
        } catch (_) { return false; }
    }
    function saveContents(layout, before) {
        var previous = Object.create(null);
        (before && before.widgets || []).forEach(function (w) { previous[w.id] = w; });
        layout.widgets.forEach(function (widget) {
            var beforeShared = previous[widget.id] ? parts(previous[widget.id]).shared : introduced[widget.id];
            saveShared(widget.id, parts(widget).shared, beforeShared, false);
        });
    }
    function seed(id, name, layout) {
        var configured = !!read(CONFIG);
        if (read(PROFILE + id) && configured) return;
        var oldShared = configured ? null : registry();
        // A failed first enable can leave prepared records without publishing
        // CONFIG. Retrying must use today's source, not resurrect that draft.
        if (!configured) keys(VISIBLE + encodeURIComponent(id) + ':').forEach(function (key) { put(key, false); });
        layout.widgets.forEach(function (widget) {
            var split = parts(widget);
            saveShared(widget.id, split.shared, oldShared && oldShared[widget.id] && parts(oldShared[widget.id]).shared, configured);
            put(slot(GEOMETRY, id, widget.id), split.geometry);
            put(slot(VISIBLE, id, widget.id), true);
        });
        put(RAIL + id, Object.assign({}, layout.rail || {}, { open: false }));
        // Publish the profile only after its initial contents are complete.
        write(PROFILE + id, { v: 1, id: id, name: label(name) });
    }
    function busy() { return !!(host && host.isBusy && host.isBusy()); }
    function schedule() {
        if (retryTimer || (!pending && !remote)) return;
        retryTimer = setTimeout(function () { retryTimer = null; settle(); }, 120);
    }
    function deliver(layout) {
        baseline = normalize(layout);
        applying = true;
        try { if (host && host.apply) host.apply(copy(baseline)); }
        finally { applying = false; }
    }
    function execute(request) {
        var source = currentLayout();
        if (!source || !loadLegacy || !saveLegacy) return { ok: false, error: 'not-ready' };
        // Flush against the source profile before changing activeId.
        if (enabled && !save(source)) { lastError = 'storage-unavailable'; notify(); return { ok: false, error: lastError }; }
        try {
            if (!enabled && read(CONFIG)) saveContents(source, baseline);
            if (request.kind === 'disable') {
                write(CONFIG, { v: 1, enabled: false, defaultId: activeId });
                enabled = false; activeId = null; remember();
                deliver(sharedLegacy(loadLegacy()));
            } else {
                if (!read(BACKUP)) {
                    var original = global.localStorage.getItem('nt_layout_v1');
                    if (original !== null) write(BACKUP, { v: 1, raw: original });
                }
                seed(request.id, request.name, source);
                write(CONFIG, { v: 1, enabled: true, defaultId: request.id });
                enabled = true; activeId = request.id; remember();
                deliver(compose(activeId));
            }
            remote = false; lastError = null; notify();
            return { ok: true };
        } catch (_) { lastError = 'storage-unavailable'; notify(); return { ok: false, error: lastError }; }
    }
    function settle() {
        if (applying || busy()) { schedule(); return; }
        if (pending) {
            var request = pending; pending = null;
            var result = execute(request);
            if (!result.ok) notify();
        } else if (remote) {
            var source = currentLayout();
            if (source && !save(source)) { remote = false; lastError = 'storage-unavailable'; notify(); return; }
            remote = false;
            deliver(enabled ? compose(activeId) : sharedLegacy(loadLegacy()));
            notify();
        }
    }
    function request(kind, id, name, options) {
        initialize();
        lastError = null;
        if (kind !== 'disable' && !validId(id)) return { ok: false, error: 'invalid-id' };
        if (kind === 'select' && !enabled) return { ok: false, error: 'disabled' };
        if (kind !== 'disable' && enabled && id === activeId) { pending = null; notify(); return { ok: true }; }
        if (kind === 'disable' && !enabled) { pending = null; notify(); return { ok: true }; }
        var owner = options && typeof options.owner === 'string' && options.owner ? options.owner : 'manual';
        var next = { kind: kind, id: id || null, name: name, owner: owner };
        if (busy()) { pending = next; notify(); schedule(); return { ok: true, pending: true }; }
        pending = null;
        return execute(next);
    }
    function cancelPending(owner) {
        if (typeof owner !== 'string' || !owner) return { ok: false, error: 'invalid-owner' };
        var cancelled = !!(pending && pending.owner === owner);
        if (cancelled) { pending = null; notify(); }
        return { ok: true, cancelled: cancelled };
    }
    function rename(id, name) {
        if (!validId(id)) return { ok: false, error: 'invalid-id' };
        var profile = read(PROFILE + id);
        if (!profile) return { ok: false, error: 'not-found' };
        try { profile.name = label(name); write(PROFILE + id, profile); notify(); return { ok: true }; }
        catch (_) { return { ok: false, error: 'storage-unavailable' }; }
    }
    function reusable(type, options, layout) {
        if (!enabled) return null;
        var existing = registry(), ids = Object.keys(existing).sort(), visible = {};
        layout.widgets.forEach(function (w) { visible[w.id] = true; });
        for (var i = 0; i < ids.length; i++) {
            var w = existing[ids[i]];
            if (visible[w.id] || w.type !== type || type === 'app' && (!w.options || w.options.appId !== options.appId)) continue;
            // A revealed widget can remain in an arrangement draft while another
            // screen edits its content. Visibility is not an edit to that content.
            introduced[w.id] = parts(w).shared;
            return copy(w);
        }
        return null;
    }
    global.NewtabLayoutProfiles = {
        getState: getState, enable: function (id, name, options) { return request('enable', id, name, options); },
        disable: function () { return request('disable'); }, select: function (id, name, options) { return request('select', id, name, options); },
        cancelPending: cancelPending,
        rename: rename, subscribe: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (item) { return item !== fn; }); }; },
        load: load, save: save, reusable: reusable, mergeShared: sharedLegacy,
        attach: function (adapter) { host = adapter; notify(); schedule(); },
        setLegacySaver: function (fn) { saveLegacy = fn; },
        check: function () { settle(); },
        isApplying: function () { return applying; }
    };
    if (global.addEventListener) global.addEventListener('storage', function (event) {
        if (!event.key || event.key.indexOf('nt_layout_') !== 0) return;
        if (!initialized) return;
        if (event.key === CONFIG) {
            var config = read(CONFIG);
            if (config && !!config.enabled !== enabled) {
                pending = config.enabled ? { kind: 'enable', id: config.defaultId, name: null, owner: 'storage' } : { kind: 'disable', id: null, owner: 'storage' };
            }
        }
        if (event.key.indexOf(FIELD) === 0 || enabled && (event.key.indexOf(GEOMETRY + encodeURIComponent(activeId) + ':') === 0 ||
            event.key.indexOf(VISIBLE + encodeURIComponent(activeId) + ':') === 0)) remote = true;
        notify(); schedule();
    });
})(typeof window !== 'undefined' ? window : this);
