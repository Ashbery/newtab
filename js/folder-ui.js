/**
 * NewtabFolderUI — open/close folder overlay with rename + FLIP-from-tile
 */
(function (global) {
    'use strict';

    var overlay = null;
    var currentFolderId = null;
    var pendingName = '';
    var closeTimer = null;
    var transitionId = 0;
    var previousFocus = null;

    function ensure() {
        if (overlay) return overlay;
        overlay = document.createElement('div');
        overlay.className = 'folder-overlay';
        overlay.innerHTML =
            '<div class="folder-overlay-backdrop" data-close="1"></div>' +
            '<div class="folder-overlay-panel" role="dialog" aria-modal="true" aria-label="資料夾" tabindex="-1">' +
            '<div class="folder-overlay-header">' +
            '<input type="text" class="folder-name-input" maxlength="24" aria-label="資料夾名稱" />' +
            '<button type="button" class="folder-close" data-close="1" aria-label="關閉資料夾">×</button>' +
            '</div>' +
            '<div class="folder-overlay-grid"></div>' +
            '</div>';
        document.body.appendChild(overlay);

        overlay.addEventListener('click', function (e) {
            if (e.target.getAttribute('data-close') === '1') close();
        });

        var input = overlay.querySelector('.folder-name-input');
        input.addEventListener('keydown', function (e) {
            if (e.isComposing || e.keyCode === 229) return;
            if (e.key === 'Enter') {
                e.preventDefault();
                commitName();
                input.blur();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                input.value = pendingName;
                input.blur();
                close();
            }
        });
        input.addEventListener('blur', function () {
            commitName();
        });
        overlay.addEventListener('keydown', function (e) {
            if (e.key !== 'Tab') return;
            var items = overlay.querySelectorAll('input, button, a[href]');
            if (!items.length) return;
            var first = items[0];
            var last = items[items.length - 1];
            if (e.shiftKey && (document.activeElement === first || document.activeElement === overlay.querySelector('.folder-overlay-panel'))) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        });

        return overlay;
    }

    function commitName() {
        if (!currentFolderId || !overlay) return;
        var input = overlay.querySelector('.folder-name-input');
        if (!input) return;
        if (input.value === pendingName) return;
        var W = global.NewtabWidgets;
        if (!W || !W.renameFolder) return;
        var res = W.renameFolder(currentFolderId, input.value);
        if (res && res.ok) {
            pendingName = res.name;
            input.value = res.name;
        }
    }

    function setFlipFromTile(panel, folderId) {
        if (!panel) return;
        var tile = document.querySelector('.widget[data-id="' + folderId + '"]');
        var vw = window.innerWidth || 0;
        var vh = window.innerHeight || 0;
        var cx = vw / 2;
        var cy = vh / 2;
        var fromX = 0;
        var fromY = 0;
        if (tile) {
            var tr = tile.getBoundingClientRect();
            var tcx = tr.left + tr.width / 2;
            var tcy = tr.top + tr.height / 2;
            fromX = tcx - cx;
            fromY = tcy - cy;
        }
        panel.style.setProperty('--folder-from-x', fromX + 'px');
        panel.style.setProperty('--folder-from-y', fromY + 'px');
        panel.style.setProperty('--folder-from-scale', '0.72');
    }

    function open(folderId) {
        var W = global.NewtabWidgets;
        var Apps = global.NewtabApps;
        if (!W || !Apps) {
            console.warn('[FolderUI] NewtabWidgets/NewtabApps missing');
            return;
        }
        var layout = W.getLayout();
        if (!layout) {
            console.warn('[FolderUI] no layout');
            return;
        }
        var folder = (layout.widgets || []).filter(function (w) {
            return w.id === folderId && w.type === 'folder';
        })[0];
        if (!folder) {
            console.warn('[FolderUI] folder not found in layout:', folderId);
            return;
        }

        var el = ensure();
        // A reversed dismissal is the same view. Retain its contents and let
        // the panel's existing transition return from its rendered position.
        if (currentFolderId === folderId && closeTimer) {
            clearTimeout(closeTimer);
            closeTimer = null;
            transitionId++;
            el.classList.add('is-open', 'is-visible');
            el.querySelector('.folder-overlay-panel').focus({ preventScroll: true });
            return;
        }
        if (currentFolderId) commitName();
        else previousFocus = document.activeElement;
        clearTimeout(closeTimer);
        closeTimer = null;
        var token = ++transitionId;
        currentFolderId = folderId;
        var panel = el.querySelector('.folder-overlay-panel');
        var input = el.querySelector('.folder-name-input');
        var grid = el.querySelector('.folder-overlay-grid');
        var name = (folder.options && folder.options.name) || '資料夾';
        pendingName = name;
        input.value = name;
        grid.innerHTML = '';

        var children = (folder.options && Array.isArray(folder.options.children)) ? folder.options.children : [];
        children.forEach(function (c) {
            if (!c || !c.appId) return;
            var meta = Apps.get(c.appId);
            if (!meta) return;
            var a = document.createElement('a');
            a.className = 'folder-open-item';
            a.href = meta.url;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            var src = Apps.iconUrl(c.appId) || '';
            var icon = document.createElement('span');
            icon.className = 'app-tile-icon';
            if (src) {
                var img = document.createElement('img');
                img.src = src;
                img.alt = '';
                img.width = 44;
                img.height = 44;
                icon.appendChild(img);
            }
            var label = document.createElement('span');
            label.className = 'app-tile-label';
            label.textContent = meta.label || '';
            a.appendChild(icon);
            a.appendChild(label);
            grid.appendChild(a);
        });

        setFlipFromTile(panel, folderId);
        el.setAttribute('data-folder-id', folderId);
        el.classList.add('is-open');
        el.classList.remove('is-visible');
        // force reflow so transition runs from from-*
        void panel.offsetWidth;
        requestAnimationFrame(function () {
            if (token !== transitionId) return;
            el.classList.add('is-visible');
            panel.focus();
        });
    }

    function close() {
        if (!overlay || !currentFolderId || closeTimer) return;
        commitName();
        var token = ++transitionId;
        var folderId = currentFolderId;
        overlay.classList.remove('is-visible');
        closeTimer = setTimeout(function () {
            if (token !== transitionId) return;
            closeTimer = null;
            if (overlay) {
                overlay.classList.remove('is-open');
                overlay.removeAttribute('data-folder-id');
            }
            currentFolderId = null;
            var focus = previousFocus;
            if (!focus || !focus.isConnected) {
                var buttons = document.querySelectorAll('.folder-tile');
                for (var i = 0; i < buttons.length; i++) {
                    if (buttons[i].getAttribute('data-folder-id') === folderId) { focus = buttons[i]; break; }
                }
            }
            if (focus && focus.isConnected && typeof focus.focus === 'function') focus.focus();
            previousFocus = null;
        }, global.NewtabMotion && global.NewtabMotion.reduced() ? 0 : 180);
    }

    function isOpen() {
        return !!(overlay && overlay.classList.contains('is-open'));
    }

    function currentId() {
        return currentFolderId;
    }

    document.addEventListener('keydown', function (e) {
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === 'Escape' && isOpen()) {
            var input = overlay && overlay.querySelector('.folder-name-input');
            if (input && document.activeElement === input) return;
            e.preventDefault();
            close();
        }
    });

    global.NewtabFolderUI = {
        open: open,
        close: close,
        isOpen: isOpen,
        currentId: currentId
    };
})(typeof window !== 'undefined' ? window : this);
