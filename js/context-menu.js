/**
 * NewtabContextMenu — cascade custom menu while arranging.
 */
(function (global) {
    'use strict';

    var menuEl = null;
    var subEl = null;
    var bound = false;
    var openSubTimer = null;
    var closeSubTimer = null;
    var returnFocus = null;
    var subParent = null;

    function ensureMenu() {
        if (menuEl) return menuEl;
        menuEl = document.createElement('div');
        menuEl.className = 'ctx-menu';
        menuEl.setAttribute('role', 'menu');
        menuEl.setAttribute('aria-label', '組件操作');
        menuEl.hidden = true;
        document.body.appendChild(menuEl);
        return menuEl;
    }

    function ensureSub() {
        if (subEl) return subEl;
        subEl = document.createElement('div');
        subEl.className = 'ctx-sub';
        subEl.setAttribute('role', 'menu');
        subEl.hidden = true;
        document.body.appendChild(subEl);
        return subEl;
    }

    function closeSub() {
        if (closeSubTimer) {
            clearTimeout(closeSubTimer);
            closeSubTimer = null;
        }
        if (subEl) {
            subEl.classList.remove('is-open', 'is-open-left');
            subEl.hidden = true;
            subEl.innerHTML = '';
        }
        if (menuEl) {
            $$('.ctx-item.has-sub', menuEl).forEach(function (b) {
                b.classList.remove('is-open');
                b.setAttribute('aria-expanded', 'false');
            });
        }
    }

    function close(restoreFocus) {
        closeSub();
        if (menuEl) {
            menuEl.classList.remove('is-visible');
            menuEl.hidden = true;
            menuEl.innerHTML = '';
        }
        if (restoreFocus && returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
        returnFocus = null;
    }

    function $$(sel, root) {
        return Array.prototype.slice.call((root || document).querySelectorAll(sel));
    }

    function isWhitelistedTarget(t) {
        if (!t || !t.closest) return false;
        return !!(
            t.closest('#side-rail') ||
            t.closest('#side-rail-tab') ||
            t.closest('#side-rail-hotzone') ||
            t.closest('.about-page-container') ||
            t.closest('.video-upload-container') ||
            t.closest('.ctx-menu') ||
            t.closest('.ctx-sub') ||
            t.closest('.bookmark-modal') ||
            t.closest('.icon-crop-modal') ||
            t.closest('.custom-app-modal') ||
            t.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]')
        );
    }

    function renderItems(container, items, closeOnAction) {
        container.innerHTML = '';
        items.forEach(function (item) {
            if (item.sep) {
                var hr = document.createElement('div');
                hr.className = 'ctx-sep';
                hr.setAttribute('role', 'separator');
                container.appendChild(hr);
                return;
            }
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.setAttribute('aria-label', item.label);
            btn.setAttribute('role', Object.prototype.hasOwnProperty.call(item, 'checked') ? 'menuitemradio' : 'menuitem');
            if (Object.prototype.hasOwnProperty.call(item, 'checked')) btn.setAttribute('aria-checked', item.checked ? 'true' : 'false');
            btn.tabIndex = -1;
            btn.className = 'ctx-item' +
                (item.danger ? ' is-danger' : '') +
                (item.children && item.children.length ? ' has-sub' : '') +
                (item.checked ? ' is-checked' : '');
            if (item.children && item.children.length) {
                var label = document.createElement('span');
                label.textContent = item.label;
                var chevron = document.createElement('span');
                chevron.className = 'ctx-chevron';
                chevron.textContent = '›';
                chevron.setAttribute('aria-hidden', 'true');
                btn.appendChild(label);
                btn.appendChild(chevron);
                btn.setAttribute('aria-haspopup', 'menu');
                btn.setAttribute('aria-expanded', 'false');
                btn._children = item.children;
            } else {
                btn.textContent = item.label;
            }
            if (item.disabled) {
                btn.disabled = true;
            } else if (item.children && item.children.length) {
                btn.addEventListener('mouseenter', function () {
                    openSubFor(btn, item.children);
                });
                btn.addEventListener('click', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    openSubFor(btn, item.children);
                    focusFirst(subEl);
                });
            } else {
                btn.addEventListener('click', function () {
                    var opener = returnFocus;
                    if (closeOnAction !== false) close(true);
                    if (item.action) item.action();
                    // Removal can delete the settings button that just regained
                    // focus. Keep keyboard users on a visible editing control.
                    if (opener && opener.classList.contains('widget-options')) requestAnimationFrame(function () {
                        var active = document.activeElement;
                        var openerGone = !opener.isConnected || !opener.getClientRects().length || !!opener.closest('[hidden], [inert], [data-active="false"]');
                        if (active !== document.body && !(active === opener && openerGone)) return;
                        var next = document.getElementById('arrange-done-bar');
                        if (!next || !next.getClientRects().length) next = document.getElementById('side-rail-tab');
                        if (next) next.focus({ preventScroll: true });
                    });
                });
                if (container === menuEl) btn.addEventListener('mouseenter', closeSub);
            }
            container.appendChild(btn);
        });
    }

    function focusFirst(container) {
        var first = container && container.querySelector('.ctx-item:not(:disabled)');
        if (first) first.focus({ preventScroll: true });
    }

    function visibleViewport() {
        var view = global.visualViewport;
        var left = view ? view.offsetLeft : 0;
        var top = view ? view.offsetTop : 0;
        var width = view ? view.width : global.innerWidth;
        var height = view ? view.height : global.innerHeight;
        return { left: left, top: top, right: left + width, bottom: top + height, width: width, height: height };
    }

    function openSubFor(parentBtn, children) {
        if (closeSubTimer) {
            clearTimeout(closeSubTimer);
            closeSubTimer = null;
        }
        var sub = ensureSub();
        $$('.ctx-item.has-sub', menuEl).forEach(function (b) {
            b.classList.remove('is-open');
        });
        parentBtn.classList.add('is-open');
        parentBtn.setAttribute('aria-expanded', 'true');
        subParent = parentBtn;
        renderItems(sub, children, true);
        var pr = parentBtn.getBoundingClientRect();
        var pad = 8;
        var view = visibleViewport();
        sub.style.maxWidth = Math.max(0, view.width - pad * 2) + 'px';
        sub.style.maxHeight = Math.max(0, view.height - pad * 2) + 'px';
        sub.style.left = '0px';
        sub.style.top = '0px';
        sub.hidden = false;
        sub.classList.add('is-open');
        var sr = { width: sub.offsetWidth, height: sub.offsetHeight };
        var left = pr.right + 4;
        var openLeft = false;
        if (left + sr.width > view.right - pad) {
            left = pr.left - sr.width - 4;
            openLeft = true;
        }
        left = Math.max(view.left + pad, Math.min(left, view.right - sr.width - pad));
        var top = pr.top;
        top = Math.max(view.top + pad, Math.min(top, view.bottom - sr.height - pad));
        sub.style.left = left + 'px';
        sub.style.top = top + 'px';
        sub.classList.toggle('is-open-left', openLeft);
    }

    function openAt(x, y, items) {
        var el = ensureMenu();
        returnFocus = document.activeElement;
        closeSub();
        el.classList.remove('is-visible');
        renderItems(el, items, true);
        el.hidden = false;
        var pad = 8;
        var view = visibleViewport();
        el.style.maxWidth = Math.max(0, view.width - pad * 2) + 'px';
        el.style.maxHeight = Math.max(0, view.height - pad * 2) + 'px';
        el.style.left = '0px';
        el.style.top = '0px';
        // Position the final layout box, not the scaled entrance animation.
        var r = { width: el.offsetWidth, height: el.offsetHeight };
        var left = x;
        var top = y;
        left = Math.max(view.left + pad, Math.min(left, view.right - r.width - pad));
        top = Math.max(view.top + pad, Math.min(top, view.bottom - r.height - pad));
        el.style.left = left + 'px';
        el.style.top = top + 'px';

        var originX = x < window.innerWidth / 2 ? 'left' : 'right';
        var originY = y < window.innerHeight / 2 ? 'top' : 'bottom';
        el.style.setProperty('--ctx-origin', originX + ' ' + originY);

        requestAnimationFrame(function () {
            if (el.hidden) return;
            el.classList.add('is-visible');
            focusFirst(el);
        });
    }

    function widgetMenuItems(widget) {
        var id = widget.getAttribute('data-id');
        var type = widget.getAttribute('data-type');
        var W = global.NewtabWidgets;
        var layout = W.getLayout();
        var w = (layout.widgets || []).filter(function (x) { return x.id === id; })[0];
        var items = [];

        if (W.isArranging && !W.isArranging()) {
            items.push({
                label: '編排主畫面',
                action: function () { if (W.enterArrange) W.enterArrange(); }
            });
            items.push({ sep: true });
        }

        if (w) {
            items.push({
                label: w.pinned ? '解除鎖定位置' : '鎖定位置',
                action: function () { W.togglePin(id); }
            });
            if (!w.pinned) {
                items.push({
                    label: '移到最上層',
                    action: function () {
                        if (W.bringToFront) W.bringToFront(id);
                    }
                });
            }
        }

        if (type === 'app') {
            var curSize = (w && w.options && w.options.size) || 'm';
            items.push({ sep: true });
            items.push({
                label: '大小',
                children: [
                    {
                        label: '精簡',
                        checked: curSize === 's',
                        action: function () { if (W.setAppSize) W.setAppSize(id, 's'); }
                    },
                    {
                        label: '標準',
                        checked: curSize === 'm',
                        action: function () { if (W.setAppSize) W.setAppSize(id, 'm'); }
                    },
                    {
                        label: '醒目',
                        checked: curSize === 'l',
                        action: function () { if (W.setAppSize) W.setAppSize(id, 'l'); }
                    }
                ]
            });
        }

        if (type === 'folder') {
            var curGrid = (w && w.options && w.options.grid) || 2;
            items.push({ sep: true });
            /* H5: left-click opens folder — no redundant context "開啟資料夾" */
            items.push({
                label: '資料夾設定',
                children: [
                    {
                        label: '主畫面顯示',
                        children: [
                            {
                                label: '2×2',
                                checked: curGrid === 2,
                                action: function () { if (W.setFolderGrid) W.setFolderGrid(id, 2); }
                            },
                            {
                                label: '3×3',
                                checked: curGrid === 3,
                                action: function () { if (W.setFolderGrid) W.setFolderGrid(id, 3); }
                            },
                            {
                                label: '4×4',
                                checked: curGrid === 4,
                                action: function () { if (W.setFolderGrid) W.setFolderGrid(id, 4); }
                            }
                        ]
                    }
                ]
            });
            // Flatten one level for simpler cascade: 資料夾設定 › 2×2/3×3/4×4
            items[items.length - 1] = {
                label: '主畫面顯示',
                children: [
                    {
                        label: '2×2',
                        checked: curGrid === 2,
                        action: function () { if (W.setFolderGrid) W.setFolderGrid(id, 2); }
                    },
                    {
                        label: '3×3',
                        checked: curGrid === 3,
                        action: function () { if (W.setFolderGrid) W.setFolderGrid(id, 3); }
                    },
                    {
                        label: '4×4',
                        checked: curGrid === 4,
                        action: function () { if (W.setFolderGrid) W.setFolderGrid(id, 4); }
                    }
                ]
            };
            items.push({
                label: '解散資料夾',
                action: function () { W.dissolveFolder(id); }
            });
        }

        if (type === 'clock') {
            items.push({ sep: true });
            var is12 = !(w && w.options && w.options.hour12 === false);
            items.push({
                label: '時間制',
                children: [
                    {
                        label: '12 小時制',
                        checked: is12,
                        action: function () {
                            if (W.setClockHour12) W.setClockHour12(true);
                        }
                    },
                    {
                        label: '24 小時制',
                        checked: !is12,
                        action: function () {
                            if (W.setClockHour12) W.setClockHour12(false);
                        }
                    }
                ]
            });
        }

        if (type === 'weather') {
            items.push({ sep: true });
            items.push({
                label: '重新定位',
                action: function () {
                    if (W.refreshWeather) W.refreshWeather(id);
                }
            });
        }

        if (type === 'bookmarks' || type === 'todo' || type === 'countdown' || type === 'notes') {
            var curPreset = (w && w.options && w.options.appearance && w.options.appearance.preset) || 'glass';
            items.push({ sep: true });
            items.push({
                label: '外觀',
                children: [
                    {
                        label: '玻璃',
                        checked: curPreset === 'glass',
                        action: function () {
                            if (W.setAppearance) W.setAppearance(id, { preset: 'glass' });
                        }
                    },
                    {
                        label: '實色',
                        checked: curPreset === 'solid',
                        action: function () {
                            if (W.setAppearance) W.setAppearance(id, { preset: 'solid' });
                        }
                    },
                    {
                        label: '透明',
                        checked: curPreset === 'clear',
                        action: function () {
                            if (W.setAppearance) W.setAppearance(id, { preset: 'clear' });
                        }
                    }
                ]
            });
        }

        items.push({ sep: true });
        items.push({
            label: '從主畫面移除',
            danger: true,
            action: function () { W.removeById(id); }
        });
        return items;
    }

    function folderOverlayMenuItems(folderId) {
        var W = global.NewtabWidgets;
        var layout = W && W.getLayout();
        var w = layout && (layout.widgets || []).filter(function (x) {
            return x.id === folderId && x.type === 'folder';
        })[0];
        var curGrid = (w && w.options && w.options.grid) || 2;
        return [
            {
                label: '主畫面顯示',
                children: [
                    {
                        label: '2×2',
                        checked: curGrid === 2,
                        action: function () { if (W.setFolderGrid) W.setFolderGrid(folderId, 2); }
                    },
                    {
                        label: '3×3',
                        checked: curGrid === 3,
                        action: function () { if (W.setFolderGrid) W.setFolderGrid(folderId, 3); }
                    },
                    {
                        label: '4×4',
                        checked: curGrid === 4,
                        action: function () { if (W.setFolderGrid) W.setFolderGrid(folderId, 4); }
                    }
                ]
            },
            {
                label: '重新命名',
                action: function () {
                    var input = document.querySelector('.folder-name-input');
                    if (input) {
                        try { input.focus(); input.select(); } catch (e) { /* */ }
                    }
                }
            }
            // NO remove folder in overlay
        ];
    }

    function onContextMenu(e) {
        var W = global.NewtabWidgets;
        if (!W) return;

        if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]')) {
            close();
            return;
        }

        // Folder overlay: custom menu without remove
        var overlay = e.target.closest && e.target.closest('.folder-overlay.is-open');
        if (overlay) {
            e.preventDefault();
            e.stopPropagation();
            var fid = overlay.getAttribute('data-folder-id') ||
                (global.NewtabFolderUI && NewtabFolderUI.currentId && NewtabFolderUI.currentId());
            // try from open state
            if (!fid && overlay._folderId) fid = overlay._folderId;
            var nameInput = overlay.querySelector('.folder-name-input');
            // get id from host via first folder in layout if needed
            if (!fid) {
                var layout = W.getLayout();
                var folders = (layout.widgets || []).filter(function (x) { return x.type === 'folder'; });
                if (folders.length === 1) fid = folders[0].id;
            }
            if (fid) {
                openAt(e.clientX, e.clientY, folderOverlayMenuItems(fid));
            }
            return;
        }

        if (isWhitelistedTarget(e.target)) {
            close();
            return;
        }

        var widget = e.target.closest && e.target.closest('.widget');
        if (!widget) {
            // Keep the browser's normal context menu on unrelated elements.
            // The home canvas gets useful page-level actions in either mode.
            var homeSurface = e.target === document.body || e.target === document.documentElement ||
                (e.target.closest && e.target.closest('#widget-canvas, #video-background, #image-background'));
            if (!homeSurface) return;
            e.preventDefault();
            e.stopPropagation();
            if (W.isArranging && W.isArranging()) {
                openAt(e.clientX, e.clientY, [{
                    label: '結束編排',
                    action: function () { W.exitArrange(); }
                }]);
            } else {
                openAt(e.clientX, e.clientY, [
                    {
                        label: '編排主畫面',
                        action: function () { if (W.enterArrange) W.enterArrange(); }
                    },
                    {
                        label: '開啟個人化選單',
                        action: function () {
                            if (global.NewtabSideRail && NewtabSideRail.open) NewtabSideRail.open();
                        }
                    }
                ]);
            }
            return;
        }

        e.preventDefault();
        e.stopPropagation();
        openAt(e.clientX, e.clientY, widgetMenuItems(widget));
    }

    function syncWidgetButtons() {
        $$('#widget-canvas .widget[data-active="true"]').forEach(function (widget) {
            if (widget.querySelector('.widget-options')) return;
            var type = widget.getAttribute('data-type');
            var meta = global.NewtabCatalog && NewtabCatalog.get(type);
            var label = meta ? meta.label : type === 'folder' ? '資料夾' : '應用';
            var button = document.createElement('button');
            button.type = 'button';
            button.className = 'widget-options';
            button.setAttribute('aria-label', label + '設定');
            button.setAttribute('aria-haspopup', 'menu');
            button.title = label + '設定';
            button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
            button.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                var rect = button.getBoundingClientRect();
                openAt(rect.right, rect.bottom + 6, widgetMenuItems(widget));
            });
            widget.appendChild(button);
        });
    }

    function init() {
        if (bound) return;
        bound = true;
        syncWidgetButtons();
        document.addEventListener('newtab:layout-change', syncWidgetButtons);
        document.addEventListener('contextmenu', onContextMenu);
        document.addEventListener('pointerdown', function (e) {
            if (!menuEl || menuEl.hidden) return;
            if (e.target.closest && (e.target.closest('.ctx-menu') || e.target.closest('.ctx-sub'))) return;
            close();
        });
        document.addEventListener('keydown', function (e) {
            if (!menuEl || menuEl.hidden) return;
            var current = document.activeElement;
            var container = current && current.closest && current.closest('.ctx-sub, .ctx-menu');
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopImmediatePropagation();
                close(true);
            } else if (e.key === 'Tab') {
                close(true);
            } else if (container && ['ArrowDown', 'ArrowUp', 'Home', 'End'].indexOf(e.key) >= 0) {
                e.preventDefault();
                var items = $$('.ctx-item:not(:disabled)', container);
                var index = items.indexOf(current);
                if (e.key === 'Home') index = 0;
                else if (e.key === 'End') index = items.length - 1;
                else index = (index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
                if (items[index]) items[index].focus();
                if (container === menuEl) closeSub();
            } else if (e.key === 'ArrowRight' && current && current._children) {
                e.preventDefault();
                openSubFor(current, current._children);
                focusFirst(subEl);
            } else if (e.key === 'ArrowLeft' && container === subEl) {
                e.preventDefault();
                closeSub();
                if (subParent) subParent.focus();
            }
        }, true);
        window.addEventListener('resize', function () { close(); });
    }

    global.NewtabContextMenu = {
        init: init,
        close: close,
        openAt: openAt,
        openItems: openAt
    };
})(typeof window !== 'undefined' ? window : this);
