/* Local screen-to-layout associations. Window Management provides live display
 * objects, not permanent hardware IDs; ambiguous reconnects stay manual.
 * https://www.w3.org/TR/window-management/#screendetails
 */
(function (global) {
    'use strict';
    var KEY = 'nt_screen_layouts_v1';
    var config = { version: 1, auto: false, screens: [] };
    var section, controls, details, permission, initialized = false;
    var generation = 0, busy = false, reason = '', status = '', syncQueued = false, authorized = false;
    var sessionScreens = new WeakMap();

    function api() { return global.NewtabLayoutProfiles; }
    function profiles() { return api() ? api().getState() : { enabled: false, activeId: null, profiles: [] }; }
    function uid(prefix) { return prefix + '-' + (global.crypto && global.crypto.randomUUID ? global.crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)); }
    function cleanName(value) { return String(value || '').trim().slice(0, 80); }
    function descriptor(screen) {
        var numeric = ['left', 'top', 'width', 'height'];
        if (!screen || numeric.some(function (key) { return !Number.isFinite(screen[key]); }) || screen.width <= 0 || screen.height <= 0) return null;
        return { label: String(screen.label || '').trim().slice(0, 160), left: screen.left, top: screen.top,
            width: screen.width, height: screen.height, internal: !!screen.isInternal };
    }
    function equalScreen(a, b) {
        return a && b && ['label', 'left', 'top', 'width', 'height', 'internal'].every(function (key) { return a[key] === b[key]; });
    }
    function screenId(value) {
        // Stable local association keys make simultaneous new tabs converge.
        // This is a descriptor hash, never a claimed hardware serial number.
        var text = JSON.stringify(value), a = 2166136261, b = 2654435769;
        for (var i = 0; i < text.length; i++) {
            a = Math.imul(a ^ text.charCodeAt(i), 16777619);
            b = Math.imul(b ^ text.charCodeAt(i), 2246822519);
        }
        return 'screen-' + (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
    }
    function savedScreens(stored) {
        if (!stored || stored.version !== 1 || !Array.isArray(stored.screens)) return null;
        return stored.screens.filter(function (entry) {
            return entry && /^[a-zA-Z0-9_-]{1,100}$/.test(entry.profileId) && descriptor(entry.screen);
        }).slice(-32);
    }
    function readConfig() {
        try {
            var stored = JSON.parse(localStorage.getItem(KEY));
            var screens = savedScreens(stored);
            if (!screens) return;
            config = { version: 1, auto: stored.auto === true, screens: screens, manualRevision: String(stored.manualRevision || '') };
        } catch (_) { /* The current page can still use manual layouts. */ }
    }
    function saveConfig() {
        try { localStorage.setItem(KEY, JSON.stringify(config)); }
        catch (_) { status = '這次設定可使用，但瀏覽器目前無法保存自動辨識設定。'; }
    }
    function capability() {
        if (typeof global.getScreenDetails !== 'function') return 'unsupported';
        var policy = document.permissionsPolicy || document.featurePolicy;
        try { if (policy && policy.allowsFeature && !policy.allowsFeature('window-management')) return 'blocked'; } catch (_) { /* Older policy interfaces may not know the feature. */ }
        return '';
    }
    function messageFor(code) {
        return {
            unsupported: '此瀏覽器未提供自動螢幕辨識，仍可手動切換版面。',
            blocked: '新分頁外框尚未開放螢幕辨識。更新並重新載入擴充後可再試，現在仍可手動切換。',
            permission: '尚未取得螢幕權限。可從網站權限允許，或繼續手動切換。',
            ambiguous: '螢幕配置已改變，已保留目前版面。請先手動選擇，再按「使用於目前螢幕」確認對應。',
            unavailable: '暫時無法取得螢幕資訊，仍可手動切換版面。'
        }[code] || '';
    }
    function setStatus(text, code) { status = text || ''; reason = code || ''; render(); }
    function profileName(id, fallback) {
        var item = profiles().profiles.find(function (profile) { return profile.id === id; });
        return item ? item.name : fallback;
    }
    function choose(id, name, automatic) {
        if (!api()) return { ok: false, error: 'unavailable' };
        var current = profiles();
        if (current.enabled && current.activeId === id && !current.pendingId) return { ok: true };
        var options = automatic ? { owner: 'screen-auto' } : undefined;
        return current.enabled ? api().select(id, name, options) : api().enable(id, name, options);
    }

    // Exact desktop position separates equal-resolution displays. A unique,
    // nonempty label can survive rearrangement. Never guess between duplicate
    // labels after their geometry changes, and never use array index as an ID.
    function findAssociation(screen, allScreens, entries) {
        var value = descriptor(screen);
        if (!value) return { error: 'unavailable' };
        var remembered = sessionScreens.get(screen);
        var entry = remembered && entries.find(function (item) { return item.profileId === remembered; });
        if (entry) return { entry: entry, screen: value };
        var exact = entries.filter(function (item) { return equalScreen(item.screen, value); });
        if (exact.length === 1) return { entry: exact[0], screen: value };
        if (exact.length > 1) return { error: 'ambiguous' };
        var sameLabel = entries.filter(function (item) { return item.screen.label === value.label; });
        var uniqueLabel = value.label && allScreens.filter(function (item) { return String(item.label || '').trim() === value.label; }).length === 1;
        if (uniqueLabel && sameLabel.length === 1) return { entry: sameLabel[0], screen: value };
        if (sameLabel.length) return { error: 'ambiguous' };
        return { entry: { profileId: screenId(value), screen: value }, screen: value, fresh: true };
    }
    function synchronize() {
        if (!config.auto || !authorized || !details || !api()) return;
        try {
            var saved = savedScreens(JSON.parse(localStorage.getItem(KEY)));
            if (saved) config.screens = saved;
        } catch (_) { /* Keep the current page's in-memory associations. */ }
        var screens = Array.from(details.screens || []), current = details.currentScreen;
        if (!screens.length || screens.indexOf(current) < 0) return setStatus(messageFor('unavailable'), 'unavailable');
        var known = config.screens.slice(), entries = known.slice(), associations = [];
        // Resolve the whole topology before committing any changed descriptor.
        for (var i = 0; i < screens.length; i++) {
            var result = findAssociation(screens[i], screens, known);
            // An unresolved disconnected/rearranged neighbour must not prevent
            // an explicitly bound current display from being used safely.
            if (result.error) {
                if (screens[i] === current) return setStatus(messageFor(result.error), result.error);
                continue;
            }
            associations.push({ object: screens[i], result: result });
            if (result.fresh) entries.push(result.entry);
        }
        var ids = associations.map(function (item) { return item.result.entry.profileId; });
        if (new Set(ids).size !== ids.length) return setStatus(messageFor('ambiguous'), 'ambiguous');
        associations.forEach(function (item) {
            item.result.entry.screen = item.result.screen;
            sessionScreens.set(item.object, item.result.entry.profileId);
        });
        config.screens = entries.slice(-32);
        var selected = associations.find(function (item) { return item.object === current; });
        var name = cleanName(selected.result.screen.label) || '螢幕 ' + (screens.indexOf(current) + 1);
        var response = choose(selected.result.entry.profileId, name, true);
        if (!response || !response.ok) return setStatus('目前無法切換版面，請稍後再試。', 'unavailable');
        saveConfig();
        var duplicateLabels = screens.some(function (screen, index) { return screens.some(function (other, j) { return j !== index && String(other.label || '') === String(screen.label || ''); }); });
        setStatus('已自動選擇「' + profileName(selected.result.entry.profileId, name) + '」。' +
            (duplicateLabels ? '同款螢幕依桌面位置區分；重新排列後請確認對應。' : ''), '');
    }
    function queueSync() {
        if (syncQueued || !config.auto) return;
        syncQueued = true;
        queueMicrotask(function () { syncQueued = false; synchronize(); });
    }
    function bindDetails(next) {
        if (details === next) return;
        if (details) {
            details.removeEventListener('currentscreenchange', queueSync);
            details.removeEventListener('screenschange', queueSync);
        }
        details = next;
        details.addEventListener('currentscreenchange', queueSync);
        details.addEventListener('screenschange', queueSync);
    }
    function clearDetails() {
        if (details) {
            details.removeEventListener('currentscreenchange', queueSync);
            details.removeEventListener('screenschange', queueSync);
        }
        details = null; authorized = false; sessionScreens = new WeakMap();
    }
    function watchPermission(next) {
        if (permission && permission !== next) permission.onchange = null;
        permission = next;
        permission.onchange = function () {
            if (next.state !== 'granted') {
                clearDetails(); stopAuto(messageFor('permission'));
                setStatus(messageFor('permission'), 'permission');
            }
        };
        if (next.state !== 'granted') permission.onchange();
    }
    function cancelAutoWork() {
        generation++;
        busy = false;
        if (api() && api().cancelPending) api().cancelPending('screen-auto');
    }
    function stopAuto(text) {
        cancelAutoWork();
        config.auto = false;
        // Even if auto was already false while a permission request was open,
        // an explicit stop in another tab must invalidate that pending request.
        config.manualRevision = uid('stop');
        saveConfig();
        setStatus(text || '已改為手動切換，原本的版面仍保留。', '');
    }
    async function enableAuto(resume) {
        var token = ++generation;
        reason = capability();
        if (reason) { clearDetails(); config.auto = false; saveConfig(); setStatus(messageFor(reason), reason); return false; }
        if (resume) {
            try {
                var granted = await navigator.permissions.query({ name: 'window-management' });
                if (token !== generation) return false;
                if (granted.state !== 'granted') { clearDetails(); config.auto = false; saveConfig(); setStatus('按「啟用自動辨識」後，再允許螢幕權限。', 'permission'); return false; }
                watchPermission(granted);
            } catch (_) { if (token !== generation) return false; clearDetails(); config.auto = false; saveConfig(); setStatus(messageFor('unavailable'), 'unavailable'); return false; }
        }
        busy = true; setStatus(resume ? '正在確認目前螢幕…' : '請在瀏覽器提示中允許螢幕辨識。', '');
        try {
            var next = await global.getScreenDetails();
            if (token !== generation) return false;
            bindDetails(next); authorized = true; config.auto = true; busy = false;
            synchronize();
            try {
                var currentPermission = await navigator.permissions.query({ name: 'window-management' });
                if (token !== generation) return false;
                watchPermission(currentPermission);
            } catch (_) { /* The explicit API grant remains sufficient. */ }
            return !reason;
        } catch (error) {
            if (token !== generation) return false;
            clearDetails(); config.auto = false; busy = false; saveConfig();
            var failure = error && error.name === 'NotAllowedError' ? (capability() || 'permission') : 'unavailable';
            setStatus(messageFor(failure), failure); return false;
        }
    }
    function newManual() {
        stopAuto('');
        var id = uid('manual'), name = '版面 ' + (profiles().profiles.length + 1);
        var response = choose(id, name);
        if (!response || !response.ok) return setStatus('目前無法新增版面，請稍後再試。', 'unavailable');
        render();
        if (controls && !response.pending) { controls.name.focus({ preventScroll: true }); controls.name.select(); }
    }
    function bindCurrent() {
        var state = profiles(), screen = details && details.currentScreen, value = descriptor(screen);
        if (!authorized || permission && permission.state !== 'granted' || !state.enabled || !state.activeId || !value) return;
        // This explicit action changes the association only. The profile owner
        // retains every saved layout, including any formerly associated one.
        config.screens = config.screens.filter(function (entry) { return entry.profileId !== state.activeId && !equalScreen(entry.screen, value); });
        config.screens.push({ profileId: state.activeId, screen: value });
        Array.from(details.screens || []).forEach(function (item) { if (item !== screen && sessionScreens.get(item) === state.activeId) sessionScreens.delete(item); });
        sessionScreens.set(screen, state.activeId); config.auto = true;
        saveConfig(); synchronize();
    }
    function disclose(expanded) {
        var element = controls.content;
        if (element._expanded === expanded) return;
        var initial = typeof element._expanded !== 'boolean';
        element._expanded = expanded;
        element.inert = !expanded;
        element.setAttribute('aria-hidden', String(!expanded));
        element.hidden = false;
        var token = (element._sequence || 0) + 1; element._sequence = token;
        function paint(pose) {
            var progress = Math.max(0, Math.min(1, pose.progress));
            element._progress = progress;
            element.style.gridTemplateRows = progress + 'fr';
            element.style.opacity = Math.min(1, progress * 1.6);
            element.style.setProperty('--screen-disclosure', progress);
        }
        if (initial || !global.NewtabMotion || !global.NewtabMotion.spring) {
            paint({ progress: expanded ? 1 : 0 }); element.hidden = !expanded; return;
        }
        global.NewtabMotion.spring(element, 'screen-layout-disclosure', { progress: expanded ? 1 : 0 }, {
            from: { progress: element._progress || 0 }, stiffness: 420, damping: 38, precision: .003, maxDuration: 520, update: paint
        }).then(function (complete) { if (complete && token === element._sequence) element.hidden = !expanded; });
    }
    function render() {
        if (!controls) return;
        var state = profiles(), active = state.profiles.find(function (item) { return item.id === state.activeId; });
        controls.enabled.checked = state.enabled;
        disclose(state.enabled);
        controls.auto.disabled = busy;
        controls.auto.textContent = busy ? '正在確認螢幕…' : config.auto && !reason ? '改為手動切換' : '啟用自動辨識';
        controls.auto.setAttribute('aria-pressed', String(config.auto && !reason));
        var signature = JSON.stringify(state.profiles);
        if (controls.select.dataset.options !== signature) {
            controls.select.textContent = '';
            state.profiles.forEach(function (item) {
                var option = document.createElement('option'); option.value = item.id; option.textContent = item.name;
                controls.select.appendChild(option);
            });
            controls.select.dataset.options = signature;
        }
        controls.select.value = state.activeId || '';
        if (document.activeElement !== controls.name) controls.name.value = active ? active.name : '';
        controls.rename.disabled = !active;
        controls.bind.hidden = !authorized || !details || !state.enabled || (config.auto && reason !== 'ambiguous');
        var pending = state.pendingAction === 'disable' ? '完成目前操作後，將恢復共用版面。' : state.pendingId ? '完成目前操作後，將切換到選擇的版面。' : '';
        var description = state.error ? '無法儲存版面，原本的版面仍保留。' : pending || status || (state.enabled ? '內容共用，各個版面保留自己的位置與大小。' : '開啟後，可讓不同螢幕保留各自的排列。');
        if (controls.status.textContent !== description) controls.status.textContent = description;
    }
    function init() {
        if (initialized) { render(); return; }
        var host = document.querySelector('#rail-panel-personalize');
        if (!host || !api()) return;
        initialized = true; readConfig();
        section = document.createElement('section'); section.className = 'screen-layouts'; section.setAttribute('aria-labelledby', 'screen-layouts-title');
        section.innerHTML = '<h3 id="screen-layouts-title">螢幕版面</h3>' +
            '<label class="screen-layouts-enable"><span>分開記住版面</span><input id="screen-layouts-enabled" type="checkbox" role="switch"><span class="screen-layouts-track" aria-hidden="true"></span></label>' +
            '<div class="screen-layouts-fields"><div class="screen-layouts-fields-inner"><label for="screen-layouts-select">目前版面</label><div class="screen-layouts-row"><select id="screen-layouts-select"></select><button type="button" data-screen-new>新增</button></div>' +
            '<form class="screen-layouts-name"><label for="screen-layouts-name">版面名稱</label><div class="screen-layouts-row"><input id="screen-layouts-name" maxlength="80" autocomplete="off"><button type="submit">儲存</button></div></form></div></div>' +
            '<button type="button" class="screen-layouts-auto" aria-pressed="false">啟用自動辨識</button>' +
            '<button type="button" class="screen-layouts-bind" data-screen-bind hidden>使用於目前螢幕</button>' +
            '<p class="screen-layouts-status" role="status" aria-live="polite"></p>';
        host.insertBefore(section, host.querySelector('#background-appearance'));
        controls = { enabled: section.querySelector('input[type=checkbox]'), content: section.querySelector('.screen-layouts-fields'),
            select: section.querySelector('select'), name: section.querySelector('#screen-layouts-name'), rename: section.querySelector('button[type=submit]'),
            auto: section.querySelector('.screen-layouts-auto'), bind: section.querySelector('[data-screen-bind]'), status: section.querySelector('.screen-layouts-status') };
        controls.enabled.addEventListener('change', function () {
            if (controls.enabled.checked) {
                var state = profiles(), first = state.profiles[0];
                var result = api().enable(first ? first.id : uid('manual'), first ? first.name : '目前版面');
                if (!result || !result.ok) setStatus('目前無法啟用獨立版面，請稍後再試。', 'unavailable');
            } else { stopAuto(''); api().disable(); }
            render();
        });
        controls.select.addEventListener('change', function () {
            var id = controls.select.value, name = controls.select.selectedOptions[0] && controls.select.selectedOptions[0].textContent;
            stopAuto(''); choose(id, name); render();
        });
        section.querySelector('[data-screen-new]').addEventListener('click', newManual);
        section.querySelector('form').addEventListener('submit', function (event) {
            event.preventDefault(); var state = profiles(), name = cleanName(controls.name.value);
            if (!name) { controls.name.setCustomValidity('請輸入版面名稱。'); controls.name.reportValidity(); return; }
            controls.name.setCustomValidity('');
            var response = api().rename(state.activeId, name);
            setStatus(response && response.ok ? '版面名稱已儲存。' : '目前無法儲存名稱，請稍後再試。', '');
        });
        controls.name.addEventListener('input', function () { controls.name.setCustomValidity(''); });
        controls.auto.addEventListener('click', function () { if (config.auto && !reason) stopAuto(); else enableAuto(false); });
        controls.bind.addEventListener('click', bindCurrent);
        document.addEventListener('newtab:profiles-change', render);
        global.addEventListener('focus', queueSync);
        global.addEventListener('storage', function (event) {
            if (event.key !== KEY) return; sessionScreens = new WeakMap(); readConfig();
            if (!config.auto) {
                cancelAutoWork(); reason = ''; status = '已改為手動切換，原本的版面仍保留。';
            }
            if (config.auto && profiles().enabled) { if (details) queueSync(); else enableAuto(true); }
            render();
        });
        reason = capability();
        if (reason) status = messageFor(reason);
        render();
        if (config.auto && profiles().enabled) enableAuto(true);
    }
    global.NewtabScreenLayouts = { init: init, enableAuto: function () { return enableAuto(false); }, disableAuto: stopAuto,
        getState: function () { return { auto: config.auto, busy: busy, reason: reason, status: status }; } };
})(window);
