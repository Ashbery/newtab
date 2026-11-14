/* Appearance controls change surfaces, never the opacity of their content. */
(function (global) {
    'use strict';

    var KEY = 'nt_appearance_v1';
    var background = { transparency: 0, blur: 0 };
    var dialog = null;
    var serial = 0;

    function finite(value, min, max) {
        return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : undefined;
    }

    function color(value) { return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : undefined; }

    function searchButtonDefaults() {
        return { searchButtonTint: '#d8eaf3', searchButtonAlpha: 1, searchButtonIcon: '#365f7c', searchButtonRadius: 22 };
    }

    function weatherButtonDefaults() {
        return { weatherButtonMode: 'inherit', weatherButtonTint: '#e4f0f5', weatherButtonAlpha: .3,
            weatherButtonText: '#303945', weatherButtonRadius: 8 };
    }

    function defaults(type) {
        var value = { preset: 'glass', alpha: type === 'clock' || type === 'companion' ? 0 : .3,
            blur: 0, tint: '#f8fbfd', text: 'dark', border: 0, radius: 18, shadow: 0,
            bgDataUrl: undefined, bgAlpha: .35 };
        if (type === 'search') Object.assign(value, searchButtonDefaults());
        if (type === 'weather') Object.assign(value, weatherButtonDefaults());
        return value;
    }

    function normalizeWidget(value) {
        var a = value && typeof value === 'object' ? value : {};
        return {
            preset: ['glass', 'solid', 'clear'].indexOf(a.preset) >= 0 ? a.preset : undefined,
            alpha: finite(a.alpha, 0, 1), blur: finite(a.blur, 0, 40),
            tint: color(a.tint),
            text: a.text === 'light' || a.text === 'dark' ? a.text : undefined,
            border: finite(a.border, 0, 1), radius: finite(a.radius, 0, 36), shadow: finite(a.shadow, 0, 1),
            bgDataUrl: typeof a.bgDataUrl === 'string' && a.bgDataUrl.indexOf('data:image/') === 0 && a.bgDataUrl.length <= 180000 ? a.bgDataUrl : undefined,
            bgAlpha: finite(a.bgAlpha, 0, 1),
            searchButtonTint: color(a.searchButtonTint), searchButtonAlpha: finite(a.searchButtonAlpha, 0, 1),
            searchButtonIcon: color(a.searchButtonIcon), searchButtonRadius: finite(a.searchButtonRadius, 0, 22),
            weatherButtonMode: ['inherit', 'custom'].indexOf(a.weatherButtonMode) >= 0 ? a.weatherButtonMode : undefined,
            weatherButtonTint: color(a.weatherButtonTint), weatherButtonAlpha: finite(a.weatherButtonAlpha, 0, 1),
            weatherButtonText: color(a.weatherButtonText), weatherButtonRadius: finite(a.weatherButtonRadius, 0, 22)
        };
    }

    function resolved(widget) {
        var value = defaults(widget.type);
        var a = normalizeWidget(widget.options && widget.options.appearance);
        if (a.preset === 'solid') value.alpha = .88;
        if (a.preset === 'clear') value.alpha = 0;
        Object.keys(a).forEach(function (key) { if (a[key] !== undefined) value[key] = a[key]; });
        return value;
    }

    function applyWidget(el, widget) {
        if (!el || !widget) return;
        var a = resolved(widget);
        applySurface(el, a);
        if (widget.type === 'weather') applyWeatherButtons(el, a);
        if (widget.type === 'search') {
            applySearchButton(el, a);
            // The compact panel moves this same container out of its widget.
            // Keep all surface/text tokens and ownership on the moving node.
            var container = el.querySelector('.search-container');
            if (container) container.setAttribute('data-search-appearance-owner', String(widget.id));
            else container = Array.prototype.find.call(document.querySelectorAll('.search-container[data-search-appearance-owner]'), function (candidate) {
                return candidate.getAttribute('data-search-appearance-owner') === String(widget.id);
            });
            if (container) {
                applySurface(container, a);
                applySearchButton(container, a);
            }
        }
    }

    function applySurface(el, a) {
        var rgb = [1, 3, 5].map(function (i) { return parseInt(a.tint.slice(i, i + 2), 16); }).join(', ');
        el.setAttribute('data-appearance-preset', a.preset);
        el.setAttribute('data-appearance-text', a.text);
        el.style.setProperty('--widget-fill', 'rgba(' + rgb + ', ' + a.alpha + ')');
        el.style.setProperty('--widget-frost', a.blur + 'px');
        el.style.setProperty('--widget-edge', 'rgba(82, 116, 140, ' + a.border + ')');
        el.style.setProperty('--widget-corner', a.radius + 'px');
        el.style.setProperty('--widget-shadow', '0 8px 28px rgba(28, 50, 68, ' + a.shadow * .28 + ')');
        el.style.setProperty('--widget-image', a.bgDataUrl ? 'url("' + a.bgDataUrl.replace(/["\\\r\n]/g, '') + '")' : 'none');
        el.toggleAttribute('data-appearance-image', !!a.bgDataUrl);
        el.style.setProperty('--widget-image-alpha', String(a.bgAlpha));
    }

    function applySearchButton(el, value) {
        var rgb = [1, 3, 5].map(function (i) { return parseInt(value.searchButtonTint.slice(i, i + 2), 16); }).join(', ');
        el.style.setProperty('--search-button-fill', 'rgba(' + rgb + ', ' + value.searchButtonAlpha + ')');
        el.style.setProperty('--search-button-ink', value.searchButtonIcon);
        el.style.setProperty('--search-button-radius', value.searchButtonRadius + 'px');
    }

    function applyWeatherButtons(el, value) {
        var custom = value.weatherButtonMode === 'custom';
        var rgb = [1, 3, 5].map(function (i) { return parseInt(value.weatherButtonTint.slice(i, i + 2), 16); }).join(', ');
        // Inherit the surface underneath, without stacking a second alpha layer.
        el.style.setProperty('--weather-button-fill', custom ? 'rgba(' + rgb + ', ' + value.weatherButtonAlpha + ')' : 'transparent');
        el.style.setProperty('--weather-button-ink', custom ? value.weatherButtonText : value.text === 'light' ? '#f4f8fc' : '#303945');
        el.style.setProperty('--weather-button-radius', (custom ? value.weatherButtonRadius : Math.min(value.radius, 22)) + 'px');
    }

    function applyBackground() {
        document.documentElement.style.setProperty('--background-visibility', String(1 - background.transparency / 100));
        document.documentElement.style.setProperty('--background-blur', background.blur * .4 + 'px');
        document.documentElement.style.setProperty('--background-scale', String(1 + background.blur / 100 * .08));
    }

    function saveBackground() {
        applyBackground();
        try { localStorage.setItem(KEY, JSON.stringify(background)); } catch (_) { /* Current page remains usable without storage. */ }
    }

    function restoreBackground() {
        try {
            var saved = JSON.parse(localStorage.getItem(KEY));
            if (saved) {
                background.transparency = finite(saved.transparency, 0, 100) || 0;
                background.blur = finite(saved.blur, 0, 100) || 0;
            }
        } catch (_) { /* Defaults handle unavailable or malformed storage. */ }
        applyBackground();
    }

    function control(parent, label, initial, change, max, unit) {
        max = max || 100;
        unit = unit == null ? '%' : unit;
        var row = document.createElement('div');
        row.className = 'appearance-control';
        var id = 'appearance-number-' + (++serial);
        var heading = document.createElement('label');
        heading.htmlFor = id;
        heading.textContent = label;
        var numberWrap = document.createElement('span');
        numberWrap.className = 'appearance-number-wrap';
        var number = document.createElement('input');
        number.id = id;
        number.type = 'number'; number.min = '0'; number.max = String(max); number.step = '1';
        number.inputMode = 'numeric';
        var suffix = document.createElement('span');
        suffix.textContent = unit; suffix.setAttribute('aria-hidden', 'true');
        numberWrap.append(number, suffix);
        var range = document.createElement('input');
        range.type = 'range'; range.min = '0'; range.max = String(max); range.step = '1';
        range.setAttribute('aria-label', label + '滑桿');
        var value = Math.round(initial);
        function paint(next) { value = Math.round(next); range.value = number.value = String(value); }
        function update(event) {
            // Empty intermediate input must not silently reset a setting to zero.
            if (event.target.value.trim() === '' || !Number.isFinite(event.target.valueAsNumber)) return;
            var next = Math.round(Math.max(0, Math.min(max, event.target.valueAsNumber)));
            value = next; range.value = String(next);
            if (event.target === range || event.type === 'change') number.value = String(next);
            change(next);
        }
        range.addEventListener('input', update);
        number.addEventListener('input', update);
        number.addEventListener('change', function (event) { update(event); paint(value); });
        number.addEventListener('blur', function () { paint(value); });
        paint(value);
        row.append(heading, numberWrap, range); parent.appendChild(row);
        return { set: paint, element: row };
    }

    function mountBackground(container) {
        if (!container || container.dataset.mounted) return;
        container.dataset.mounted = 'true';
        var title = document.createElement('h3'); title.textContent = '背景外觀'; container.appendChild(title);
        var transparency = control(container, '背景透明度', background.transparency, function (value) { background.transparency = value; saveBackground(); });
        var blur = control(container, '背景模糊', background.blur, function (value) { background.blur = value; saveBackground(); });
        var hint = document.createElement('p'); hint.className = 'appearance-hint';
        hint.textContent = '調整圖片與影片背景。透明度越高，背景越淡；模糊 100% 為最柔和。'; container.appendChild(hint);
        var reset = document.createElement('button'); reset.type = 'button'; reset.className = 'appearance-reset'; reset.textContent = '恢復背景預設';
        reset.addEventListener('click', function () {
            background = { transparency: 0, blur: 0 }; saveBackground(); transparency.set(0); blur.set(0);
        });
        container.appendChild(reset);
    }

    function widgetById(id) {
        var W = global.NewtabWidgets;
        return W && W.getLayout().widgets.find(function (w) { return w.id === id; });
    }

    function openWidget(id) {
        var widget = widgetById(id);
        if (!widget) return;
        if (dialog) dialog.close();
        var opener = document.activeElement;
        dialog = document.createElement('dialog');
        dialog.className = 'appearance-dialog';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-labelledby', 'appearance-title');
        var header = document.createElement('header');
        var title = document.createElement('h2'); title.id = 'appearance-title'; title.textContent = '組件外觀';
        var close = document.createElement('button'); close.type = 'button'; close.className = 'appearance-close'; close.textContent = '×'; close.setAttribute('aria-label', '關閉外觀設定');
        header.append(title, close); dialog.appendChild(header);
        var hint = document.createElement('p'); hint.className = 'appearance-hint'; hint.textContent = '即時預覽，文字與圖示保持清晰。'; dialog.appendChild(hint);
        var fields = document.createElement('div'); fields.className = 'appearance-fields'; dialog.appendChild(fields);
        var values = resolved(widget);
        var searchUI = null;
        var weatherUI = null;
        function update(key, value) {
            var patch = {}; patch[key] = value; global.NewtabWidgets.setAppearance(id, patch);
            var current = widgetById(id);
            if (searchUI && current) applySearchButton(searchUI.preview, resolved(current));
            if (weatherUI && current) weatherUI.paint(resolved(current));
        }
        var controls = [
            control(fields, '組件背景透明度', (1 - values.alpha) * 100, function (v) { update('alpha', (100 - v) / 100); }),
            control(fields, '組件背景模糊', values.blur / .4, function (v) { update('blur', v * .4); }),
            control(fields, '邊框濃度', values.border * 100, function (v) { update('border', v / 100); }),
            control(fields, '陰影濃度', values.shadow * 100, function (v) { update('shadow', v / 100); }),
            control(fields, '圓角', values.radius, function (v) { update('radius', v); }, 36, 'px')
        ];
        // The character keeps its circular aperture; a rectangle-radius control
        // would promise a change that its artwork intentionally does not use.
        if (widget.type === 'companion') controls[4].element.remove();
        var imageControl = values.bgDataUrl ? control(fields, '組件圖片透明度', (1 - values.bgAlpha) * 100, function (v) { update('bgAlpha', (100 - v) / 100); }) : null;
        var tintRow = document.createElement('label'); tintRow.className = 'appearance-tint'; tintRow.textContent = '背景色';
        var tint = document.createElement('input'); tint.type = 'color'; tint.value = values.tint; tint.setAttribute('aria-label', '組件背景色');
        tint.addEventListener('input', function () { update('tint', tint.value); });
        tintRow.appendChild(tint); fields.appendChild(tintRow);
        var textRow = document.createElement('label'); textRow.className = 'appearance-tint'; textRow.textContent = '文字顏色';
        var textColor = document.createElement('select'); textColor.setAttribute('aria-label', '組件文字顏色');
        textColor.innerHTML = '<option value="dark">深色</option><option value="light">淺色</option>';
        textColor.value = values.text;
        textColor.addEventListener('change', function () { update('text', textColor.value); });
        textRow.appendChild(textColor); fields.appendChild(textRow);
        if (widget.type === 'search') {
            var searchSection = document.createElement('section'); searchSection.className = 'appearance-search-section';
            var searchTitle = document.createElement('h3'); searchTitle.id = 'appearance-search-title-' + (++serial); searchTitle.textContent = '搜尋送出按鈕';
            searchSection.setAttribute('aria-labelledby', searchTitle.id); searchSection.appendChild(searchTitle);
            var preview = document.createElement('div'); preview.className = 'appearance-search-preview'; preview.inert = true; preview.setAttribute('aria-hidden', 'true');
            var previewLabel = document.createElement('span'); previewLabel.className = 'appearance-search-preview-label'; previewLabel.textContent = '按鈕預覽';
            var previewButton = document.createElement('span'); previewButton.className = 'appearance-search-preview-button';
            previewButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4.5 10 15-5.5L14 19.5l-3-6.5-6.5-3Z"/><path d="m11 13 8.5-8.5"/></svg>';
            preview.append(previewLabel, previewButton); searchSection.appendChild(preview);
            function buttonColor(label, value, key) {
                var row = document.createElement('label'); row.className = 'appearance-tint'; row.textContent = label;
                var input = document.createElement('input'); input.type = 'color'; input.value = value; input.setAttribute('aria-label', label);
                input.addEventListener('input', function () { update(key, input.value); });
                row.appendChild(input); searchSection.appendChild(row); return input;
            }
            var buttonTint = buttonColor('按鈕背景色', values.searchButtonTint, 'searchButtonTint');
            var buttonAlpha = control(searchSection, '按鈕背景透明度', (1 - values.searchButtonAlpha) * 100, function (v) { update('searchButtonAlpha', (100 - v) / 100); });
            var buttonIcon = buttonColor('按鈕圖示顏色', values.searchButtonIcon, 'searchButtonIcon');
            var buttonRadius = control(searchSection, '按鈕圓角', values.searchButtonRadius, function (v) { update('searchButtonRadius', v); }, 22, 'px');
            var buttonReset = document.createElement('button'); buttonReset.type = 'button'; buttonReset.className = 'appearance-reset appearance-search-reset'; buttonReset.textContent = '恢復按鈕預設';
            searchUI = { preview: preview, set: function (value) {
                buttonTint.value = value.searchButtonTint; buttonIcon.value = value.searchButtonIcon;
                buttonAlpha.set((1 - value.searchButtonAlpha) * 100); buttonRadius.set(value.searchButtonRadius);
                applySearchButton(preview, value);
            } };
            buttonReset.addEventListener('click', function () {
                var buttonValues = searchButtonDefaults(); global.NewtabWidgets.setAppearance(id, buttonValues); searchUI.set(buttonValues);
            });
            searchSection.appendChild(buttonReset); fields.insertBefore(searchSection, fields.firstChild);
            searchUI.set(values);
        }
        if (widget.type === 'weather') {
            var weatherSection = document.createElement('section'); weatherSection.className = 'appearance-weather-section';
            var weatherTitle = document.createElement('h3'); weatherTitle.id = 'appearance-weather-title-' + (++serial); weatherTitle.textContent = '天氣操作按鈕';
            weatherSection.setAttribute('aria-labelledby', weatherTitle.id); weatherSection.appendChild(weatherTitle);
            var weatherPreview = document.createElement('div'); weatherPreview.className = 'appearance-weather-preview'; weatherPreview.inert = true; weatherPreview.setAttribute('aria-hidden', 'true');
            var weatherLabel = document.createElement('span'); weatherLabel.textContent = '按鈕預覽'; weatherPreview.appendChild(weatherLabel);
            var weatherIcons = document.createElement('span'); weatherIcons.className = 'appearance-weather-icons';
            var weatherWidget = document.querySelector('.widget[data-id="' + id + '"]');
            ['weather-locate', 'weather-retry'].forEach(function (cls) {
                var sample = document.createElement('span'); sample.className = 'appearance-weather-preview-button';
                var icon = weatherWidget && weatherWidget.querySelector('.' + cls + ' svg');
                if (icon) sample.appendChild(icon.cloneNode(true));
                weatherIcons.appendChild(sample);
            });
            weatherPreview.appendChild(weatherIcons); weatherSection.appendChild(weatherPreview);
            var modeRow = document.createElement('label'); modeRow.className = 'appearance-tint appearance-weather-mode'; modeRow.textContent = '按鈕外觀';
            var mode = document.createElement('select'); mode.setAttribute('aria-label', '按鈕外觀');
            mode.innerHTML = '<option value="inherit">跟隨組件外觀</option><option value="custom">自訂按鈕外觀</option>';
            mode.addEventListener('change', function () { update('weatherButtonMode', mode.value); });
            modeRow.appendChild(mode); weatherSection.appendChild(modeRow);
            var customFields = document.createElement('div'); customFields.className = 'appearance-weather-custom'; weatherSection.appendChild(customFields);
            function weatherColor(label, key) {
                var row = document.createElement('label'); row.className = 'appearance-tint'; row.textContent = label;
                var input = document.createElement('input'); input.type = 'color'; input.setAttribute('aria-label', label);
                input.addEventListener('input', function () { update(key, input.value); });
                row.appendChild(input); customFields.appendChild(row); return input;
            }
            var weatherTint = weatherColor('按鈕背景色', 'weatherButtonTint');
            var weatherAlpha = control(customFields, '按鈕背景透明度', (1 - values.weatherButtonAlpha) * 100, function (v) { update('weatherButtonAlpha', (100 - v) / 100); });
            var weatherInk = weatherColor('按鈕圖示顏色', 'weatherButtonText');
            var weatherRadius = control(customFields, '按鈕圓角', values.weatherButtonRadius, function (v) { update('weatherButtonRadius', v); }, 22, 'px');
            var weatherReset = document.createElement('button'); weatherReset.type = 'button'; weatherReset.className = 'appearance-reset'; weatherReset.textContent = '恢復按鈕預設';
            weatherUI = { paint: function (value) {
                mode.value = value.weatherButtonMode; customFields.hidden = value.weatherButtonMode !== 'custom';
                applySurface(weatherPreview, value); applyWeatherButtons(weatherPreview, value);
            }, set: function (value) {
                weatherTint.value = value.weatherButtonTint; weatherInk.value = value.weatherButtonText;
                weatherAlpha.set((1 - value.weatherButtonAlpha) * 100); weatherRadius.set(value.weatherButtonRadius); this.paint(value);
            } };
            weatherReset.addEventListener('click', function () {
                global.NewtabWidgets.setAppearance(id, weatherButtonDefaults()); weatherUI.set(resolved(widgetById(id)));
            });
            weatherSection.appendChild(weatherReset); fields.insertBefore(weatherSection, fields.firstChild); weatherUI.set(values);
        }
        var animation = null;
        if (widget.type === 'companion' && global.NewtabWidgets.setCompanionOptions) {
            var animationRow = document.createElement('label'); animationRow.className = 'appearance-tint'; animationRow.textContent = '角色動畫';
            animation = document.createElement('select');
            animation.innerHTML = '<option value="auto">跟隨系統偏好</option><option value="on">開啟動畫</option><option value="off">靜態角色</option>';
            var options = widget.options || {};
            animation.value = options.animationMode || (options.animation === true ? 'on' : options.animation === false ? 'off' : 'auto');
            animation.setAttribute('aria-label', '角色動畫');
            animation.addEventListener('change', function () { global.NewtabWidgets.setCompanionOptions(id, { animationMode: animation.value }); });
            animationRow.appendChild(animation); fields.appendChild(animationRow);
            var motionHint = document.createElement('p'); motionHint.className = 'appearance-hint';
            motionHint.textContent = '角色會眨眼與輕輕呼吸。選擇「開啟動畫」可在系統減少動態效果時仍播放；拖移、調整外觀或離開分頁時暫停。';
            var chatHint = document.createElement('p'); chatHint.className = 'appearance-hint';
            chatHint.textContent = '點選角色即可在這裡與 GPT 對話，首次使用請在對話面板登入 ChatGPT。';
            fields.append(motionHint, chatHint);
        }
        var actions = document.createElement('footer');
        var reset = document.createElement('button'); reset.type = 'button'; reset.className = 'appearance-reset'; reset.textContent = '恢復預設';
        var done = document.createElement('button'); done.type = 'button'; done.className = 'appearance-done'; done.textContent = '完成';
        actions.append(reset, done); dialog.appendChild(actions);
        var panel = dialog;
        function finish() { panel.close(); }
        close.addEventListener('click', finish);
        done.addEventListener('click', finish);
        panel.addEventListener('close', function () {
            panel.remove();
            if (dialog === panel) {
                dialog = null;
                document.dispatchEvent(new CustomEvent('newtab:appearance-dialog', { detail: { open: false } }));
                if (opener && opener.isConnected) opener.focus({ preventScroll: true });
            }
        });
        panel.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(); }
        });
        panel.addEventListener('click', function (event) {
            if (event.target !== panel) return;
            var rect = panel.getBoundingClientRect();
            if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) finish();
        });
        reset.addEventListener('click', function () {
            values = defaults(widget.type); global.NewtabWidgets.setAppearance(id, values);
            [100 - values.alpha * 100, values.blur / .4, values.border * 100, values.shadow * 100, values.radius].forEach(function (v, i) { controls[i].set(v); });
            tint.value = values.tint;
            textColor.value = values.text;
            if (searchUI) searchUI.set(values);
            if (weatherUI) weatherUI.set(values);
            if (imageControl) { imageControl.element.remove(); imageControl = null; }
            if (animation) {
                animation.value = 'auto';
                global.NewtabWidgets.setCompanionOptions(id, { animationMode: 'auto' });
            }
        });
        document.body.appendChild(panel); panel.showModal();
        document.dispatchEvent(new CustomEvent('newtab:appearance-dialog', { detail: { open: true } }));
        close.focus();
    }

    restoreBackground();
    global.NewtabAppearance = { normalizeWidget: normalizeWidget, defaults: defaults, applyWidget: applyWidget, mountBackground: mountBackground, openWidget: openWidget };
})(typeof window !== 'undefined' ? window : this);
