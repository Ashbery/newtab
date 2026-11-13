const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = process.env.NEWTAB_TEST_URL || 'http://127.0.0.1:4173/';

for (const width of [2560, 1920, 1440, 1280, 1100, 390, 320]) for (const reducedMotion of ['no-preference', 'reduce']) {
    test(`clock and hidden tools ${width}px ${reducedMotion}`, async () => {
        const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
        try {
            const context = await browser.newContext({ viewport: { width, height: width === 320 ? 640 : width === 2560 ? 1440 : width === 1920 ? 1080 : 900 },
                isMobile: width < 600, hasTouch: width < 600, reducedMotion });
            await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
            const page = await context.newPage();
            // Keep real timers/animations while avoiding a clock tick racing
            // the explicit noon shell-rebuild assertion below.
            await page.clock.setFixedTime(new Date(2026, 10, 14, 12, 0, 1));
            const errors = [];
            page.on('pageerror', e => errors.push(e.message));
            await page.goto(base);
            await page.evaluate(() => document.fonts.ready);
            await page.waitForFunction(() => window.NewtabWidgets && document.documentElement.dataset.motionReady === 'true');
            const cases = await page.evaluate(() => {
                const result = [];
                for (const [hours, minutes, use12] of [[0, 0, false], [11, 11, false], [23, 59, false], [0, 0, true], [12, 0, true]]) {
                    NewtabWidgets.setClockHour12(use12);
                    updateClock(new Date(2026, 10, 14, hours, minutes, 36));
                    const face = document.querySelector('.clock-face'), glass = document.querySelector('.clock-glass');
                    const f = face.getBoundingClientRect(), g = glass.getBoundingClientRect();
                    result.push({ hours: document.querySelector('.clock-hours').textContent, minutes: document.querySelector('.clock-minutes').textContent,
                        period: document.querySelector('.clock-period').textContent, hidden: document.querySelector('.clock-period').hidden,
                        font: getComputedStyle(document.querySelector('.clock-hours')).fontFamily,
                        weight: getComputedStyle(document.querySelector('.clock-hours')).fontWeight,
                        width: f.width, fits: f.left >= g.left && f.right <= g.right && f.top >= g.top && f.bottom <= g.bottom,
                        label: document.querySelector('#clock').getAttribute('aria-label') });
                }
                const before = document.querySelector('.clock-hours');
                updateClock(new Date(2026, 10, 14, 12, 0, 37));
                return { result, stableNode: before === document.querySelector('.clock-hours'), fontLoaded: document.fonts.check('300 84px "Manrope Clock"'), face: document.querySelector('.clock-face').textContent };
            });
            assert.equal(cases.fontLoaded, true);
            assert.equal(cases.stableNode, true, 'seconds update does not recreate the face');
            assert.deepEqual(cases.result.map(x => x.hours), ['00', '11', '23', '12', '12']);
            assert.deepEqual(cases.result.map(x => x.period), ['', '', '', '上午', '下午']);
            assert.equal(cases.face, '12:00:37', 'complete time stays on one line with natural separators');
            for (const c of cases.result) { assert(c.fits, 'clock face fits its widget'); assert.match(c.font, /Manrope Clock/); assert.equal(c.weight, '300'); assert.match(c.label, /星期六/); }
            assert(Math.max(...cases.result.map(x => x.width)) - Math.min(...cases.result.map(x => x.width)) < 1, 'tabular time width is stable');
            const tab = page.locator('#side-rail-tab');
            if (width >= 600) {
                assert.equal(await tab.evaluate(e => getComputedStyle(e).opacity), '0', 'desktop entry starts hidden');
                await page.mouse.move(width - 2, 450);
                await page.waitForFunction(() => getComputedStyle(document.querySelector('#side-rail-tab')).opacity === '1');
                await tab.click();
            } else {
                assert.equal(await tab.evaluate(e => getComputedStyle(e).opacity), '1');
                const r = await tab.boundingBox(); assert(r.width >= 44 && r.height >= 44);
                await tab.tap();
            }
            await page.getByRole('dialog', { name: '個人化選單', exact: true }).waitFor({ state: 'visible' });
            await page.getByRole('tab', { name: '個人化', exact: true }).click();
            assert.equal(await page.locator('#rail-media-status').textContent(), '目前使用貓貓主題。');
            await page.mouse.move(20, 20);
            assert.equal(await page.evaluate(() => NewtabSideRail.isOpen()), true, 'drawer does not dismiss when pointer leaves');
            await page.keyboard.press('Escape');
            assert.equal(await tab.evaluate(e => e === document.activeElement), true);
            await page.keyboard.press('Enter');
            assert.equal(await page.evaluate(() => NewtabSideRail.isOpen()), true);
            await page.keyboard.press('Escape');
            if (width >= 600) {
                await page.locator('#search-input').click();
                await page.mouse.move(20, 20);
                await page.waitForFunction(() => getComputedStyle(document.querySelector('#side-rail-tab')).opacity === '0');
                await page.keyboard.press('Tab');
                await tab.focus();
                await page.waitForFunction(() => getComputedStyle(document.querySelector('#side-rail-tab')).opacity === '1');
            }
            await page.evaluate(() => {
                const clock = document.getElementById('clock'); clock.innerHTML = '';
                const oldDate = document.createElement('div'); oldDate.id = 'date'; clock.after(oldDate);
                updateClock(new Date(2026, 10, 14, 12, 0, 1));
            });
            assert.equal(await page.locator('#date').count(), 1, 'legacy recreated shell is upgraded without duplicate date');
            assert.equal(await page.locator('.clock-hours').textContent(), '12');
            assert.deepEqual(errors, []);
        } finally { await browser.close(); }
    });
}
