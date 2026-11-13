/* Character chat UI. Only the transport can provide assistant responses. */
(function (global) {
    'use strict';
    var STORAGE_KEY = 'nt_character_chat_session_v1';
    var PERSONA_KEY = 'nt_character_persona_v1';
    var persona = global.NewtabCharacterPersona;
    var MAX_MESSAGES = 40;
    var MAX_HISTORY_CHARS = 64000;
    var state = { dialog: null, widgetId: null, opener: null, connected: false, canChat: false, available: false, personaSupported: false,
        checking: false, busy: false, controller: null, request: 0, messages: [], retryAt: -1,
        loginTimer: 0, loginUntil: 0, connectionGeneration: 0, composing: false, followLatest: true,
        characterPrompt: persona.defaultPrompt, personaEditing: false, personaGeneration: 0, personaImporting: false, personaReadError: '' };
    var ui = {};

    function transport() { return global.NewtabChatTransport; }
    function announce(message) { ui.status.textContent = message || ''; }
    function reaction(value) {
        document.dispatchEvent(new CustomEvent('newtab:chat-state', { detail: { widgetId: state.widgetId, state: value } }));
    }
    function save() {
        var messages = state.messages.filter(function (m) { return m.content; }).slice(-MAX_MESSAGES);
        while (messages.length > 2 && JSON.stringify(messages).length > MAX_HISTORY_CHARS) messages.shift();
        try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages)); }
        catch (_) { ui.privacy.textContent = '瀏覽器無法暫存，重新整理後會清除這段對話。'; }
    }
    function load() {
        try {
            var raw = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
            if (Array.isArray(raw)) state.messages = raw.filter(function (m) {
                return m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string';
            }).slice(-MAX_MESSAGES).map(function (m) {
                return { role: m.role, content: m.content.slice(0, 16000), status: m.status === 'complete' ? 'complete' : 'stopped' };
            });
        } catch (_) { state.messages = []; }
        try {
            var prompt = localStorage.getItem(PERSONA_KEY);
            if (prompt && prompt.trim() && prompt.length <= persona.maxLength) state.characterPrompt = prompt;
        } catch (_) { state.personaReadError = '無法讀取已儲存的角色設定，目前使用預設內容。'; }
    }
    function element(tag, className, text) {
        var el = document.createElement(tag);
        if (className) el.className = className;
        if (text != null) el.textContent = text;
        return el;
    }
    function button(label, className, action) {
        var el = element('button', className, label); el.type = 'button';
        if (action) el.addEventListener('click', action);
        return el;
    }
    function avatar(className) {
        var frame = element('span', className || 'character-chat-avatar');
        var image = new Image(); image.src = 'assets/character/nacho-companion.webp'; image.alt = '';
        frame.appendChild(image); return frame;
    }
    function inlineText(target, text) {
        var pattern = /\*\*([^*\n]+)\*\*|`([^`\n]+)`/g, match, end = 0;
        while ((match = pattern.exec(text))) {
            target.appendChild(document.createTextNode(text.slice(end, match.index)));
            target.appendChild(element(match[1] !== undefined ? 'strong' : 'code', null, match[1] !== undefined ? match[1] : match[2]));
            end = pattern.lastIndex;
        }
        target.appendChild(document.createTextNode(text.slice(end)));
    }
    function renderReply(target, text) {
        target.replaceChildren();
        if (!text) return;
        text.split(/\n\s*\n/).forEach(function (block) {
            var lines = block.split('\n');
            var unordered = lines.every(function (line) { return /^\s*[-*+]\s+/.test(line); });
            var ordered = lines.every(function (line) { return /^\s*\d+\.\s+/.test(line); });
            if (unordered || ordered) {
                var list = element(unordered ? 'ul' : 'ol');
                lines.forEach(function (line) { var item = element('li'); inlineText(item, line.replace(unordered ? /^\s*[-*+]\s+/ : /^\s*\d+\.\s+/, '')); list.appendChild(item); });
                target.appendChild(list);
            } else { var paragraph = element('p'); inlineText(paragraph, block); target.appendChild(paragraph); }
        });
    }
    function promptError(value) {
        if (!value.trim()) return '請寫下角色的個性與說話方式，或恢復預設內容。';
        if (value.length > persona.maxLength) return '角色提示詞最多 ' + persona.maxLength.toLocaleString() + ' 字元，請縮短後再儲存。';
        return '';
    }
    function updatePromptControls() {
        var error = promptError(ui.prompt.value);
        ui.promptCount.textContent = ui.prompt.value.length.toLocaleString() + ' / ' + persona.maxLength.toLocaleString();
        ui.promptCount.dataset.over = String(ui.prompt.value.length > persona.maxLength);
        ui.promptSave.disabled = state.personaImporting || !!error;
        ui.promptImport.disabled = state.personaImporting;
        ui.promptReset.disabled = state.personaImporting;
        ui.prompt.disabled = state.personaImporting;
        ui.prompt.setAttribute('aria-invalid', String(!!error));
    }
    function editPersona() {
        state.personaGeneration++; state.personaEditing = true; state.personaImporting = false;
        ui.prompt.value = state.characterPrompt; ui.promptNotice.textContent = state.personaReadError;
        ui.settings.hidden = false; state.dialog.classList.add('is-settings');
        ui.personaToggle.setAttribute('aria-expanded', 'true');
        updatePromptControls(); ui.prompt.focus(); ui.prompt.setSelectionRange(0, 0); ui.prompt.scrollTop = 0;
    }
    function closePersona(focus) {
        state.personaGeneration++; state.personaEditing = false; state.personaImporting = false;
        ui.settings.hidden = true; state.dialog.classList.remove('is-settings');
        ui.personaToggle.setAttribute('aria-expanded', 'false');
        if (focus) ui.personaToggle.focus();
    }
    function savePersona() {
        if (!state.personaEditing || state.personaImporting) return;
        var value = ui.prompt.value, error = promptError(value);
        if (error) { ui.promptNotice.textContent = error; updatePromptControls(); return; }
        try { localStorage.setItem(PERSONA_KEY, value); }
        catch (_) { ui.promptNotice.textContent = '無法儲存角色設定，請確認瀏覽器允許儲存資料後重試。原設定仍保留。'; return; }
        state.characterPrompt = value; state.personaReadError = '';
        closePersona(true); announce('已儲存角色設定，下一則回覆開始套用。');
    }
    async function importPersona() {
        var file = ui.promptFile.files && ui.promptFile.files[0]; ui.promptFile.value = '';
        if (!file || !state.personaEditing) return;
        if (!/\.(txt|md)$/i.test(file.name)) { ui.promptNotice.textContent = '請選擇 .txt 或 .md 文字檔。'; return; }
        if (file.size > 64000) { ui.promptNotice.textContent = '檔案過長；角色提示詞最多 ' + persona.maxLength.toLocaleString() + ' 字元。'; return; }
        var generation = state.personaGeneration;
        state.personaImporting = true; updatePromptControls(); ui.promptNotice.textContent = '正在讀取文字檔…';
        try {
            var value = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
            if (!state.personaEditing || generation !== state.personaGeneration) return;
            if (value.includes('\u0000')) throw new Error('invalid_text');
            var error = promptError(value);
            if (error) { ui.promptNotice.textContent = error; return; }
            ui.prompt.value = value; ui.prompt.scrollTop = 0; ui.promptNotice.textContent = '已匯入「' + file.name + '」。檢查內容後按「儲存設定」套用。';
        } catch (_) {
            if (state.personaEditing && generation === state.personaGeneration) ui.promptNotice.textContent = '無法讀取檔案，請使用 UTF-8 格式的 .txt 或 .md 文字檔。';
        } finally {
            if (state.personaEditing && generation === state.personaGeneration) { state.personaImporting = false; updatePromptControls(); }
        }
    }
    function nearBottom() { return ui.messages.scrollHeight - ui.messages.scrollTop - ui.messages.clientHeight < 72; }
    function scrollLatest(force) {
        if (force || state.followLatest) {
            ui.messages.scrollTop = ui.messages.scrollHeight;
            ui.latest.hidden = true;
        } else ui.latest.hidden = false;
    }
    function addMessage(message) {
        var row = element('article', 'character-chat-message is-' + message.role);
        row.setAttribute('aria-label', message.role === 'user' ? '你的訊息' : 'Nacho 回覆');
        var name = element('div', 'character-chat-speaker');
        if (message.role === 'assistant') name.appendChild(avatar('character-chat-avatar character-chat-reply-avatar'));
        name.appendChild(element('span', null, message.role === 'user' ? '你' : 'Nacho'));
        var content = element('div', 'character-chat-text', message.content);
        if (message.role === 'assistant') renderReply(content, message.content);
        var note = element('span', 'character-chat-message-note');
        if (message.status === 'stopped') note.textContent = '已停止';
        if (message.status === 'failed') note.textContent = '回覆未完成';
        row.append(name, content, note); ui.messages.appendChild(row);
        return { row: row, content: content, note: note };
    }
    function renderHistory() {
        ui.messages.replaceChildren();
        state.messages.forEach(addMessage);
        ui.empty.hidden = state.messages.length > 0;
        ui.clear.disabled = !state.messages.length || state.busy;
        scrollLatest(true);
    }
    function controls() {
        ui.send.disabled = !state.canChat || state.busy || state.checking || !ui.input.value.trim();
        ui.stop.hidden = !state.busy;
        ui.send.hidden = state.busy;
        ui.clear.disabled = !state.messages.length || state.busy;
        ui.connect.hidden = state.canChat || state.available && !state.personaSupported;
        ui.connect.disabled = state.checking || !state.available;
        ui.refresh.disabled = state.checking || state.busy;
        ui.disconnect.hidden = !state.connected || !transport() || !transport().disconnect;
        ui.disconnect.disabled = state.busy || state.checking;
        ui.retry.hidden = state.retryAt < 0;
        ui.retry.disabled = state.busy || state.checking || !state.canChat;
        ui.input.setAttribute('aria-describedby', 'character-chat-status character-chat-input-hint');
    }
    function errorText(error, fallback) {
        return String(error && (error.userMessage || error.message) || fallback).slice(0, 240);
    }
    function currentConnection(generation) {
        return state.dialog && state.dialog.open && generation === state.connectionGeneration;
    }
    function stopLoginPolling() {
        if (state.loginTimer) clearInterval(state.loginTimer);
        state.loginTimer = 0;
    }
    function pollLogin(generation) {
        if (!currentConnection(generation) || state.loginTimer) return;
        if (state.loginUntil && Date.now() > state.loginUntil) return;
        if (!state.loginUntil) state.loginUntil = Date.now() + 180000;
        var timer = setInterval(function () {
            if (!currentConnection(generation) || Date.now() > state.loginUntil) {
                clearInterval(timer);
                if (state.loginTimer === timer) state.loginTimer = 0;
                return;
            }
            refresh();
        }, 2000);
        state.loginTimer = timer;
    }
    async function refresh() {
        if (!state.dialog || !state.dialog.open) return;
        if (state.checking || state.busy) return;
        var generation = state.connectionGeneration;
        state.checking = true; controls();
        try {
            if (!transport() || !transport().status) throw new Error('連線服務尚未準備好。請啟動本機對話服務後重新確認。');
            var result = await transport().status();
            if (!currentConnection(generation)) return;
            if (!result || typeof result !== 'object') throw new Error('無法確認連線，請重新確認。');
            state.available = result.available !== false;
            state.connected = !!result.connected;
            state.personaSupported = !!(result.capabilities && result.capabilities.characterPrompt);
            state.canChat = !!result.canChat && state.personaSupported;
            ui.connection.textContent = state.canChat ? (result.accountLabel || 'Nacho 已準備好') : state.available && !state.personaSupported ? '請更新對話服務' : state.available && result.connected ? '請完成 ChatGPT 登入' : '尚未連線';
            ui.connection.dataset.connected = String(state.canChat);
            if (state.canChat) {
                stopLoginPolling();
                announce('已準備好，可以直接在這裡對話。');
            } else {
                if (result.connecting) pollLogin(generation);
                announce(!state.available ? result.error || '本機對話服務尚未啟動。啟動後按「重新確認」。' : !state.personaSupported ? '本機對話服務需要更新，才能套用角色設定。更新後按「重新確認」。' : result.error || (result.connecting ? '在登入視窗完成後，回來就能繼續對話。' : '先登入 ChatGPT，就能在這裡和 Nacho 聊聊。'));
            }
        } catch (error) {
            if (!currentConnection(generation)) return;
            state.connected = state.canChat = state.available = false;
            ui.connection.textContent = '尚未連線'; ui.connection.dataset.connected = 'false';
            announce(errorText(error, '暫時無法連線，請稍後重新確認。'));
        } finally { if (currentConnection(generation)) { state.checking = false; controls(); } }
    }
    async function login() {
        if (!state.dialog.open || state.checking || state.busy) return;
        if (!transport() || !transport().login) { announce('連線服務尚未準備好，請先啟動本機對話服務。'); return; }
        var generation = state.connectionGeneration;
        state.checking = true; controls(); announce('正在準備 ChatGPT 登入…');
        try {
            var result = await transport().login();
            if (!currentConnection(generation)) return;
            if (result && result.opened) {
                announce('在登入視窗完成後，回來就能繼續對話。');
                state.loginUntil = 0;
                pollLogin(generation);
            }
        } catch (error) {
            if (currentConnection(generation)) announce(errorText(error, '無法開始登入，請稍後重試。'));
        } finally { if (currentConnection(generation)) { state.checking = false; controls(); } }
        if (currentConnection(generation) && result && !result.opened) refresh();
    }
    async function disconnect() {
        if (!state.dialog.open || state.busy || state.checking || !transport() || !transport().disconnect) return;
        var generation = state.connectionGeneration;
        state.checking = true; controls();
        try {
            await transport().disconnect();
            if (!currentConnection(generation)) return;
            state.connected = state.canChat = false;
            state.checking = false; await refresh();
            if (currentConnection(generation)) announce('已登出。對話仍暫存在這個分頁。');
        } catch (error) { if (currentConnection(generation)) announce(errorText(error, '暫時無法登出，請重試。')); }
        finally { if (currentConnection(generation)) { state.checking = false; controls(); } }
    }
    function contextMessages(end) {
        var list = state.messages.slice(0, end).filter(function (m) { return m.content && (m.role === 'user' || m.status === 'complete'); })
            // The local service accepts at most 12,000 characters per message.
            // Keep the full answer visible; bound only the context sent next time.
            .map(function (m) { return { role: m.role, content: m.content.slice(0, 12000) }; });
        var chars = 0, result = [];
        for (var i = list.length - 1; i >= 0 && result.length < 24; i--) {
            if (chars + list[i].content.length > 32000 && result.length) break;
            result.unshift(list[i]); chars += list[i].content.length;
        }
        while (result.length && result[0].role !== 'user') result.shift();
        return result;
    }
    async function requestReply(userIndex) {
        if (state.busy || state.checking || !state.canChat) return;
        var id = ++state.request;
        state.retryAt = -1; state.busy = true; state.followLatest = true;
        state.controller = new AbortController();
        var tooLong = false;
        var lengthNotice = '回覆過長，已停止；可請 Nacho 分段回答';
        var reply = { role: 'assistant', content: '', status: 'streaming' };
        state.messages.push(reply);
        var view = addMessage(reply);
        view.row.classList.add('is-pending'); view.note.textContent = '正在思考…';
        ui.empty.hidden = true; controls(); scrollLatest(true); reaction('thinking'); announce('Nacho 正在回覆…');
        function delta(value) {
            if (id !== state.request || !state.busy || state.controller.signal.aborted) return;
            var text = typeof value === 'string' ? value : value && value.text || '';
            if (!text) return;
            var firstDelta = !reply.content;
            if (reply.content.length + text.length > 64000) tooLong = true;
            reply.content = (reply.content + text).slice(0, 64000);
            view.content.textContent = reply.content; view.note.textContent = ''; view.row.classList.remove('is-pending');
            if (firstDelta) reaction('speaking'); scrollLatest(false);
            if (tooLong) state.controller.abort();
        }
        try {
            var result = await transport().stream({ messages: contextMessages(state.messages.length - 1), characterPrompt: state.characterPrompt, signal: state.controller.signal, onDelta: delta });
            if (id !== state.request) return;
            if (!reply.content) reply.content = typeof result === 'string' ? result : result && result.text || '';
            if (reply.content.length > 64000) { reply.content = reply.content.slice(0, 64000); tooLong = true; }
            view.content.textContent = reply.content;
            if (tooLong) throw new Error(lengthNotice);
            if (!reply.content.trim()) throw new Error('沒有收到回覆，請按重試。');
            view.content.textContent = reply.content; reply.status = 'complete'; view.note.textContent = '';
            announce('回覆完成。');
        } catch (error) {
            if (id !== state.request) return;
            var stopped = tooLong || state.controller.signal.aborted || error && error.name === 'AbortError';
            reply.status = stopped ? 'stopped' : 'failed';
            view.note.textContent = tooLong ? '回覆過長，已停止' : stopped ? '已停止' : '回覆未完成';
            state.retryAt = userIndex;
            announce(tooLong ? lengthNotice : stopped ? '已停止回覆。' : errorText(error, '回覆中斷，請重試。'));
        } finally {
            if (id === state.request) {
                state.busy = false; state.controller = null;
                renderReply(view.content, reply.content);
                view.row.classList.remove('is-pending'); reaction('idle'); controls(); save(); scrollLatest(false);
            }
        }
    }
    function send(event) {
        if (event) event.preventDefault();
        if (state.busy || state.checking || !state.canChat || state.composing) return;
        var text = ui.input.value.trim();
        if (!text) return;
        state.messages.push({ role: 'user', content: text.slice(0, 8000), status: 'complete' });
        ui.input.value = ''; ui.input.style.height = ''; ui.confirm.hidden = true;
        renderHistory(); save(); requestReply(state.messages.length - 1);
    }
    function stop() { if (state.controller) { state.controller.abort(); announce('正在停止回覆…'); } }
    function retry() {
        if (state.retryAt < 0 || state.busy || state.checking || !state.canChat) return;
        var index = state.retryAt;
        state.messages = state.messages.slice(0, index + 1); renderHistory(); requestReply(index);
    }
    function close() {
        if (!state.dialog || !state.dialog.open) return;
        if (state.busy) stop();
        if (state.personaEditing) closePersona(false);
        state.connectionGeneration++; state.checking = false; stopLoginPolling();
        state.dialog.close();
    }
    function place() {
        if (!state.dialog) return;
        var width = Math.min(420, innerWidth - 32);
        var widget = document.querySelector('.widget[data-id="' + String(state.widgetId).replace(/[^\w-]/g, '') + '"]');
        var rect = widget && widget.getBoundingClientRect();
        var left = Math.max(16, innerWidth - width - 24);
        var height = Math.min(700, innerHeight - 48);
        var center = rect ? rect.top + rect.height / 2 : innerHeight / 2;
        var top = Math.max(24, Math.min(innerHeight - height - 24, center - height / 2));
        if (innerWidth > 760 && rect) {
            if (rect.left >= width + 40) left = rect.left - width - 20;
            else if (innerWidth - rect.right >= width + 40) left = rect.right + 20;
        }
        state.dialog.style.setProperty('--chat-left', Math.round(left) + 'px');
        state.dialog.style.setProperty('--chat-top', Math.round(top) + 'px');
    }
    function create() {
        if (state.dialog) return;
        load();
        var dialog = element('dialog', 'character-chat-dialog'); state.dialog = dialog;
        dialog.setAttribute('aria-labelledby', 'character-chat-title');
        var header = element('header', 'character-chat-header');
        var identity = element('div', 'character-chat-identity');
        var portrait = avatar();
        var heading = element('div'); var title = element('h2', null, 'Nacho'); title.id = 'character-chat-title';
        ui.connection = element('p', 'character-chat-connection', '確認連線中…');
        heading.append(title, ui.connection); identity.append(portrait, heading);
        var dismiss = button('×', 'character-chat-close', close); dismiss.setAttribute('aria-label', '關閉對話');
        ui.personaToggle = button('角色設定', 'character-chat-persona-toggle', function () { if (state.personaEditing) closePersona(true); else editPersona(); });
        ui.personaToggle.setAttribute('aria-expanded', 'false'); ui.personaToggle.setAttribute('aria-controls', 'character-chat-settings');
        var headerActions = element('div', 'character-chat-header-actions'); headerActions.append(ui.personaToggle, dismiss);
        header.append(identity, headerActions); dialog.appendChild(header);
        var connectionBar = element('div', 'character-chat-connect');
        ui.connect = button('使用 ChatGPT 登入', 'character-chat-connect-button', login);
        ui.refresh = button('重新確認', 'character-chat-refresh', refresh);
        ui.disconnect = button('登出', 'character-chat-disconnect', disconnect); ui.disconnect.hidden = true;
        connectionBar.append(ui.connect, ui.refresh, ui.disconnect); dialog.appendChild(connectionBar);
        ui.settings = element('section', 'character-chat-settings'); ui.settings.id = 'character-chat-settings'; ui.settings.hidden = true;
        ui.settings.setAttribute('aria-labelledby', 'character-chat-settings-title');
        var settingsTitle = element('h3', null, '讓 Nacho 更懂你的習慣'); settingsTitle.id = 'character-chat-settings-title';
        var settingsIntro = element('p', 'character-chat-settings-intro', '描述她的個性與說話方式。設定儲存在此瀏覽器，從下一則回覆開始套用。');
        var promptLabel = element('label', 'character-chat-prompt-label', '角色提示詞'); promptLabel.htmlFor = 'character-chat-prompt';
        ui.prompt = element('textarea'); ui.prompt.id = 'character-chat-prompt'; ui.prompt.spellcheck = false;
        ui.prompt.setAttribute('aria-describedby', 'character-chat-prompt-count character-chat-prompt-notice');
        ui.prompt.addEventListener('input', function () { updatePromptControls(); ui.promptNotice.textContent = promptError(ui.prompt.value); });
        var promptTools = element('div', 'character-chat-prompt-tools');
        ui.promptImport = button('匯入文字檔', 'character-chat-prompt-import', function () { ui.promptFile.click(); });
        ui.promptFile = element('input'); ui.promptFile.type = 'file'; ui.promptFile.accept = '.txt,.md,text/plain,text/markdown'; ui.promptFile.hidden = true;
        ui.promptFile.setAttribute('aria-label', '匯入角色提示詞'); ui.promptFile.addEventListener('change', importPersona);
        ui.promptCount = element('span', 'character-chat-prompt-count'); ui.promptCount.id = 'character-chat-prompt-count';
        promptTools.append(ui.promptImport, ui.promptFile, ui.promptCount);
        ui.promptNotice = element('p', 'character-chat-prompt-notice'); ui.promptNotice.id = 'character-chat-prompt-notice'; ui.promptNotice.setAttribute('role', 'status'); ui.promptNotice.setAttribute('aria-live', 'polite');
        var promptActions = element('div', 'character-chat-prompt-actions');
        ui.promptReset = button('恢復預設', 'character-chat-prompt-reset', function () { ui.prompt.value = persona.defaultPrompt; ui.prompt.scrollTop = 0; ui.promptNotice.textContent = '已還原預設內容，按「儲存設定」後套用。'; updatePromptControls(); });
        var promptCancel = button('取消', 'character-chat-prompt-cancel', function () { closePersona(true); });
        ui.promptSave = button('儲存設定', 'character-chat-prompt-save', savePersona);
        promptActions.append(ui.promptReset, promptCancel, ui.promptSave);
        ui.settings.append(settingsTitle, settingsIntro, promptLabel, ui.prompt, promptTools, ui.promptNotice, promptActions); dialog.appendChild(ui.settings);
        var body = element('div', 'character-chat-body');
        ui.messages = element('div', 'character-chat-messages'); ui.messages.setAttribute('role', 'log'); ui.messages.setAttribute('aria-label', '對話內容'); ui.messages.setAttribute('aria-live', 'off'); ui.messages.tabIndex = 0;
        ui.messages.addEventListener('scroll', function () { state.followLatest = nearBottom(); ui.latest.hidden = state.followLatest; });
        ui.empty = element('div', 'character-chat-empty');
        ui.empty.append(element('h3', null, '今天想聊些什麼？'), element('p', null, '連接 ChatGPT 後，直接在這裡說說想法、問問題，或一起整理今天的事情。'));
        ui.latest = button('查看最新回覆', 'character-chat-latest', function () { state.followLatest = true; scrollLatest(true); }); ui.latest.hidden = true;
        body.append(ui.messages, ui.empty, ui.latest); dialog.appendChild(body);
        var form = element('form', 'character-chat-composer'); form.addEventListener('submit', send);
        var label = element('label', 'sr-only', '傳送訊息給 Nacho'); label.htmlFor = 'character-chat-input';
        ui.input = element('textarea'); ui.input.id = 'character-chat-input'; ui.input.rows = 2; ui.input.maxLength = 8000; ui.input.placeholder = '想說的話，寫在這裡…';
        ui.input.addEventListener('compositionstart', function () { state.composing = true; });
        ui.input.addEventListener('compositionend', function () { state.composing = false; controls(); });
        ui.input.addEventListener('input', function () { ui.input.style.height = 'auto'; ui.input.style.height = Math.min(132, ui.input.scrollHeight) + 'px'; controls(); });
        ui.input.addEventListener('keydown', function (event) {
            if (event.key !== 'Enter' || event.shiftKey || event.isComposing || state.composing || event.keyCode === 229) return;
            event.preventDefault(); send();
        });
        var composeActions = element('div', 'character-chat-compose-actions');
        var inputHint = element('span', null, 'Enter 傳送 · Shift+Enter 換行'); inputHint.id = 'character-chat-input-hint';
        ui.send = button('傳送', 'character-chat-send'); ui.send.type = 'submit';
        ui.send.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4.5 10 15-5.5L14 19.5l-3-6.5-6.5-3Z"/><path d="m11 13 8.5-8.5"/></svg><span>傳送</span>';
        ui.stop = button('停止回覆', 'character-chat-stop', stop); ui.stop.hidden = true;
        composeActions.append(inputHint, ui.send, ui.stop); form.append(label, ui.input, composeActions); dialog.appendChild(form);
        var statusRow = element('div', 'character-chat-status-row');
        ui.status = element('p', 'character-chat-status'); ui.status.id = 'character-chat-status'; ui.status.setAttribute('role', 'status'); ui.status.setAttribute('aria-live', 'polite');
        ui.retry = button('重試', 'character-chat-retry', retry); ui.retry.hidden = true;
        statusRow.append(ui.status, ui.retry); dialog.appendChild(statusRow);
        var footer = element('footer', 'character-chat-footer'); ui.privacy = element('p', null, '對話只暫存於目前分頁。');
        ui.clear = button('清除對話', 'character-chat-clear', function () { ui.confirm.hidden = false; ui.confirm.querySelector('button').focus(); });
        footer.append(ui.privacy, ui.clear); dialog.appendChild(footer);
        ui.confirm = element('div', 'character-chat-confirm'); ui.confirm.hidden = true;
        ui.confirm.append(element('p', null, '清除這個分頁的對話？這個動作無法復原。'), button('保留對話', 'character-chat-keep', function () { ui.confirm.hidden = true; ui.clear.focus(); }), button('確認清除', 'character-chat-confirm-clear', function () {
            if (state.busy) return;
            state.messages = []; state.retryAt = -1; ui.confirm.hidden = true; save(); renderHistory(); controls(); announce('已清除這個分頁的對話。'); ui.input.focus();
        })); dialog.appendChild(ui.confirm);
        dialog.addEventListener('cancel', function (event) { event.preventDefault(); close(); });
        dialog.addEventListener('keydown', function (event) {
            if (event.key === 'Tab') {
                var focusable = Array.from(dialog.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]'))
                    .filter(function (el) { return el.getClientRects().length > 0 && !el.closest('[hidden]'); });
                var first = focusable[0], last = focusable[focusable.length - 1];
                if (first && event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
                else if (first && !event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
                return;
            }
            if (event.key !== 'Escape') return;
            event.preventDefault(); event.stopPropagation();
            if (state.personaEditing) closePersona(true);
            else if (!ui.confirm.hidden) { ui.confirm.hidden = true; ui.clear.focus(); }
            else close();
        });
        dialog.addEventListener('click', function (event) { if (event.target !== dialog) return; var r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close(); });
        dialog.addEventListener('close', function () {
            if (dialog.open) return;
            if (state.opener && state.opener.isConnected) state.opener.focus({ preventScroll: true });
        });
        global.addEventListener('resize', place);
        global.addEventListener('focus', function () { if (dialog.open && !state.canChat) refresh(); });
        document.body.appendChild(dialog); renderHistory(); controls();
    }
    function open(widgetId) {
        create(); state.widgetId = widgetId || 'companion-1';
        if (!state.dialog.open) { state.connectionGeneration++; state.checking = false; state.loginUntil = 0; state.opener = document.activeElement; place(); state.dialog.showModal(); }
        ui.confirm.hidden = true; refresh();
        ui.input.focus({ preventScroll: true }); scrollLatest(true);
    }
    global.NewtabCharacterChat = { open: open, close: close, refresh: refresh, isOpen: function () { return !!state.dialog && state.dialog.open; } };
})(window);
