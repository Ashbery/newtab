// Isolated Brave UI fixtures; no login, chat, weather, or other live service calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const base = process.env.NEWTAB_TEST_URL || 'http://127.0.0.1:4174/';
const output = path.resolve('.impeccable/review/rail-spring');
fs.mkdirSync(output, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function boot(browser, options = {}) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', ...options });
    await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(String(error)));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.NewtabSideRail && window.NewtabMotion?.spring);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => { NewtabSideRail.open(); NewtabSideRail.setTab('personalize'); });
    await page.waitForTimeout(1000);
    return { context, page, errors };
}
async function pose(page) {
    return page.evaluate(() => {
        const rail = document.querySelector('#side-rail'), stage = document.querySelector('.side-rail-panels');
        const indicator = document.querySelector('.rail-tab-indicator');
        return {
            drawerX: rail.getBoundingClientRect().x,
            width: stage.getBoundingClientRect().width,
            pill: { x: indicator.getBoundingClientRect().x, width: indicator.getBoundingClientRect().width },
            panels: [...document.querySelectorAll('.side-rail-panel')].map(el => ({ name: el.dataset.panel, hidden: el.hidden, inert: el.inert,
                x: el.getBoundingClientRect().x, opacity: Number(getComputedStyle(el).opacity), selected: el.classList.contains('is-active') }))
        };
    });
}
function panel(snapshot, name) { return snapshot.panels.find(item => item.name === name); }
async function onePanel(page, name) {
    await page.waitForFunction(expected => {
        const panels = [...document.querySelectorAll('.side-rail-panel')].filter(el => !el.hidden);
        return panels.length === 1 && panels[0].dataset.panel === expected && !panels[0].inert;
    }, name);
}
(async () => {
    const browser = await chromium.launch({ executablePath: process.env.BRAVE_PATH || 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe', headless: true });
    const results = [];
    async function test(name, fn) { await fn(); results.push(name); console.log('PASS ' + name); }
    try {
        await test('continuous adjacent panels and reversible selection, without a blank fade', async () => {
            const { context, page, errors } = await boot(browser);
            await page.evaluate(() => NewtabSideRail.setTab('apps'));
            const samples = [];
            let previousTime = 0;
            for (const elapsed of [0, 60, 120, 240]) {
                if (elapsed) await page.waitForTimeout(elapsed - previousTime);
                previousTime = elapsed;
                const sample = await pose(page); samples.push({ elapsed, ...sample });
                const old = panel(sample, 'personalize'), next = panel(sample, 'apps');
                assert(!old.hidden && !next.hidden, 'both real panels remain painted during handoff');
                assert(old.inert && !next.inert && next.selected, 'only selected content is operable');
                assert.equal(old.opacity, 1); assert.equal(next.opacity, 1);
                assert(Math.abs(old.x - next.x - sample.width) < 1, 'panels stay adjacent, avoiding overlapping text');
            }
            await onePanel(page, 'apps');
            await page.evaluate(() => NewtabSideRail.setTab('personalize'));
            await page.waitForTimeout(75);
            const repeat = await page.evaluate(() => {
                const pill = document.querySelector('.rail-tab-indicator');
                const before = pill.getBoundingClientRect().x;
                NewtabSideRail.setTab('personalize');
                return { before, after: pill.getBoundingClientRect().x };
            });
            assert(Math.abs(repeat.before - repeat.after) < .1, 'clicking the selected tab must not snap its travelling pill');
            const before = await pose(page);
            await page.evaluate(() => NewtabSideRail.setTab('apps'));
            const after = await pose(page);
            assert(Math.abs(panel(after, 'apps').x - panel(before, 'apps').x) < 38, 'reversal continues its current pose');
            await page.evaluate(async () => {
                for (const name of ['about', 'components', 'personalize', 'apps', 'personalize']) {
                    NewtabSideRail.setTab(name); await new Promise(resolve => setTimeout(resolve, 35));
                }
            });
            await onePanel(page, 'personalize'); await page.waitForTimeout(950);
            assert(await page.locator('.side-rail-panel,.rail-tab-indicator').evaluateAll(elements =>
                elements.every(el => !el.style.willChange)), 'reversed panels and indicator release temporary compositor hints');
            const selected = await page.locator('.side-rail-tabs [aria-selected=true]').boundingBox();
            const finalPill = await page.locator('.rail-tab-indicator').boundingBox();
            assert(Math.abs(selected.x - finalPill.x) < 1 && Math.abs(selected.width - finalPill.width) < 1);
            for (const elapsed of [0, 60, 120, 240]) {
                await page.evaluate(() => NewtabSideRail.setTab('personalize')); await onePanel(page, 'personalize'); await page.waitForTimeout(1000);
                await page.evaluate(() => NewtabSideRail.setTab('apps')); if (elapsed) await page.waitForTimeout(elapsed);
                await page.screenshot({ path: path.join(output, `switch-${elapsed}.png`) });
                await onePanel(page, 'apps');
            }
            assert.deepEqual(errors, []); fs.writeFileSync(path.join(output, 'switch-samples.json'), JSON.stringify(samples, null, 2));
            await context.close();
        });
        await test('drawer reversal is continuous, closes inert, and preserves edge reveal', async () => {
            const { context, page } = await boot(browser);
            const data = await page.evaluate(async () => {
                const rail = document.querySelector('#side-rail');
                NewtabSideRail.close(); await new Promise(resolve => setTimeout(resolve, 80));
                const before = rail.getBoundingClientRect().x;
                NewtabSideRail.open(); const after = rail.getBoundingClientRect().x;
                return { before, after, inert: rail.inert };
            });
            assert(Math.abs(data.before - data.after) < .1); assert.equal(data.inert, false);
            await page.waitForTimeout(1000); await page.keyboard.press('Escape');
            await page.waitForFunction(() => getComputedStyle(document.querySelector('#side-rail')).visibility === 'hidden');
            assert(await page.locator('#side-rail').evaluate(el => el.inert));
            assert.equal(await page.locator('#side-rail').evaluate(el => el.style.willChange), '', 'closed drawer releases its compositor hint');
            await page.locator('#side-rail-tab').evaluate(el => el.blur()); await page.mouse.move(200, 50); await page.waitForTimeout(700);
            assert.equal(await page.locator('#side-rail-tab').evaluate(el => getComputedStyle(el).opacity), '0');
            await page.mouse.move(1437, 80); await page.waitForTimeout(300);
            assert.equal(await page.locator('#side-rail-tab').evaluate(el => getComputedStyle(el).opacity), '1');
            await context.close();
        });
        await test('four viewport sizes, keyboard/touch, per-panel scroll and saved appearance', async () => {
            for (const [width, height] of [[320, 480], [390, 600], [1440, 900], [3440, 1440]]) {
                const { context, page, errors } = await boot(browser, { viewport: { width, height }, hasTouch: width < 500 });
                const rail = await page.locator('#side-rail').boundingBox();
                assert(rail.x >= 0 && rail.y >= 0 && rail.x + rail.width <= width && rail.y + rail.height <= height);
                assert(await page.locator('.side-rail-panel.is-active').evaluate(el => el.scrollWidth === el.clientWidth));
                const tabs = page.locator('.side-rail-tabs [data-panel=apps]');
                if (width < 500) await tabs.tap(); else await tabs.click();
                await onePanel(page, 'apps');
                const scroll = await page.locator('#rail-panel-apps').evaluate(el => { el.scrollTop = el.scrollHeight; return el.scrollTop; });
                await page.locator('.side-rail-tabs [data-panel=personalize]').click(); await onePanel(page, 'personalize');
                const number = page.locator('#background-appearance input[type=number]').first();
                await number.fill('43'); await page.locator('.side-rail-tabs [data-panel=apps]').click(); await onePanel(page, 'apps');
                assert.equal(await page.locator('#rail-panel-apps').evaluate(el => el.scrollTop), scroll);
                await page.locator('.side-rail-tabs [data-panel=apps]').focus(); await page.keyboard.press('ArrowRight');
                await onePanel(page, 'personalize'); assert.equal(await page.evaluate(() => document.activeElement.dataset.panel), 'personalize');
                await page.locator('#background-appearance .appearance-reset').click();
                assert.equal(await number.inputValue(), '0');
                await number.fill('43'); await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.NewtabSideRail);
                assert.equal(await page.locator('#background-appearance input[type=number]').first().inputValue(), '43');
                await page.evaluate(() => { NewtabSideRail.open(); NewtabSideRail.setTab('personalize'); }); await page.waitForTimeout(1000);
                await page.screenshot({ path: path.join(output, `settled-${width}.png`) });
                assert.deepEqual(errors, []); await context.close();
            }
        });
        await test('reduced motion settles every layer and does not retain stale close callbacks', async () => {
            const { context, page } = await boot(browser);
            await page.evaluate(() => { NewtabSideRail.setTab('apps'); NewtabSideRail.close(); });
            await page.emulateMedia({ reducedMotion: 'reduce' });
            await onePanel(page, 'apps');
            await page.waitForFunction(() => getComputedStyle(document.querySelector('#side-rail')).visibility === 'hidden');
            await page.evaluate(() => { NewtabSideRail.open(); NewtabSideRail.setTab('personalize'); }); await onePanel(page, 'personalize');
            const snap = await pose(page); assert(Math.abs(panel(snap, 'personalize').x - snap.drawerX - 1) < 1);
            assert(await page.locator('#side-rail,.side-rail-panel,.rail-tab-indicator').evaluateAll(elements =>
                elements.every(el => !el.style.willChange)), 'dynamic reduced motion releases every temporary compositor hint');
            await context.close();
        });
        await test('custom app and crop keep stacked focus and discard interrupted close cleanup', async () => {
            const { context, page, errors } = await boot(browser);
            await page.evaluate(() => NewtabSideRail.setTab('apps')); await onePanel(page, 'apps');
            await page.locator('#app-add-btn').click(); await page.waitForTimeout(70);
            await page.keyboard.press('Escape');
            await page.evaluate(() => document.querySelector('#app-add-btn').click()); await page.waitForTimeout(900);
            assert(await page.locator('.custom-app-modal').evaluate(el => el.classList.contains('is-open') && !el.inert));
            assert.equal(await page.evaluate(() => document.activeElement.id), 'custom-app-name');
            const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 96; const g = c.getContext('2d'); g.fillStyle = '#b7d9e9'; g.fillRect(0, 0, 96, 96); return c.toDataURL().split(',')[1]; });
            await page.locator('#custom-app-file').setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
            await page.waitForSelector('.icon-crop-modal.is-visible'); await page.waitForTimeout(70); await page.keyboard.press('Escape');
            await page.waitForFunction(() => !document.querySelector('.icon-crop-modal').classList.contains('is-open'));
            assert(await page.locator('.custom-app-modal').evaluate(el => el.contains(document.activeElement) && !el.inert));
            await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('.custom-app-modal').classList.contains('is-open'));
            assert.equal(await page.evaluate(() => document.activeElement.id), 'app-add-btn'); assert.deepEqual(errors, []);
            await context.close();
        });
        if (process.argv.includes('--demo')) {
            const { context, page } = await boot(browser, { viewport: { width: 1100, height: 800 }, recordVideo: { dir: path.join(output, 'video'), size: { width: 1100, height: 800 } } });
            for (const name of ['apps', 'components', 'personalize', 'about', 'personalize']) {
                await page.locator(`.side-rail-tabs [data-panel=${name}]`).click(); await sleep(1400);
            }
            await page.locator('#background-appearance input[type=number]').first().fill('32'); await sleep(1200);
            await page.locator('#background-appearance .appearance-reset').click(); await sleep(900);
            await page.locator('#focus-home').click(); await sleep(200); await page.evaluate(() => NewtabSideRail.open()); await sleep(1400);
            await page.locator('#focus-home').click(); await sleep(300); await page.evaluate(() => NewtabSideRail.open()); await sleep(1000);
            await page.evaluate(async () => { for (const tab of ['apps', 'personalize', 'components', 'personalize']) { NewtabSideRail.setTab(tab); await new Promise(r => setTimeout(r, 90)); } }); await sleep(1500);
            await page.locator('.side-rail-tabs [data-panel=apps]').click(); await sleep(1200); await page.locator('#app-add-btn').click(); await sleep(1500);
            await page.keyboard.press('Escape'); await sleep(1000); await page.keyboard.press('Escape'); await sleep(1000);
            const video = page.video(); await context.close(); await video.saveAs(path.join(output, 'rail-real-ui.webm'));
        }
        fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ passed: results.length, tests: results }, null, 2));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
