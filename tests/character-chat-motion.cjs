// Real browser UI with a deliberately controlled transport; never opens an
// account session or sends model requests. Motion assertions observe DOM/WAAPI.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const base = process.env.NEWTAB_TEST_URL || 'http://127.0.0.1:4174/';
const output = '.impeccable/review/chat-motion';
fs.mkdirSync(output, { recursive: true });

async function settled(page) {
    await page.waitForFunction(() => !document.querySelector('.character-chat-view-ghost,.character-chat-exit-ghost') &&
        !document.querySelector('[data-chat-motion]') &&
        document.getAnimations().filter(a => a.effect?.target?.closest?.('.character-chat-dialog') && a.effect.getTiming().iterations !== Infinity).every(a => a.playState === 'finished'));
}
async function assertProgressMoving(page, phase) {
    const row = page.locator('.character-chat-message.is-assistant').last();
    assert.equal(await row.getAttribute('data-phase'), phase);
    const ring = row.locator('.chat-state-ring');
    const icon = row.locator('.character-chat-reply-state-icon');
    await settled(page);
    const before = await ring.evaluate(el => getComputedStyle(el).transform);
    const imageBefore = await icon.screenshot();
    await page.waitForTimeout(220);
    const after = await ring.evaluate(el => getComputedStyle(el).transform);
    const imageAfter = await icon.screenshot();
    assert.notEqual(before, after, `${phase}: the rendered progress ring keeps turning`);
    assert(!imageBefore.equals(imageAfter), `${phase}: visible icon pixels change, not just its animation clock`);
}
async function assertProgressSettled(page, phase) {
    const row = page.locator('.character-chat-message.is-assistant').last();
    await page.waitForFunction(expected => document.querySelector('.character-chat-message.is-assistant:last-child')?.dataset.phase === expected, phase);
    await settled(page);
    assert.equal(await row.locator('.chat-state-ring').evaluate(el => el.getAnimations().length), 0, `${phase}: no orphaned spinner`);
    assert.equal(await row.locator('.chat-state-ring').isVisible(), false);
    assert.equal(await row.locator('.chat-state-check').isVisible(), phase === 'complete');
}
async function setup(browser, viewport) {
    const context = await browser.newContext({ viewport, reducedMotion: 'no-preference', hasTouch: viewport.width < 600,
        isMobile: viewport.width < 600, serviceWorkers: 'block',
        ...(process.env.NEWTAB_RECORD_MOTION ? { recordVideo: { dir: output, size: viewport } } : {}) });
    await context.route(/^https?:\/\//, route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.evaluate(() => {
        window.chatMotion = { calls: 0, aborted: 0, animations: [] };
        const animate = Element.prototype.animate;
        Element.prototype.animate = function (frames, options) {
            if (this.closest('.character-chat-dialog')) chatMotion.animations.push({ target: this.className?.baseVal || this.className, at: performance.now() });
            return animate.call(this, frames, options);
        };
        NewtabChatTransport = {
            async status() { return { available: true, connected: true, canChat: true, capabilities: { characterPrompt: true }, accountLabel: '測試連線' }; },
            async stream({ onDelta, signal }) {
                chatMotion.calls++;
                return new Promise((resolve, reject) => {
                    chatMotion.delta = onDelta;
                    chatMotion.finish = () => resolve({});
                    chatMotion.fail = () => reject(new Error('測試連線中斷'));
                    signal.addEventListener('abort', () => { chatMotion.aborted++; reject(new DOMException('Stopped', 'AbortError')); }, { once: true });
                });
            }
        };
        document.querySelector('.companion-trigger')?.focus();
        NewtabCharacterChat.open('companion-1');
    });
    await page.waitForFunction(() => document.querySelector('.character-chat-connection')?.dataset.connected === 'true');
    await settled(page);
    return { context, page, errors };
}

(async () => {
    const browser = await chromium.launch({ headless: true, ...(process.env.NEWTAB_BROWSER_PATH ?
        { executablePath: process.env.NEWTAB_BROWSER_PATH } : { channel: 'msedge' }) });
    try {
        for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
            const { context, page, errors } = await setup(browser, viewport);
            await page.screenshot({ path: `${output}/empty-${viewport.width}.png` });
            const input = page.locator('#character-chat-input');
            await input.fill('今天想把步調放慢一點。\n可以陪我整理一下\n接下來的計畫嗎？');
            await settled(page);
            const tall = await input.boundingBox(); assert(tall.height > 70 && tall.height <= 132);
            const resizeContinuity = await page.evaluate(async () => {
                const input = document.querySelector('#character-chat-input');
                input.value = '第一行'; input.dispatchEvent(new Event('input', { bubbles: true }));
                await new Promise(resolve => setTimeout(resolve, 60));
                const before = input.getBoundingClientRect().height;
                input.value = '第一行\n第二行\n第三行'; input.dispatchEvent(new Event('input', { bubbles: true }));
                return { before, after: input.getBoundingClientRect().height };
            });
            assert(Math.abs(resizeContinuity.before - resizeContinuity.after) < 1, 'composer reverses from its rendered height, without jumping to either endpoint');
            await settled(page);
            await page.screenshot({ path: `${output}/composer-${viewport.width}.png` });
            await page.getByRole('button', { name: '傳送', exact: true }).click();
            assert.equal(await page.evaluate(() => chatMotion.calls), 1, 'send action is immediate, before animation ends');
            assert.equal(await page.getByRole('button', { name: '停止回覆', exact: true }).isVisible(), true);
            assert.match(await page.locator('.character-chat-message.is-assistant:not([aria-hidden]) .character-chat-reply-state').innerText(), /正在思考/);
            assert.equal(await page.locator('.character-chat-message.is-user .character-chat-speaker').count(), 0, 'user bubbles show content without a name header');
            assert.equal(await page.getByRole('article', { name: '你的訊息' }).count(), 1, 'the message author remains accessible');
            await assertProgressMoving(page, 'thinking');
            await page.evaluate(() => {
                chatMotion.delta('當然可以。');
                chatMotion.row = document.querySelector('.character-chat-message.is-assistant');
                chatMotion.textNode = chatMotion.row.querySelector('.character-chat-text').firstChild;
                chatMotion.entrances = chatMotion.animations.filter(x => typeof x.target === 'string' && x.target.includes('character-chat-message')).length;
            });
            await page.evaluate(() => { for (const text of ['先把注意力放回', '現在的這一刻。\n\n', '選一件今天最重要的事，', '我們慢慢完成它。']) chatMotion.delta(text); });
            assert.equal(await page.evaluate(() => chatMotion.row === document.querySelector('.character-chat-message.is-assistant') &&
                chatMotion.textNode === chatMotion.row.querySelector('.character-chat-text').firstChild), true, 'streamed chunks preserve the existing message/text node');
            assert.equal(await page.evaluate(() => chatMotion.animations.filter(x => typeof x.target === 'string' && x.target.includes('character-chat-message')).length),
                await page.evaluate(() => chatMotion.entrances), 'stream chunks never replay message entrances');
            await settled(page);
            await assertProgressMoving(page, 'streaming');
            assert((await input.boundingBox()).height <= 45, 'submitted composer settles back to a single row');
            await page.screenshot({ path: `${output}/streaming-${viewport.width}.png` });
            await page.getByRole('button', { name: '對話設定', exact: true }).click();
            assert.equal(await page.locator('#character-chat-settings').isVisible(), true);
            assert.equal(await page.evaluate(() => document.activeElement.id), 'character-chat-settings-title');
            await settled(page);
            await page.screenshot({ path: `${output}/settings-${viewport.width}.png` });
            await page.keyboard.press('Escape'); await settled(page);
            assert.equal(await page.getByRole('button', { name: '停止回覆', exact: true }).isVisible(), true, 'Stop remains reachable after settings');
            await page.evaluate(() => chatMotion.finish());
            await page.waitForFunction(() => document.querySelector('.character-chat-message.is-assistant')?.dataset.phase === 'complete');
            await settled(page);
            await assertProgressSettled(page, 'complete');
            await page.screenshot({ path: `${output}/complete-${viewport.width}.png` });
            await input.fill('測試立即停止與快速重開');
            await page.getByRole('button', { name: '傳送', exact: true }).click();
            const close = await page.evaluate(() => {
                NewtabCharacterChat.close();
                return { open: NewtabCharacterChat.isOpen(), aborted: chatMotion.aborted,
                    ghosts: document.querySelectorAll('.character-chat-exit-ghost').length };
            });
            assert.equal(close.open, false); assert.equal(close.aborted, 1, 'closing aborts the stream immediately'); assert.equal(close.ghosts, 1);
            await page.evaluate(() => NewtabCharacterChat.open('companion-1'));
            await settled(page);
            assert.equal(await page.locator('.character-chat-exit-ghost').count(), 0);
            assert.equal(await page.evaluate(() => NewtabCharacterChat.isOpen()), true, 'old exit completion cannot close a reopened panel');
            const reopenContinuity = await page.evaluate(async () => {
                NewtabCharacterChat.close(); await new Promise(resolve => setTimeout(resolve, 70));
                const ghost = document.querySelector('.character-chat-exit-ghost');
                const before = getComputedStyle(ghost);
                const values = { opacity: +before.opacity, transform: before.transform };
                NewtabCharacterChat.open('companion-1');
                const after = getComputedStyle(document.querySelector('.character-chat-dialog[open]'));
                return { before: values, after: { opacity: +after.opacity, transform: after.transform } };
            });
            assert(Math.abs(reopenContinuity.before.opacity - reopenContinuity.after.opacity) < .01, 'reopening continues the visible exit opacity');
            assert.equal(reopenContinuity.before.transform, reopenContinuity.after.transform, 'reopening preserves the exact current panel pose');
            await settled(page);
            const viewContinuity = await page.evaluate(async () => {
                const toggle = document.querySelector('.character-chat-persona-toggle');
                const views = [document.querySelector('.character-chat-conversation'), document.querySelector('#character-chat-settings')];
                const sample = () => views.map(view => ({ opacity: +getComputedStyle(view).opacity, transform: getComputedStyle(view).transform }));
                toggle.click(); await new Promise(resolve => setTimeout(resolve, 90));
                const before = sample(); toggle.click(); const after = sample();
                let overlap = 0;
                for (let i = 0; i < 12; i++) {
                    await new Promise(requestAnimationFrame);
                    const values = sample(); overlap = Math.max(overlap, Math.min(values[0].opacity, values[1].opacity));
                }
                return { before, after, outgoingInert: views[1].inert, currentInert: views[0].inert,
                    ghosts: document.querySelectorAll('.character-chat-view-ghost').length, overlap };
            });
            assert.deepEqual(viewContinuity.after, viewContinuity.before, 'both real views retain their current rendered opacity and position when reversed');
            assert.equal(viewContinuity.outgoingInert, true); assert.equal(viewContinuity.currentInert, false);
            assert.equal(viewContinuity.ghosts, 0, 'view changes retain live content, never snapshots of streaming replies');
            assert(viewContinuity.overlap < .01, 'dense settings and reply text never crossfade on top of each other');
            await settled(page);
            const interrupted = await page.evaluate(() => {
                NewtabCharacterChat.close(); NewtabCharacterChat.open('companion-1');
                const dialog = document.querySelector('.character-chat-dialog[open]');
                const before = parseFloat(getComputedStyle(dialog).opacity);
                NewtabCharacterChat.close();
                const ghost = document.querySelector('.character-chat-exit-ghost');
                const first = getComputedStyle(ghost).opacity;
                NewtabCharacterChat.open('companion-1');
                return { before, first: Number(first) };
            });
            assert(Math.abs(interrupted.before - interrupted.first) < .01, 'interrupted entrance exits from its visible opacity without flashing fully opaque');
            await settled(page);
            await page.evaluate(() => { for (let i = 0; i < 8; i++) document.querySelector('.character-chat-persona-toggle').click(); });
            await settled(page);
            assert.equal(await page.locator('#character-chat-settings').isVisible(), false);
            await page.evaluate(() => { NewtabCharacterChat.close(); NewtabCharacterChat.open('companion-1'); });
            await page.emulateMedia({ reducedMotion: 'reduce' });
            await page.waitForFunction(() => document.getAnimations().filter(a => a.effect?.target?.closest?.('.character-chat-dialog')).length === 0);
            assert.equal(await page.locator('.character-chat-view-ghost,.character-chat-exit-ghost').count(), 0, 'dynamic reduced motion removes outgoing layers');
            await page.getByRole('button', { name: '對話設定', exact: true }).click();
            assert.equal(await page.evaluate(() => document.getAnimations().filter(a => a.effect?.target?.closest?.('.character-chat-dialog')).length), 0);
            await page.keyboard.press('Escape');
            for (const terminal of ['complete', 'stopped', 'failed']) {
                await input.fill('進度提示測試');
                await page.getByRole('button', { name: '傳送', exact: true }).click();
                await assertProgressMoving(page, 'thinking');
                await page.evaluate(() => chatMotion.delta('我在這裡。'));
                await assertProgressMoving(page, 'streaming');
                assert.equal(await page.evaluate(() => document.getAnimations().filter(a => a.effect?.target?.closest?.('.character-chat-dialog') &&
                    !a.effect.target.matches('.chat-state-ring')).length), 0, 'reduced motion keeps all decorative chat motion off');
                if (terminal === 'complete') {
                    await page.emulateMedia({ reducedMotion: 'no-preference' });
                    await assertProgressMoving(page, 'streaming');
                    await page.emulateMedia({ reducedMotion: 'reduce' });
                    await assertProgressMoving(page, 'streaming');
                    await page.evaluate(() => chatMotion.finish());
                } else if (terminal === 'stopped') await page.getByRole('button', { name: '停止回覆', exact: true }).click();
                else await page.evaluate(() => chatMotion.fail());
                await assertProgressSettled(page, terminal);
            }
            assert.equal(await page.locator('.character-chat-message.is-user .character-chat-speaker').count(), 0);
            await page.keyboard.press('Escape');
            assert.equal(await page.evaluate(() => NewtabCharacterChat.isOpen()), false);
            assert.equal(await page.locator('.character-chat-exit-ghost').count(), 0, 'reduced motion closes without a visual clone');
            assert.deepEqual(errors, []);
            if (process.env.NEWTAB_RECORD_MOTION) {
                await page.emulateMedia({ reducedMotion: 'no-preference' });
                await page.evaluate(() => NewtabCharacterChat.open('companion-1')); await settled(page);
                await page.waitForTimeout(550);
                await page.getByRole('button', { name: '對話設定', exact: true }).click(); await page.waitForTimeout(90);
                await page.screenshot({ path: `${output}/continuous-settings-${viewport.width}-90.png` });
                await settled(page); await page.waitForTimeout(650);
                await page.keyboard.press('Escape'); await settled(page);
                await input.fill('今天想慢一點，\n先做一件喜歡的事。'); await settled(page); await page.waitForTimeout(650);
                await page.getByRole('button', { name: '傳送', exact: true }).click(); await page.waitForTimeout(700);
                for (const part of ['好呀，', '先把今天最想做的一件事', '留給自己。\n\n', '我會在這裡陪你慢慢來。']) {
                    await page.evaluate(text => chatMotion.delta(text), part); await page.waitForTimeout(340);
                }
                await page.evaluate(() => chatMotion.finish()); await settled(page); await page.waitForTimeout(800);
                await page.getByRole('button', { name: '關閉對話', exact: true }).click(); await settled(page);
                await page.waitForTimeout(350);
            }
            const video = page.video();
            await context.close();
            if (video) await video.saveAs(`${output}/continuous-${viewport.width}.webm`);
            console.log(`PASS chat motion ${viewport.width}: visible thinking/streaming progress in both motion modes, no user headers, completion/stop/error cleanup, adaptive composer, stable stream DOM, view continuity`);
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
