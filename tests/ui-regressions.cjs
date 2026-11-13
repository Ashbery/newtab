// Test artifacts stay local and are excluded from the published repository.
require('node:fs').mkdirSync('.impeccable/review', { recursive: true });
// Start a local server, then run with Playwright available in NODE_PATH:
// NEWTAB_TEST_URL=http://127.0.0.1:4173 node tests/ui-regressions.cjs
// PLAYWRIGHT_CHANNEL defaults to the installed Microsoft Edge browser.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const base = process.env.NEWTAB_TEST_URL || 'http://127.0.0.1:4173';
const origin = new URL(base).origin;

async function hitTest(page, selector) {
    try { await page.waitForFunction((selector) => {
        const element = document.querySelector(selector);
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.right <= innerWidth + 1 &&
            rect.top >= 0 && rect.bottom <= innerHeight + 1 &&
            element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    }, selector, { timeout: 5000 }); } catch (error) {
        console.error('Hit target diagnostics', selector, await page.locator(selector).first().evaluate(element => {
            const rect = element.getBoundingClientRect();
            const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
            return { rect: rect.toJSON(), viewport: { width: innerWidth, height: innerHeight }, top: top?.outerHTML.slice(0, 500), body: document.body.className };
        }));
        await page.screenshot({ path: '.impeccable/review/ui-hit-target-failure.png' });
        throw error;
    }
}

async function home(page) {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.NewtabSearch && window.NewtabWidgets && window.NewtabSideRail);
    assert.equal(await page.locator('#search-input').count(), 1, 'there is only one search input');
    assert.equal(await page.locator('.search-expand-layer.is-open').count(), 0, 'search never opens on its own');
}

async function destination(page, action, expected) {
    await Promise.all([
        page.waitForURL(expected, { waitUntil: 'domcontentloaded' }),
        action()
    ]);
    assert.equal(page.url(), expected);
    assert.match(await page.title(), /Test destination/, 'navigation is intercepted instead of loading a real results page');
}

async function exerciseSearch(page, mobile, network) {
    await home(page);
    assert.equal(await page.locator('#search-submit').isDisabled(), true);
    await page.locator('#side-rail-tab').focus();
    await page.keyboard.press('/');
    await page.waitForFunction(() => document.activeElement.id === 'search-input');
    if (mobile) {
        await page.getByRole('dialog', { name: 'Google 搜尋' }).waitFor({ state: 'visible' });
    } else {
        assert.equal(await page.locator('.search-expand-layer.is-open').count(), 0, 'desktop search stays inline');
        assert.equal(await page.locator('#search-input').evaluate((input) => !!input.closest('.widget[data-type="search"]')), true);
    }
    await page.locator('#search-input').fill('cat');
    await page.waitForFunction(() => document.querySelectorAll('.suggestion-item').length === 3);
    await hitTest(page, '#suggestions-list .suggestion-item');
    await hitTest(page, '#search-submit');
    if (mobile) {
        for (const selector of ['#clear-btn', '.search-back']) {
            const bounds = await page.locator(selector).boundingBox();
            assert(bounds.width >= 44 && bounds.height >= 44, selector + ' provides a 44px touch target');
            await hitTest(page, selector);
        }
        await page.locator('#search-input').focus();
        await page.keyboard.press('Shift+Tab');
        assert.equal(await page.locator('.search-back').evaluate((button) => button === document.activeElement), true);
        await page.keyboard.press('Shift+Tab');
        assert.equal(await page.locator('#search-submit').evaluate((button) => button === document.activeElement), true, 'mobile search traps focus including its submit action');
        await page.locator('#search-input').focus();
    }
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#search-input').getAttribute('aria-activedescendant'), 'search-suggestion-0');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#search-input').getAttribute('aria-activedescendant'), 'search-suggestion-1');
    await destination(page, () => page.keyboard.press('Enter'), 'https://www.google.com/search?q=cat%20cafe');

    // The visible button works independently of keyboard submission.
    await home(page);
    await page.locator('#search-input').click();
    await page.locator('#search-input').fill('button search');
    await destination(page, () => mobile ? page.locator('#search-submit').tap() : page.locator('#search-submit').click(),
        'https://www.google.com/search?q=button%20search');

    // Clicking/tapping a suggestion uses its text, including after a real blur.
    await home(page);
    await page.locator('#search-input').click();
    await page.locator('#search-input').fill('dog');
    await page.waitForFunction(() => document.querySelectorAll('.suggestion-item').length === 3);
    await destination(page, () => mobile ? page.locator('.suggestion-item').nth(2).tap() : page.locator('.suggestion-item').nth(2).click(),
        'https://www.google.com/search?q=dog%20videos');

    // IME confirmation must not submit the incomplete composition.
    await home(page);
    await page.locator('#search-input').click();
    await page.waitForFunction(() => document.activeElement.id === 'search-input');
    await page.locator('#search-input').evaluate((input) => {
        input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
        input.value = '中文搜尋';
        input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true, data: '中文搜尋' }));
    });
    assert.equal(await page.locator('#search-submit').isDisabled(), true);
    await page.keyboard.press('Enter');
    assert.equal(new URL(page.url()).origin, origin, 'IME Enter stays on the home page');
    await page.locator('#search-input').evaluate((input) => {
        input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '中文搜尋' }));
    });
    await destination(page, () => page.keyboard.press('Enter'), 'https://www.google.com/search?q=' + encodeURIComponent('中文搜尋'));

    // No suggestion service is required for either text searches or addresses.
    network.offline = true;
    await home(page);
    await page.locator('#search-input').click();
    await page.locator('#search-input').fill('offline query');
    await page.waitForFunction(() => document.querySelector('.suggestion-item')?.dataset.suggestion === 'offline query');
    await destination(page, () => page.locator('#search-submit').click(), 'https://www.google.com/search?q=offline%20query');
    await home(page);
    await page.locator('#search-input').click();
    await page.locator('#search-input').fill('example.com/@artist');
    await page.waitForFunction(() => document.querySelector('.suggestion-item')?.dataset.suggestion === 'example.com/@artist');
    await destination(page, () => mobile ? page.locator('.suggestion-item').first().tap() : page.locator('.suggestion-item').first().click(),
        'https://example.com/@artist');
    network.offline = false;

    await home(page);
    await page.locator('#side-rail-tab').focus();
    await page.keyboard.press('Control+k');
    await page.waitForFunction(() => document.activeElement.id === 'search-input');
    await page.locator('#search-input').fill('long '.repeat(90));
    await page.waitForFunction(() => document.querySelector('.suggestion-item'));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'long search text does not overflow the viewport');
    await page.locator('#clear-btn').click();
    assert.equal(await page.locator('#search-input').inputValue(), '');
    assert.equal(await page.locator('#search-submit').isDisabled(), true);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.search-expand-layer.is-open'));
    assert.equal(await page.locator('#search-input').getAttribute('aria-expanded'), 'false');
    if (mobile) {
        await page.waitForFunction(() => !document.querySelector('.search-expand-layer.is-closing'));
        assert.equal(await page.evaluate(() => document.activeElement.matches('.widget[data-type="search"]')), true, 'mobile dismissal restores the home search trigger');
    } else {
        assert.equal(await page.locator('#search-input').evaluate((input) => input === document.activeElement), true, 'desktop dismissal preserves text-field focus');
        await page.keyboard.press('Tab');
        assert.equal(await page.locator('#search-input').evaluate((input) => input === document.activeElement), false, 'inline search does not trap Tab');
    }
}

async function revealTools(page) {
    if (await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches)) {
        const size = page.viewportSize();
        await page.mouse.move(size.width - 2, size.height / 2);
        await page.waitForFunction(() => getComputedStyle(document.getElementById('side-rail-tab')).opacity === '1');
    }
}
async function openTools(page) {
    if (!await page.evaluate(() => document.body.classList.contains('side-rail-open'))) {
        await revealTools(page);
        await page.locator('#side-rail-tab').click();
    }
    await page.getByRole('tab', { name: '個人化', exact: true }).click();
}

async function exercisePersonalization(page, mobile) {
    await home(page);
    await revealTools(page);
    await hitTest(page, '#side-rail-tab');
    assert.equal(await page.locator('.home-header, .home-footer, .home-help').count(), 0, 'requested home chrome is removed');
    for (const selector of ['#focus-home', '#background-home', '#arrange-home']) {
        assert.equal(await page.locator(selector).isVisible(), false, 'secondary action is inside the closed drawer');
    }
    await page.locator('#side-rail-tab').click();
    await page.waitForFunction(() => document.body.classList.contains('side-rail-open'));
    assert.equal(await page.locator('#side-rail-tab').getAttribute('aria-expanded'), 'true');
    assert.equal(await page.getByRole('tab', { name: '個人化', exact: true }).getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('#rail-media-status').isVisible(), true, 'static backgrounds show a compact status');
    assert.match(await page.locator('#rail-media-status').textContent(), /貓貓主題/);
    for (const action of ['play-pause', 'mute']) {
        assert.equal(await page.locator('#side-rail [data-action="' + action + '"]').isVisible(), false, 'static backgrounds hide irrelevant ' + action + ' controls');
    }
    await page.locator('#side-rail-close').focus();
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => {
        const active = document.activeElement;
        return active.id !== 'side-rail-close' && document.getElementById('side-rail').contains(active) &&
            active.getClientRects().length > 0 && getComputedStyle(active).visibility !== 'hidden' && !active.closest('[hidden], [inert]');
    }), true, 'settings focus wraps to a visible control instead of hidden media actions');
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('#side-rail-close').evaluate((button) => button === document.activeElement), true);
    await page.getByRole('tab', { name: '應用', exact: true }).click();
    const icons = await page.evaluate(async () => {
        const ids = NewtabApps.ORDER;
        const atlas = new DOMParser().parseFromString(await (await fetch('assets/character/launcher-icons.svg')).text(), 'image/svg+xml');
        const results = await Promise.all(ids.map(async (id) => {
            const source = NewtabApps.iconUrl(id);
            const image = new Image();
            const loaded = await new Promise((resolve) => {
                image.onload = () => resolve(image.naturalWidth > 0 && image.naturalHeight > 0);
                image.onerror = () => resolve(false);
                image.src = source;
            });
            return { id, source, loaded, view: atlas.getElementById(id)?.tagName,
                catalogSource: document.querySelector('#app-list [data-place-type="' + id + '"] img')?.getAttribute('src') };
        }));
        const customSource = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#597b9a"/></svg>');
        const customId = NewtabApps.addCustom({ label: 'Local icon regression', url: 'https://example.com/', icon: customSource,
            cropMeta: { nx: 0.1, ny: 0.2, nw: 0.6, nh: 0.7, animated: false } });
        const custom = { retained: NewtabApps.iconUrl(customId) === customSource, crop: NewtabApps.get(customId)?.cropMeta };
        NewtabApps.removeCustom(customId);
        return { results, custom };
    });
    assert.equal(icons.results.length, 9);
    for (const icon of icons.results) {
        assert.equal(icon.loaded, true, icon.id + ' atlas fragment decodes as an image');
        assert.equal(icon.view, 'view', icon.id + ' has its own SVG fragment view');
        assert.equal(icon.catalogSource, icon.source, icon.id + ' catalog uses the same character icon');
        assert.equal(icon.source, 'assets/character/launcher-icons.svg#' + icon.id);
    }
    assert.equal(icons.custom.retained, true, 'the atlas does not replace an uploaded custom icon');
    assert.deepEqual(icons.custom.crop, { nx: 0.1, ny: 0.2, nw: 0.6, nh: 0.7, animated: false });
    await page.getByRole('tab', { name: '組件', exact: true }).click();
    assert.equal(await page.getByRole('tab', { name: '組件', exact: true }).getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.body.classList.contains('side-rail-open'));
    assert.equal(await page.locator('#side-rail-tab').getAttribute('aria-expanded'), 'false');
    assert.equal(await page.locator('#side-rail').evaluate((rail) => rail.inert), true, 'closed settings leave the tab order');

    await openTools(page);
    await page.locator('#background-home').click();
    await page.locator('#video-upload-container').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#confirm-upload').evaluate((apply) => {
        const fileGroup = apply.closest('.file-input-wrapper');
        return !!fileGroup?.contains(document.getElementById('bg-file')) &&
            !!(apply.compareDocumentPosition(document.getElementById('bg-url')) & Node.DOCUMENT_POSITION_FOLLOWING);
    }), true, 'file apply stays with the file picker before the separate URL flow');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.locator('#restore-theme').evaluate((button) => button === document.activeElement), true,
        'the background dialog includes the theme restore action in its focus loop');
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('#close-upload').evaluate((button) => button === document.activeElement), true);
    await page.keyboard.press('Escape');
    await page.locator('#video-upload-container').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#side-rail-tab').evaluate((button) => button === document.activeElement), true, 'background dialog restores its opener');

    await openTools(page);
    await page.locator('#focus-home').click();
    assert.equal(await page.locator('#focus-home').getAttribute('aria-pressed'), 'true');
    await revealTools(page);
    await hitTest(page, '#side-rail-tab');
    assert.equal(await page.locator('.widget[data-type="app"]').first().evaluate((app) => app.inert), true);
    assert.equal(await page.locator('#search-input').isDisabled(), false, 'search remains available in focus mode');
    await openTools(page);
    await hitTest(page, '#background-home');
    await hitTest(page, '#focus-home');
    assert.equal(await page.locator('#focus-home span').textContent(), '結束專注');
    await page.keyboard.press('Escape'); // close the drawer first
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#focus-home').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('.widget[data-type="app"]').first().evaluate((app) => app.inert), false);
    await revealTools(page);
    await hitTest(page, '#side-rail-tab');

    if (!mobile) {
        await openTools(page);
        await page.locator('#arrange-home').click();
        assert.equal(await page.evaluate(() => NewtabWidgets.isArranging()), true);
        const app = page.locator('.widget[data-type="app"]').first();
        const sizes = [];
        for (const [size, label] of [['s', '精簡'], ['m', '標準'], ['l', '醒目']]) {
            await app.click({ button: 'right' });
            await page.getByRole('menuitem', { name: '大小', exact: true }).click();
            await page.getByRole('menuitemradio', { name: label, exact: true }).click();
            assert.equal(await page.evaluate(() => NewtabWidgets.isArranging()), true, 'size changes keep arrange mode');
            await page.waitForFunction((size) => document.querySelector('.widget[data-type="app"]').getAttribute('data-app-size') === size, size);
            const geometry = await app.evaluate((element) => {
                const frame = element.getBoundingClientRect();
                const icon = element.querySelector('.app-tile-icon').getBoundingClientRect();
                const label = element.querySelector('.app-tile-label').getBoundingClientRect();
                return { width: frame.width, icon: icon.width, labelFits: label.bottom <= frame.bottom + 1 };
            });
            assert.equal(geometry.labelFits, true, size + ' shortcut label stays inside its selectable frame');
            sizes.push(geometry);
        }
        assert(sizes[0].icon < sizes[1].icon && sizes[1].icon < sizes[2].icon, 'shortcut sizes visibly increase');
        await page.getByRole('button', { name: '完成主畫面編輯', exact: true }).click();
        assert.equal(await page.evaluate(() => NewtabWidgets.isArranging()), false);
        await page.reload({ waitUntil: 'domcontentloaded' });
        assert.equal(await app.getAttribute('data-app-size'), 'l', 'chosen shortcut size persists');
    }
}

async function exerciseCompanion(page, mobile, reducedMotion) {
    await home(page);
    await page.waitForFunction(() => document.querySelector('#home-companion')?.dataset.ready === 'true');
    const companion = page.locator('#home-companion');
    const trigger = page.locator('#companion-trigger');
    const message = page.locator('#companion-message');
    await page.waitForFunction(() => {
        const image = document.querySelector('.companion-portrait');
        return image && image.complete && image.naturalWidth > 0;
    });
    assert.equal(await companion.evaluate((element) => element.classList.contains('is-docked')), mobile,
        mobile ? 'phone uses a compact companion' : 'fresh desktop layout keeps the full portrait');
    if (mobile) {
        assert.equal(await companion.evaluate((element) => element.classList.contains('is-top-avatar')), true,
            'fresh phone layout gives the companion an unobstructed top position');
    }
    await hitTest(page, '#companion-trigger');
    await hitTest(page, '#search-input');
    const original = await message.textContent();
    if (mobile) await trigger.tap();
    else await trigger.click();
    assert.notEqual(await message.textContent(), original, 'greeting activation changes the visible message');
    if (reducedMotion === 'reduce') {
        assert.equal(await companion.evaluate((element) => element.classList.contains('is-greeting')), false);
        assert.equal(await page.locator('.companion-portrait').evaluate((image) => getComputedStyle(image).animationName), 'none',
            'reduced motion suppresses the portrait greeting animation');
    }
    const clicked = await message.textContent();
    await trigger.focus();
    await page.keyboard.press('Enter');
    assert.notEqual(await message.textContent(), clicked, 'the native button also activates with Enter');

    await openTools(page);
    await page.locator('#focus-home').click();
    await page.waitForFunction(() => document.querySelector('#home-companion').inert);
    assert.equal(await companion.getAttribute('aria-hidden'), 'true');
    assert.equal(await companion.isVisible(), false, 'focus mode hides the companion as well as removing it from keyboard access');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#home-companion').inert);
    assert.equal(await companion.getAttribute('aria-hidden'), 'false');

    // Simulate a user-positioned widget. A visible fixture exercises the same
    // collision observer as dragging an actual widget, without persisting it.
    await page.evaluate((mobile) => {
        const portrait = document.querySelector('.companion-footprint').getBoundingClientRect();
        const fixture = document.createElement('div');
        fixture.id = 'companion-collision-fixture';
        fixture.className = 'widget';
        fixture.setAttribute('data-active', 'true');
        fixture.setAttribute('aria-hidden', 'true');
        Object.assign(fixture.style, {
            position: 'fixed', display: 'block', visibility: 'visible', pointerEvents: 'none',
            left: (mobile ? innerWidth / 2 - 40 : portrait.left + 30) + 'px',
            top: (mobile ? 106 : portrait.top + 30) + 'px', width: '80px', height: '60px'
        });
        document.querySelector('#widget-canvas').appendChild(fixture);
    }, mobile);
    await page.waitForFunction((mobile) => {
        const element = document.querySelector('#home-companion');
        return element.classList.contains('is-docked') && (!mobile || !element.classList.contains('is-top-avatar'));
    }, mobile);
    await hitTest(page, '#search-input');
    await hitTest(page, '#companion-trigger');
    assert.equal(await companion.isVisible(), true, 'collision docks the companion instead of removing it');
    await page.evaluate(() => document.getElementById('companion-collision-fixture').remove());
    await page.waitForFunction((mobile) => {
        const element = document.querySelector('#home-companion');
        if (!mobile) return !element.classList.contains('is-docked');
        const avatar = document.getElementById('companion-trigger').getBoundingClientRect();
        return !element.inert && [...document.querySelectorAll('.widget[data-active="true"]')].every((widget) => {
            const rect = widget.getBoundingClientRect();
            return rect.right <= avatar.left || rect.left >= avatar.right || rect.bottom <= avatar.top || rect.top >= avatar.bottom;
        });
    }, mobile);
    await page.locator('#search-input').click();
    await page.waitForFunction(() => document.activeElement.id === 'search-input');
    await hitTest(page, '#search-input');
    assert.equal(await page.locator('#search-input').isEditable(), true, 'the companion never blocks entering a search');
    await page.keyboard.press('Escape');
}

async function exerciseMotion(page, mobile, reducedMotion) {
    await home(page);
    await page.waitForFunction(() => document.documentElement.dataset.motionReady === 'true');
    const app = page.locator('.widget[data-type="app"][data-active="true"] .app-tile').first();
    const icon = app.locator('.app-tile-icon');
    const tooltip = page.locator('#app-destination');
    const expectedHost = await app.evaluate((link) => new URL(link.href).hostname.replace(/^www\./, ''));
    const stableTarget = await app.boundingBox();
    const point = { x: stableTarget.x + stableTarget.width / 2, y: stableTarget.y + Math.min(28, stableTarget.height / 2) };

    if (!mobile) {
        await page.mouse.move(point.x, point.y);
        await page.waitForFunction(() => document.getElementById('app-destination').classList.contains('is-visible'));
        if (reducedMotion === 'reduce') {
            assert.equal(await icon.evaluate((element) => getComputedStyle(element).transform), 'none', 'reduced motion keeps dock icons stationary');
        } else {
            await page.waitForFunction(() => {
                const icon = document.querySelector('.widget[data-type="app"][data-active="true"] .app-tile-icon');
                const transform = getComputedStyle(icon).transform;
                return transform !== 'none' && new DOMMatrix(transform).m42 < -0.1;
            });
        }
        const hoveredTarget = await app.boundingBox();
        for (const property of ['x', 'y', 'width', 'height']) {
            assert(Math.abs(stableTarget[property] - hoveredTarget[property]) < 0.1,
                'proximity animation does not move the clickable shortcut ' + property);
        }
    }

    // The destination hint also works without a mouse and follows the actual URL.
    await app.focus();
    await page.waitForFunction(() => document.getElementById('app-destination').classList.contains('is-visible'));
    assert.equal(await tooltip.textContent(), expectedHost);
    assert.match(await app.getAttribute('aria-describedby'), /(?:^|\s)app-destination(?:\s|$)/);
    if (reducedMotion === 'reduce') {
        assert.equal(await icon.evaluate((element) => getComputedStyle(element).transform), 'none', 'keyboard focus also respects reduced motion');
    }
    await page.keyboard.press('Escape');
    assert.equal(await tooltip.isVisible(), false);
    assert.equal(await app.evaluate((link) => document.activeElement === link), true, 'dismissing the tooltip does not move keyboard focus');
    assert.equal(await app.getAttribute('aria-describedby'), null);
    if (!mobile) {
        await page.mouse.move(point.x + 1, point.y);
        await page.waitForTimeout(300);
        assert.equal(await tooltip.isVisible(), false, 'Escape keeps the tooltip dismissed while the pointer remains on the same shortcut');
    }

    await page.locator('#side-rail-tab').focus();
    await app.focus();
    await page.waitForFunction(() => document.getElementById('app-destination').classList.contains('is-visible'));
    await page.evaluate(() => NewtabWidgets.enterArrange());
    await page.waitForFunction(() => document.getElementById('app-destination').hidden);
    assert.equal(await app.evaluate((link) => link.style.getPropertyValue('--dock-lift')), '', 'arranging clears proximity state');
    assert.equal(await app.evaluate((link) => link.style.getPropertyValue('--dock-scale')), '');
    assert.equal(await app.getAttribute('aria-describedby'), null);
    await page.getByRole('button', { name: '完成主畫面編輯', exact: true }).click();

    await app.focus();
    await page.waitForFunction(() => document.getElementById('app-destination').classList.contains('is-visible'));
    const viewport = page.viewportSize();
    await page.setViewportSize({ width: viewport.width + 24, height: viewport.height });
    await page.waitForFunction(() => document.getElementById('app-destination').hidden);
    assert.equal(await app.evaluate((link) => link.style.getPropertyValue('--dock-lift')), '', 'resizing clears proximity state');
    assert.equal(await app.evaluate((link) => link.style.getPropertyValue('--dock-scale')), '');
    assert.equal(await app.getAttribute('aria-describedby'), null);
    await page.setViewportSize(viewport);

    await page.locator('#search-input').click();
    await page.locator('#search-input').fill('motion check');
    await hitTest(page, '#search-input');
    await hitTest(page, '#search-submit');
    await destination(page, () => page.locator('#search-submit').click(), 'https://www.google.com/search?q=motion%20check');
}

(async () => {
    const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
    try {
        for (const mobile of [false, true]) {
            for (const reducedMotion of ['reduce', 'no-preference']) {
                const page = await browser.newPage({
                    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
                    isMobile: mobile, hasTouch: mobile, reducedMotion
                });
                page.setDefaultTimeout(8000);
                const errors = [];
                const network = { offline: false };
                // Functional checks are self-contained; CDN fonts/icons and other
                // external services are blocked unless explicitly stubbed below.
                await page.route(/^https?:\/\//, (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
                // Only app errors count: the intercepted Google result document is
                // deliberately minimal and may receive browser-owned search hooks.
                page.on('pageerror', (error) => { if (new URL(page.url()).origin === origin) errors.push(error.message); });
                await page.route('https://suggestqueries.google.com/**', (route) => {
                    if (network.offline) return route.abort();
                    const url = new URL(route.request().url());
                    const query = url.searchParams.get('q');
                    return route.fulfill({ contentType: 'text/javascript',
                        body: `${url.searchParams.get('callback')}(${JSON.stringify([query, [query, query + ' cafe', query + ' videos']])})` });
                });
                await page.route(/^https:\/\/www\.google\.com\/search(?:\?|$)/, (route) => route.fulfill({
                    contentType: 'text/html', body: '<title>Test destination: search</title>'
                }));
                await page.route('https://example.com/**', (route) => route.fulfill({
                    contentType: 'text/html', body: '<title>Test destination: address</title>'
                }));
                await exerciseSearch(page, mobile, network);
                await exerciseCompanion(page, mobile, reducedMotion);
                await exercisePersonalization(page, mobile);
                await exerciseMotion(page, mobile, reducedMotion);
                assert.deepEqual(errors, [], 'no application JavaScript errors');
                console.log(`PASS ${mobile ? 'mobile 390' : 'desktop 1440'} / ${reducedMotion}: search, IME, offline, shortcuts, companion, settings, focus, layout, motion`);
                await page.close();
            }
        }
    } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
