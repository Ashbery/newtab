const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadLayout() {
    const storage = new Map();
    const window = {
        innerWidth: 1200,
        innerHeight: 800,
        localStorage: {
            getItem: (key) => storage.get(key) ?? null,
            setItem: (key, value) => storage.set(key, String(value))
        },
        console
    };
    vm.runInNewContext(fs.readFileSync('js/layout-engine.js', 'utf8'), {
        window,
        console,
        Math,
        JSON,
        Date,
        isNaN,
        parseInt,
        parseFloat
    });
    return window.NewtabLayout;
}

test('every free-size component exposes edge and corner handles', () => {
    const layout = loadLayout();
    for (const type of ['clock', 'search', 'weather', 'notes', 'countdown', 'todo', 'bookmarks', 'companion']) {
        assert.deepEqual(Array.from(layout.HANDLE_MATRIX[type]), ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']);
    }
});

test('normalization preserves a custom vertical size', () => {
    const layout = loadLayout();
    const raw = layout.defaultLayout();
    const search = raw.widgets.find((widget) => widget.type === 'search');
    search.h = 0.173;
    const normalized = layout.normalizeLayout(raw, 1200, 800);
    assert.equal(normalized.widgets.find((widget) => widget.type === 'search').h, 0.173);
});

test('corner resize changes width and height together', () => {
    const layout = loadLayout();
    const resized = layout.resizeAxisFollow(
        { left: 100, top: 100, width: 300, height: 80 },
        'se',
        60,
        45,
        'search',
        []
    );
    assert.equal(resized.width, 360);
    assert.equal(resized.height, 125);
});

// Exercise the real host's resize and keyboard listeners with a small DOM
// adapter. Layout math alone cannot catch accidentally persisting its output.
function loadWidgetHost(options = {}) {
    const savedLayout = {
        v: 4, rail: { open: false, width: 300, tab: 'personalize' },
        companionMigrated: !options.unmigrated,
        widgets: [
            { id: 'clock-1', type: 'clock', x: 0.02, y: 0.025, w: 0.22, h: 0.14, z: 1, options: {} },
            { id: 'search-1', type: 'search', x: 0.26, y: 0.03, w: 0.36, h: 0.09, z: 2, options: {} },
            { id: 'app-images', type: 'app', x: 0.84, y: 0.02, w: 0.07, h: 0.11, z: 3, options: { appId: 'images' } },
            { id: 'app-gmail', type: 'app', x: 0.92, y: 0.02, w: 0.07, h: 0.11, z: 4, options: { appId: 'gmail' } }
        ]
    };
    savedLayout.widgets.push(...(options.extraWidgets || []));
    const storage = new Map([['nt_layout_v1', JSON.stringify(savedLayout)]]);
    let writes = 0;
    const listeners = { window: new Map(), document: new Map() };
    const addListener = (surface, type, fn) => {
        const list = listeners[surface].get(type) || [];
        list.push(fn);
        listeners[surface].set(type, list);
    };
    let document;
    const element = (attrs = {}) => ({
        id: attrs.id || '',
        hidden: false,
        disabled: false,
        style: { setProperty(name, value) { this[name] = value; } },
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        setAttribute(name, value) { attrs[name] = String(value); },
        getAttribute(name) { return attrs[name] ?? null; },
        removeAttribute(name) { delete attrs[name]; },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        addEventListener() {},
        appendChild() {},
        matches(selector) { return attrs['data-type'] === 'search' && selector === '.widget[data-type="search"]'; },
        closest() { return null; },
        focus() {
            document.activeElement = this;
            for (const fn of listeners.document.get('focusin') || []) fn({ target: this });
        },
        getBoundingClientRect() {
            return Object.fromEntries(['left', 'top', 'width', 'height'].map((key) => [key, parseFloat(this.style[key]) || 0]));
        }
    });
    const widgets = new Map(savedLayout.widgets.map((widget) => [widget.id, element({
        'data-id': widget.id, 'data-type': widget.type, 'data-active': 'true'
    })]));
    const input = element({ id: 'search-input' });
    input.closest = (selector) => selector === '.widget[data-type="search"]' ? widgets.get('search-1') : input;
    const nodes = new Map([
        ['widget-canvas', element()], ['arrange-done-bar', element()], ['home-editor-toolbar', element()], ['search-input', input]
    ]);
    document = {
        activeElement: null,
        body: element(),
        querySelector(selector) {
            if (selector.startsWith('#')) return nodes.get(selector.slice(1)) || null;
            const match = selector.match(/^\.widget\[data-id="([^"]+)"\]$/);
            if (match) return widgets.get(match[1]) || null;
            if (selector === '.widget[data-type="search"][data-active="true"]') return widgets.get('search-1');
            return null;
        },
        querySelectorAll() { return []; },
        getElementById(id) { return nodes.get(id) || null; },
        addEventListener(type, fn) { addListener('document', type, fn); },
        dispatchEvent() {},
        createElement() { return element(); }
    };
    const window = {
        innerWidth: options.width || 1440, innerHeight: options.height || 900, console,
        localStorage: {
            getItem: (key) => storage.get(key) ?? null,
            setItem: (key, value) => { writes++; storage.set(key, String(value)); }
        },
        addEventListener(type, fn) { addListener('window', type, fn); }
    };
    const context = vm.createContext({
        window, document, console, Math, JSON, Date, isNaN, parseInt, parseFloat,
        setInterval() {}, setTimeout() {}, clearTimeout() {},
        CustomEvent: function (name, options) { this.type = name; this.detail = options?.detail; }
    });
    vm.runInContext(fs.readFileSync('js/layout-engine.js', 'utf8'), context);
    vm.runInContext(fs.readFileSync('js/widget-host.js', 'utf8'), context);
    window.NewtabWidgets.init();
    return {
        window, document, widgets, input, storage,
        writes: () => writes,
        pointerdown(target) {
            for (const fn of listeners.document.get('pointerdown') || []) fn({ target, button: 0, pointerId: 1, clientX: 200, clientY: 200 });
        },
        resize(width, height) {
            window.innerWidth = width;
            window.innerHeight = height;
            for (const fn of listeners.window.get('resize') || []) fn({});
        },
        keydown(props = {}) {
            const event = {
                key: '/', target: document.body, isComposing: false, keyCode: 0,
                ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
                defaultPrevented: false,
                preventDefault() { this.defaultPrevented = true; },
                ...props
            };
            for (const fn of listeners.document.get('keydown') || []) fn(event);
            return event;
        }
    };
}

test('resize reflows the view without changing or saving the user layout', () => {
    const host = loadWidgetHost();
    const api = host.window.NewtabWidgets;
    const before = JSON.stringify(api.getLayout());
    const desktopGeometry = host.widgets.get('clock-1').getBoundingClientRect();
    host.resize(390, 844);
    const phoneGeometry = host.widgets.get('clock-1').getBoundingClientRect();
    assert(phoneGeometry.width < desktopGeometry.width, 'the view still adapts to a narrow window');
    assert.equal(JSON.stringify(api.getLayout()), before, 'canonical coordinates survive a phone viewport');
    assert.equal(host.writes(), 0, 'a resize is not a user edit and must not write storage');
    const phoneSearch = host.widgets.get('search-1').getBoundingClientRect();
    assert(phoneSearch.width > 300, 'mobile search remains a readable full-width control');
    assert(phoneSearch.top >= phoneGeometry.top + phoneGeometry.height + 20, 'clock and search form a vertical stack');
    // Unrelated actions and pagehide may persist while the viewport is narrow.
    api.persist();
    const stored = JSON.parse(host.storage.get('nt_layout_v1'));
    assert.equal(stored.widgets.find((widget) => widget.type === 'search').x, 0.26);
    assert.equal(stored.widgets.find((widget) => widget.type === 'clock').w, 0.22);
    host.resize(1440, 900);
    assert.deepEqual(host.widgets.get('clock-1').getBoundingClientRect(), desktopGeometry);
    assert.equal(JSON.stringify(api.getLayout()), before);
});

test('the companion migration is saved once without changing existing widgets', () => {
    const host = loadWidgetHost({ unmigrated: true });
    const layout = host.window.NewtabWidgets.getLayout();
    assert.equal(layout.companionMigrated, true);
    assert.equal(layout.widgets.filter(w => w.type === 'companion').length, 1);
    assert.equal(host.writes(), 1);
    assert.equal(layout.widgets.find(w => w.id === 'app-images').x, 0.84);
    host.resize(390, 844);
    assert.equal(host.writes(), 1, 'resizing never repeats migration');
    const saved = JSON.parse(host.storage.get('nt_layout_v1'));
    assert.equal(saved.companionMigrated, true);
    const removed = host.window.NewtabLayout.removeWidget(layout, 'companion-1').layout;
    assert.equal(removed.companionMigrated, true, 'removing the character preserves migration decision');
    assert.equal(removed.widgets.some(w => w.type === 'companion'), false);
});

test('desktop search shortcuts focus the inline field and respect text entry and IME', () => {
    const host = loadWidgetHost();
    for (const props of [{ key: '/' }, { key: 'k', ctrlKey: true }, { key: 'k', metaKey: true }]) {
        host.document.activeElement = null;
        assert.equal(host.keydown(props).defaultPrevented, true);
        assert.equal(host.document.activeElement, host.input);
    }
    host.document.activeElement = null;
    for (const props of [
        { key: '/', target: host.input },
        { key: '/', isComposing: true },
        { key: 'k', ctrlKey: true, keyCode: 229 },
        { key: '/', altKey: true }
    ]) {
        assert.equal(host.keydown(props).defaultPrevented, false);
        assert.equal(host.document.activeElement, null);
    }
});

test('search submit buttons do not arm a long press that steals their click', () => {
    const host = loadWidgetHost();
    const widget = host.widgets.get('search-1');
    const classes = [];
    widget.classList.add = (name) => classes.push(name);
    const button = {
        closest(selector) {
            if (selector === '.widget[data-active="true"]') return widget;
            if (selector.startsWith('input, textarea, select, button')) return button;
            return null;
        }
    };
    host.pointerdown(button);
    assert.equal(classes.includes('is-longpress-hint'), false);
});

test('a mobile load and settings save preserve right-edge shortcut coordinates', () => {
    const host = loadWidgetHost({ width: 390, height: 844 });
    const api = host.window.NewtabWidgets;
    const shortcut = api.getLayout().widgets.find((widget) => widget.id === 'app-gmail');
    assert.equal(shortcut.x, 0.92);
    assert.equal(shortcut.w, 0.07);
    api.setRailState({ open: true });
    const stored = JSON.parse(host.storage.get('nt_layout_v1'));
    const savedShortcut = stored.widgets.find((widget) => widget.id === 'app-gmail');
    assert.equal(savedShortcut.x, 0.92);
    assert.equal(savedShortcut.w, 0.07);
});

test('four mobile shortcuts form one evenly spaced centered row without changing the saved layout', () => {
    const host = loadWidgetHost({ extraWidgets: [
        { id: 'app-youtube', type: 'app', x: 0.40, y: 0.02, w: 0.07, h: 0.11, z: 5, options: { appId: 'youtube' } },
        { id: 'app-maps', type: 'app', x: 0.60, y: 0.02, w: 0.07, h: 0.11, z: 6, options: { appId: 'maps' } }
    ] });
    const before = JSON.stringify(host.window.NewtabWidgets.getLayout());
    host.resize(390, 844);
    const rects = ['app-images', 'app-gmail', 'app-youtube', 'app-maps']
        .map((id) => host.widgets.get(id).getBoundingClientRect()).sort((a, b) => a.left - b.left);
    assert.equal(new Set(rects.map((rect) => rect.top)).size, 1);
    const gaps = rects.slice(1).map((rect, index) => rect.left - rects[index].left - rects[index].width);
    assert(gaps.every((gap) => gap === 16));
    assert.equal(rects[0].left, 390 - rects.at(-1).left - rects.at(-1).width);
    assert.equal(JSON.stringify(host.window.NewtabWidgets.getLayout()), before);
});

test('optional mobile widgets remain separate below shortcuts with enough scrollable content height', () => {
    const extraWidgets = ['notes', 'todo', 'weather', 'bookmarks'].map((type, i) => ({
        id: type + '-1', type, x: 0.1 + i * 0.15, y: 0.7, w: 0.3, h: 0.25, z: i + 7, options: {}
    }));
    const host = loadWidgetHost({ extraWidgets });
    const before = JSON.stringify(host.window.NewtabWidgets.getLayout());
    host.resize(390, 844);
    const rects = extraWidgets.map((widget) => host.widgets.get(widget.id).getBoundingClientRect());
    for (let i = 1; i < rects.length; i++) {
        assert(rects[i].top >= rects[i - 1].top + rects[i - 1].height + 24);
    }
    const contentHeight = parseFloat(host.document.getElementById('widget-canvas').style['--canvas-content-height']);
    assert(contentHeight >= rects.at(-1).top + rects.at(-1).height + 80);
    assert.equal(JSON.stringify(host.window.NewtabWidgets.getLayout()), before);
});

test('320px phones keep four standard app slots in one row without shrinking icons or saved sizes', () => {
    const host = loadWidgetHost({ extraWidgets: [
        { id: 'app-youtube', type: 'app', x: 0.40, y: 0.02, w: 0.07, h: 0.11, z: 5, options: { appId: 'youtube' } },
        { id: 'app-maps', type: 'app', x: 0.60, y: 0.02, w: 0.07, h: 0.11, z: 6, options: { appId: 'maps' } }
    ] });
    const api = host.window.NewtabWidgets;
    const before = JSON.stringify(api.getLayout());
    const apps = ['app-images', 'app-gmail', 'app-youtube', 'app-maps'].map((id) => host.widgets.get(id));
    host.resize(320, 844);
    const rects = apps.map((app) => app.getBoundingClientRect()).sort((a, b) => a.left - b.left);
    assert.equal(new Set(rects.map((rect) => rect.top)).size, 1);
    assert.deepEqual(rects.map((rect) => rect.left), [20, 92, 164, 236]);
    assert(rects.every((rect) => rect.width === 64));
    assert(apps.every((app) => app.style['--app-icon-size'] === '48px'));
    assert.equal(host.writes(), 0);
    assert.equal(JSON.stringify(api.getLayout()), before);
    host.resize(390, 844);
    assert(apps.every((app) => app.getBoundingClientRect().width === 68));
    api.persist();
    assert.equal(host.storage.get('nt_layout_v1'), before);
});

test('narrow phone slots do not shrink folder previews or large app presets', () => {
    const host = loadWidgetHost({ extraWidgets: [
        { id: 'folder-1', type: 'folder', x: 0.4, y: 0.3, w: 0.1, h: 0.15, z: 5, options: { grid: 2, children: [{ appId: 'youtube' }, { appId: 'maps' }] } },
        { id: 'app-large', type: 'app', x: 0.6, y: 0.3, w: 0.1, h: 0.15, z: 6, options: { appId: 'calendar', size: 'l' } }
    ] });
    const api = host.window.NewtabWidgets;
    const before = JSON.stringify(api.getLayout());
    host.resize(320, 844);
    for (const id of ['folder-1', 'app-large']) {
        const widget = api.getLayout().widgets.find((item) => item.id === id);
        const expected = host.window.NewtabLayout.toPixels(widget);
        const actual = host.widgets.get(id).getBoundingClientRect();
        assert.equal(actual.width, expected.width);
        assert.equal(actual.height, expected.height);
        assert(actual.left >= 20 && actual.left + actual.width <= 300);
    }
    assert.equal(JSON.stringify(api.getLayout()), before);
});

test('desktop-sized optional cards stay readable at 390px and restore their canonical layout', () => {
    const minimums = { notes: 144, todo: 176, weather: 160, countdown: 176, bookmarks: 88 };
    const dimensions = { notes: [0.16, 0.15], todo: [0.16, 0.19], weather: [0.18, 0.17], countdown: [0.12, 0.14], bookmarks: [0.3, 0.08] };
    const extraWidgets = Object.entries(dimensions).map(([type, [w, h]], i) => ({
        id: type + '-1', type, x: 0.05 + i * 0.12, y: 0.4 + i * 0.03, w, h, z: i + 7, options: {}
    }));
    // A saved tall note and a wider bookmark strip must keep their custom space.
    extraWidgets.push({ id: 'notes-tall', type: 'notes', x: 0.1, y: 0.5, w: 0.4, h: 0.4, z: 15, options: {} });
    extraWidgets.find((widget) => widget.type === 'bookmarks').w = 0.74;
    const host = loadWidgetHost({ width: 1440, height: 900, extraWidgets });
    const api = host.window.NewtabWidgets;
    const before = JSON.stringify(api.getLayout());
    const desktop = extraWidgets.map((widget) => host.widgets.get(widget.id).getBoundingClientRect());
    host.resize(390, 844);
    for (const widget of extraWidgets) {
        const rect = host.widgets.get(widget.id).getBoundingClientRect();
        assert(rect.width >= 280 && rect.width <= 350, widget.type + ' needs a readable contained card');
        assert(rect.height >= minimums[widget.type], widget.type + ' needs usable content height');
        assert.equal(rect.left, (390 - rect.width) / 2);
    }
    assert.equal(host.widgets.get('notes-tall').getBoundingClientRect().height, 0.4 * 844);
    assert.equal(host.widgets.get('bookmarks-1').getBoundingClientRect().width, 0.74 * 390);
    assert.equal(host.writes(), 0);
    assert.equal(JSON.stringify(api.getLayout()), before);
    api.persist();
    assert.equal(host.storage.get('nt_layout_v1'), before);
    host.resize(1440, 900);
    assert.deepEqual(extraWidgets.map((widget) => host.widgets.get(widget.id).getBoundingClientRect()), desktop);
});
