// Real pointer and keyboard editing with isolated profiles; no external requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test, before, after } = require('node:test');
const { chromium } = require('playwright');
const base = process.env.NEWTAB_TEST_URL || 'http://127.0.0.1:4174/';
const origin = new URL(base).origin;
let browser;
before(async () => {
    browser = await chromium.launch(process.env.NEWTAB_BROWSER_PATH ? { headless: true, executablePath: process.env.NEWTAB_BROWSER_PATH } :
        { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
    fs.mkdirSync('.impeccable/review', { recursive: true });
});
after(async () => { await browser?.close(); });

function semanticGrid(width, height) {
    const narrow = width <= 600;
    let columns = narrow ? 4 : Math.max(1, Math.floor((width - 48) / 96));
    if (!narrow && columns > 14) columns -= columns % 2;
    const pitchX = narrow ? (width - 40) / 4 : 96;
    return { narrow, columns, pitchX, pitchY: 104, left: (width - columns * pitchX) / 2,
        top: narrow ? 96 : Math.max(0, (height - 760) / 2) + 24 };
}
function profile(width, height, type = 'app') {
    const grid = semanticGrid(width, height), appWidth = width <= 350 ? 64 : 68;
    const size = type === 'app' ? { width: appWidth, height: 80 } : { width: 280, height: 200 };
    const col = grid.narrow ? 1 : 3, row = 1;
    const left = grid.left + col * grid.pitchX + (type === 'app' ? (grid.pitchX - size.width) / 2 : 4);
    const top = grid.top + row * grid.pitchY;
    return { v: 4, companionMigrated: true, rail: { open: false, width: 300, tab: 'personalize' }, widgets: [{
        id: 'fine-item', type, x: left / width, y: top / height, w: size.width / width, h: size.height / height, z: 1, pinned: false,
        options: { ...(type === 'app' ? { appId: 'images', size: 'm' } : { content: '保留我的筆記' }),
            [grid.narrow ? 'homeMobile' : 'homeDesktop']: { v: 3, columns: grid.columns, col, row, ...size,
                edge: null, edgeY: null, spanX: type === 'app' ? null : 3, spanY: type === 'app' ? null : 2 } }
    }] };
}
async function setup(width, height, layout) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce',
        hasTouch: width <= 600, isMobile: width <= 600, serviceWorkers: 'block' });
    await context.route(/^https?:\/\//, route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    if (layout) await context.addInitScript(layout => {
        if (!sessionStorage.getItem('fine-grid-seeded')) {
            localStorage.setItem('nt_layout_v1', JSON.stringify(layout));
            sessionStorage.setItem('fine-grid-seeded', '1');
        }
    }, layout);
    const page = await context.newPage(); page.setDefaultTimeout(6000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(base, { waitUntil: 'domcontentloaded' }); await ready(page);
    return { context, page, errors };
}
async function ready(page) {
    await page.waitForFunction(() => window.NewtabWidgets?.getLayout() && document.documentElement.classList.contains('nt-ready'));
}
async function geometry(page, id = 'fine-item') {
    return page.locator('.widget[data-id="' + id + '"]').evaluate(el =>
        Object.fromEntries(['left', 'top', 'width', 'height'].map(key => [key, parseFloat(el.style[key])])));
}
function same(actual, expected, label) {
    for (const key of ['left', 'top', 'width', 'height']) assert(Math.abs(actual[key] - expected[key]) < .1,
        `${label}: ${key} ${actual[key]} vs ${expected[key]}`);
}
async function gridPaintMatches(page, rect) {
    const paint = await page.locator('#widget-canvas').evaluate(el => {
        const style = getComputedStyle(el, '::before');
        return { sizes: style.backgroundSize.split(',').map(s => s.trim().split(/\s+/).map(parseFloat)),
            positions: style.backgroundPosition.split(',').map(s => s.trim().split(/\s+/).map(parseFloat)) };
    });
    assert.equal(paint.sizes.length, 2, 'editor shows semantic and fine grid layers');
    for (const [axis, position] of ['left', 'top'].map((key, index) => [index, rect[key]])) {
        const step = paint.sizes[1][axis], origin = paint.positions[1][axis] + step / 2;
        assert(step > 0 && step < paint.sizes[0][axis], 'fine grid uses smaller visible spacing');
        const cells = (position - origin) / step;
        assert(Math.abs(cells - Math.round(cells)) < .01, 'visible grid centers match the selected item\'s ' + (axis ? 'vertical' : 'horizontal') + ' snap phase');
    }
}
async function dragDelta(page, dx, dy, id = 'fine-item') {
    const card = page.locator('.widget[data-id="' + id + '"]'), box = await card.boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await page.mouse.move(x, y); await page.mouse.down();
    await page.waitForFunction(id => document.querySelector('.widget.is-dragging')?.dataset.id === id, id);
    await page.mouse.move(x + dx, y + dy, { steps: 4 });
    const preview = await page.locator('#home-drop-preview').evaluate(el => ({ state: el.dataset.state,
        rect: Object.fromEntries(['left', 'top', 'width', 'height'].map(key => [key, parseFloat(el.style[key])])) }));
    assert.equal(preview.state, 'place', 'the fine target is a valid placement');
    await page.mouse.up();
    same(await geometry(page, id), preview.rect, 'actual drop equals the shown preview');
    return preview.rect;
}

for (const [width, height] of [[1920, 1080], [3440, 1440], [5120, 1440], [390, 844], [320, 640]]) {
    test(`fine pointer movement, keyboard and saved geometry at ${width}×${height}`, async () => {
        const { context, page, errors } = await setup(width, height, profile(width, height));
        try {
            const original = await geometry(page), grid = await page.evaluate(() => NewtabLayout.homeGrid());
            assert.equal(grid.stepX, grid.pitchX / 8); assert.equal(grid.stepY, 13);
            assert.equal(grid.pitchY, 104, 'existing footprint and profile units remain unchanged');
            const first = await dragDelta(page, grid.stepX, 0);
            same(first, { ...original, left: original.left + grid.stepX }, 'one fine horizontal move');
            const second = await dragDelta(page, grid.stepX, grid.stepY);
            same(second, { ...original, left: original.left + 2 * grid.stepX, top: original.top + grid.stepY }, 'two distinct sub-cell targets');
            await gridPaintMatches(page, second);
            if (width === 3440) await page.screenshot({ path: '.impeccable/review/fine-grid-3440.png' });
            assert(second.left - original.left < grid.pitchX && second.top - original.top < grid.pitchY);
            await page.locator('#arrange-done-bar').click(); await page.reload({ waitUntil: 'domcontentloaded' }); await ready(page);
            same(await geometry(page), second, 'fine position survives save and reload');
            await page.evaluate(() => NewtabWidgets.enterArrange());
            const card = page.locator('.widget[data-id="fine-item"]'); await card.focus();
            await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown');
            same(await geometry(page), { ...second, left: second.left + grid.stepX, top: second.top + grid.stepY }, 'keyboard uses the same fine increment');
            await page.locator('#arrange-cancel').click();
            same(await geometry(page), second, 'cancel restores the saved fine position');
            await page.reload({ waitUntil: 'domcontentloaded' }); await ready(page);
            same(await geometry(page), second, 'cancel does not overwrite the persisted profile');
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            assert.deepEqual(errors, []);
        } finally { await context.close(); }
    });
}

test('nearby launcher spacing can shrink by one fine step without overlapping', async () => {
    const layout = profile(1920, 1080), left = layout.widgets[0];
    const right = JSON.parse(JSON.stringify(left)); right.id = 'fine-neighbor'; right.options.appId = 'gmail';
    right.options.homeDesktop.col++; right.x += 96 / 1920; right.z++;
    layout.widgets.push(right);
    const { context, page, errors } = await setup(1920, 1080, layout);
    try {
        const a = await geometry(page), b = await geometry(page, 'fine-neighbor');
        const placed = await dragDelta(page, -12, 0, 'fine-neighbor');
        assert.equal(placed.left - a.left, 84, 'one eighth-step reduces the old96px launcher pitch');
        assert.equal(placed.left - a.left - a.width, 16, 'the remaining gap is smaller and still valid');
        assert.equal(placed.top, b.top, 'the existing row remains aligned');
        same(await geometry(page), a, 'neighbor is not displaced');
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('resizing by a fine step preserves exact custom dimensions through reload', async () => {
    const { context, page, errors } = await setup(1920, 1080, profile(1920, 1080, 'notes'));
    try {
        const original = await geometry(page);
        await page.evaluate(() => NewtabWidgets.enterArrange());
        const card = page.locator('.widget[data-id="fine-item"]'); await card.focus(); await page.keyboard.press('Enter');
        const handle = page.locator('.widget-handle[data-handle="se"]'); const box = await handle.boundingBox();
        const x = box.x + box.width / 2, y = box.y + box.height / 2;
        await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 12, y + 13, { steps: 4 });
        const preview = await page.locator('#home-drop-preview').evaluate(el => Object.fromEntries(
            ['left', 'top', 'width', 'height'].map(key => [key, parseFloat(el.style[key])])));
        await page.mouse.up();
        const resized = await geometry(page);
        same(resized, { ...original, width: original.width + 12, height: original.height + 13 }, 'fine resize');
        same(resized, preview, 'resize drop matches preview');
        await gridPaintMatches(page, resized);
        await page.locator('#arrange-done-bar').click(); await page.reload({ waitUntil: 'domcontentloaded' }); await ready(page);
        same(await geometry(page), resized, 'fractional semantic spans keep exact pixel size');
        assert.equal(await page.getByRole('textbox', { name: '備註內容', exact: true }).inputValue(), '保留我的筆記');
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('off-lattice saved cards resize only the requested edge and retain the opposite anchor', async () => {
    const original = { left: 350, top: 302, width: 457, height: 263 };
    const layout = profile(1440, 900, 'notes'), grid = semanticGrid(1440, 900), widget = layout.widgets[0];
    Object.assign(widget, { x: original.left / 1440, y: original.top / 900, w: original.width / 1440, h: original.height / 900 });
    Object.assign(widget.options.homeDesktop, { col: (original.left - grid.left - 4) / grid.pitchX,
        row: (original.top - grid.top) / grid.pitchY, width: original.width, height: original.height, spanX: null, spanY: null });
    const { context, page, errors } = await setup(1440, 900, layout);
    try {
        const card = page.locator('.widget[data-id="fine-item"]');
        same(await geometry(page), original, 'legacy fixture starts at its exact custom rectangle');
        for (const [edge, dx, dy, expected] of [
            ['e', 12, 0, { ...original, width: 469 }],
            ['s', 0, 13, { ...original, height: 276 }],
            ['w', 12, 0, { ...original, left: 362, width: 445 }],
            ['n', 0, 13, { ...original, top: 315, height: 250 }]
        ]) {
            await page.evaluate(() => NewtabWidgets.enterArrange()); await card.focus(); await page.keyboard.press('Enter');
            const handle = await page.locator('.widget-handle[data-handle="' + edge + '"]').boundingBox();
            const x = handle.x + handle.width / 2, y = handle.y + handle.height / 2;
            await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx, y + dy, { steps: 4 });
            const preview = await page.locator('#home-drop-preview').evaluate(el => Object.fromEntries(
                ['left','top','width','height'].map(key => [key, parseFloat(el.style[key])])));
            await page.mouse.up();
            same(await geometry(page), expected, edge + ' resize preserves the untouched axis and fixed edge');
            same(preview, expected, edge + ' preview uses the same anchored geometry');
            if (edge === 'w') assert.equal((await geometry(page)).left + (await geometry(page)).width, 807, 'west resize retains the original right edge');
            if (edge === 'n') assert.equal((await geometry(page)).top + (await geometry(page)).height, 565, 'north resize retains the original bottom edge');
            await page.locator('#arrange-cancel').click(); same(await geometry(page), original, edge + ' resize cancels exactly');
        }
        for (const [key, expected] of [
            ['ArrowRight', { ...original, width: 469 }], ['ArrowLeft', { ...original, width: 445 }],
            ['ArrowDown', { ...original, height: 276 }], ['ArrowUp', { ...original, height: 250 }]
        ]) {
            await page.evaluate(() => NewtabWidgets.enterArrange()); await card.focus(); await page.keyboard.press('Enter');
            await page.keyboard.press('Shift+' + key);
            same(await geometry(page), expected, 'Shift+' + key + ' keeps position and unrequested dimension');
            if (key === 'ArrowUp') {
                await page.locator('#arrange-done-bar').click(); await page.reload({ waitUntil: 'domcontentloaded' }); await ready(page);
                same(await geometry(page), expected, 'anchored custom resize persists without lattice rounding');
            } else {
                await page.locator('#arrange-cancel').click(); same(await geometry(page), original, 'keyboard resize cancel restores custom dimensions');
            }
        }
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('grandfathered small cards can grow and return to their original size in the same edit session', async () => {
    const original = { left: 350, top: 302, width: 220, height: 160 };
    const layout = profile(1440, 900, 'notes'), grid = semanticGrid(1440, 900), widget = layout.widgets[0];
    Object.assign(widget, { x: original.left / 1440, y: original.top / 900, w: original.width / 1440, h: original.height / 900 });
    Object.assign(widget.options.homeDesktop, { col: (original.left - grid.left - 4) / grid.pitchX,
        row: (original.top - grid.top) / grid.pitchY, width: original.width, height: original.height, spanX: null, spanY: null });
    const { context, page, errors } = await setup(1440, 900, layout);
    try {
        same(await geometry(page), original, 'saved small card retains its starting dimensions');
        await page.evaluate(() => NewtabWidgets.enterArrange());
        const card = page.locator('.widget[data-id="fine-item"]'); await card.focus(); await page.keyboard.press('Enter');
        await page.keyboard.press('Shift+ArrowDown');
        same(await geometry(page), { ...original, height: 173 }, 'old small height grows by13');
        await page.keyboard.press('Shift+ArrowUp');
        same(await geometry(page), original, 'the original160px minimum does not ratchet up to173');
        await page.keyboard.press('Shift+ArrowRight');
        same(await geometry(page), { ...original, width: 232 }, 'custom width grows by12');
        await page.keyboard.press('Shift+ArrowLeft');
        same(await geometry(page), original, 'horizontal resize is equally reversible');
        await page.keyboard.press('Shift+ArrowUp');
        same(await geometry(page), original, 'shrinking stops at the original grandfathered height');
        await page.locator('#arrange-done-bar').click(); await page.reload({ waitUntil: 'domcontentloaded' }); await ready(page);
        same(await geometry(page), original, 'reversible editing does not inflate the saved card');
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('long-pressing the catalog applies the exact fine-grid preview on drop and reload', async () => {
    const { context, page, errors } = await setup(1920, 1080, profile(1920, 1080));
    try {
        await page.locator('#side-rail-tab').focus(); await page.keyboard.press('Enter');
        await page.getByRole('tab', { name: '組件', exact: true }).click();
        const icon = page.locator('.list-row.is-placeable[data-place-type="notes"] .list-icon');
        await icon.scrollIntoViewIfNeeded(); const box = await icon.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
        await page.waitForFunction(() => document.body.classList.contains('is-catalog-placing'));
        await page.mouse.move(861, 507, { steps: 10 });
        const preview = await page.locator('#home-drop-preview').evaluate(el => ({ state: el.dataset.state,
            rect: Object.fromEntries(['left','top','width','height'].map(key => [key, parseFloat(el.style[key])])) }));
        assert.equal(preview.state, 'place');
        await gridPaintMatches(page, preview.rect);
        await page.mouse.up();
        const card = page.locator('.widget[data-type="notes"]'); await card.waitFor();
        const id = await card.getAttribute('data-id');
        same(await geometry(page, id), preview.rect, 'new catalog card uses the already displayed target');
        await page.locator('#arrange-done-bar').click(); await page.reload({ waitUntil: 'domcontentloaded' }); await ready(page);
        same(await geometry(page, id), preview.rect, 'catalog target survives reload without another snap pass');
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('fresh defaults retain the shipped geometry before any edit at desktop and phone sizes', async () => {
    // Captured from the shipped semantic grid before introducing finer editing steps.
    const baseline = [
        [1920, 1080, [484,288,568,200], [484,496,568,96], [590,600,68,80], [1156,288,280,360]],
        [3440, 1440, [1244,468,568,200], [1244,676,568,96], [1350,780,68,80], [1916,468,280,360]],
        [5120, 1440, [2084,468,568,200], [2084,676,568,96], [2190,780,68,80], [2756,468,280,360]],
        [390, 844, [24,200,342,200], [24,408,342,96], [29.75,512,68,80], [115,616,160,208]],
        [320, 640, [24,96,272,200], [24,304,272,96], [23,408,64,80], [80,512,160,208]]
    ];
    for (const [width, height, ...rects] of baseline) {
        const { context, page, errors } = await setup(width, height);
        try {
            for (const [index, id] of ['clock-1','search-1','app-images','companion-1'].entries()) {
                const [left, top, w, h] = rects[index];
                same(await geometry(page, id), { left, top, width: w, height: h }, `${width}px shipped ${id}`);
            }
            assert.deepEqual(errors, []);
        } finally { await context.close(); }
    }
});

test('legacy fractional profiles and currentv3 custom geometry remain unchanged until an intentional edit', async () => {
    const old = JSON.parse(fs.readFileSync('tests/fixtures/legacy-four-apps.json', 'utf8'));
    old.widgets = old.widgets.filter(widget => widget.type === 'app'); old.companionMigrated = true;
    const current = profile(1440, 900, 'notes');
    Object.assign(current.widgets[0].options.homeDesktop, { col: 3.137, row: 1.123, width: 457, height: 263, spanX: null, spanY: null });
    current.widgets[0].options.appearance = { alpha: .3, tint: '#d8eaf3' };
    for (const [name, layout] of [['legacy', old], ['currentv3', current]]) {
        const { context, page, errors } = await setup(1440, 900, layout);
        try {
            const original = Object.fromEntries(await Promise.all(layout.widgets.map(async w => [w.id, await geometry(page, w.id)])));
            if (name === 'legacy') old.widgets.forEach((w, index) => same(original[w.id],
                { left: 353.6 + index * 92, top: 544, width: 68, height: 80 }, 'legacy launcher row'));
            else same(original['fine-item'], { left: 48 + 3.137 * 96 + 4, top: 94 + 1.123 * 104, width: 457, height: 263 }, 'customv3 geometry');
            await page.evaluate(() => NewtabWidgets.enterArrange());
            for (const w of layout.widgets) same(await geometry(page, w.id), original[w.id], 'entering edit never snaps existing positions');
            await page.locator('#arrange-cancel').click(); await page.reload({ waitUntil: 'domcontentloaded' }); await ready(page);
            for (const w of layout.widgets) same(await geometry(page, w.id), original[w.id], 'unchanged profile reload');
            const saved = await page.evaluate(() => NewtabWidgets.getLayout());
            for (const w of layout.widgets) assert.deepEqual(saved.widgets.find(item => item.id === w.id).options.homeDesktop, w.options.homeDesktop);
            for (const viewport of [{ width: 3440, height: 1440 }, { width: 390, height: 844 }, { width: 1440, height: 900 }]) {
                await page.setViewportSize(viewport); await page.waitForTimeout(140);
            }
            for (const w of layout.widgets) same(await geometry(page, w.id), original[w.id], 'responsive roundtrip retains original geometry');
            assert.deepEqual(errors, []);
        } finally { await context.close(); }
    }
});
