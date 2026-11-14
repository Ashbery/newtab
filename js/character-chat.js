/* Character chat UI. Only the transport can provide assistant responses. */
(function (global) {
    'use strict';
    var STORAGE_KEY = 'nt_character_chat_session_v1';
    var PERSONA_KEY = 'nt_character_persona_v1';
    var persona = global.NewtabCharacterPersona;
    var MAX_MESSAGES = 40;
    var MAX_HISTORY_CHARS = 64000;
    var state = { dialog: null, widgetId: null, opener: null, connected: false, canChat: false, available: false, personaSupported: false,
        checking: false, busy: false, quietStatus: true, controller: null, request: 0, messages: [], retryAt: -1,
        loginTimer: 0, loginUntil: 0, connectionGeneration: 0, composing: false, followLatest: true,
        characterPrompt: persona.defaultPrompt, personaEditing: false, personaGeneration: 0, personaImporting: false, personaReadError: '' };
    var ui = {};
    var motionPreference = global.matchMedia('(prefers-reduced-motion: reduce)');
    var motions = new Map(), springs = new Map(), ghosts = new Set(), viewRevision = 0, viewBlend = 0;
    var layerHints = new WeakMap();

    function reducedMotion() { return motionPreference.matches || !!(global.NewtabMotion && global.NewtabMotion.reduced()); }
    function cancelMotion(el) { var animation = motions.get(el); if (animation) { motions.delete(el); animation.cancel(); } }
    function promoteLayer(el) {
        if (reducedMotion()) return;
        if (!layerHints.has(el)) layerHints.set(el, el.style.willChange);
        el.style.willChange = 'transform, opacity';
    }
    function releaseLayer(el) {
        if (!layerHints.has(el)) return;
        el.style.willChange = layerHints.get(el); layerHints.delete(el);
    }
    function springMotion(owner, key, target, from, update, settings) {
        var group = springs.get(owner);
        if (!group) { group = new Map(); springs.set(owner, group); }
        var record = {}; group.set(key, record); owner.dataset.chatMotion = Array.from(group.keys()).join(' ');
        var promise = global.NewtabMotion.spring(owner, key, target, Object.assign({ from: from, update: update,
            stiffness: 420, damping: 36, precision: .002, maxDuration: 1000 }, settings));
        return promise.then(function (complete) {
            if (group.get(key) === record) {
                group.delete(key);
                if (!group.size) { springs.delete(owner); delete owner.dataset.chatMotion; }
                else owner.dataset.chatMotion = Array.from(group.keys()).join(' ');
            }
            return complete;
        });
    }
    function visualPose(el) {
        var style = getComputedStyle(el), matrix = new DOMMatrixReadOnly(style.transform === 'none' ? undefined : style.transform);
        return { opacity: parseFloat(style.opacity), x: matrix.m41, y: matrix.m42, scale: matrix.a };
    }
    function paintPose(el, pose) {
        el.style.opacity = Math.max(0, Math.min(1, pose.opacity));
        el.style.transform = 'translate(' + pose.x + 'px,' + pose.y + 'px) scale(' + pose.scale + ')';
    }
    function panelMotion(el, from, exiting) {
        var to = { opacity: exiting ? 0 : 1, x: 0, y: exiting ? 8 : 0, scale: exiting ? .985 : 1 };
        promoteLayer(el);
        if (global.NewtabMotion && global.NewtabMotion.spring) {
            // Both directions keep one owner, even while native dialog.close()
            // releases focus and its inert visual handoff finishes outside it.
            return springMotion(state.dialog, 'chat-panel', to, from, function (pose) { paintPose(el, pose); },
                { stiffness: exiting ? 560 : 380, damping: exiting ? 42 : 36 }).then(function (complete) {
                    if (complete) releaseLayer(el);
                    if (complete && el === state.dialog) { el.style.removeProperty('opacity'); el.style.removeProperty('transform'); }
                    return complete;
                });
        }
        return animate(el, [{ opacity: from.opacity, transform: 'translate(' + from.x + 'px,' + from.y + 'px) scale(' + from.scale + ')' },
            { opacity: to.opacity, transform: 'translateY(' + to.y + 'px) scale(' + to.scale + ')' }], exiting ? 'control' : 'panel')
            .then(function (complete) { if (complete) releaseLayer(el); return complete; });
    }
    function animate(el, frames, token) {
        // Reversing a transition starts at its rendered state, never its old
        // keyframe. This also keeps rapid textarea growth/shrink continuous.
        if (el && motions.has(el)) {
            var current = getComputedStyle(el), first = Object.assign({}, frames[0]);
            Object.keys(first).forEach(function (key) { if (key !== 'offset') first[key] = current[key]; });
            frames = [first].concat(frames.slice(1));
        }
        cancelMotion(el);
        if (!el || !el.isConnected || reducedMotion() || !el.animate) return Promise.resolve(true);
        var style = getComputedStyle(el), value = style.getPropertyValue('--motion-' + token).trim();
        var duration = parseFloat(value) * (/ms$/.test(value) ? 1 : 1000);
        if (!isFinite(duration)) duration = token === 'panel' ? 320 : token === 'fast' ? 120 : 180;
        var animation;
        try { animation = el.animate(frames, { duration: duration,
            easing: style.getPropertyValue('--motion-ease').trim() || 'cubic-bezier(.22,1,.36,1)' }); }
        catch (_) { return Promise.resolve(true); }
        motions.set(el, animation);
        function finish(completed) { if (motions.get(el) === animation) motions.delete(el); return completed; }
        return animation.finished.then(function () { return finish(true); }, function () { return finish(false); });
    }
    function clearGhosts(except) { ghosts.forEach(function (el) { if (el !== except) { cancelMotion(el); el.remove(); ghosts.delete(el); } }); }
    function settleViews() {
        if (!ui.stage) return;
        viewRevision++;
        viewBlend = state.personaEditing ? 1 : 0;
        [ui.settings, ui.conversation].forEach(function (el) {
            var visible = el === ui.settings ? state.personaEditing : !state.personaEditing;
            el.hidden = !visible; el.inert = !visible; el.setAttribute('aria-hidden', String(!visible));
            el.style.removeProperty('opacity'); el.style.removeProperty('transform');
            releaseLayer(el);
        });
    }
    function cancelAllMotion(except, keepPanel) {
        motions.forEach(function (animation) { animation.cancel(); }); motions.clear();
        springs.forEach(function (group, owner) {
            if (keepPanel && group.has('chat-panel')) return;
            global.NewtabMotion.finishSpring(owner);
        });
        clearGhosts(except); settleViews();
    }
    function snapshot(el, className, parent) {
        if (reducedMotion()) return null;
        var clone = el.cloneNode(true);
        clone.classList.add(className); clone.removeAttribute('open'); clone.setAttribute('aria-hidden', 'true'); clone.inert = true;
        [clone].concat(Array.from(clone.querySelectorAll('*'))).forEach(function (node) {
            node.removeAttribute('id'); node.removeAttribute('autofocus'); node.removeAttribute('aria-labelledby'); node.removeAttribute('aria-describedby');
        });
        var fields = el.querySelectorAll('textarea');
        clone.querySelectorAll('textarea').forEach(function (field, index) { field.value = fields[index].value; });
        parent.appendChild(clone); ghosts.add(clone);
        var sourceScroll = [el].concat(Array.from(el.querySelectorAll('*')));
        [clone].concat(Array.from(clone.querySelectorAll('*'))).forEach(function (node, index) {
            var source = sourceScroll[index]; node.scrollTop = source.scrollTop;
            if (motions.has(source) || springs.has(source)) {
                var style = getComputedStyle(source);
                node.style.opacity = style.opacity; node.style.transform = style.transform;
                if (source === ui.input) node.style.height = style.height;
            }
        });
        return clone;
    }
    function switchView(settings) {
        if (!ui.stage) return;
        state.dialog.classList.toggle('is-settings', settings);
        if (!state.dialog.open || reducedMotion()) { cancelMotion(ui.settings); cancelMotion(ui.conversation); settleViews(); return; }
        var revision = ++viewRevision;
        var fade;
        if (global.NewtabMotion && global.NewtabMotion.spring) {
            // Fade through the quiet paper between two dense text surfaces.
            // One reversible blend prevents overlapping paragraphs even when
            // a second click interrupts the first switch mid-flight.
            fade = springMotion(ui.stage, 'chat-view-fade', { blend: settings ? 1 : 0 }, { blend: viewBlend }, function (pose) {
                viewBlend = Math.max(0, Math.min(1, pose.blend));
                ui.conversation.style.opacity = Math.max(0, 1 - viewBlend / .46);
                ui.settings.style.opacity = Math.max(0, (viewBlend - .54) / .46);
            }, { stiffness: 1100, damping: 58 });
        }
        // Keep both real panes during a switch. A quick reversal reuses their
        // current positions, scroll and streamed text instead of stale clones.
        [ui.settings, ui.conversation].forEach(function (el) {
            var visible = el === ui.settings ? settings : !settings;
            var side = el === ui.settings ? 1 : -1;
            var style = getComputedStyle(el);
            var from = el.hidden ? { opacity: 0, transform: 'translateX(' + (side * 16) + 'px)' } : { opacity: style.opacity, transform: style.transform };
            var to = { opacity: visible ? 1 : 0, transform: 'translateX(' + (visible ? 0 : side * 16) + 'px)' };
            el.hidden = false; el.inert = !visible; el.setAttribute('aria-hidden', String(!visible));
            promoteLayer(el);
            // The semantic view and pointer action change immediately; only
            // the inert outgoing pixels remain while the transition settles.
            cancelMotion(el);
            var complete;
            if (global.NewtabMotion && global.NewtabMotion.spring) {
                var matrix = new DOMMatrixReadOnly(from.transform === 'none' ? undefined : from.transform);
                complete = Promise.all([
                    springMotion(el, 'chat-view-position', { x: visible ? 0 : side * 16 }, { x: matrix.m41 },
                        function (pose) { el.style.transform = 'translateX(' + pose.x + 'px)'; }, { stiffness: 420, damping: 36 }),
                    fade
                ]).then(function (results) { return results.every(Boolean); });
            } else {
                el.style.opacity = to.opacity; el.style.transform = to.transform; complete = animate(el, [from, to], 'panel');
            }
            complete.then(function (completed) {
                if (completed && revision === viewRevision) { releaseLayer(el); if (!visible) el.hidden = true; }
            });
        });
        if (!settings) resizeComposer(false);
    }
    function resizeComposer(motion) {
        if (!ui.input || !ui.input.getClientRects().length) return;
        var before = ui.input.getBoundingClientRect().height;
        cancelMotion(ui.input); ui.input.style.height = 'auto';
        var height = Math.max(44, Math.min(132, ui.input.scrollHeight));
        ui.input.style.height = height + 'px'; ui.input.style.overflowY = ui.input.scrollHeight > height ? 'auto' : 'hidden';
        if (motion !== false && (Math.abs(before - height) > 1 || springs.has(ui.input))) {
            if (global.NewtabMotion && global.NewtabMotion.spring) springMotion(ui.input, 'composer-height', { height: height }, { height: before },
                function (pose) { ui.input.style.height = pose.height + 'px'; }, { stiffness: 480, damping: 42, precision: .1 });
            else animate(ui.input, [{ height: before + 'px' }, { height: height + 'px' }], 'control');
        } else if (springs.has(ui.input)) global.NewtabMotion.cancelSpring(ui.input, 'composer-height');
    }
    motionPreference.addEventListener('change', function () { if (reducedMotion()) cancelAllMotion(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) cancelAllMotion(); });

    function transport() { return global.NewtabChatTransport; }
    function statusLayout() {
        ui.statusRow.classList.toggle('is-quiet', state.quietStatus && ui.retry.hidden && ui.openSettings.hidden);
        ui.settingsStatus.hidden = !ui.status.textContent || state.quietStatus && !state.busy;
    }
    function announce(message, quiet) {
        state.quietStatus = !!quiet || !message;
        ui.status.textContent = message || '';
        ui.settingsStatus.textContent = message || '';
        statusLayout();
    }
    function reaction(value) {
        document.dispatchEvent(new CustomEvent('newtab:chat-state', { detail: { widgetId: state.widgetId, state: value } }));
    }
    function save() {
        var messages = state.messages.filter(function (m) { return m.content; }).slice(-MAX_MESSAGES);
        while (messages.length > 2 && JSON.stringify(messages).length > MAX_HISTORY_CHARS) messages.shift();
        try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages)); }
        catch (_) { ui.privacy.textContent = '瀏覽器無法暫存，重新整理後會清除這段對話。'; announce(ui.privacy.textContent); }
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
            if (prompt && prompt.trim() && prompt.length <= persona.maxLength) {
                // Refresh only an unchanged shipped default. Read-time mapping
                // preserves custom text and works when storage is read-only.
                var legacyDefaults = persona.legacyDefaultPrompts || [];
                state.characterPrompt = legacyDefaults.indexOf(prompt) >= 0 ? persona.defaultPrompt : prompt;
            }
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
        switchView(true);
        ui.personaToggle.setAttribute('aria-expanded', 'true');
        updatePromptControls(); ui.settingsTitle.focus({ preventScroll: true }); ui.settings.scrollTop = 0; ui.prompt.scrollTop = 0;
    }
    function closePersona(focus) {
        state.personaGeneration++; state.personaEditing = false; state.personaImporting = false;
        switchView(false);
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
        closePersona(true); announce('已儲存角色設定，下一則回覆開始套用。', true);
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
    function replyPhase(view, phase) {
        if (!view.progress || view.row.dataset.phase === phase) return;
        var previous = view.row.dataset.phase;
        view.row.dataset.phase = phase;
        view.progressLabel.textContent = phase === 'thinking' ? '正在思考' : phase === 'streaming' ? '正在回覆' : '';
        view.progress.title = phase === 'complete' ? '回覆完成' : '';
        if (phase === 'complete' && previous) animate(view.progress, [{ opacity: 0, transform: 'scale(.75)' }, { opacity: 1, transform: 'scale(1)' }], 'control');
    }
    function addMessage(message, entrance) {
        var row = element('article', 'character-chat-message is-' + message.role);
        row.setAttribute('aria-label', message.role === 'user' ? '你的訊息' : 'Nacho 回覆');
        var name = element('div', 'character-chat-speaker');
        if (message.role === 'assistant') name.appendChild(avatar('character-chat-avatar character-chat-reply-avatar'));
        name.appendChild(element('span', null, message.role === 'user' ? '你' : 'Nacho'));
        var progress, progressLabel;
        if (message.role === 'assistant') {
            progress = element('span', 'character-chat-reply-state'); progress.setAttribute('aria-hidden', 'true');
            var icon = element('span', 'character-chat-reply-state-icon');
            icon.innerHTML = '<svg viewBox="0 0 16 16"><circle class="chat-state-ring" cx="8" cy="8" r="5"/><path class="chat-state-check" d="m4 8 2.5 2.5L12 5"/></svg>';
            progressLabel = element('span'); progress.append(icon, progressLabel); name.appendChild(progress);
        }
        var content = element('div', 'character-chat-text', message.content);
        if (message.role === 'assistant') renderReply(content, message.content);
        var note = element('span', 'character-chat-message-note');
        if (message.status === 'stopped') note.textContent = '已停止';
        if (message.status === 'failed') note.textContent = '回覆未完成';
        row.append(name, content, note); ui.messages.appendChild(row);
        var view = { row: row, content: content, note: note, progress: progress, progressLabel: progressLabel };
        replyPhase(view, message.status === 'streaming' ? 'thinking' : message.status);
        if (entrance === true) animate(row, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], 'control');
        return view;
    }
    function renderHistory() {
        ui.messages.replaceChildren();
        state.messages.forEach(addMessage);
        ui.empty.hidden = state.messages.length > 0;
        scrollLatest(true);
    }
    function controls() {
        var busyChanged = ui.lastBusy !== undefined && ui.lastBusy !== state.busy;
        var oldAction = state.busy ? ui.send : ui.stop;
        var actionFocused = document.activeElement === oldAction;
        var actionGhost = busyChanged && state.dialog.open && !oldAction.hidden ?
            snapshot(oldAction.querySelector('svg'), 'character-chat-action-ghost', ui.actions) : null;
        ui.send.disabled = !state.canChat || state.busy || state.checking || !ui.input.value.trim();
        ui.stop.hidden = !state.busy;
        ui.send.hidden = state.busy;
        ui.connect.hidden = state.canChat || state.available && !state.personaSupported;
        ui.connect.disabled = state.checking || !state.available;
        ui.refresh.disabled = state.checking || state.busy;
        ui.disconnect.hidden = !state.connected || !transport() || !transport().disconnect;
        ui.disconnect.disabled = state.busy || state.checking;
        ui.retry.hidden = state.retryAt < 0;
        ui.retry.disabled = state.busy || state.checking || !state.canChat;
        ui.openSettings.hidden = state.canChat || state.checking || state.busy;
        ui.input.setAttribute('aria-describedby', 'character-chat-status character-chat-input-hint');
        ui.composer.dataset.busy = String(state.busy);
        ui.composer.dataset.hasText = String(!!ui.input.value.trim());
        if (busyChanged && state.dialog.open) {
            var newAction = state.busy ? ui.stop : ui.send;
            if (actionGhost) animate(actionGhost, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.65) rotate(12deg)' }], 'fast')
                .then(function () { actionGhost.remove(); ghosts.delete(actionGhost); });
            animate(newAction.querySelector('svg'), [{ opacity: 0, transform: 'scale(.75) rotate(-12deg)' }, { opacity: 1, transform: 'scale(1) rotate(0)' }], 'control');
            if (actionFocused && !state.personaEditing) (state.busy ? ui.stop : ui.input).focus({ preventScroll: true });
        }
        ui.lastBusy = state.busy;
        statusLayout();
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
                announce('已準備好，可以直接在這裡對話。', true);
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
        var view = addMessage(reply, true);
        var streamText = document.createTextNode(''); view.content.appendChild(streamText);
        view.row.classList.add('is-pending');
        ui.empty.hidden = true; controls(); scrollLatest(true); reaction('thinking'); announce('Nacho 正在回覆…', true);
        function delta(value) {
            if (id !== state.request || !state.busy || state.controller.signal.aborted) return;
            var text = typeof value === 'string' ? value : value && value.text || '';
            if (!text) return;
            var firstDelta = !reply.content;
            if (reply.content.length + text.length > 64000) tooLong = true;
            var addition = text.slice(0, 64000 - reply.content.length);
            reply.content += addition; streamText.appendData(addition);
            view.note.textContent = ''; view.row.classList.remove('is-pending');
            if (firstDelta) { replyPhase(view, 'streaming'); reaction('speaking'); } scrollLatest(false);
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
            announce('回覆完成。', true);
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
                replyPhase(view, reply.status);
                view.row.classList.remove('is-pending'); reaction('idle'); controls(); save(); scrollLatest(false);
            }
        }
    }
    function send(event) {
        if (event) event.preventDefault();
        if (state.busy || state.checking || !state.canChat || state.composing) return;
        var text = ui.input.value.trim();
        if (!text) return;
        var message = { role: 'user', content: text.slice(0, 8000), status: 'complete' };
        state.messages.push(message);
        ui.input.value = ''; resizeComposer(true);
        ui.empty.hidden = true; addMessage(message, true); scrollLatest(true); save(); requestReply(state.messages.length - 1);
    }
    function stop() { if (state.controller) { state.controller.abort(); announce('正在停止回覆…'); } }
    function retry() {
        if (state.retryAt < 0 || state.busy || state.checking || !state.canChat) return;
        var index = state.retryAt;
        state.messages = state.messages.slice(0, index + 1); renderHistory(); requestReply(index);
    }
    function close() {
        if (!state.dialog || !state.dialog.open) return;
        var visual = getComputedStyle(state.dialog);
        var from = visualPose(state.dialog);
        var rect = { left: parseFloat(visual.left), top: parseFloat(visual.top), width: state.dialog.offsetWidth, height: state.dialog.offsetHeight };
        clearGhosts();
        var ghost = snapshot(state.dialog, 'character-chat-exit-ghost', document.body);
        cancelAllMotion(ghost, true);
        if (ghost) { ghost.style.inset = 'auto'; ghost.style.left = rect.left + 'px'; ghost.style.top = rect.top + 'px'; ghost.style.width = rect.width + 'px'; ghost.style.height = rect.height + 'px'; }
        if (state.busy) stop();
        state.connectionGeneration++; state.checking = false; stopLoginPolling();
        state.dialog.close();
        releaseLayer(state.dialog);
        if (state.personaEditing) closePersona(false);
        if (ghost) panelMotion(ghost, from, true)
            .then(function (completed) { if (completed) { ghost.remove(); ghosts.delete(ghost); } });
    }
    function place() {
        if (!state.dialog) return;
        var width = Math.min(420, innerWidth - 32);
        var widget = document.querySelector('.widget[data-id="' + String(state.widgetId).replace(/[^\w-]/g, '') + '"]');
        var rect = widget && widget.getBoundingClientRect();
        var left = Math.max(16, innerWidth - width - 24);
        var height = Math.min(600, innerHeight - 48);
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
        dialog.setAttribute('aria-labelledby', 'character-chat-title'); dialog.setAttribute('role', 'dialog');
        var header = element('header', 'character-chat-header');
        var identity = element('div', 'character-chat-identity');
        var portrait = avatar();
        var heading = element('div'); var title = element('h2', null, 'Nacho'); title.id = 'character-chat-title';
        ui.connection = element('p', 'character-chat-connection', '確認連線中…');
        heading.append(title); identity.append(portrait, heading);
        var dismiss = button('', 'character-chat-close', close); dismiss.setAttribute('aria-label', '關閉對話'); dismiss.title = '關閉對話';
        dismiss.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>';
        ui.personaToggle = button('', 'character-chat-persona-toggle', function () { if (state.personaEditing) closePersona(true); else editPersona(); });
        ui.personaToggle.setAttribute('aria-expanded', 'false'); ui.personaToggle.setAttribute('aria-controls', 'character-chat-settings');
        ui.personaToggle.setAttribute('aria-label', '對話設定'); ui.personaToggle.title = '對話設定';
        ui.personaToggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 3-.6 2.3-2 .9-2.1-.7-2 3.4 1.6 1.7v2.8l-1.6 1.7 2 3.4 2.1-.7 2 .9.6 2.3h4.1l.6-2.3 2-.9 2.1.7 2-3.4-1.6-1.7v-2.8l1.6-1.7-2-3.4-2.1.7-2-.9L13.6 3Z"/><circle cx="11.5" cy="12" r="3"/></svg>';
        var headerActions = element('div', 'character-chat-header-actions'); headerActions.append(ui.personaToggle, dismiss);
        header.append(identity, headerActions); dialog.appendChild(header);
        ui.stage = element('div', 'character-chat-stage'); dialog.appendChild(ui.stage);
        ui.conversation = element('div', 'character-chat-conversation');
        var connectionBar = element('div', 'character-chat-connect');
        ui.connect = button('使用 ChatGPT 登入', 'character-chat-connect-button', login);
        ui.refresh = button('重新確認', 'character-chat-refresh', refresh);
        ui.disconnect = button('登出', 'character-chat-disconnect', disconnect); ui.disconnect.hidden = true;
        connectionBar.append(ui.connect, ui.refresh, ui.disconnect);
        ui.settings = element('section', 'character-chat-settings'); ui.settings.id = 'character-chat-settings'; ui.settings.hidden = true;
        ui.settings.setAttribute('aria-labelledby', 'character-chat-settings-title');
        ui.settingsTitle = element('h3', null, '對話設定'); ui.settingsTitle.id = 'character-chat-settings-title'; ui.settingsTitle.tabIndex = -1;
        var account = element('section', 'character-chat-account');
        var accountTitle = element('h4', null, '帳號');
        ui.settingsStatus = element('p', 'character-chat-settings-status'); ui.settingsStatus.setAttribute('role', 'status'); ui.settingsStatus.hidden = true;
        account.append(accountTitle, ui.connection, connectionBar, ui.settingsStatus);
        var settingsIntro = element('p', 'character-chat-settings-intro', '調整個性與說話方式，下次回覆開始套用。');
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
        ui.privacy = element('p', 'character-chat-privacy', '對話只暫存於目前分頁；角色設定保存在此瀏覽器。');
        ui.settings.append(ui.settingsTitle, account, element('h4', 'character-chat-persona-title', '角色設定'), settingsIntro, promptLabel, ui.prompt, promptTools, ui.promptNotice, promptActions, ui.privacy); ui.stage.append(ui.settings, ui.conversation);
        var body = element('div', 'character-chat-body');
        ui.messages = element('div', 'character-chat-messages'); ui.messages.setAttribute('role', 'log'); ui.messages.setAttribute('aria-label', '對話內容'); ui.messages.setAttribute('aria-live', 'off'); ui.messages.tabIndex = 0;
        ui.messages.addEventListener('scroll', function () { state.followLatest = nearBottom(); ui.latest.hidden = state.followLatest; });
        ui.empty = element('div', 'character-chat-empty');
        ui.empty.append(element('p', null, '想聊些什麼？'));
        ui.latest = button('查看最新回覆', 'character-chat-latest', function () { state.followLatest = true; scrollLatest(true); }); ui.latest.hidden = true;
        body.append(ui.messages, ui.empty, ui.latest); ui.conversation.appendChild(body);
        var form = element('form', 'character-chat-composer'); ui.composer = form; form.addEventListener('submit', send);
        var label = element('label', 'sr-only', '傳送訊息給 Nacho'); label.htmlFor = 'character-chat-input';
        ui.input = element('textarea'); ui.input.id = 'character-chat-input'; ui.input.rows = 1; ui.input.maxLength = 8000; ui.input.placeholder = '和 Nacho 說點什麼…';
        ui.input.addEventListener('compositionstart', function () { state.composing = true; });
        ui.input.addEventListener('compositionend', function () { state.composing = false; controls(); });
        ui.input.addEventListener('input', function () { resizeComposer(true); controls(); });
        ui.input.addEventListener('keydown', function (event) {
            if (event.key !== 'Enter' || event.shiftKey || event.isComposing || state.composing || event.keyCode === 229) return;
            event.preventDefault(); send();
        });
        var composeActions = element('div', 'character-chat-compose-actions'); ui.actions = composeActions;
        var inputHint = element('span', 'sr-only', 'Enter 傳送 · Shift+Enter 換行'); inputHint.id = 'character-chat-input-hint';
        ui.send = button('', 'character-chat-send'); ui.send.type = 'submit'; ui.send.setAttribute('aria-label', '傳送'); ui.send.title = '傳送（Enter）';
        ui.send.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4.5 10 15-5.5L14 19.5l-3-6.5-6.5-3Z"/><path d="m11 13 8.5-8.5"/></svg>';
        ui.stop = button('', 'character-chat-stop', stop); ui.stop.setAttribute('aria-label', '停止回覆'); ui.stop.title = '停止回覆'; ui.stop.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>'; ui.stop.hidden = true;
        composeActions.append(ui.send, ui.stop); form.append(label, inputHint, ui.input, composeActions); ui.conversation.appendChild(form);
        ui.statusRow = element('div', 'character-chat-status-row is-quiet');
        ui.status = element('p', 'character-chat-status'); ui.status.id = 'character-chat-status'; ui.status.setAttribute('role', 'status'); ui.status.setAttribute('aria-live', 'polite');
        ui.retry = button('重試', 'character-chat-retry', retry); ui.retry.hidden = true;
        ui.openSettings = button('前往設定', 'character-chat-open-settings', editPersona); ui.openSettings.hidden = true;
        ui.statusRow.append(ui.status, ui.retry, ui.openSettings); ui.conversation.appendChild(ui.statusRow);
        dialog.addEventListener('cancel', function (event) { event.preventDefault(); close(); });
        dialog.addEventListener('keydown', function (event) {
            if (event.key === 'Tab') {
                var focusable = Array.from(dialog.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]'))
                    .filter(function (el) { return el.getClientRects().length > 0 && !el.closest('[hidden], [inert]'); });
                var first = focusable[0], last = focusable[focusable.length - 1];
                if (first && event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
                else if (first && !event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
                return;
            }
            if (event.key !== 'Escape') return;
            event.preventDefault(); event.stopPropagation();
            if (state.personaEditing) closePersona(true);
            else close();
        });
        dialog.addEventListener('click', function (event) { if (event.target !== dialog) return; var r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close(); });
        dialog.addEventListener('close', function () {
            if (dialog.open) return;
            motions.forEach(function (_, el) { if (el === dialog || dialog.contains(el)) cancelMotion(el); });
            if (state.busy) stop();
            if (state.personaEditing) closePersona(false);
            state.connectionGeneration++; state.checking = false; stopLoginPolling();
            if (state.opener && state.opener.isConnected) state.opener.focus({ preventScroll: true });
        });
        global.addEventListener('resize', function () { place(); resizeComposer(false); });
        global.addEventListener('focus', function () { if (dialog.open && !state.canChat) refresh(); });
        document.body.appendChild(dialog); renderHistory(); controls();
    }
    function open(widgetId) {
        create(); state.widgetId = widgetId || 'companion-1';
        var departing = Array.from(ghosts).find(function (el) { return el.classList.contains('character-chat-exit-ghost'); });
        var resumeFrame;
        if (departing) resumeFrame = visualPose(departing);
        clearGhosts();
        if (!state.dialog.open) {
            state.connectionGeneration++; state.checking = false; state.loginUntil = 0; state.opener = document.activeElement; place(); state.dialog.showModal();
            panelMotion(state.dialog, resumeFrame || { opacity: 0, x: 0, y: 10, scale: .985 }, false);
        }
        refresh();
        ui.input.focus({ preventScroll: true }); resizeComposer(false); scrollLatest(true);
    }
    global.NewtabCharacterChat = { open: open, close: close, refresh: refresh, isOpen: function () { return !!state.dialog && state.dialog.open; } };
})(window);
