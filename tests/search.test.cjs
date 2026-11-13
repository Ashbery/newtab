const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/search.js'), 'utf8');

function createPage({ withSubmit = true } = {}) {
    let now = 0;
    let timerId = 0;
    const timers = new Map();
    const setTimeout = (callback, delay = 0) => {
        const id = ++timerId;
        timers.set(id, { callback, time: now + delay });
        return id;
    };
    const advance = milliseconds => {
        const end = now + milliseconds;
        while (true) {
            const next = [...timers].filter(([, timer]) => timer.time <= end)
                .sort((a, b) => a[1].time - b[1].time)[0];
            if (!next) break;
            timers.delete(next[0]);
            now = next[1].time;
            next[1].callback();
        }
        now = end;
    };
    let document;
    class Element {
        constructor(id = '') {
            this.id = id;
            this.children = [];
            this.parentNode = null;
            this.className = '';
            this.value = '';
            this.style = {};
            this.dataset = {};
            this.attributes = {};
            this.listeners = {};
            this.classList = {
                contains: name => this.className.split(' ').includes(name),
                add: (...names) => { this.className = [...new Set([...this.className.split(' ').filter(Boolean), ...names])].join(' '); },
                remove: (...names) => { this.className = this.className.split(' ').filter(name => !names.includes(name)).join(' '); },
                toggle: (name, force) => {
                    const enabled = force === undefined ? !this.classList.contains(name) : force;
                    this.classList[enabled ? 'add' : 'remove'](name);
                    return enabled;
                }
            };
        }
        set innerHTML(value) {
            this.html = value;
            this.children.forEach(child => { child.parentNode = null; });
            this.children = [];
        }
        get innerHTML() { return this.html || ''; }
        setAttribute(name, value) { this.attributes[name] = String(value); }
        getAttribute(name) { return this.attributes[name] ?? null; }
        removeAttribute(name) { delete this.attributes[name]; }
        addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
        dispatch(name, values = {}) {
            const event = { target: this, defaultPrevented: false,
                preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...values };
            (this.listeners[name] || []).forEach(callback => callback.call(this, event));
            return event;
        }
        appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
        remove() {
            if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this);
            this.parentNode = null;
        }
        contains(target) { return this === target || this.children.some(child => child.contains(target)); }
        querySelectorAll(selector) {
            assert.equal(selector, '.suggestion-item:not(.skeleton)');
            return this.children.filter(child => child.classList.contains('suggestion-item') && !child.classList.contains('skeleton'));
        }
        scrollIntoView() { this.scrolled = true; }
        focus() {
            if (document.activeElement === this) return;
            if (document.activeElement) document.activeElement.dispatch('blur');
            document.activeElement = this;
            this.dispatch('focus');
        }
        blur() { document.activeElement = null; this.dispatch('blur'); }
    }
    const ids = ['search-input', 'search-box', 'clear-btn', 'suggestions-container', 'suggestions-list'];
    if (withSubmit) ids.push('search-submit');
    const elements = Object.fromEntries(ids.map(id => [id, new Element(id)]));
    const [input, box, clearButton, container, list] = ids.map(id => elements[id]);
    const submitButton = elements['search-submit'];
    box.appendChild(input);
    box.appendChild(clearButton);
    if (submitButton) box.appendChild(submitButton);
    box.appendChild(container);
    container.appendChild(list);
    document = new Element();
    document.head = new Element();
    document.getElementById = id => elements[id];
    document.createElement = () => new Element();
    const window = { location: { href: 'about:blank' } };
    const context = { window, document, URL, setTimeout, clearTimeout: id => timers.delete(id),
        requestAnimationFrame: callback => setTimeout(callback, 16), cancelAnimationFrame: id => timers.delete(id) };
    vm.runInNewContext(source, context);
    const type = value => { input.value = value; input.dispatch('input'); };
    const key = (value, extras) => input.dispatch('keydown', { key: value, ...extras });
    const currentRequest = () => {
        const script = document.head.children.at(-1);
        assert.ok(script, 'a suggestion request exists');
        return { script, name: new URL(script.src).searchParams.get('callback') };
    };
    const respond = values => {
        const pending = currentRequest();
        window[pending.name]([input.value, values]);
        advance(16);
    };
    return { input, box, clearButton, submitButton, container, list, document, window, advance, type, key, currentRequest, respond };
}

test('searches dotted sentences, version numbers and unsafe schemes; navigates valid web addresses', () => {
    const page = createPage();
    const searches = ['今天 v1.2 更新', 'Hello. world', '1.2', '.NET', 'javascript:alert(1)', 'data:text/html,<h1>hi</h1>',
        'file:///C:/test.txt', 'ftp://example.com', 'https://user:pass@example.com', 'https://example.com\\@evil.com'];
    for (const query of searches) {
        page.input.value = query;
        page.key('Enter');
        assert.equal(page.window.location.href, 'https://www.google.com/search?q=' + encodeURIComponent(query), query);
    }
    const addresses = [
        ['example.com/path?q=hello', 'https://example.com/path?q=hello'],
        ['https://example.com', 'https://example.com/'],
        ['https://example.com/@artist?contact=name@example.org', 'https://example.com/@artist?contact=name@example.org'],
        ['http://localhost:8080/path', 'http://localhost:8080/path'],
        ['localhost:3000', 'https://localhost:3000/'],
        ['192.168.1.10:8080', 'https://192.168.1.10:8080/'],
        ['[::1]:3000', 'https://[::1]:3000/']
    ];
    for (const [query, expected] of addresses) {
        page.input.value = query;
        page.key('Enter');
        assert.equal(page.window.location.href, expected, query);
    }
});

test('IME composition Enter and Safari keyCode 229 do not navigate or request incomplete text', () => {
    const page = createPage();
    page.input.focus();
    page.input.dispatch('compositionstart');
    page.type('中文');
    assert.equal(page.key('Enter').defaultPrevented, false);
    page.advance(300);
    assert.equal(page.window.location.href, 'about:blank');
    assert.equal(page.document.head.children.length, 0);
    page.input.dispatch('compositionend');
    page.key('Enter', { keyCode: 229 });
    page.key('Enter', { isComposing: true });
    assert.equal(page.window.location.href, 'about:blank');
    page.advance(260);
    assert.equal(page.document.head.children.length, 1);
    page.key('Enter');
    assert.equal(page.window.location.href, 'https://www.google.com/search?q=' + encodeURIComponent('中文'));
});

test('an expired JSONP callback cannot remove or replace a newer request', () => {
    const page = createPage();
    page.type('first');
    page.advance(260);
    const first = page.currentRequest();
    const oldCallback = page.window[first.name];
    page.type('second');
    page.advance(260);
    const second = page.currentRequest();
    assert.notEqual(first.name, second.name);
    assert.equal(first.script.parentNode, null);
    oldCallback(['first', ['old response']]);
    assert.equal(second.script.parentNode, page.document.head);
    page.respond(['second response']);
    assert.equal(page.list.children[0].dataset.suggestion, 'second response');
    assert.equal(page.document.head.children.length, 0);
    page.advance(30000);
    assert.equal(page.window[first.name], undefined);
    assert.equal(page.window[second.name], undefined);
});

test('Escape, outside click, blur and clearing reject late responses and pending animation', () => {
    for (const dismiss of [
        page => page.key('Escape'),
        page => page.document.dispatch('click', { target: page.document }),
        page => page.input.blur(),
        page => page.clearButton.dispatch('click')
    ]) {
        const page = createPage();
        page.input.focus();
        page.type('cat');
        page.advance(260);
        const pending = page.currentRequest();
        const callback = page.window[pending.name];
        dismiss(page);
        callback(['cat', ['late cat']]);
        page.advance(6000);
        assert.equal(page.box.classList.contains('active'), false);
        assert.equal(page.input.getAttribute('aria-expanded'), 'false');
        assert.equal(page.container.getAttribute('aria-hidden'), 'true');
        assert.equal(page.document.head.children.length, 0);
    }
    const page = createPage();
    page.type('cat');
    page.key('Escape');
    page.advance(500);
    assert.equal(page.box.classList.contains('active'), false);
    assert.equal(page.document.head.children.length, 0);
});

test('clearing text cancels a debounce and updates the clear button', () => {
    const page = createPage();
    assert.equal(page.clearButton.tabIndex, -1);
    page.type('cat');
    assert.equal(page.clearButton.disabled, false);
    page.clearButton.dispatch('click');
    page.advance(6000);
    assert.equal(page.document.head.children.length, 0);
    assert.equal(page.list.children.length, 0);
    assert.equal(page.clearButton.disabled, true);
    assert.equal(page.clearButton.tabIndex, -1);
    assert.equal(page.input.value, '');
    assert.equal(page.document.activeElement, page.input);
});

test('timeout and network failure keep an actionable, escaped query', () => {
    for (const failure of [page => page.advance(5000), page => page.currentRequest().script.onerror()]) {
        const page = createPage();
        page.type('<cat>');
        page.advance(260);
        failure(page);
        assert.equal(page.list.children.length, 1);
        assert.equal(page.list.children[0].dataset.suggestion, '<cat>');
        assert.match(page.list.children[0].innerHTML, /&lt;cat&gt;/);
        assert.equal(page.list.getAttribute('aria-busy'), 'false');
        page.key('ArrowDown');
        page.key('Enter');
        assert.equal(page.window.location.href, 'https://www.google.com/search?q=%3Ccat%3E');
    }
});

test('combobox arrows update accessible selection, Escape keeps focus, and Tab dismisses', () => {
    const page = createPage();
    page.window.NewtabSearch.focus();
    page.type('cat');
    page.advance(260);
    page.respond(['cat videos', 'cat pictures']);
    assert.equal(page.list.children[0].getAttribute('aria-label'), null, 'remote options use their visible text as the accessible name');
    assert.equal(page.input.getAttribute('role'), 'combobox');
    assert.equal(page.input.getAttribute('aria-controls'), page.list.id);
    assert.equal(page.input.getAttribute('aria-expanded'), 'true');
    assert.equal(page.key('ArrowDown').defaultPrevented, true);
    assert.equal(page.input.getAttribute('aria-activedescendant'), 'search-suggestion-0');
    assert.equal(page.list.children[0].getAttribute('aria-selected'), 'true');
    page.key('ArrowUp');
    assert.equal(page.input.getAttribute('aria-activedescendant'), 'search-suggestion-1');
    page.key('Escape');
    assert.equal(page.document.activeElement, page.input);
    assert.equal(page.input.getAttribute('aria-activedescendant'), null);
    page.key('ArrowDown');
    assert.equal(page.input.getAttribute('aria-expanded'), 'true');
    assert.equal(page.key('Tab').defaultPrevented, false);
    assert.equal(page.input.getAttribute('aria-expanded'), 'false');
});

test('typing after selecting a suggestion submits the latest text, while suggestion selection is a search', () => {
    const page = createPage();
    page.type('example');
    page.advance(260);
    page.respond(['example.com']);
    page.key('ArrowDown');
    page.type('new query');
    page.key('Enter');
    assert.equal(page.window.location.href, 'https://www.google.com/search?q=new%20query');
    page.type('example');
    page.advance(260);
    page.respond(['example.com']);
    page.key('ArrowDown');
    page.key('Enter');
    assert.equal(page.window.location.href, 'https://www.google.com/search?q=example.com');
});

test('malformed and duplicate remote suggestions are filtered and rendered as text', () => {
    const page = createPage();
    page.type('cat');
    page.advance(260);
    page.respond(['cat', null, {}, '', 'cat', '<img onerror="alert(1)">']);
    assert.equal(page.list.children.length, 2);
    assert.match(page.list.children[1].innerHTML, /&lt;img onerror=&quot;alert\(1\)&quot;&gt;/);
    assert.doesNotMatch(page.list.children[1].innerHTML, /<img/);
});

test('the current query is actionable before the network responds and old rows cannot submit stale text', () => {
    const page = createPage();
    page.type('cat');
    assert.equal(page.list.children[0].dataset.suggestion, 'cat');
    assert.equal(page.list.getAttribute('aria-busy'), 'true');
    page.advance(260);
    page.respond(['cat videos', 'cat pictures']);
    const staleClick = page.list.children[0].onclick;
    page.type('dog');
    assert.equal(page.list.children.length, 1);
    assert.equal(page.list.children[0].dataset.suggestion, 'dog');
    staleClick();
    assert.equal(page.window.location.href, 'about:blank');
    assert.equal(page.input.value, 'dog');
    page.list.children[0].onclick();
    assert.equal(page.window.location.href, 'https://www.google.com/search?q=dog');
});

test('a typed address remains a direct navigation action before and after a network failure', () => {
    for (const fail of [false, true]) {
        const page = createPage();
        page.type('example.com/@artist');
        if (fail) {
            page.advance(260);
            page.currentRequest().script.onerror();
        }
        assert.equal(page.list.children[0].getAttribute('aria-label'), '前往 example.com/@artist');
        page.key('ArrowDown');
        page.key('Enter');
        assert.equal(page.window.location.href, 'https://example.com/@artist');
    }
});

test('submit control and public API submit safely without depending on suggestion availability', () => {
    const page = createPage();
    assert.equal(page.submitButton.disabled, true);
    page.type('   ');
    assert.equal(page.submitButton.disabled, true);
    page.window.NewtabSearch.submit();
    assert.equal(page.window.location.href, 'about:blank');
    page.type('中文搜尋');
    assert.equal(page.submitButton.disabled, false);
    page.input.dispatch('compositionstart');
    assert.equal(page.submitButton.disabled, true);
    page.window.NewtabSearch.submit();
    assert.equal(page.window.location.href, 'about:blank');
    page.input.dispatch('compositionend');
    assert.equal(page.submitButton.disabled, false);
    page.submitButton.dispatch('click');
    assert.equal(page.window.location.href, 'https://www.google.com/search?q=' + encodeURIComponent('中文搜尋'));

    const withoutButton = createPage({ withSubmit: false });
    withoutButton.type('example.com');
    withoutButton.window.NewtabSearch.submit();
    assert.equal(withoutButton.window.location.href, 'https://example.com/');
});

test('hovering a suggestion never changes the query submitted by Search or Enter', () => {
    for (const submit of ['button', 'enter']) {
        const page = createPage();
        page.type('motion check');
        page.advance(260);
        page.respond(['motion check videos', 'motion check images']);
        const row = page.list.children[0];
        row.dispatch('mouseenter');
        if (row.onmouseenter) row.onmouseenter();
        if (submit === 'button') page.submitButton.dispatch('click');
        else page.key('Enter');
        assert.equal(page.window.location.href, 'https://www.google.com/search?q=motion%20check');
    }
    const page = createPage();
    page.type('motion check');
    page.advance(260);
    page.respond(['motion check videos']);
    page.key('ArrowDown');
    page.submitButton.dispatch('click');
    assert.equal(page.window.location.href, 'https://www.google.com/search?q=motion%20check%20videos', 'explicit keyboard selection is retained');
});

test('refocusing a pending query restarts its request rather than treating the local action as a cached response', () => {
    const page = createPage();
    page.type('cat');
    page.advance(260);
    const first = page.currentRequest();
    page.input.focus();
    page.advance(1);
    const second = page.currentRequest();
    assert.notEqual(first.name, second.name);
    page.respond(['cat videos']);
    assert.equal(page.list.children[0].dataset.suggestion, 'cat videos');
    page.window.NewtabSearch.dismiss();
    assert.equal(page.input.getAttribute('aria-expanded'), 'false');
});
