// Real appearance controls and rendered search states; external navigation is stubbed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const base = process.env.NEWTAB_TEST_URL || 'http://127.0.0.1:4174/';
const origin = new URL(base).origin;
const custom = { fill: 'rgba(18, 52, 86, 0.4)', color: 'rgb(254, 220, 186)', radius: '7px' };
const defaults = { fill: 'rgb(216, 234, 243)', color: 'rgb(54, 95, 124)', radius: '22px' };
const darkSurface = { tint: '#102030', transparency: 32, blur: 30, border: 45, shadow: 35, radius: 13, text: 'light',
    fill: 'rgba(16, 32, 48, 0.68)', ink: 'rgb(244, 248, 252)', muted: 'rgb(224, 234, 242)' };
const lightSurface = { tint: '#e8f2fa', transparency: 10, blur: 10, border: 20, shadow: 10, radius: 24, text: 'dark',
    fill: 'rgba(232, 242, 250, 0.9)', ink: 'rgb(48, 57, 69)', muted: 'rgb(83, 100, 119)' };
const defaultSurface = { fill: 'rgba(248, 251, 253, 0.3)', blur: 0, border: 0, shadow: 0, radius: 18,
    ink: 'rgb(48, 57, 69)', muted: 'rgb(83, 100, 119)' };
let suggestionSequence = 0;
async function ready(page) {
    await page.goto(base); await page.waitForFunction(() => window.NewtabAppearance && window.NewtabWidgets);
}
async function edit(page) {
    await closeExpanded(page);
    await page.locator('.widget[data-type=search]').focus(); await page.keyboard.press('Shift+F10');
    await page.getByRole('menuitem', { name: '自訂組件外觀', exact: true }).click();
    await page.locator('.appearance-dialog').waitFor();
}
async function done(page) { await page.getByRole('button', { name: '完成', exact: true }).click(); }
async function closeExpanded(page) {
    if (await page.locator('.search-expand-layer.is-open').count()) {
        await page.locator('.search-back').click();
        await page.waitForFunction(() => !document.querySelector('.search-expand-layer.is-open, .search-expand-layer.is-closing'));
    }
}
async function openSearch(page) {
    await page.locator('#search-input').click();
    if (page.viewportSize().width <= 600) await page.locator('.search-expand-layer.is-open').waitFor();
}
async function color(page, label, value) {
    const input = page.locator(`input[type=color][aria-label="${label}"]`);
    await input.scrollIntoViewIfNeeded();
    await input.evaluate((el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); }, value);
}
async function paint(page) {
    return page.locator('#search-submit').evaluate(el => {
        const css = getComputedStyle(el), svg = getComputedStyle(el.querySelector('svg'));
        return { fill: css.backgroundColor, color: css.color, radius: css.borderTopLeftRadius,
            opacity: css.opacity, iconOpacity: svg.opacity, stroke: svg.stroke, shadow: css.boxShadow,
            outlineWidth: css.outlineWidth, transform: css.transform, scale: new DOMMatrix(css.transform).a,
            active: el.matches(':active'), focus: el.matches(':focus-visible') };
    });
}
async function assertPaint(page, expected, label) {
    const actual = await paint(page);
    for (const key of ['fill', 'color', 'radius']) assert.equal(actual[key], expected[key], label + ' ' + key);
    assert.equal(actual.opacity, '1', label + ': transparency affects background, not the entire control');
    assert.equal(actual.stroke, expected.color, label + ': arrow inherits the chosen icon color');
    return actual;
}
async function setCustom(page) {
    await color(page, '按鈕背景色', '#123456'); await color(page, '按鈕圖示顏色', '#fedcba');
    await page.getByRole('spinbutton', { name: '按鈕背景透明度', exact: true }).fill('60');
    await page.getByRole('spinbutton', { name: '按鈕圓角', exact: true }).fill('7');
}
async function setSurface(page, value) {
    await color(page, '組件背景色', value.tint);
    for (const [name, key] of [['組件背景透明度', 'transparency'], ['組件背景模糊', 'blur'], ['邊框濃度', 'border'], ['陰影濃度', 'shadow'], ['圓角', 'radius']]) {
        await page.getByRole('spinbutton', { name, exact: true }).fill(String(value[key]));
    }
    await page.getByRole('combobox', { name: '組件文字顏色', exact: true }).selectOption(value.text);
}
async function suggestions(page, expected, label, feedback = false) {
    await openSearch(page);
    await page.locator('#search-input').fill('外觀建議 ' + (++suggestionSequence));
    await page.waitForFunction(() => document.querySelectorAll('.suggestion-item[data-query-action="false"]').length === 3 &&
        document.querySelector('#suggestions-list').getAttribute('aria-busy') === 'false');
    const result = await page.locator('#suggestions-container').evaluate(el => {
        const read = node => { const c = getComputedStyle(node); return { fill: c.backgroundColor, blur: c.backdropFilter,
            border: c.borderTopColor, borderWidth: c.borderTopWidth, radius: c.borderTopLeftRadius,
            corners: [c.borderTopLeftRadius, c.borderTopRightRadius, c.borderBottomRightRadius, c.borderBottomLeftRadius],
            shadow: c.boxShadow, opacity: c.opacity }; };
        return { dropdown: read(el), input: read(document.querySelector('.search-input-wrapper')),
            moving: read(el.closest('.search-container')),
            text: [...el.querySelectorAll('.suggestion-text, .suggestion-text .match, .suggestion-text .rest')].map(node => getComputedStyle(node).color),
            icon: getComputedStyle(el.querySelector('.suggestion-icon')).color,
            listFill: getComputedStyle(el.querySelector('.suggestions-list')).backgroundColor,
            listCorners: read(el.querySelector('.suggestions-list')).corners,
            panel: el.closest('.search-expand-panel') ? read(el.closest('.search-expand-panel')) : null };
    });
    const surface = result.panel ? result.moving : result.dropdown;
    assert.equal(surface.fill, expected.fill, label + ': suggestions use the configured surface tint and alpha');
    assert.equal(surface.blur, `blur(${expected.blur * .4}px)`, label + ': suggestions use the configured blur');
    assert.equal(surface.radius, expected.radius + 'px', label + ': suggestions use the configured radius');
    assert.equal(surface.border, `rgba(82, 116, 140, ${expected.border / 100})`, label + ': edge follows the configured concentration');
    assert.equal(surface.borderWidth, '1px');
    const shadowAlpha = /rgba\(28, 50, 68, ([\d.]+)\)/.exec(surface.shadow);
    assert(shadowAlpha && Math.abs(Number(shadowAlpha[1]) - expected.shadow / 100 * .28) < .002, label + ': shadow follows the configured concentration');
    if (!result.panel) for (const key of ['fill', 'blur', 'border', 'borderWidth', 'radius', 'shadow']) {
        assert.equal(result.dropdown[key], result.input[key], label + ': dropdown and input share ' + key);
    }
    assert.equal(result.dropdown.opacity, '1', label + ': background transparency never fades the text');
    assert.equal(result.listFill, 'rgba(0, 0, 0, 0)', label + ': list has no independent opaque layer');
    assert.deepEqual(result.listCorners, result.dropdown.corners, label + ': every inner-list corner inherits its dropdown corner');
    assert(result.text.length >= 6 && result.text.every(ink => ink === expected.ink), label + ': matched and unmatched suggestion text use the chosen readable ink');
    assert.equal(result.icon, expected.muted, label + ': suggestion icons follow the chosen text scheme');
    if (result.panel) {
        for (const [name, child] of [['outer shell', result.panel], ['input', result.input], ['dropdown', result.dropdown]]) {
            assert.equal(child.fill, 'rgba(0, 0, 0, 0)', label + ': mobile ' + name + ' cannot double the surface alpha');
            assert.equal(child.shadow, 'none', label + ': mobile ' + name + ' adds no independent shadow');
            assert.equal(child.borderWidth, '0px', label + ': mobile ' + name + ' adds no independent edge');
            assert.equal(child.blur, 'none', label + ': mobile ' + name + ' adds no independent blur');
        }
    }
    if (feedback) {
        const row = page.locator('.suggestion-item').first();
        await page.mouse.move(0, 0);
        const idle = await row.evaluate(el => getComputedStyle(el).backgroundColor);
        await row.hover();
        const hovered = await row.evaluate(el => getComputedStyle(el).backgroundColor);
        assert.notEqual(hovered, idle, label + ': hover feedback remains visible');
        await page.mouse.move(0, 0); await page.locator('#search-input').focus(); await page.keyboard.press('ArrowDown');
        assert.equal(await row.getAttribute('aria-selected'), 'true');
        assert.equal(await row.evaluate(el => getComputedStyle(el).backgroundColor), hovered, label + ': keyboard selection has the same visible feedback');
        assert.equal(await row.locator('.suggestion-text').evaluate(el => getComputedStyle(el).color), expected.ink);
    }
}
async function surfaceSnapshot(page) {
    return page.evaluate(() => {
        const clock = document.querySelector('.widget[data-type=clock] .clock-glass');
        const notes = document.querySelector('.widget[data-type=notes]');
        return { clock: getComputedStyle(clock).backgroundColor,
            notesFill: getComputedStyle(notes.querySelector('.notes-body')).backgroundColor,
            notesOptions: NewtabWidgets.getLayout().widgets.find(w => w.type === 'notes').options.appearance };
    });
}
async function navigation(page, query, keyboard) {
    await openSearch(page); await page.locator('#search-input').fill(query);
    const next = page.waitForURL(url => url.origin === 'https://www.google.com' && url.searchParams.get('q') === query);
    if (keyboard) await page.keyboard.press('Enter'); else await page.locator('#search-submit').click();
    await next; assert.equal(await page.title(), 'Search appearance destination'); await ready(page);
}
(async () => {
    const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
    fs.mkdirSync('.impeccable/review', { recursive: true });
    try {
        for (const [width, height] of [[1440,900],[390,844],[320,640],[3440,1440],[5120,1440]]) {
            const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 600, hasTouch: width < 600, reducedMotion: 'reduce' });
            await context.route(/^https?:\/\//, route => new URL(route.request().url()).origin === origin ? route.continue() :
                route.request().isNavigationRequest() ? route.fulfill({ contentType: 'text/html', body: '<title>Search appearance destination</title>' }) : route.abort());
            await context.route('https://suggestqueries.google.com/**', route => {
                const url = new URL(route.request().url()), query = url.searchParams.get('q'), callback = url.searchParams.get('callback');
                assert.match(callback, /^__newtabSuggestions_\d+_\d+$/);
                return route.fulfill({ contentType: 'application/javascript', body: `${callback}(${JSON.stringify([query, [query + ' 第一項', query + ' 第二項', query + ' 第三項']])});` });
            });
            const page = await context.newPage(); page.setDefaultTimeout(6000);
            // Browser-owned Google hooks may run on the deliberately minimal
            // destination fixture; only this application's exceptions count.
            const errors = []; page.on('pageerror', error => { if (new URL(page.url()).origin === origin) errors.push(error.message); });
            await ready(page);
            await page.evaluate(() => {
                NewtabWidgets.addFromCatalog('notes');
                const note = NewtabWidgets.getLayout().widgets.find(w => w.type === 'notes');
                NewtabWidgets.setAppearance(note.id, { alpha: .6, tint: '#abcdee', radius: 11 });
            });
            const otherSurfaces = await surfaceSnapshot(page);
            await openSearch(page); assert.equal(await page.locator('#search-submit').isDisabled(), true);
            assert.equal((await assertPaint(page, defaults, 'empty default')).iconOpacity, '0.5');
            await edit(page);
            assert.equal(await page.getByRole('spinbutton', { name: '按鈕圓角', exact: true }).getAttribute('max'), '22');
            await setSurface(page, darkSurface);
            await setCustom(page);
            await page.getByRole('spinbutton', { name: '按鈕背景透明度', exact: true }).fill('100');
            await assertPaint(page, { ...custom, fill: 'rgba(18, 52, 86, 0)' }, 'fully transparent background keeps icon color');
            await page.getByRole('spinbutton', { name: '按鈕背景透明度', exact: true }).fill('60');
            await page.getByRole('spinbutton', { name: '按鈕圓角', exact: true }).fill('0');
            await assertPaint(page, { ...custom, radius: '0px' }, 'square button');
            await page.getByRole('spinbutton', { name: '按鈕圓角', exact: true }).fill('50');
            await page.getByRole('spinbutton', { name: '按鈕圓角', exact: true }).blur();
            assert.equal(await page.getByRole('spinbutton', { name: '按鈕圓角', exact: true }).inputValue(), '22', 'numeric radius clamps to a circle');
            await page.getByRole('spinbutton', { name: '按鈕圓角', exact: true }).fill('7');
            assert(await page.locator('.appearance-dialog').evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'appearance dialog has no horizontal overflow');
            assert(await page.getByRole('button', { name: '完成', exact: true }).evaluate(el => {
                const r = el.getBoundingClientRect();
                return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight &&
                    el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
            }), 'Done stays visible and hit-testable while scrolling the search appearance fields');
            const preview = page.locator('.appearance-search-preview-button');
            const previewPaint = await preview.evaluate(el => { const s = getComputedStyle(el); return { fill: s.backgroundColor, color: s.color, radius: s.borderTopLeftRadius }; });
            assert.deepEqual(previewPaint, custom, 'inert preview matches the actual button');
            if (width === 1440 || width === 320) {
                await preview.scrollIntoViewIfNeeded();
                await page.screenshot({ path: `.impeccable/review/search-appearance-dialog-${width}.png` });
            }
            await done(page); await openSearch(page);
            assert.equal((await assertPaint(page, custom, 'custom disabled')).iconOpacity, '0.5');
            await suggestions(page, darkSurface, 'custom dark surface', true);
            if (width === 1440 || width === 320) await page.screenshot({ path: `.impeccable/review/search-suggestions-custom-${width}.png` });
            await page.locator('#search-input').fill('自訂搜尋按鈕');
            assert.equal((await assertPaint(page, custom, 'custom enabled')).iconOpacity, '1');
            const button = page.locator('#search-submit'); await button.hover();
            assert.notEqual((await assertPaint(page, custom, 'hover')).shadow, 'none', 'hover adds a visible ring');
            await page.locator('#search-input').focus();
            for (let i = 0; i < 8 && !await button.evaluate(el => el === document.activeElement); i++) await page.keyboard.press('Tab');
            const focused = await assertPaint(page, custom, 'keyboard focus');
            assert(focused.focus && parseFloat(focused.outlineWidth) > 0, 'keyboard focus has a visible outline');
            const bounds = await button.boundingBox(); await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); await page.mouse.down();
            const active = await assertPaint(page, custom, 'pressed'); assert(active.active); assert(Math.abs(active.scale - .91) < .01, 'pressed feedback shrinks the button');
            await page.mouse.move(bounds.x - 60, bounds.y); await page.mouse.up();
            assert.deepEqual(await surfaceSnapshot(page), otherSurfaces, 'button controls never alter another widget');
            await closeExpanded(page); await page.reload(); await page.waitForFunction(() => window.NewtabWidgets);
            await openSearch(page); await assertPaint(page, custom, 'reload');
            await suggestions(page, darkSurface, 'suggestions reload');
            await page.setViewportSize({ width: 390, height: 844 }); await openSearch(page);
            assert.equal(await page.locator('.search-expand-panel .search-container').count(), 1, 'mobile reuses the original search DOM');
            await assertPaint(page, custom, 'reparented mobile search');
            await page.evaluate(() => NewtabAppearance.openWidget('search-1'));
            await setSurface(page, lightSurface); await done(page);
            assert.equal(await page.locator('.search-expand-panel .search-container').count(), 1, 'editing appearance preserves the expanded search container');
            await suggestions(page, lightSurface, 'live light surface in expanded search', true);
            await page.evaluate(() => NewtabAppearance.openWidget('search-1'));
            await setSurface(page, darkSurface); await done(page);
            await suggestions(page, darkSurface, 'live restoration in expanded search');
            await page.evaluate(() => NewtabWidgets.setAppearance('search-1', { searchButtonTint: '#2468ac' }));
            await assertPaint(page, { ...custom, fill: 'rgba(36, 104, 172, 0.4)' }, 'updates reach the already open mobile popup');
            await page.evaluate(() => NewtabWidgets.setAppearance('search-1', { searchButtonTint: '#123456' }));
            await page.setViewportSize({ width: 1440, height: 900 }); await assertPaint(page, custom, 'resize while expanded');
            await closeExpanded(page); await assertPaint(page, custom, 'returned to widget');
            await page.setViewportSize({ width, height }); await openSearch(page); await assertPaint(page, custom, 'viewport roundtrip');
            await navigation(page, 'button appearance ' + width, false);
            await openSearch(page); await assertPaint(page, custom, 'custom survives button navigation');
            await navigation(page, 'keyboard appearance ' + width, true);
            await edit(page);
            await page.getByRole('button', { name: '恢復按鈕預設', exact: true }).click();
            const reset = await page.evaluate(() => NewtabWidgets.getLayout().widgets.find(w => w.type === 'search').options.appearance);
            assert.equal(reset.alpha, .68); assert.equal(reset.tint, '#102030', 'button-only reset preserves the search surface');
            assert.equal(await page.getByRole('spinbutton', { name: '按鈕背景透明度', exact: true }).inputValue(), '0');
            assert.equal(await page.getByRole('spinbutton', { name: '按鈕圓角', exact: true }).inputValue(), '22');
            await done(page); await openSearch(page); await assertPaint(page, defaults, 'button reset');
            await suggestions(page, darkSurface, 'button-only reset preserves suggestion surface');
            await page.reload(); await page.waitForFunction(() => window.NewtabWidgets); await openSearch(page); await assertPaint(page, defaults, 'reset reload has no stale portal tokens');
            await edit(page); await setCustom(page);
            await page.getByRole('button', { name: '恢復預設', exact: true }).click(); await done(page);
            await openSearch(page); await assertPaint(page, defaults, 'whole-widget reset');
            await suggestions(page, defaultSurface, 'whole-widget reset restores suggestion surface');
            assert.deepEqual(await surfaceSnapshot(page), otherSurfaces, 'both reset scopes preserve unrelated widgets');
            if (width === 1440) {
                const normalized = await page.evaluate(() => ({
                    high: NewtabAppearance.normalizeWidget({ searchButtonTint: 'red', searchButtonIcon: '#fff', searchButtonAlpha: 9, searchButtonRadius: 90 }),
                    low: NewtabAppearance.normalizeWidget({ searchButtonAlpha: -1, searchButtonRadius: -1 }),
                    invalid: NewtabAppearance.normalizeWidget({ searchButtonAlpha: '0.5', searchButtonRadius: NaN })
                }));
                assert.equal(normalized.high.searchButtonTint, undefined); assert.equal(normalized.high.searchButtonIcon, undefined);
                assert.equal(normalized.high.searchButtonAlpha, 1); assert.equal(normalized.high.searchButtonRadius, 22);
                assert.equal(normalized.low.searchButtonAlpha, 0); assert.equal(normalized.low.searchButtonRadius, 0);
                assert.equal(normalized.invalid.searchButtonAlpha, undefined); assert.equal(normalized.invalid.searchButtonRadius, undefined);
            }
            assert.deepEqual(errors, []);
            await page.screenshot({ path: `.impeccable/review/search-appearance-${width}.png` });
            await context.close();
            console.log(`PASS search appearance ${width}×${height}: actual controls, suggestion surfaces/text/feedback, live mobile edits, persistence, both resets, button states, isolation and navigation`);
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
