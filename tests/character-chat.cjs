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
        window.chatBackdropBefore = ['html', 'body', '#widget-canvas', '#image-background', '#video-background'].map(selector => {
            const el = document.querySelector(selector), style = getComputedStyle(el);
            return { selector, filter: style.filter, opacity: style.opacity };
        });
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
async function complete(page) {
    await page.waitForFunction(() => document.querySelector('.character-chat-stop')?.hidden &&
        document.querySelectorAll('.character-chat-message.is-assistant').length > 0 &&
        Array.from(document.querySelectorAll('.character-chat-message.is-assistant .character-chat-message-note')).at(-1)?.textContent === '' &&
        chatTest.reactions.at(-1)?.state === 'idle');
}
async function openSettings(page) {
    const gear = page.getByRole('button', { name: '對話設定', exact: true });
    if (await gear.getAttribute('aria-expanded') !== 'true') await gear.click();
    await page.locator('.character-chat-settings').waitFor({ state: 'visible' });
}
async function closeSettings(page) {
    const gear = page.getByRole('button', { name: '對話設定', exact: true });
    if (await gear.getAttribute('aria-expanded') === 'true') await gear.click();
    await page.locator('.character-chat-settings').waitFor({ state: 'hidden' });
}

async function checkQuietChat(page) {
    for (const selector of ['.character-chat-settings', '.character-chat-connection', '.character-chat-connect', '.character-chat-refresh', '.character-chat-disconnect']) {
        assert.equal(await page.locator(selector).isVisible(), false, selector + ' is confined to settings');
    }
    assert.equal(await page.locator('.character-chat-clear,.character-chat-confirm').count(), 0, 'clear conversation controls have been removed');
    assert.equal(await page.locator('.character-chat-header').innerText(), 'Nacho', 'header contains no account or login details');
    assert.equal(await page.locator('.character-chat-status-row').evaluate(el => el.classList.contains('is-quiet')), true, 'routine success announcements occupy no visible row');
    assert.equal(await page.locator('.character-chat-status-row').evaluate(el => getComputedStyle(el).clipPath), 'inset(50%)', 'routine announcements remain accessible without visual clutter');
    const backdrop = await page.locator('.character-chat-dialog').evaluate(el => {
        const style = getComputedStyle(el, '::backdrop');
        return { background: style.backgroundColor, filter: style.backdropFilter };
    });
    assert.equal(backdrop.background, 'rgba(0, 0, 0, 0)', 'opening chat does not tint the page');
    assert.equal(backdrop.filter, 'none', 'opening chat does not blur the page');
    assert.deepEqual(await page.evaluate(() => chatBackdropBefore.map(before => {
        const style = getComputedStyle(document.querySelector(before.selector));
        return { selector: before.selector, filter: style.filter, opacity: style.opacity };
    })), await page.evaluate(() => chatBackdropBefore), 'opening chat preserves background/widget filters and opacity');
    const composer = await page.locator('.character-chat-composer').boundingBox();
    assert(composer.height <= 68, 'empty composer stays compact');
    assert.equal(await page.locator('#character-chat-input').getAttribute('rows'), '1');
    const send = await page.locator('.character-chat-send').boundingBox();
    assert(send.width >= 44 && send.height >= 44, 'compact send remains a usable touch target');
}

async function checkPersonaMigration(browser) {
    const defaults = require('../js/character-persona.js');
    assert(defaults.legacyDefaultPrompts.length > 0, 'the previously shipped default is retained for exact matching');
    const old = defaults.legacyDefaultPrompts[0];
    assert.notEqual(old, defaults.defaultPrompt, 'the migration must exercise a genuinely revised default');
    const cases = [
        ...defaults.legacyDefaultPrompts.map((saved, index) => ({ name: 'exact legacy ' + index, saved, expected: defaults.defaultPrompt })),
        { name: 'legacy with blocked writes', saved: old, expected: defaults.defaultPrompt, readOnly: true },
        { name: 'one-character custom edit', saved: old + ' ', expected: old + ' ' },
        { name: 'custom appended instructions', saved: old + '\n請始終用兩句話回答。', expected: old + '\n請始終用兩句話回答。', restore: true }
    ];
    for (const sample of cases) {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
        await context.route(/^https?:\/\//, route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
        await context.addInitScript(({ saved, readOnly }) => {
            const set = Storage.prototype.setItem;
            if (!sessionStorage.getItem('persona-migration-seeded')) {
                set.call(localStorage, 'nt_character_persona_v1', saved);
                set.call(sessionStorage, 'persona-migration-seeded', '1');
            }
            window.personaWriteAttempts = 0;
            Storage.prototype.setItem = function (key, value) {
                if (this === localStorage && key === 'nt_character_persona_v1') {
                    personaWriteAttempts++;
                    if (readOnly) throw new DOMException('denied', 'SecurityError');
                }
                return set.call(this, key, value);
            };
        }, sample);
        const page = await context.newPage();
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        try {
            await boot(page);
            const edit = () => openSettings(page);
            const prompt = page.getByRole('textbox', { name: '角色提示詞', exact: true });
            await edit(); assert.equal(await prompt.inputValue(), sample.expected, sample.name + ': editor uses the correct active prompt');
            await page.getByRole('button', { name: '取消', exact: true }).click();
            await send(page, '預設更新後的第一則訊息'); await complete(page);
            assert.equal(await page.evaluate(() => chatTest.calls.at(-1).characterPrompt), sample.expected, sample.name + ': next request uses the active prompt');
            assert.equal(await page.evaluate(() => localStorage.getItem('nt_character_persona_v1')), sample.saved, 'reading and sending never replace saved prompt text');
            assert.equal(await page.evaluate(() => personaWriteAttempts), 0, 'migration does not even attempt a storage write');
            await boot(page); await edit();
            assert.equal(await prompt.inputValue(), sample.expected, sample.name + ': mapping survives reload without rewriting storage');
            assert.equal(await page.evaluate(() => localStorage.getItem('nt_character_persona_v1')), sample.saved);
            assert.equal(await page.evaluate(() => personaWriteAttempts), 0);
            if (sample.restore) {
                await page.getByRole('button', { name: '恢復預設', exact: true }).click();
                assert.equal(await prompt.inputValue(), defaults.defaultPrompt, 'Restore always targets the latest shipped prompt');
                assert.equal(await page.evaluate(() => localStorage.getItem('nt_character_persona_v1')), sample.saved, 'Restore remains a draft until Save');
                await page.getByRole('button', { name: '儲存設定', exact: true }).click();
                await send(page, '恢復新版預設後的訊息'); await complete(page);
                assert.equal(await page.evaluate(() => chatTest.calls.at(-1).characterPrompt), defaults.defaultPrompt);
                assert.equal(await page.evaluate(() => localStorage.getItem('nt_character_persona_v1')), defaults.defaultPrompt);
                assert.equal(await page.evaluate(() => personaWriteAttempts), 1, 'only the explicit Save writes the revised default');
            }
            assert.deepEqual(errors, []);
        } finally { await context.close(); }
    }
    console.log('PASS persona migration: exact old defaults only, custom text preserved, zero migration writes, reload/request/Restore use current default');
}

async function checkPersona(browser) {
    const defaults = require('../js/character-persona.js');
    assert.equal(defaults.maxLength, 8000);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await context.route(/^https?:\/\//, route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await boot(page);
    const edit = () => openSettings(page);
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
    assert.equal(await page.locator('.character-chat-message.is-user').count(), 0, 'reload clears the conversation while retaining the saved persona');
    await page.getByRole('button', { name: '恢復預設', exact: true }).click();
    assert.equal(await prompt.inputValue(), defaults.defaultPrompt);
    assert.equal(await page.evaluate(() => localStorage.getItem('nt_character_persona_v1')), edited, 'reset changes draft until explicitly saved');
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await edit(); assert.equal(await prompt.inputValue(), edited);
    await page.getByRole('button', { name: '恢復預設', exact: true }).click(); await save();
    assert.equal(await page.locator('.character-chat-message.is-user').count(), 0, 'default reset affects only the prompt');
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
    await openSettings(page);
    await page.getByRole('button', { name: '登出', exact: true }).click();
    await closeSettings(page);
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
    await openSettings(page);
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
        assert.equal(dialog.height, 600, 'desktop sheet stays compact');
        assert(dialog.x >= 0 && dialog.y >= 24 && dialog.x + dialog.width <= viewport.width && dialog.y + dialog.height <= viewport.height - 24, 'sheet stays within screen');
        assert(dialog.x + dialog.width <= character.x || dialog.x >= character.x + character.width, 'sheet sits beside the character');
        await page.screenshot({ path: `.impeccable/review/chat-desktop-${viewport.width}.png` });
    }
    assert.deepEqual(serviceCalls, ['/v1/status'], 'resizing never starts login or another request');
    await page.getByRole('button', { name: '前往設定', exact: true }).click();
    assert.equal(await page.locator('.character-chat-settings').isVisible(), true, 'disconnected chat has a direct settings entry');
    assert.equal(await page.getByRole('button', { name: '使用 ChatGPT 登入', exact: true }).isVisible(), true);
    assert.equal(await page.getByRole('button', { name: '重新確認', exact: true }).isVisible(), true);
    assert.deepEqual(serviceCalls, ['/v1/status'], 'opening settings alone does not start login or access the account');
    await context.close();
    console.log('PASS integrated chat: lazy local access, compact adjacent sheet at 16:9 / 21:9 / 32:9');
}

async function checkCloseDuringStream(browser) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await context.route(/^https?:\/\//, route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    try {
        await boot(page);
        await page.evaluate(() => { chatTest.mode = 'hold'; });
        await send(page, '關閉設定中的進行中回覆');
        await openSettings(page);
        await page.getByRole('textbox', { name: '角色提示詞', exact: true }).fill('這段未儲存草稿不可套用。');
        await page.getByRole('button', { name: '關閉對話', exact: true }).click();
        await page.waitForFunction(() => !NewtabCharacterChat.isOpen() && chatTest.reactions.at(-1)?.state === 'idle');
        await page.waitForTimeout(100);
        await page.evaluate(() => NewtabCharacterChat.open('companion-1'));
        await page.waitForFunction(() => document.querySelector('.character-chat-connection').dataset.connected === 'true');
        assert.equal(await page.locator('.character-chat-message-note').last().textContent(), '已停止');
        assert.equal(await page.locator('.character-chat-text').last().textContent(), '正在輸出的內容', 'late aborted chunks do not mutate the reopened conversation');
        assert.equal(await page.locator('.character-chat-settings').isVisible(), false, 'reopening returns to chat, not an abandoned settings draft');
        await openSettings(page);
        assert.equal(await page.getByRole('textbox', { name: '角色提示詞', exact: true }).inputValue(), await page.evaluate(() => NewtabCharacterPersona.defaultPrompt));
        assert.equal(await page.evaluate(() => chatTest.loginCalls + chatTest.disconnectCalls), 0);
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
    console.log('PASS settings during stream: closing aborts, stale chunks fenced, history retained, unsaved persona discarded');
}

async function checkSideRailKeyboard(browser) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await context.route(/^https?:\/\//, route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    try {
        await boot(page);
        await page.evaluate(() => {
            NewtabCharacterChat.close(); NewtabSideRail.open(); NewtabCharacterChat.open('companion-1');
            window.chatSearchFocusEvents = 0;
            document.querySelector('.search-input').addEventListener('focus', () => chatSearchFocusEvents++);
        });
        assert.equal(await page.evaluate(() => NewtabSideRail.isOpen()), true);
        assert.equal(await page.locator('.character-chat-dialog').getAttribute('role'), 'dialog');
        for (const key of [...Array(14).fill('Tab'), ...Array(14).fill('Shift+Tab')]) {
            await page.keyboard.press(key);
            assert.equal(await page.evaluate(() => !!document.activeElement.closest('.character-chat-dialog')), true,
                'open side rail never takes keyboard focus from chat');
        }
        const gear = page.getByRole('button', { name: '對話設定', exact: true });
        await gear.focus(); await page.keyboard.press('Control+k');
        assert.equal(await page.evaluate(() => chatSearchFocusEvents), 0, 'Ctrl+K in chat never focuses the new-tab search');
        await gear.focus();
        assert.equal(await gear.evaluate(el => el.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'k', code: 'KeyK', ctrlKey: true, bubbles: true, cancelable: true
        }))), true, 'the page search handler does not consume Ctrl+K from a dialog control');
        assert.equal(await gear.evaluate(el => document.activeElement === el), true);
        await openSettings(page); await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => !!document.activeElement.closest('.character-chat-dialog')), true);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('.character-chat-settings').isVisible(), false);
        assert.equal(await page.evaluate(() => NewtabCharacterChat.isOpen() && NewtabSideRail.isOpen()), true,
            'first Escape returns to chat without changing the underlying rail');
        await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(() => NewtabCharacterChat.isOpen()), false);
        assert.equal(await page.evaluate(() => NewtabSideRail.isOpen()), true, 'closing chat does not also dismiss the rail');
        await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(() => NewtabSideRail.isOpen()), false, 'the underlying rail resumes its own keyboard handling after chat closes');
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
    console.log('PASS stacked keyboard: open rail preserves chat Tab loop, Escape hierarchy and Ctrl+K isolation');
}

(async () => {
    const browser = await chromium.launch(process.env.NEWTAB_BROWSER_PATH ? { headless: true, executablePath: process.env.NEWTAB_BROWSER_PATH } :
        { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
    try {
        if (process.argv.includes('--keyboard-only')) { await checkSideRailKeyboard(browser); return; }
        await checkPersonaMigration(browser);
        await checkPersona(browser);
        await checkConnectionLifecycle(browser);
        await checkLazyTransportAndPlacement(browser);
        await checkCloseDuringStream(browser);
        await checkSideRailKeyboard(browser);
        for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 640 }]) {
            const context = await browser.newContext({ viewport, isMobile: viewport.width < 600, hasTouch: viewport.width < 600, reducedMotion: 'reduce' });
            await context.route(/^https?:\/\//, route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
            const page = await context.newPage(); page.setDefaultTimeout(5000);
            const errors = []; page.on('pageerror', e => errors.push(e.message));
            await boot(page);
            await checkQuietChat(page);
            await page.screenshot({ path: `.impeccable/review/chat-quiet-${viewport.width}.png` });
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
            }
            const expectedBase = viewport.width === 1440 ? 3 : 1;
            await page.evaluate(() => { chatTest.mode = 'failure'; });
            await send(page, '第二個問題');
            await page.getByRole('button', { name: '重試', exact: true }).waitFor();
            assert.match(await page.locator('.character-chat-status').textContent(), /中斷/);
            await page.evaluate(() => { chatTest.mode = 'normal'; });
            await page.getByRole('button', { name: '重試', exact: true }).click(); await complete(page);
            assert.equal(await page.locator('.character-chat-message.is-user').count(), expectedBase + 1, 'retry does not duplicate the question');
            assert.equal(await page.evaluate(() => chatTest.calls.at(-1).messages.some(m => m.content === '部分內容')), false, 'partial failed answer is not sent as complete model context');
            await page.evaluate(() => { chatTest.mode = 'hold'; });
            await send(page, '停止測試');
            await openSettings(page);
            assert.equal(await page.locator('.character-chat-disconnect').isDisabled(), true, 'account actions are locked while a response is active');
            await closeSettings(page);
            assert.equal(await page.locator('.character-chat-stop').isVisible(), true, 'returning from settings keeps Stop reachable');
            await page.locator('.character-chat-stop').click();
            await page.waitForFunction(() => document.querySelector('.character-chat-status').textContent === '已停止回覆。');
            assert.equal(await page.locator('.character-chat-message-note').last().textContent(), '已停止');
            await page.waitForTimeout(90);
            assert.equal(await page.locator('.character-chat-text').last().textContent(), '正在輸出的內容', 'late stream chunks after cancellation are ignored');
            await openSettings(page);
            await page.keyboard.press('Escape');
            assert.equal(await page.evaluate(() => NewtabCharacterChat.isOpen()), true, 'Escape returns from settings before closing chat');
            assert.equal(await page.locator('.character-chat-message.is-user').count(), expectedBase + 2, 'settings preserve conversation history');
            await page.keyboard.press('Escape');
            assert.equal(await page.evaluate(() => NewtabCharacterChat.isOpen()), false);
            assert.equal(await page.evaluate(() => document.activeElement.classList.contains('companion-trigger')), true, 'close returns focus to character');
            await boot(page);
            assert.equal(await page.locator('.character-chat-message.is-user').count(), 0, 'reload starts a fresh conversation');
            await openSettings(page);
            await page.getByRole('button', { name: '登出', exact: true }).click();
            assert.equal(await page.evaluate(() => chatTest.disconnectCalls), 1);
            await page.getByRole('button', { name: '使用 ChatGPT 登入', exact: true }).click();
            await page.waitForFunction(() => document.querySelector('.character-chat-connection').dataset.connected === 'true');
            assert.equal(await page.evaluate(() => chatTest.loginCalls), 1);
            await closeSettings(page);
            await page.evaluate(() => { chatTest.available = false; NewtabCharacterChat.refresh(); });
            await page.waitForFunction(() => document.querySelector('.character-chat-connection').dataset.connected === 'false');
            await page.locator('#character-chat-input').fill('離線內容');
            assert.equal(await page.getByRole('button', { name: '傳送', exact: true }).isDisabled(), true, 'offline mode never fabricates responses');
            assert.match(await page.locator('.character-chat-status').textContent(), /尚未啟動/);
            assert.deepEqual(errors, []);
            await page.screenshot({ path: `.impeccable/review/chat-${viewport.width}.png` });
            await context.close();
            console.log(`PASS chat ${viewport.width}×${viewport.height}: quiet settings, transparent backdrop, compact composer, IME, streaming, retry/stop, history preservation, prompt contract, focus`);
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
