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
        document.getAnimations().filter(a => a.effect?.target?.closest?.('.character-chat-dialog') && a.effect.getTiming().iterations !== Infinity).every(a => a.playState === 'finished'));
}
async function setup(browser, viewport) {
    const context = await browser.newContext({ viewport, reducedMotion: 'no-preference', hasTouch: viewport.width < 600,
        isMobile: viewport.width < 600, serviceWorkers: 'block' });
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
            await page.screenshot({ path: `${output}/composer-${viewport.width}.png` });
            await page.getByRole('button', { name: '傳送', exact: true }).click();
            assert.equal(await page.evaluate(() => chatMotion.calls), 1, 'send action is immediate, before animation ends');
            assert.equal(await page.getByRole('button', { name: '停止回覆', exact: true }).isVisible(), true);
            assert.match(await page.locator('.character-chat-message.is-assistant:not([aria-hidden]) .character-chat-reply-state').innerText(), /正在思考/);
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
            const interrupted = await page.evaluate(() => {
                NewtabCharacterChat.close(); NewtabCharacterChat.open('companion-1');
                const dialog = document.querySelector('.character-chat-dialog[open]');
                const before = parseFloat(getComputedStyle(dialog).opacity);
                NewtabCharacterChat.close();
                const ghost = document.querySelector('.character-chat-exit-ghost');
                const first = ghost.getAnimations().find(a => a.effect.target === ghost).effect.getKeyframes()[0].opacity;
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
            await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
            assert.equal(await page.evaluate(() => NewtabCharacterChat.isOpen()), false);
            assert.equal(await page.locator('.character-chat-exit-ghost').count(), 0, 'reduced motion closes without a visual clone');
            assert.deepEqual(errors, []);
            await context.close();
            console.log(`PASS chat motion ${viewport.width}: adaptive composer, immediate send/stop, stable stream DOM, settings transition, rapid reopen, live reduced motion, cleanup`);
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
