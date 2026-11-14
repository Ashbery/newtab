// Isolated UI/transport fixtures. Never opens a personal profile or calls a model.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = process.env.NEWTAB_TEST_URL || 'http://127.0.0.1:4174/';
const historyKey = 'nt_character_chat_session_v1';
const persona = '請用平靜而簡短的語氣回答。';

async function contextFor(browser, options = {}) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block', ...options });
    await context.route(/^https?:\/\//, route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
    await context.addInitScript(({ historyKey, persona, origin }) => {
        if (location.origin !== origin) return;
        if (!sessionStorage.getItem('chat-lifecycle-seeded')) {
            sessionStorage.setItem(historyKey, JSON.stringify([{ role: 'user', content: 'OLD_SAVED_SECRET', status: 'complete' }]));
            sessionStorage.setItem('chat-lifecycle-seeded', 'yes');
        }
        if (!localStorage.getItem('nt_character_persona_v1')) localStorage.setItem('nt_character_persona_v1', persona);
        if (!localStorage.getItem('nt_appearance_v1')) localStorage.setItem('nt_appearance_v1', JSON.stringify({ transparency: 37, blur: 4 }));
        window.chatHistoryWrites = [];
        const originalSet = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
            if (key === historyKey) chatHistoryWrites.push(value);
            return originalSet.call(this, key, value);
        };
    }, { historyKey, persona, origin: new URL(base).origin });
    return context;
}
async function ready(page, navigate = true) {
    if (navigate) await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.NewtabCharacterChat && window.NewtabWidgets?.getLayout());
}
async function fixture(page) {
    await page.evaluate(() => {
        window.chatLife = { calls: [], aborted: 0, mode: 'normal', connected: true, statusCalls: 0, stale: null };
        window.NewtabChatTransport = {
            async status() {
                chatLife.statusCalls++;
                return { available: true, connected: chatLife.connected, canChat: chatLife.connected, accountLabel: '測試連線',
                    capabilities: { characterPrompt: true }, connecting: !chatLife.connected };
            },
            async login() { return { opened: true }; },
            async stream({ messages, characterPrompt, signal, onDelta }) {
                chatLife.calls.push({ messages, characterPrompt });
                if (chatLife.mode === 'hold') {
                    onDelta('尚未完成的回覆');
                    return new Promise((resolve, reject) => {
                        chatLife.stale = () => { onDelta('STALE_DELTA'); resolve({ text: 'STALE_FINAL' }); };
                        signal.addEventListener('abort', () => { chatLife.aborted++; reject(new DOMException('Stopped', 'AbortError')); }, { once: true });
                    });
                }
                if (chatLife.mode === 'failure') { onDelta('未完成'); throw new Error('測試中斷'); }
                const text = chatLife.mode === 'long' ? '長'.repeat(18000) : '回覆：' + messages.at(-1).content;
                onDelta(text); return { text };
            }
        };
    });
}
async function open(page) {
    await page.evaluate(() => NewtabCharacterChat.open('companion-1'));
    await page.waitForFunction(() => document.querySelector('.character-chat-connection')?.dataset.connected === 'true');
}
async function send(page, text, terminal = 'complete') {
    await page.locator('#character-chat-input').fill(text);
    await page.getByRole('button', { name: '傳送', exact: true }).click();
    if (terminal) await page.waitForFunction(phase => document.querySelector('.character-chat-message.is-assistant:last-child')?.dataset.phase === phase, terminal);
}
async function assertFresh(page) {
    assert.equal(await page.evaluate(() => NewtabCharacterChat.isOpen()), false, 'new document starts with chat closed');
    assert.equal(await page.locator('.character-chat-message').count(), 0, 'new document has no retained message nodes');
    assert.equal(await page.evaluate(key => sessionStorage.getItem(key), historyKey), null, 'legacy saved history is removed before chat opens');
}
async function savedPreferences(page) {
    return page.evaluate(() => ({
        persona: localStorage.getItem('nt_character_persona_v1'),
        appearance: localStorage.getItem('nt_appearance_v1'),
        widgets: JSON.stringify(NewtabWidgets.getLayout().widgets),
        profiles: localStorage.getItem('nt_layout_profiles_v1')
    }));
}

(async () => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.NEWTAB_BROWSER_PATH || 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe' });
    async function test(name, run) {
        const context = await contextFor(browser);
        const errors = [];
        context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
        try { await run(context); assert.deepEqual(errors, []); console.log('PASS ' + name); }
        finally { await context.close(); }
    }
    try {
        await test('reload clears transient chat; same-page close preserves it; durable preferences survive', async context => {
            const page = await context.newPage(); await ready(page); await assertFresh(page);
            const preferences = await savedPreferences(page);
            await fixture(page); await open(page);
            assert.equal(await page.locator('.character-chat-message').count(), 0, 'legacy secret is never rendered');
            await send(page, 'CURRENT_PAGE_ONLY');
            assert.deepEqual(await page.evaluate(() => chatHistoryWrites), [], 'messages are never written to browser storage');
            await page.getByRole('button', { name: '關閉對話', exact: true }).click(); await open(page);
            assert.equal(await page.locator('.character-chat-message.is-user').innerText(), 'CURRENT_PAGE_ONLY');
            await page.locator('#character-chat-input').fill('UNSENT_DRAFT');
            await page.getByRole('button', { name: '對話設定', exact: true }).click();
            await page.locator('#character-chat-prompt').fill('UNSAVED_PERSONA');
            await page.reload(); await ready(page, false); await assertFresh(page);
            assert.deepEqual(await savedPreferences(page), preferences, 'reset preserves widgets, appearance, profile configuration and saved persona');
            await fixture(page); await open(page);
            assert.equal(await page.locator('#character-chat-input').inputValue(), '');
            assert.equal(await page.locator('#character-chat-settings').isVisible(), false);
            await send(page, 'AFTER_RELOAD');
            assert.deepEqual(await page.evaluate(() => chatLife.calls.at(-1).messages), [{ role: 'user', content: 'AFTER_RELOAD' }], 'the next request carries no previous-document conversation');
            assert.equal(await page.evaluate(() => chatLife.calls.at(-1).characterPrompt), persona);
        });

        await test('opener-created tabs ignore copied history; resetting one tab leaves the other live conversation intact', async context => {
            const parent = await context.newPage(); await ready(parent); await fixture(parent); await open(parent);
            await send(parent, 'PARENT_LIVE_MESSAGE');
            await parent.evaluate(key => {
                sessionStorage.setItem('opener-copy-proof', 'copied');
                sessionStorage.setItem(key, JSON.stringify([{ role: 'user', content: 'COPIED_SECRET', status: 'complete' }]));
            }, historyKey);
            const popupPromise = parent.waitForEvent('popup');
            await parent.evaluate(url => window.open(url, '_blank'), base);
            const child = await popupPromise; await ready(child, false);
            assert.equal(await child.evaluate(() => sessionStorage.getItem('opener-copy-proof')), 'copied', 'the test exercises actual opener sessionStorage copying');
            await assertFresh(child); await fixture(child); await open(child);
            await send(child, 'CHILD_ONLY');
            assert.deepEqual(await child.evaluate(() => chatLife.calls.at(-1).messages), [{ role: 'user', content: 'CHILD_ONLY' }]);
            await child.reload(); await ready(child, false); await assertFresh(child);
            assert.equal(await parent.locator('.character-chat-message.is-user').innerText(), 'PARENT_LIVE_MESSAGE', 'another tab reset cannot erase the active parent conversation');
            await send(parent, 'PARENT_CONTINUES');
            assert.equal(await parent.evaluate(() => chatLife.calls.at(-1).messages[0].content), 'PARENT_LIVE_MESSAGE');
        });

        await test('pagehide aborts and clears; cached-page restoration cannot resurrect replies, drafts or settings', async context => {
            const page = await context.newPage(); await ready(page); await fixture(page); await open(page);
            await page.evaluate(() => { chatLife.mode = 'hold'; });
            await send(page, 'ABORT_ON_LEAVE', null);
            await page.locator('#character-chat-input').fill('DRAFT_TO_DISCARD');
            await page.getByRole('button', { name: '對話設定', exact: true }).click();
            await page.locator('#character-chat-prompt').fill('UNSAVED_PERSONA');
            await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
            assert.equal(await page.evaluate(() => chatLife.aborted), 1, 'leaving aborts the in-flight transport immediately');
            await page.evaluate(() => { chatLife.stale(); window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
            await page.waitForTimeout(50);
            await assertFresh(page);
            assert.equal(await page.locator('.character-chat-exit-ghost,.character-chat-view-ghost').count(), 0);
            assert.equal(await page.evaluate(() => document.getAnimations().filter(a => a.effect?.target?.closest?.('.character-chat-dialog')).length), 0, 'no chat animation survives page leave');
            await page.evaluate(() => { chatLife.mode = 'normal'; }); await open(page);
            assert.equal(await page.locator('#character-chat-input').inputValue(), '');
            assert.equal(await page.locator('#character-chat-settings').isVisible(), false);
            await send(page, 'FRESH_AFTER_RESTORE');
            assert.deepEqual(await page.evaluate(() => chatLife.calls.at(-1).messages), [{ role: 'user', content: 'FRESH_AFTER_RESTORE' }]);
            assert.equal(await page.locator('.character-chat-messages').innerText().then(text => text.includes('STALE_')), false);
        });

        await test('long-lived conversations prune old DOM and context while keeping retry attached to the latest user', async context => {
            const page = await context.newPage(); await ready(page); await fixture(page); await open(page);
            for (let i = 0; i < 24; i++) await send(page, 'TURN_' + i);
            assert.equal(await page.locator('.character-chat-message').count(), 40, 'retains at most twenty completed exchanges');
            assert.equal(await page.locator('.character-chat-message.is-user').first().innerText(), 'TURN_4');
            await page.evaluate(() => { chatLife.mode = 'failure'; }); await send(page, 'LATEST_RETRY', 'failed');
            assert.equal(await page.locator('.character-chat-message').count(), 40);
            await page.evaluate(() => { chatLife.mode = 'normal'; });
            await page.getByRole('button', { name: '重試', exact: true }).click();
            await page.waitForFunction(() => document.querySelector('.character-chat-message.is-assistant:last-child')?.dataset.phase === 'complete');
            assert.equal(await page.evaluate(() => chatLife.calls.at(-1).messages.at(-1).content), 'LATEST_RETRY');
            assert.equal(await page.locator('.character-chat-message.is-user').last().innerText(), 'LATEST_RETRY');
            await page.evaluate(() => NewtabCharacterChat.close()); await open(page);
            assert.equal(await page.locator('.character-chat-message').count(), 40, 'old state does not regenerate pruned nodes on reopen');
            await page.evaluate(() => { chatLife.mode = 'long'; });
            for (let i = 0; i < 5; i++) await send(page, 'LONG_' + i);
            const retained = await page.locator('.character-chat-text').allTextContents();
            assert(retained.join('').length <= 64000, 'the text budget also bounds retained nodes before reaching the message-count limit');
            assert.equal(await page.locator('.character-chat-message.is-user').last().innerText(), 'LONG_4');
            assert.deepEqual(await page.evaluate(() => chatHistoryWrites), []);
        });

        await test('pagehide stops pending-login polling without clearing saved persona', async context => {
            const page = await context.newPage(); await ready(page); await fixture(page);
            await page.evaluate(() => { chatLife.connected = false; NewtabCharacterChat.open('companion-1'); });
            await page.waitForFunction(() => document.querySelector('.character-chat-connection')?.dataset.connected === 'false');
            const before = await page.evaluate(() => chatLife.statusCalls);
            await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
            await page.waitForTimeout(2200);
            assert.equal(await page.evaluate(() => chatLife.statusCalls), before, 'the two-second login poll is removed on page leave');
            assert.equal(await page.evaluate(() => localStorage.getItem('nt_character_persona_v1')), persona);
            await assertFresh(page);
        });
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
