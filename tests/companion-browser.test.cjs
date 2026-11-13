// Test artifacts stay local and are excluded from the published repository.
require('node:fs').mkdirSync('.impeccable/review', { recursive: true });
// Run against a local static server: NEWTAB_TEST_URL=http://127.0.0.1:4173 node --test tests/companion-browser.test.cjs
// Requires Playwright and an installed browser; Windows defaults to the Edge channel.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const url = process.env.NEWTAB_TEST_URL || 'http://127.0.0.1:4173/';
let browser;
let baseLayout;

before(async () => {
    browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(url);
    baseLayout = await page.evaluate(() => NewtabWidgets.getLayout());
    await page.close();
});
after(async () => { if (browser) await browser.close(); });

async function open(width = 1440, height = 900, layout, reducedMotion = 'no-preference') {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 600, hasTouch: width < 600, reducedMotion });
    if (layout) await context.addInitScript(value => localStorage.setItem('nt_layout_v1', JSON.stringify(value)), layout);
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => !!document.getElementById('home-companion').dataset.placement);
    return { page, context };
}

async function assertSafe(page) {
    const result = await page.evaluate(() => {
        const companion = document.getElementById('home-companion');
        const visible = element => element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
        if (companion.dataset.placement === 'hidden') return { hidden: true, inert: companion.inert };
        const triggerRect = document.getElementById('companion-trigger').getBoundingClientRect();
        const rect = { left: triggerRect.left, top: triggerRect.top, right: triggerRect.right, bottom: triggerRect.bottom };
        if (companion.dataset.placement === 'portrait') {
            // Test projected layers, including the disc's soft shadow, rather than
            // only the untransformed click target.
            companion.querySelectorAll('.companion-figure, .companion-disc').forEach(layer => {
                const bounds = layer.getBoundingClientRect();
                const shadow = layer.matches('.companion-disc') ? 32 : 0;
                rect.left = Math.min(rect.left, bounds.left - shadow);
                rect.right = Math.max(rect.right, bounds.right + shadow);
                rect.top = Math.min(rect.top, bounds.top - shadow);
                rect.bottom = Math.max(rect.bottom, bounds.bottom + shadow);
            });
        }
        const overlaps = (a, b) => a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;
        const obstacles = [...document.querySelectorAll('#widget-canvas .widget[data-active="true"], #side-rail-tab')].filter(visible);
        const hits = obstacles.filter(element => overlaps(rect, element.getBoundingClientRect())).map(element => element.dataset.id || element.id);
        const message = document.getElementById('companion-message');
        const speech = message.getBoundingClientRect();
        const speechVisible = visible(message);
        return {
            hidden: false, inert: companion.inert, hits,
            bounded: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
            speechBounded: !speechVisible || (speech.left >= 0 && speech.right <= innerWidth && speech.top >= 0 && speech.bottom <= innerHeight),
            speechHits: speechVisible ? obstacles.filter(element => overlaps(speech, element.getBoundingClientRect())).map(element => element.dataset.id || element.id) : []
        };
    });
    if (result.hidden) assert.equal(result.inert, true, 'hidden artwork must not retain an active control');
    else {
        assert.equal(result.inert, false);
        assert.equal(result.bounded, true);
        assert.deepEqual(result.hits, [], 'artwork must not overlap functional widgets or the menu entry');
        assert.equal(result.speechBounded, true);
        assert.deepEqual(result.speechHits, [], 'greeting must not cover functional widgets');
    }
    return result;
}

function populated(dense = false) {
    const layout = JSON.parse(JSON.stringify(baseLayout));
    const rectangles = [[.65, .24, .32, .6]];
    if (dense) rectangles.push([.01, .01, .26, .16], [.37, .01, .26, .16], [.73, .01, .26, .16]);
    rectangles.forEach(([x, y, w, h], index) => layout.widgets.push({
        id: 'notes-companion-test-' + index, type: 'notes', x, y, w, h, z: 30 + index,
        pinned: false, options: { content: '已儲存的工作區筆記 ' + index }
    }));
    return layout;
}

test('fresh desktop and mobile artwork and greetings remain clear of controls', async () => {
    for (const [width, height] of [[2560, 1440], [1920, 1080], [1440, 900], [1280, 720], [1279, 800], [1200, 800], [1100, 900], [1100, 800], [390, 844], [320, 640]]) {
        const { page, context } = await open(width, height);
        try {
            assert.equal((await assertSafe(page)).hidden, false);
            for (let index = 0; index < 3; index++) {
                await page.locator('#companion-trigger').click();
                await page.waitForTimeout(250);
                await assertSafe(page);
            }
            if (width >= 1100) {
                assert.equal(await page.locator('#home-companion').getAttribute('data-placement'), 'portrait', 'fresh desktop retains the full scene at ' + width + 'x' + height);
                assert.notEqual(await page.locator('.companion-portrait').evaluate(element => getComputedStyle(element).maskImage), 'none');
                assert.equal(await page.locator('.companion-ledge, .companion-recess').count(), 0, 'the rejected window and ledge do not return');
                const disc = await page.locator('.companion-disc').evaluate(element => ({ width: element.offsetWidth, height: element.offsetHeight, radius: getComputedStyle(element).borderRadius }));
                assert.equal(disc.width, disc.height, 'the supporting surface stays circular');
                assert.equal(disc.radius, '50%');
            }
        } finally { await context.close(); }
    }
});

test('saved widgets force a safe dock through resizing and restore the portrait when removed', async () => {
    const { page, context } = await open(1440, 900, populated());
    try {
        assert.equal(await page.locator('#home-companion').getAttribute('data-placement'), 'dock');
        for (const [width, height] of [[1440, 900], [1100, 900], [1000, 700], [390, 844], [320, 640], [1440, 900]]) {
            await page.setViewportSize({ width, height });
            await page.waitForTimeout(200);
            await assertSafe(page);
        }
        await page.evaluate(() => NewtabWidgets.removeById('notes-companion-test-0'));
        await page.waitForFunction(() => document.getElementById('home-companion').dataset.placement === 'portrait');
        await assertSafe(page);
    } finally { await context.close(); }
});

test('a fully occupied portrait and dock region hides and makes the companion inert', async () => {
    const { page, context } = await open(1440, 900, populated(true));
    try {
        assert.equal(await page.locator('#home-companion').getAttribute('data-placement'), 'hidden');
        await assertSafe(page);
        const focused = await page.evaluate(() => { document.getElementById('companion-trigger').focus(); return document.activeElement.id; });
        assert.notEqual(focused, 'companion-trigger');
    } finally { await context.close(); }
});

test('drawer, arranging and mobile search suppress the companion until the action ends', async () => {
    const { page, context } = await open(390, 844);
    try {
        await page.locator('#side-rail-tab').click();
        await page.waitForFunction(() => document.getElementById('home-companion').inert);
        await page.getByRole('tab', { name: '個人化', exact: true }).click();
        await page.locator('#arrange-home').click();
        assert.equal(await page.locator('#home-companion').getAttribute('aria-hidden'), 'true');
        await page.getByRole('button', { name: '完成主畫面編輯', exact: true }).click();
        await page.waitForFunction(() => !document.getElementById('home-companion').inert);
        await page.locator('#search-input').tap();
        await page.waitForFunction(() => document.getElementById('home-companion').inert);
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.getElementById('home-companion').inert);
        await assertSafe(page);
    } finally { await context.close(); }
});

test('scrolling populated mobile widgets hides immediately and rechecks the resting viewport', async () => {
    const { page, context } = await open(390, 844);
    try {
        await page.evaluate(() => { NewtabWidgets.addFromCatalog('notes'); NewtabWidgets.addFromCatalog('todo'); NewtabWidgets.exitArrange(); });
        await page.waitForTimeout(250);
        const scrolled = await page.evaluate(() => {
            const canvas = document.getElementById('widget-canvas');
            canvas.scrollTop = canvas.scrollHeight;
            return canvas.scrollHeight > canvas.clientHeight;
        });
        assert.equal(scrolled, true, 'fixture must exercise actual canvas scrolling');
        await page.waitForFunction(() => document.getElementById('home-companion').inert);
        await page.waitForTimeout(220);
        await assertSafe(page);
    } finally { await context.close(); }
});

test('reduced motion keeps static depth, with no pointer movement or greeting animation', async () => {
    const { page, context } = await open(1440, 900, undefined, 'reduce');
    try {
        const initial = await page.locator('.companion-scene').evaluate(element => getComputedStyle(element).transform);
        assert.match(initial, /^matrix3d/, 'reduced motion retains the authored static perspective');
        await page.locator('#companion-trigger').click();
        await page.mouse.move(1000, 320);
        await page.waitForTimeout(450);
        const styles = await page.locator('#companion-trigger').evaluate(element => ({
            transform: getComputedStyle(element).transform,
            animation: getComputedStyle(element.querySelector('.companion-portrait')).animationName
        }));
        assert.deepEqual(styles, { transform: 'none', animation: 'none' });
        assert.equal(await page.locator('.companion-scene').evaluate(element => getComputedStyle(element).transform), initial);
        await assertSafe(page);
    } finally { await context.close(); }
});

test('pointer depth has distinct layers, a stable hit target and safe bounded extremes', async () => {
    for (const [width, height] of [[2560, 1440], [1920, 1080], [1440, 900], [1280, 720], [1200, 800], [1100, 900], [1100, 800]]) {
        const { page, context } = await open(width, height);
        try {
            const trigger = page.locator('#companion-trigger');
            const initial = await trigger.boundingBox();
            const sceneBefore = await page.locator('.companion-scene').evaluate(element => getComputedStyle(element).transform);
            for (const [x, y] of [[.06, .06], [.94, .06], [.94, .94], [.06, .94]]) {
                await page.mouse.move(initial.x + initial.width * x, initial.y + initial.height * y);
                await page.waitForTimeout(450);
                assert.deepEqual(await trigger.boundingBox(), initial, 'hover does not move the click target');
                assert.notEqual(await page.locator('.companion-scene').evaluate(element => getComputedStyle(element).transform), sceneBefore);
                const depth = await page.locator('#home-companion').evaluate(element => {
                    const matrix = selector => new DOMMatrix(getComputedStyle(element.querySelector(selector)).transform);
                    return [matrix('.companion-disc').m43, matrix('.companion-figure').m43];
                });
                assert.ok(depth[0] < 0 && depth[1] > 0, 'the character and supporting disc occupy distinct front/back depths');
                await assertSafe(page);
            }
            await page.mouse.move(20, height - 20);
            await page.waitForTimeout(450);
            assert.equal(await page.locator('.companion-scene').evaluate(element => getComputedStyle(element).transform), sceneBefore);
            assert.equal(await page.locator('#home-companion').evaluate(element => element.classList.contains('is-tracking')), false);
            await assertSafe(page);
        } finally { await context.close(); }
    }
});

test('an uploaded black background preserves the circular scene and readable greeting', async () => {
    const { page, context } = await open();
    try {
        await page.locator('#side-rail-tab').focus();
        await page.locator('#side-rail-tab').click();
        await page.getByRole('tab', { name: '個人化', exact: true }).click();
        await page.locator('#background-home').click();
        await page.locator('#bg-file').setInputFiles({
            name: 'black.png', mimeType: 'image/png',
            buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
        });
        await page.locator('#confirm-upload').click();
        await page.waitForFunction(() => document.body.classList.contains('has-custom-background'));
        await page.waitForFunction(() => !document.getElementById('home-companion').inert);
        await page.locator('#companion-trigger').click();
        await page.waitForTimeout(950);
        await page.mouse.move(30, 850);
        await page.waitForTimeout(450);
        await assertSafe(page);
        const scene = await page.locator('#home-companion').evaluate(element => {
            const figure = element.querySelector('.companion-figure').getBoundingClientRect();
            const rear = element.querySelector('.companion-disc').getBoundingClientRect();
            const message = getComputedStyle(element.querySelector('.companion-message'));
            return { protrudes: figure.top + 80 < rear.top, paper: message.backgroundColor, ink: message.color };
        });
        assert.deepEqual(scene, { protrudes: true, paper: 'rgb(248, 251, 253)', ink: 'rgb(64, 89, 113)' });
        await page.screenshot({ path: '.impeccable/review/round5-companion-custom-black.png' });
    } finally { await context.close(); }
});
