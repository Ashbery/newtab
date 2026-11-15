/* Weather refresh preferences. The widget host owns persistence and requests. */
(function (global) {
    'use strict';
    var active = null;
    function node(tag, className, text) {
        var el = document.createElement(tag);
        if (className) el.className = className;
        if (text !== undefined) el.textContent = text;
        return el;
    }
    function button(label, className, onClick) {
        var el = node('button', className, label); el.type = 'button';
        el.addEventListener('click', onClick); return el;
    }
    function valid(session) { return active === session && !session.closed && (!session.options.isCurrent || session.options.isCurrent()); }
    function close(session, restoreFocus) {
        if (!session || session.closed) return;
        session.closed = true;
        if (active === session) active = null;
        if (session.observer) session.observer.disconnect();
        session.dialog.inert = true;
        function remove() {
            session.dialog.close(); session.dialog.remove();
            var target = session.options.focusTarget ? session.options.focusTarget() : session.options.opener;
            if (restoreFocus && !active && target && target.isConnected) target.focus({ preventScroll: true });
        }
        if (global.NewtabMotion) global.NewtabMotion.exit(session.dialog, { y: 5, scale: .99, duration: 140 }).then(remove);
        else remove();
    }
    function open(options) {
        if (active) close(active, false);
        var dialog = node('dialog', 'weather-settings-dialog');
        dialog.setAttribute('aria-labelledby', 'weather-settings-title');
        var session = { options: options, dialog: dialog, closed: false };
        var header = node('header', 'weather-settings-header');
        var title = node('h2', null, '天氣設定'); title.id = 'weather-settings-title'; title.tabIndex = -1;
        var dismiss = button('', 'weather-settings-close', function () { close(session, true); });
        dismiss.setAttribute('aria-label', '關閉天氣設定');
        dismiss.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>';
        header.append(title, dismiss);
        var location = node('section', 'weather-settings-location');
        location.append(node('h3', null, '位置'), node('p', 'weather-settings-city', options.city || '尚未選擇位置'));
        var locationActions = node('div', 'weather-settings-location-actions');
        function locationAction(callback) {
            if (!valid(session)) return;
            // Dispose immediately before handing native focus to another sheet.
            close(session, false);
            if (callback) callback();
        }
        locationActions.append(button('選擇城市', 'weather-settings-link', function () { locationAction(options.onCity); }),
            button('重新定位', 'weather-settings-link', function () { locationAction(options.onLocate); }));
        location.append(locationActions);
        var form = node('form', 'weather-settings-form');
        var opening = node('label', 'weather-settings-switch-row');
        var switchCopy = node('span');
        switchCopy.append(node('strong', null, '開新分頁時更新'), node('small', null, '先顯示已有天氣，再檢查最新資料。'));
        var onOpen = node('input'); onOpen.type = 'checkbox'; onOpen.id = 'weather-refresh-on-open';
        onOpen.setAttribute('role', 'switch'); onOpen.checked = options.options.weatherRefreshOnOpen;
        var track = node('span', 'weather-settings-switch'); track.setAttribute('aria-hidden', 'true');
        opening.append(switchCopy, onOpen, track);
        var interval = node('label', 'weather-settings-interval'); interval.htmlFor = 'weather-refresh-minutes';
        interval.append(node('strong', null, '自動更新頻率'));
        var select = node('select'); select.id = 'weather-refresh-minutes';
        [[15, '每 15 分鐘'], [30, '每 30 分鐘'], [60, '每 1 小時'], [120, '每 2 小時'], [0, '關閉定時更新']].forEach(function (entry) {
            var option = node('option', null, entry[1]); option.value = String(entry[0]); select.append(option);
        });
        select.value = String(options.options.weatherRefreshMinutes); interval.append(select);
        var hint = node('p', 'weather-settings-hint', '只在分頁顯示時自動更新。短時間連開分頁會共用最新資料；資料來源的更新限制仍會保留。');
        var status = node('p', 'weather-settings-status'); status.setAttribute('role', 'status');
        var actions = node('div', 'weather-settings-actions');
        var reset = button('恢復預設', 'weather-settings-reset', function () {
            onOpen.checked = true; select.value = '30'; status.textContent = '已恢復更新預設，儲存後套用；位置不變。';
        });
        var save = node('button', 'weather-settings-save', '儲存設定'); save.type = 'submit'; actions.append(reset, save);
        form.append(opening, interval, hint, status, actions);
        form.addEventListener('submit', function (event) {
            event.preventDefault();
            if (!valid(session)) return;
            var saved = options.onSave({ weatherRefreshOnOpen: onOpen.checked, weatherRefreshMinutes: Number(select.value) });
            if (saved === false) { status.textContent = '無法儲存設定，請確認瀏覽器儲存空間後重試。'; return; }
            close(session, true);
        });
        dialog.append(header, location, form);
        if (options.sourceInformation) {
            var source = node('details', 'weather-settings-source');
            source.append(node('summary', null, '更新時間與資料來源'), options.sourceInformation.cloneNode(true)); dialog.append(source);
        }
        dialog.addEventListener('cancel', function (event) { event.preventDefault(); close(session, true); });
        dialog.addEventListener('close', function () { close(session, true); });
        dialog.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(session, true); return; }
            if (event.key !== 'Tab') return;
            var targets = Array.from(dialog.querySelectorAll('button,input,select,summary,a[href]')).filter(function (el) { return el.getClientRects().length && !el.disabled; });
            var first = targets[0], last = targets[targets.length - 1];
            if (event.shiftKey && (document.activeElement === first || document.activeElement === title)) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        });
        dialog.addEventListener('click', function (event) {
            if (event.target !== dialog) return;
            var rect = dialog.getBoundingClientRect();
            if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close(session, true);
        });
        active = session; document.body.append(dialog); dialog.showModal(); title.focus({ preventScroll: true });
        if (global.NewtabMotion) global.NewtabMotion.enter(dialog, { y: 8, scale: .985, duration: 240 });
        session.observer = new MutationObserver(function () { if (!dialog.isConnected || !valid(session)) close(session, false); });
        session.observer.observe(document.body, { childList: true, subtree: true });
        return true;
    }
    global.NewtabWeatherSettings = { open: open, close: function () { close(active, true); } };
})(window);
