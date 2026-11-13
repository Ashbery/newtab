// UI-only fixture transport. No model request, login, or personal account is used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const base = process.env.NEWTAB_TEST_URL || 'http://127.0.0.1:4174/';
fs.mkdirSync('.impeccable/review', { recursive: true });

async function boot(page) {
    await page.goto(base);
    assert.equal(await page.evaluate(() => typeof window.NewtabCharacterChat?.open), 'function', 'page includes chat without fixture injection');
    await page.evaluate(() => {
        window.chatTest = { available: true, connected: true, mode: 'normal', calls: [], reactions: [], loginCalls: 0, disconnectCalls: 0 };
        document.addEventListener('newtab:chat-state', e => chatTest.reactions.push(e.detail));
        window.NewtabChatTransport = {
            async status() { return { capabilities: { characterPrompt: true }, available: chatTest.available, connected: chatTest.connected, canChat: chatTest.available && chatTest.connected,
                accountLabel: '測試連線', models: [{ slug: 'test-model', displayName: '測試模型' }, { slug: 'test-other', displayName: '另一個測試模型' }] }; },
            async login() { chatTest.loginCalls++; chatTest.connected = true; return { opened: true }; },
            async disconnect() { chatTest.disconnectCalls++; chatTest.connected = false; },
            async stream(options) {
                const { messages, characterPrompt, signal, onDelta } = options;
                chatTest.calls.push({ messages, characterPrompt, hasModel: Object.hasOwn(options, 'model') });
                if (chatTest.mode === 'long') { const text = '長'.repeat(18000); onDelta(text); return { text }; }
                if (chatTest.mode === 'oversize') { const text = '長'.repeat(65000); onDelta(text); return { text }; }
                if (chatTest.mode === 'oversize-final') return { text: '長'.repeat(65000) };
                if (chatTest.mode === 'markdown') { const text = '**一起慢慢來**\n\n- 喝一口水\n- <img src=x onerror="window.chatXss=true">\n\n這是 `文字`。'; onDelta(text); return { text }; }
                if (chatTest.mode === 'failure') { onDelta('部分內容'); throw new Error('測試連線中斷，請重試。'); }
                if (chatTest.mode === 'hold') {
                    onDelta('正在輸出的內容');
                    await new Promise((_, reject) => signal.addEventListener('abort', () => { reject(new DOMException('stopped', 'AbortError')); setTimeout(() => onDelta('STALE_DELTA'), 60); }, { once: true }));
                }
                onDelta('這是測試回覆。\n'); await new Promise(resolve => setTimeout(resolve, 35));
                onDelta('<img src=x onerror="window.chatXss=true">');
                return { text: '這是測試回覆。\n<img src=x onerror="window.chatXss=true">' };
            }
        };
        document.querySelector('.companion-trigger')?.focus();
        NewtabCharacterChat.open('companion-1');
    });
    await page.waitForFunction(() => document.querySelector('.character-chat-connection')?.dataset.connected === 'true');
}
async function send(page, text) {
    await page.locator('#character-chat-input').fill(text);
    await page.getByRole('button', { name: '傳送', exact: true }).click();
}
async function complete(page) { await page.getByRole('status').filter({ hasText: '回覆完成。' }).waitFor(); }

async function checkPersona(browser) {
    const defaults = require('../js/character-persona.js');
    assert.equal(defaults.maxLength, 8000);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await context.route(/^https?:\/\//, route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await boot(page);
    const edit = () => page.getByRole('button', { name: '角色設定', exact: true }).click();
    const prompt = page.getByRole('textbox', { name: '角色提示詞', exact: true });
    const save = () => page.getByRole('button', { name: '儲存設定', exact: true }).click();
    await edit();
    assert.equal(await prompt.inputValue(), defaults.defaultPrompt, 'browser and server share the same default persona');
    await prompt.fill('尚未儲存的草稿');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => NewtabCharacterChat.isOpen()), true, 'Escape cancels settings before closing chat');
    await edit(); assert.equal(await prompt.inputValue(), defaults.defaultPrompt, 'cancel discards only the prompt draft');
    const custom = '你是 Nacho。請用溫柔、簡短的繁體中文陪我規劃今天。';
    await prompt.fill(custom); await save();
    await send(page, '角色設定測試'); await complete(page);
    assert.equal(await page.evaluate(() => chatTest.calls.at(-1).characterPrompt), custom);
    assert.equal(await page.evaluate(() => chatTest.calls.at(-1).hasModel), false);
    assert.equal(await page.evaluate(() => chatTest.loginCalls + chatTest.disconnectCalls), 0, 'saving persona never changes account state');
    await edit();
    const importFile = page.locator('input[aria-label="匯入角色提示詞"]');
    const invalidFiles = [
        { name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('image') },
        { name: 'empty.txt', mimeType: 'text/plain', buffer: Buffer.from('   ') },
        { name: 'long.md', mimeType: 'text/markdown', buffer: Buffer.from('字'.repeat(8001)) },
        { name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from([0xff, 0xfe, 0xff]) }
    ];
    for (const file of invalidFiles) {
        await importFile.setInputFiles(file);
        await page.waitForFunction(() => !document.getElementById('character-chat-prompt').disabled);
        assert.equal(await prompt.inputValue(), custom, 'invalid import preserves the draft');
        assert.match(await page.locator('.character-chat-prompt-notice').textContent(), /請|最多|無法/);
    }
    await prompt.fill('🐱'.repeat(4001));
    assert.equal(await page.getByRole('button', { name: '儲存設定', exact: true }).isDisabled(), true, 'prompt length uses the backend UTF-16 limit');
    assert.equal(await prompt.getAttribute('aria-invalid'), 'true');
    const imported = '# Nacho\n請用平靜的語氣回答。<script>window.personaXss=true</script>';
    await importFile.setInputFiles({ name: 'nacho.md', mimeType: 'text/markdown', buffer: Buffer.from(imported) });
    await page.waitForFunction(value => document.getElementById('character-chat-prompt').value === value, imported);
    assert.equal(await page.evaluate(() => localStorage.getItem('nt_character_persona_v1')), custom, 'import alone does not save or execute the prompt');
    assert.equal(await page.evaluate(() => chatTest.calls.length), 1, 'import makes no conversation request');
    assert.equal(await page.evaluate(() => window.personaXss), undefined);
    const edited = imported + '\n請先回答重點。';
    await prompt.fill(edited); await save();
    await send(page, '第二次角色測試'); await complete(page);
    assert.equal(await page.evaluate(() => chatTest.calls.at(-1).characterPrompt), edited);
    await boot(page);
    await edit(); assert.equal(await prompt.inputValue(), edited, 'saved prompt survives reload');
    assert.equal(await page.locator('.character-chat-message.is-user').count(), 2, 'settings do not clear conversation history');
    await page.getByRole('button', { name: '恢復預設', exact: true }).click();
    assert.equal(await prompt.inputValue(), defaults.defaultPrompt);
    assert.equal(await page.evaluate(() => localStorage.getItem('nt_character_persona_v1')), edited, 'reset changes draft until explicitly saved');
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await edit(); assert.equal(await prompt.inputValue(), edited);
    await page.getByRole('button', { name: '恢復預設', exact: true }).click(); await save();
    assert.equal(await page.locator('.character-chat-message.is-user').count(), 2, 'default reset affects only the prompt');
    await send(page, '預設角色測試'); await complete(page);
    assert.equal(await page.evaluate(() => chatTest.calls.at(-1).characterPrompt), defaults.defaultPrompt);

    await edit(); await prompt.fill('儲存失敗不應套用這段內容。');
    await page.evaluate(() => {
        window.originalStorageSet = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) { if (key === 'nt_character_persona_v1') throw new DOMException('denied', 'SecurityError'); return originalStorageSet.call(this, key, value); };
    });
    await save();
    assert.equal(await page.locator('.character-chat-settings').isVisible(), true);
    assert.match(await page.locator('.character-chat-prompt-notice').textContent(), /無法儲存.*原設定仍保留/);
    await page.evaluate(() => { Storage.prototype.setItem = originalStorageSet; });
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await page.evaluate(() => { chatTest.mode = 'markdown'; });
    await send(page, '格式測試'); await complete(page);
    assert.equal(await page.evaluate(() => chatTest.calls.at(-1).characterPrompt), defaults.defaultPrompt, 'failed save leaves the active prompt intact');
    const reply = page.locator('.character-chat-message.is-assistant .character-chat-text').last();
    assert.equal(await reply.locator('strong').textContent(), '一起慢慢來');
    assert.equal(await reply.locator('li').count(), 2);
    assert.equal(await reply.locator('code').textContent(), '文字');
    assert.equal(await reply.locator('img,script').count(), 0, 'limited markdown never creates model-supplied HTML');
    assert.equal(await page.evaluate(() => window.chatXss), undefined);
    await page.screenshot({ path: '.impeccable/review/chat-nacho-replies.png' });
    await edit(); await page.screenshot({ path: '.impeccable/review/chat-nacho-settings-1440.png' });
    await page.setViewportSize({ width: 320, height: 640 });
    await page.getByRole('button', { name: '儲存設定', exact: true }).scrollIntoViewIfNeeded();
    assert.equal(await page.locator('.character-chat-settings').evaluate(el => el.scrollWidth <= el.clientWidth), true, 'settings fit a narrow screen without horizontal overflow');
    await page.screenshot({ path: '.impeccable/review/chat-nacho-settings-320.png' });
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await page.evaluate(() => {
        NewtabChatTransport.status = async () => ({ available: true, connected: true, canChat: true });
        NewtabCharacterChat.refresh();
    });
    await page.waitForFunction(() => document.querySelector('.character-chat-connection').textContent === '請更新對話服務');
    await page.locator('#character-chat-input').fill('舊服務不應忽略角色設定');
    assert.equal(await page.locator('.character-chat-send').isDisabled(), true);
    assert.match(await page.locator('.character-chat-status').textContent(), /需要更新/);
    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS Nacho persona: shared default, edit/import/cancel/reset/persistence, UTF-16 limits, storage errors, no model UI, safe markdown, older-service guard');
}

async function checkConnectionLifecycle(browser) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await context.route(/^https?:\/\//, route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
    const page = await context.newPage();
    await boot(page);
    await page.evaluate(() => {
        window.connectionProbe = { requests: [], statusCalls: 0 };
        NewtabChatTransport.status = () => new Promise(resolve => connectionProbe.requests.push(resolve));
        NewtabCharacterChat.refresh();
        NewtabCharacterChat.close();
        NewtabCharacterChat.open('companion-1');
    });
    assert.equal(await page.evaluate(() => connectionProbe.requests.length), 2, 'reopening requests fresh status even while the old request is pending');
    await page.locator('#character-chat-input').fill('尚未傳送');
    await page.evaluate(() => connectionProbe.requests[0]({ capabilities: { characterPrompt: true }, available: true, connected: false, canChat: false, error: 'STALE_STATUS' }));
    await page.waitForTimeout(30);
    assert.equal(await page.locator('.character-chat-refresh').isDisabled(), true, 'old finally cannot release the new status request');
    assert.equal(await page.locator('.character-chat-send').isDisabled(), true);
    assert.doesNotMatch(await page.locator('.character-chat-status').textContent(), /STALE_STATUS/);
    await page.keyboard.press('Enter');
    await page.locator('.character-chat-composer').evaluate(form => form.requestSubmit());
    assert.equal(await page.evaluate(() => chatTest.calls.length), 0, 'keyboard and form submission wait for connection checks');
    await page.evaluate(() => connectionProbe.requests[1]({ capabilities: { characterPrompt: true }, available: true, connected: true, canChat: true, accountLabel: '最新連線' }));
    await page.waitForFunction(() => document.querySelector('.character-chat-connection').textContent === '最新連線');

    await page.evaluate(() => { chatTest.mode = 'failure'; });
    await send(page, '重試鎖定測試');
    await page.locator('.character-chat-retry').waitFor();
    const sentBeforeDisconnect = await page.evaluate(() => chatTest.calls.length);
    await page.evaluate(() => { NewtabChatTransport.disconnect = () => new Promise(resolve => connectionProbe.disconnect = resolve); });
    await page.getByRole('button', { name: '登出', exact: true }).click();
    await page.locator('#character-chat-input').fill('登出途中不得傳送');
    assert.equal(await page.locator('.character-chat-send').isDisabled(), true);
    assert.equal(await page.locator('.character-chat-retry').isDisabled(), true);
    await page.keyboard.press('Enter');
    await page.locator('.character-chat-composer').evaluate(form => form.requestSubmit());
    await page.locator('.character-chat-retry').dispatchEvent('click');
    assert.equal(await page.evaluate(() => chatTest.calls.length), sentBeforeDisconnect, 'send and retry handlers reject actions during disconnect');
    await page.evaluate(() => {
        NewtabChatTransport.status = async () => ({ capabilities: { characterPrompt: true }, available: true, connected: false, canChat: false });
        connectionProbe.disconnect();
    });
    await page.waitForFunction(() => !document.querySelector('.character-chat-connect-button').disabled);

    // A late old login must not change the reopened panel or start a poll.
    await page.evaluate(() => { NewtabChatTransport.login = () => new Promise(resolve => connectionProbe.login = resolve); });
    await page.getByRole('button', { name: '使用 ChatGPT 登入', exact: true }).click();
    await page.evaluate(() => {
        NewtabCharacterChat.close();
        NewtabChatTransport.status = async () => { connectionProbe.statusCalls++; return { capabilities: { characterPrompt: true }, available: true, connected: false, canChat: false, error: 'FRESH_STATUS' }; };
        NewtabCharacterChat.open('companion-1');
    });
    await page.waitForFunction(() => document.querySelector('.character-chat-status').textContent === 'FRESH_STATUS');
    await page.evaluate(() => connectionProbe.login({ opened: true }));
    await page.waitForTimeout(2150);
    assert.equal(await page.evaluate(() => connectionProbe.statusCalls), 1, 'old login completion cannot start polling in the new dialog');
    assert.equal(await page.locator('.character-chat-status').textContent(), 'FRESH_STATUS');

    // An explicit reopen seeing a real pending login owns a new bounded poll.
    await page.evaluate(() => {
        NewtabCharacterChat.close(); connectionProbe.statusCalls = 0;
        NewtabChatTransport.status = async () => {
            connectionProbe.statusCalls++;
            return connectionProbe.statusCalls === 1 ? { capabilities: { characterPrompt: true }, available: true, connected: false, canChat: false, connecting: true } : { capabilities: { characterPrompt: true }, available: true, connected: true, canChat: true, accountLabel: '登入完成' };
        };
        NewtabCharacterChat.open('companion-1');
    });
    await page.waitForFunction(() => document.querySelector('.character-chat-connection').textContent === '登入完成');
    assert.equal(await page.evaluate(() => connectionProbe.statusCalls), 2, 'reopened pending login becomes ready through its own poll');
    for (const mode of ['oversize', 'oversize-final']) {
        await page.evaluate(mode => { chatTest.mode = mode; }, mode);
        await send(page, '過長回覆測試');
        await page.waitForFunction(() => document.querySelector('.character-chat-status').textContent === '回覆過長，已停止；可請 Nacho 分段回答');
        assert.equal(await page.locator('.character-chat-message.is-assistant .character-chat-text').last().evaluate(el => el.textContent.length), 64000);
        assert.equal(await page.locator('.character-chat-message-note').last().textContent(), '回覆過長，已停止');
    }
    await context.close();
    console.log('PASS connection lifecycle: stale status/login fenced, fresh reopen, pending-login poll, send/retry lock, explicit oversized-answer stop');
}

async function checkLazyTransportAndPlacement(browser) {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
    const serviceCalls = [];
    await context.route(/^https?:\/\//, route => {
        const url = new URL(route.request().url());
        if (url.origin === new URL(base).origin) return route.continue();
        if (url.origin === 'http://127.0.0.1:43127') {
            serviceCalls.push(url.pathname);
            // Real transport, fixture status only: no login or model calls.
            return route.fulfill({ json: { capabilities: { characterPrompt: true }, available: true, connected: false, canChat: false } });
        }
        return route.abort();
    });
    const page = await context.newPage();
    await page.goto(base, { waitUntil: 'networkidle' });
    assert.equal(await page.evaluate(() => typeof NewtabChatTransport.status), 'function');
    assert.deepEqual(serviceCalls, [], 'loading a new tab never requests access to the local chat service');
    await page.locator('.companion-trigger').click();
    await page.waitForFunction(() => document.querySelector('.character-chat-connection')?.textContent === '尚未連線');
    assert.deepEqual(serviceCalls, ['/v1/status'], 'local access begins only when the user opens chat');
    for (const viewport of [{ width: 1920, height: 1080 }, { width: 3440, height: 1440 }, { width: 5120, height: 1440 }]) {
        await page.setViewportSize(viewport);
        const dialog = await page.locator('.character-chat-dialog').boundingBox();
        const character = await page.locator('.widget[data-type="companion"]').boundingBox();
        assert.equal(dialog.height, 700, 'desktop sheet stays compact');
        assert(dialog.x >= 0 && dialog.y >= 24 && dialog.x + dialog.width <= viewport.width && dialog.y + dialog.height <= viewport.height - 24, 'sheet stays within screen');
        assert(dialog.x + dialog.width <= character.x || dialog.x >= character.x + character.width, 'sheet sits beside the character');
        await page.screenshot({ path: `.impeccable/review/chat-desktop-${viewport.width}.png` });
    }
    assert.deepEqual(serviceCalls, ['/v1/status'], 'resizing never starts login or another request');
    await context.close();
    console.log('PASS integrated chat: lazy local access, compact adjacent sheet at 16:9 / 21:9 / 32:9');
}

(async () => {
    const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
    try {
        await checkPersona(browser);
        await checkConnectionLifecycle(browser);
        await checkLazyTransportAndPlacement(browser);
        for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 640 }]) {
            const context = await browser.newContext({ viewport, isMobile: viewport.width < 600, hasTouch: viewport.width < 600, reducedMotion: 'reduce' });
            await context.route(/^https?:\/\//, route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
            const page = await context.newPage(); page.setDefaultTimeout(5000);
            const errors = []; page.on('pageerror', e => errors.push(e.message));
            await boot(page);
            assert.equal(await page.evaluate(() => document.activeElement.id), 'character-chat-input');
            await page.getByRole('button', { name: '關閉對話', exact: true }).focus();
            await page.keyboard.press('Shift+Tab');
            assert.equal(await page.evaluate(() => !!document.activeElement.closest('.character-chat-dialog')), true, 'native modal keeps keyboard focus in chat');
            const bounds = await page.locator('.character-chat-dialog').boundingBox();
            assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1, 'chat sheet fits');
            assert.equal(await page.locator('[aria-label="對話模型"]').count(), 0, 'the service chooses the model; no model controls appear');
            assert.equal(await page.locator('#character-chat-title').textContent(), 'Nacho');
            await page.locator('#character-chat-input').fill('中文確認');
            await page.locator('#character-chat-input').evaluate(input => {
                input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
                input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }));
            });
            assert.equal(await page.evaluate(() => chatTest.calls.length), 0, 'IME confirmation does not send');
            await page.locator('#character-chat-input').evaluate(input => input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
            await page.keyboard.press('Shift+Enter');
            assert.equal(await page.evaluate(() => chatTest.calls.length), 0, 'Shift+Enter inserts newline');
            await page.keyboard.press('Enter'); await complete(page);
            assert.equal(await page.evaluate(() => chatTest.calls.length), 1);
            assert.equal(await page.evaluate(() => chatTest.calls[0].hasModel), false);
            assert.equal(await page.evaluate(() => chatTest.calls[0].characterPrompt === NewtabCharacterPersona.defaultPrompt), true);
            assert.equal(await page.locator('.character-chat-message.is-assistant .character-chat-speaker').first().textContent(), 'Nacho');
            assert.equal((await page.locator('.character-chat-reply-avatar').first().boundingBox()).width, 30);
            assert.equal(await page.locator('.character-chat-text img').count(), 0, 'assistant HTML is rendered as plain text');
            assert.equal(await page.evaluate(() => window.chatXss), undefined);
            assert.deepEqual(await page.evaluate(() => [...new Set(chatTest.reactions.map(x => x.state))]), ['thinking', 'speaking', 'idle']);
            assert.equal(await page.locator('.character-chat-message.is-user').count(), 1);
            if (viewport.width === 1440) {
                await page.evaluate(() => { chatTest.mode = 'long'; });
                await send(page, '長回覆測試'); await complete(page);
                assert.equal(await page.locator('.character-chat-message.is-assistant .character-chat-text').last().evaluate(el => el.textContent.length), 18000, 'long answer remains visible');
                await page.evaluate(() => { chatTest.mode = 'normal'; });
                await send(page, '長回覆後繼續'); await complete(page);
                assert.equal(await page.evaluate(() => chatTest.calls.at(-1).messages.every(m => m.content.length <= 12000)), true, 'next question stays within the service per-message context limit');
                await page.getByRole('button', { name: '清除對話', exact: true }).click();
                await page.getByRole('button', { name: '確認清除', exact: true }).click();
                await send(page, '中文確認'); await complete(page);
            }
            await page.evaluate(() => { chatTest.mode = 'failure'; });
            await send(page, '第二個問題');
            await page.getByRole('button', { name: '重試', exact: true }).waitFor();
            assert.match(await page.locator('.character-chat-status').textContent(), /中斷/);
            await page.evaluate(() => { chatTest.mode = 'normal'; });
            await page.getByRole('button', { name: '重試', exact: true }).click(); await complete(page);
            assert.equal(await page.locator('.character-chat-message.is-user').count(), 2, 'retry does not duplicate the question');
            assert.equal(await page.evaluate(() => chatTest.calls.at(-1).messages.some(m => m.content === '部分內容')), false, 'partial failed answer is not sent as complete model context');
            await page.evaluate(() => { chatTest.mode = 'hold'; });
            await send(page, '停止測試');
            await page.locator('.character-chat-stop').click();
            await page.waitForFunction(() => document.querySelector('.character-chat-status').textContent === '已停止回覆。');
            assert.equal(await page.locator('.character-chat-message-note').last().textContent(), '已停止');
            await page.waitForTimeout(90);
            assert.equal(await page.locator('.character-chat-text').last().textContent(), '正在輸出的內容', 'late stream chunks after cancellation are ignored');
            await page.getByRole('button', { name: '清除對話', exact: true }).click();
            await page.keyboard.press('Escape');
            assert.equal(await page.evaluate(() => NewtabCharacterChat.isOpen()), true, 'Escape dismisses clear confirmation before closing chat');
            assert.equal(await page.locator('.character-chat-message.is-user').count(), 3);
            await page.keyboard.press('Escape');
            assert.equal(await page.evaluate(() => NewtabCharacterChat.isOpen()), false);
            assert.equal(await page.evaluate(() => document.activeElement.classList.contains('companion-trigger')), true, 'close returns focus to character');
            await boot(page);
            assert.equal(await page.locator('.character-chat-message.is-user').count(), 3, 'history survives reload in current tab');
            await page.getByRole('button', { name: '清除對話', exact: true }).click();
            await page.getByRole('button', { name: '確認清除', exact: true }).click();
            assert.equal(await page.locator('.character-chat-message').count(), 0);
            await page.getByRole('button', { name: '登出', exact: true }).click();
            assert.equal(await page.evaluate(() => chatTest.disconnectCalls), 1);
            await page.getByRole('button', { name: '使用 ChatGPT 登入', exact: true }).click();
            await page.waitForFunction(() => document.querySelector('.character-chat-connection').dataset.connected === 'true');
            assert.equal(await page.evaluate(() => chatTest.loginCalls), 1);
            await page.evaluate(() => { chatTest.available = false; NewtabCharacterChat.refresh(); });
            await page.waitForFunction(() => document.querySelector('.character-chat-connection').dataset.connected === 'false');
            await page.locator('#character-chat-input').fill('離線內容');
            assert.equal(await page.getByRole('button', { name: '傳送', exact: true }).isDisabled(), true, 'offline mode never fabricates responses');
            assert.match(await page.locator('.character-chat-status').textContent(), /尚未啟動/);
            assert.deepEqual(errors, []);
            await page.screenshot({ path: `.impeccable/review/chat-${viewport.width}.png` });
            await context.close();
            console.log(`PASS chat ${viewport.width}×${viewport.height}: sizing, IME, streaming, literal rendering, retry/stop, history/clear, Nacho identity/prompt contract, focus`);
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
