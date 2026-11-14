// Startup behavior in an isolated browser; remote services are never called.
const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { chromium } = require('playwright');

const base = process.env.NEWTAB_TEST_URL || 'http://127.0.0.1:4174/';
const origin = new URL(base).origin;
let browser;

before(async () => {
    const options = { headless: true };
    if (process.env.NEWTAB_BROWSER_PATH) options.executablePath = process.env.NEWTAB_BROWSER_PATH;
    else options.channel = process.env.PLAYWRIGHT_CHANNEL || 'msedge';
    browser = await chromium.launch(options);
});
after(async () => { if (browser) await browser.close(); });

async function fixture({ width = 1920, height = 1080, holdFonts = false, holdLayout = false } = {}) {
    const context = await browser.newContext({
        viewport: { width, height }, reducedMotion: 'reduce', serviceWorkers: 'block'
    });
    const held = { fonts: [], layout: [] };
    await context.route(/^https?:\/\//, route => {
        const url = new URL(route.request().url());
        if (url.origin === origin) {
            if (holdLayout && url.pathname.endsWith('/js/layout-engine.js')) { held.layout.push(route); return; }
            return route.continue();
        }
        if (holdFonts && ['fonts.googleapis.com', 'cdnjs.cloudflare.com'].includes(url.hostname) &&
            route.request().resourceType() === 'stylesheet') { held.fonts.push(route); return; }
        if (url.hostname === 'suggestqueries.google.com') {
            const callback = url.searchParams.get('callback'), query = url.searchParams.get('q');
            assert.match(callback, /^__newtabSuggestions_\d+_\d+$/);
            return route.fulfill({ contentType: 'application/javascript',
                body: `${callback}(${JSON.stringify([query, [query + ' 第一項', query + ' 第二項']])});` });
        }
        return route.abort();
    });
    await context.addInitScript(() => {
        const audit = window.__startupAudit = { invalidVisible: [], firstVisible: null, samples: 0 };
        function visible(el) {
            if (!el || !el.getClientRects().length) return false;
            for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
                const style = getComputedStyle(node);
                if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
            }
            return true;
        }
        let readyAt = 0;
        function sample() {
            audit.samples++;
            const search = document.getElementById('search-box');
            const layout = window.NewtabWidgets && window.NewtabWidgets.getLayout();
            if (visible(search)) {
                const rect = search.getBoundingClientRect();
                const entry = { time: performance.now(), x: rect.x, y: rect.y,
                    booting: document.documentElement.classList.contains('nt-booting'), layout: !!layout };
                if (!audit.firstVisible) audit.firstVisible = entry;
                if (!layout || entry.booting) audit.invalidVisible.push(entry);
            }
            if (layout && !readyAt) readyAt = performance.now();
            if (!readyAt || performance.now() - readyAt < 1500) requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
    });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    return { context, page, held, errors };
}

async function ready(page) {
    await page.waitForFunction(() => window.NewtabWidgets && NewtabWidgets.getLayout() &&
        !document.documentElement.classList.contains('nt-booting'));
    await page.locator('.widget[data-type="search"] #search-input').waitFor({ state: 'visible' });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

test('slow essential JavaScript never exposes the unpositioned search or accepts keyboard focus', async () => {
    const { context, page, held, errors } = await fixture({ holdLayout: true });
    try {
        await page.goto(base, { waitUntil: 'commit' });
        await page.waitForFunction(() => !!document.getElementById('search-box'));
        for (let count = 0; !held.layout.length && count < 60; count++) await page.waitForTimeout(25);
        assert.equal(held.layout.length, 1, 'the critical layout script remains held');
        await page.waitForTimeout(650);
        assert.equal(await page.evaluate(() => document.documentElement.classList.contains('nt-booting')), true);
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => !!document.activeElement.closest('.widget')), false,
            'uninitialized widgets are not keyboard targets');
        assert.deepEqual(await page.evaluate(() => __startupAudit.invalidVisible), []);
        await held.layout.shift().continue();
        await ready(page);
        const audit = await page.evaluate(() => __startupAudit);
        assert(audit.samples >= 3, 'the loading interval was actually observed');
        assert(audit.firstVisible && audit.firstVisible.layout && !audit.firstVisible.booting);
        assert.deepEqual(audit.invalidVisible, []);
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('unresolved external font stylesheets cannot delay local layout or search usability', async () => {
    const { context, page, held, errors } = await fixture({ holdFonts: true });
    try {
        await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 8000 });
        await ready(page);
        assert(held.fonts.length >= 2, 'Google Fonts and Font Awesome requests are still unresolved');
        await page.keyboard.press('Control+k');
        assert.equal(await page.locator('#search-input').evaluate(el => document.activeElement === el), true);
        await page.locator('#search-input').fill('離線字型');
        await page.waitForFunction(() => document.querySelectorAll('.suggestion-item[data-query-action="false"]').length === 2);
        await page.keyboard.press('ArrowDown');
        assert.equal(await page.locator('.suggestion-item').first().getAttribute('aria-selected'), 'true');
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#search-input').getAttribute('aria-expanded'), 'false');
        assert.deepEqual(await page.evaluate(() => __startupAudit.invalidVisible), []);
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

async function seedPoster(context, variant, format = 'webp') {
    await context.addInitScript(({ variant, format }) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 2;
        const draw = canvas.getContext('2d');
        draw.fillStyle = '#345e78'; draw.fillRect(0, 0, 2, 2);
        const meta = { type: 'video', source: variant === 'default' ? 'default' : 'file', name: 'fixture.mp4', url: '' };
        const identity = JSON.stringify(meta);
        const image = variant === 'oversized' ? 'data:image/webp;base64,' + 'A'.repeat(180001) :
            variant === 'invalid-type' ? 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' : canvas.toDataURL('image/' + format);
        const preview = { version: 1, identity: variant === 'mismatched' ? identity + ' ' : identity, image };
        localStorage.setItem('nt_background_v1', identity);
        localStorage.setItem('nt_startup_background_v1', JSON.stringify(preview));
        localStorage.setItem('nt_appearance_v1', variant === 'bad-appearance' ? '{malformed' : JSON.stringify({ transparency: 52, blur: 25 }));
    }, { variant, format });
}

test('matching startup posters paint before the UI with saved opacity and blur, even if appearance JSON is malformed', async () => {
    for (const [variant, format] of [['valid', 'webp'], ['valid', 'jpeg'], ['bad-appearance', 'webp']]) {
        const { context, page, held, errors } = await fixture({ holdLayout: true });
        try {
            await seedPoster(context, variant, format);
            await page.goto(base, { waitUntil: 'commit' });
            await page.locator('#startup-backdrop').waitFor({ state: 'visible' });
            const result = await page.locator('#startup-backdrop').evaluate(el => {
                const css = getComputedStyle(el);
                return { image: css.backgroundImage, opacity: css.opacity, blur: css.filter,
                    visibility: css.visibility, booting: document.documentElement.classList.contains('nt-booting') };
            });
            assert.equal(result.booting, true);
            assert.equal(result.visibility, 'visible');
            assert(result.image.startsWith('url("data:image/' + format + ';base64,'));
            assert.equal(result.opacity, variant === 'bad-appearance' ? '1' : '0.48');
            assert.equal(result.blur, variant === 'bad-appearance' ? 'blur(0px)' : 'blur(10px)');
            assert.equal(await page.locator('#search-input').isVisible(), false);
            assert.equal(held.layout.length, 1, 'the media preview does not depend on layout initialization');
            assert.deepEqual(await page.evaluate(() => __startupAudit.invalidVisible), []);
            assert.deepEqual(errors, []);
        } finally { await context.close(); }
    }
});

test('stale, default, unsupported and oversized startup posters never paint', async () => {
    for (const variant of ['mismatched', 'default', 'invalid-type', 'oversized']) {
        const { context, page, errors } = await fixture({ holdLayout: true });
        try {
            await seedPoster(context, variant);
            await page.goto(base, { waitUntil: 'commit' });
            await page.waitForFunction(() => !!document.getElementById('startup-backdrop'));
            assert.equal(await page.locator('#startup-backdrop').isVisible(), false, variant);
            assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-startup-preview')), false, variant);
            assert.equal(await page.locator('#search-input').isVisible(), false);
            assert.deepEqual(await page.evaluate(() => __startupAudit.invalidVisible), []);
            assert.deepEqual(errors, []);
        } finally { await context.close(); }
    }
});

test('missing essential module shows a usable retry and keyboard reload recovers', async () => {
    const { context, page, errors } = await fixture();
    let attempts = 0;
    await context.route(/\/js\/layout-engine\.js(?:\?.*)?$/, route => {
        attempts++;
        return attempts === 1 ? route.fulfill({ contentType: 'application/javascript', body: '/* unavailable module fixture */' }) : route.continue();
    });
    try {
        await page.goto(base, { waitUntil: 'domcontentloaded' });
        await page.getByRole('alert').filter({ has: page.locator('#startup-retry') }).waitFor({ state: 'visible' });
        assert.equal(await page.evaluate(() => document.documentElement.classList.contains('nt-booting')), true);
        assert.equal(await page.locator('#search-input').isVisible(), false);
        assert.deepEqual(await page.evaluate(() => __startupAudit.invalidVisible), []);
        await Promise.all([
            page.waitForEvent('domcontentloaded'),
            page.locator('#startup-retry').press('Enter')
        ]);
        await ready(page);
        assert.equal(attempts, 2, 'retry performs a real document load');
        assert.equal(await page.locator('#startup-error').isVisible(), false);
        assert.deepEqual(await page.evaluate(() => __startupAudit.invalidVisible), []);
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('a stalled startup reaches its bounded error state and late completion removes it', { timeout: 22000 }, async () => {
    const { context, page, held, errors } = await fixture({ holdLayout: true });
    try {
        await page.goto(base, { waitUntil: 'commit' });
        await page.locator('#startup-error').waitFor({ state: 'visible', timeout: 16000 });
        assert.equal(held.layout.length, 1, 'the pending script has not been silently released');
        assert.equal(await page.locator('#search-input').isVisible(), false);
        await page.keyboard.press('Tab');
        assert.equal(await page.locator('#startup-retry').evaluate(el => document.activeElement === el), true,
            'the error action remains keyboard reachable while ordinary chrome is hidden');
        assert.deepEqual(await page.evaluate(() => __startupAudit.invalidVisible), []);
        await held.layout.shift().continue();
        await ready(page);
        assert.equal(await page.locator('#startup-error').isVisible(), false, 'late success does not leave an obsolete retry overlay');
        assert.deepEqual(await page.evaluate(() => __startupAudit.invalidVisible), []);
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

for (const [width, height] of [[1920, 1080], [3440, 1440], [5120, 1440]]) {
    test(`first usable render preserves saved geometry and keyboard search at ${width}×${height}`, async () => {
        const { context, page, errors } = await fixture({ width, height });
        try {
            await page.goto(base, { waitUntil: 'domcontentloaded' });
            await ready(page);
            const before = await page.locator('.widget[data-type="search"]').boundingBox();
            assert(before.x > 0 && before.y > 0, 'initial search has its home position, not the document origin');
            assert(before.x + before.width <= width + 1 && before.y + before.height <= height + 1);
            assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
            assert.equal(await page.locator('#search-input').evaluate(el => document.activeElement === el), false,
                'startup does not take the browser address bar focus');
            await page.keyboard.press('Control+k');
            assert.equal(await page.locator('#search-input').evaluate(el => document.activeElement === el), true);
            await page.keyboard.press('Escape');
            await page.reload({ waitUntil: 'domcontentloaded' });
            await ready(page);
            const restored = await page.locator('.widget[data-type="search"]').boundingBox();
            for (const key of ['x', 'y', 'width', 'height']) assert(Math.abs(restored[key] - before[key]) <= 1, key + ' is stable after reload');
            assert.deepEqual(await page.evaluate(() => __startupAudit.invalidVisible), []);
            assert.deepEqual(errors, []);
        } finally { await context.close(); }
    });
}
