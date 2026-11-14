/**
 * NewtabSideRail — M3 tabs: 組件 | 應用 | 個人化 | 關於
 * Long-press drag from catalog to home; right-click on home to move/pin/remove.
 * Tap or use the keyboard to add; long-press remains available for precise placement.
 */
(function (global) {
    'use strict';

    var LONG_PRESS_MS = 380;
    var MOVE_CANCEL_PX = 8;
    var HIDE_DELAY_MS = 450;

    var state = {
        open: false,
        tab: 'personalize',
        bound: false,
        placeDrag: null,
        longPressTimer: null,
        longPressStart: null,
        suppressClickUntil: 0,
        hideTimer: null
    };

    function $(sel, root) {
        return (root || document).querySelector(sel);
    }

    function $$(sel, root) {
        return Array.prototype.slice.call((root || document).querySelectorAll(sel));
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
        });
    }

    function keepFocusIn(panel, e) {
        if (e.key !== 'Tab') return;
        var controls = $$('button:not(:disabled), input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]', panel)
            .filter(function (el) { return el.getClientRects().length && !el.closest('[inert]'); });
        if (!controls.length) return;
        var first = controls[0];
        var last = controls[controls.length - 1];
        if (e.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
            e.preventDefault();
            first.focus();
        }
    }

    /** Crop modal shell (Mode B UI). Mapping/logic rewritten by AP; shell may rebuild. */
    function ensureIconCropModal() {
        var modal = document.querySelector('.icon-crop-modal');
        var needShell = !modal || !modal.querySelector('.icon-crop-frame [data-h="nw"]') || !modal.querySelector('.icon-crop-toolbar');
        if (!modal) {
            modal = document.createElement('div');
            modal.className = 'icon-crop-modal';
            document.body.appendChild(modal);
        }
        if (needShell) {
            modal.innerHTML =
                '<button type="button" class="icon-crop-modal-backdrop" data-close="1" aria-label="關閉"></button>' +
                '<div class="icon-crop-modal-panel" role="dialog" aria-modal="true" aria-label="裁切圖標">' +
                '<h3>裁切圖標</h3>' +
                '<div class="icon-crop-stage">' +
                '<img class="icon-crop-img" alt="" draggable="false" />' +
                '<div class="icon-crop-dim" aria-hidden="true"></div>' +
                '<div class="icon-crop-frame">' +
                '<span class="h" data-h="nw" aria-hidden="true"></span>' +
                '<span class="h" data-h="ne" aria-hidden="true"></span>' +
                '<span class="h" data-h="sw" aria-hidden="true"></span>' +
                '<span class="h" data-h="se" aria-hidden="true"></span>' +
                '</div></div>' +
                '<div class="icon-crop-toolbar">' +
                '<button type="button" data-zoom-out aria-label="縮小">−</button>' +
                '<button type="button" data-zoom-in aria-label="放大">+</button>' +
                '<button type="button" data-reset aria-label="重置">重置</button>' +
                '<div class="icon-crop-preview"><img alt="" /><span class="gif-badge" hidden>GIF</span></div>' +
                '</div>' +
                '<p class="icon-crop-hint">拖圖片移動 · 滾輪/± 縮放 · 拖框選取 · 角點調大小</p>' +
                '<div class="icon-crop-modal-actions">' +
                '<button type="button" class="btn-ghost" data-cancel>取消</button>' +
                '<button type="button" class="btn-primary" data-confirm>使用</button></div></div>';
        }
        return modal;
    }

    /**
     * True crop mapping: frame in stage px → image display rect → natural → 64×64.
     * Preview and confirm MUST share this function.
     */
    function sampleCropToCanvas(img, stageW, stageH, imgLayout, frame) {
        var nw = img.naturalWidth;
        var nh = img.naturalHeight;
        if (!nw || !nh || !imgLayout || !frame || imgLayout.w <= 0 || imgLayout.h <= 0) return null;
        var relX = (frame.x - imgLayout.x) / imgLayout.w;
        var relY = (frame.y - imgLayout.y) / imgLayout.h;
        var relW = frame.size / imgLayout.w;
        var relH = frame.size / imgLayout.h;
        var sx = relX * nw;
        var sy = relY * nh;
        var sw = relW * nw;
        var sh = relH * nh;
        var side = Math.min(Math.abs(sw), Math.abs(sh));
        if (!(side > 0)) return null;
        var cx = sx + sw / 2;
        var cy = sy + sh / 2;
        sx = cx - side / 2;
        sy = cy - side / 2;
        sw = side;
        sh = side;
        if (sx < 0) { sw += sx; sx = 0; }
        if (sy < 0) { sh += sy; sy = 0; }
        if (sx + sw > nw) sw = nw - sx;
        if (sy + sh > nh) sh = nh - sy;
        side = Math.min(sw, sh);
        if (!(side > 1)) {
            side = Math.min(nw, nh);
            sx = Math.max(0, (nw - side) / 2);
            sy = Math.max(0, (nh - side) / 2);
        }
        sw = sh = Math.max(1, side);
        var canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        var ctx = canvas.getContext('2d');
        try {
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 64, 64);
        } catch (e) {
            return null;
        }
        var cropNorm = {
            nx: sx / nw,
            ny: sy / nh,
            nw: sw / nw,
            nh: sh / nh
        };
        var dataURL;
        try {
            dataURL = canvas.toDataURL('image/png');
            if (dataURL.length > 48000) dataURL = canvas.toDataURL('image/jpeg', 0.88);
        } catch (e2) {
            try {
                dataURL = canvas.toDataURL('image/jpeg', 0.88);
            } catch (e3) {
                return null;
            }
        }
        return { canvas: canvas, dataURL: dataURL, cropNorm: cropNorm };
    }

    /** Mode B crop: pan/zoom image + movable/resizable square frame. */
    function openIconCrop(dataUrl, cb) {
        /* close stacked modals lightly */
        var other = document.querySelector('.custom-app-modal.is-open, .bookmark-modal.is-open');
        /* leave custom-app open underneath — crop is on top */

        var modal = ensureIconCropModal();
        var cropSession = (modal._cropSession || 0) + 1;
        modal._cropSession = cropSession;
        var stage = modal.querySelector('.icon-crop-stage');
        var img = stage.querySelector('img.icon-crop-img') || stage.querySelector('img');
        var frameEl = stage.querySelector('.icon-crop-frame');
        var prev = modal.querySelector('.icon-crop-preview img');
        var gifBadge = modal.querySelector('.icon-crop-preview .gif-badge');
        var isGif = /^data:image\/gif/i.test(dataUrl || '');

        var scale = 1;
        var ox = 0;
        var oy = 0;
        var frame = { x: 0, y: 0, size: 100 };
        var dragMode = null;
        var resizeCorner = null;
        var lx = 0;
        var ly = 0;
        var startFrame = null;
        var closed = false;
        var cropReturnFocus = document.activeElement;
        var confirmCrop = modal.querySelector('[data-confirm]');
        confirmCrop.disabled = true;
        state._pendingCropMeta = null;
        modal._close = function () { closeCrop(null); };

        if (gifBadge) gifBadge.hidden = !isGif;

        function stageSize() {
            return { w: stage.clientWidth || 280, h: stage.clientHeight || 280 };
        }

        function getImgLayout() {
            var ss = stageSize();
            var nw = img.naturalWidth || 1;
            var nh = img.naturalHeight || 1;
            var fit = Math.min(ss.w / nw, ss.h / nh);
            var dispW = nw * fit * scale;
            var dispH = nh * fit * scale;
            var cx = ss.w / 2 + ox;
            var cy = ss.h / 2 + oy;
            return { x: cx - dispW / 2, y: cy - dispH / 2, w: dispW, h: dispH };
        }

        function clampFrame() {
            var ss = stageSize();
            var minS = 40;
            var maxS = Math.min(ss.w, ss.h) - 8;
            if (maxS < minS) maxS = minS;
            frame.size = Math.max(minS, Math.min(maxS, frame.size));
            frame.x = Math.max(0, Math.min(ss.w - frame.size, frame.x));
            frame.y = Math.max(0, Math.min(ss.h - frame.size, frame.y));
        }

        function resetView() {
            scale = 1;
            ox = 0;
            oy = 0;
            var ss = stageSize();
            var size = Math.min(ss.w, ss.h) * 0.72;
            frame.x = (ss.w - size) / 2;
            frame.y = (ss.h - size) / 2;
            frame.size = size;
            clampFrame();
            paint();
        }

        function paint() {
            img.style.setProperty('--crop-scale', String(scale));
            img.style.setProperty('--crop-ox', ox + 'px');
            img.style.setProperty('--crop-oy', oy + 'px');
            img.style.transform =
                'translate(calc(-50% + ' + ox + 'px), calc(-50% + ' + oy + 'px)) scale(' + scale + ')';
            /* also size img via fit base so scale is relative to contain */
            var ss = stageSize();
            var nw = img.naturalWidth || 1;
            var nh = img.naturalHeight || 1;
            var fit = Math.min(ss.w / nw, ss.h / nh);
            img.style.width = (nw * fit) + 'px';
            img.style.height = (nh * fit) + 'px';
            clampFrame();
            if (frameEl) {
                frameEl.style.left = frame.x + 'px';
                frameEl.style.top = frame.y + 'px';
                frameEl.style.width = frame.size + 'px';
                frameEl.style.height = frame.size + 'px';
            }
            updatePreview();
        }

        function updatePreview() {
            if (!prev || !img.naturalWidth) return;
            var ss = stageSize();
            var result = sampleCropToCanvas(img, ss.w, ss.h, getImgLayout(), frame);
            if (result && result.dataURL) prev.src = result.dataURL;
        }

        function closeCrop(result) {
            if (closed) return;
            closed = true;
            dragMode = null;
            stage.classList.remove('is-panning', 'is-moving-frame');
            modal.classList.remove('is-visible');
            modal.inert = true;
            var panel = $('.icon-crop-modal-panel', modal);
            var closing = global.NewtabMotion ? NewtabMotion.exit(panel, { y: 12, scale: .975 }) : Promise.resolve(true);
            closing.then(function (complete) {
                if (!complete || modal._cropSession !== cropSession) return;
                modal.classList.remove('is-open');
                if (typeof cb === 'function') cb(result == null ? null : result);
                if (cropReturnFocus && cropReturnFocus.isConnected) cropReturnFocus.focus({ preventScroll: true });
            });
        }

        function hitOnHandle(t) {
            var h = t && t.closest ? t.closest('[data-h]') : null;
            return h && frameEl && frameEl.contains(h) ? h.getAttribute('data-h') : null;
        }

        function onPointerDown(e) {
            if (e.button != null && e.button !== 0) return;
            e.preventDefault();
            lx = e.clientX;
            ly = e.clientY;
            var corner = hitOnHandle(e.target);
            if (corner) {
                dragMode = 'resizeFrame';
                resizeCorner = corner;
                startFrame = { x: frame.x, y: frame.y, size: frame.size };
            } else if (frameEl && (e.target === frameEl || (frameEl.contains(e.target) && !hitOnHandle(e.target)))) {
                dragMode = 'moveFrame';
                startFrame = { x: frame.x, y: frame.y, size: frame.size };
                stage.classList.add('is-moving-frame');
            } else {
                dragMode = 'pan';
                stage.classList.add('is-panning');
            }
            try { stage.setPointerCapture(e.pointerId); } catch (ex) { /* */ }
        }

        function onPointerMove(e) {
            if (!dragMode) return;
            var dx = e.clientX - lx;
            var dy = e.clientY - ly;
            if (dragMode === 'pan') {
                ox += dx;
                oy += dy;
                lx = e.clientX;
                ly = e.clientY;
                paint();
                return;
            }
            if (dragMode === 'moveFrame' && startFrame) {
                frame.x = startFrame.x + dx;
                frame.y = startFrame.y + dy;
                paint();
                return;
            }
            if (dragMode === 'resizeFrame' && startFrame && resizeCorner) {
                /* square resize from corner toward opposite */
                var ax = startFrame.x;
                var ay = startFrame.y;
                var asz = startFrame.size;
                var delta = 0;
                if (resizeCorner === 'se') {
                    delta = Math.max(dx, dy);
                    frame.x = ax;
                    frame.y = ay;
                    frame.size = asz + delta;
                } else if (resizeCorner === 'nw') {
                    delta = Math.max(-dx, -dy);
                    frame.size = asz + delta;
                    frame.x = ax + asz - frame.size;
                    frame.y = ay + asz - frame.size;
                } else if (resizeCorner === 'ne') {
                    delta = Math.max(dx, -dy);
                    frame.size = asz + delta;
                    frame.x = ax;
                    frame.y = ay + asz - frame.size;
                } else if (resizeCorner === 'sw') {
                    delta = Math.max(-dx, dy);
                    frame.size = asz + delta;
                    frame.x = ax + asz - frame.size;
                    frame.y = ay;
                }
                paint();
            }
        }

        function onPointerUp() {
            dragMode = null;
            resizeCorner = null;
            startFrame = null;
            stage.classList.remove('is-panning', 'is-moving-frame');
        }

        function zoomBy(delta) {
            scale = Math.max(0.5, Math.min(4, scale + delta));
            paint();
        }

        img.onload = function () {
            if (closed) return;
            confirmCrop.disabled = false;
            resetView();
        };
        img.onerror = function () {
            if (!closed) closeCrop(null);
            var error = document.querySelector('#custom-app-error');
            if (error) error.textContent = '無法開啟此圖檔，請選擇其他圖片。';
        };
        if (img.src === dataUrl && img.complete && img.naturalWidth) {
            confirmCrop.disabled = false;
            resetView();
        } else {
            img.src = dataUrl;
        }

        stage.onpointerdown = onPointerDown;
        stage.onpointermove = onPointerMove;
        stage.onpointerup = onPointerUp;
        stage.onpointercancel = onPointerUp;
        stage.onwheel = function (e) {
            e.preventDefault();
            zoomBy(e.deltaY < 0 ? 0.1 : -0.1);
        };

        var zOut = modal.querySelector('[data-zoom-out]');
        var zIn = modal.querySelector('[data-zoom-in]');
        var zReset = modal.querySelector('[data-reset]');
        if (zOut) zOut.onclick = function (e) { e.preventDefault(); zoomBy(-0.1); };
        if (zIn) zIn.onclick = function (e) { e.preventDefault(); zoomBy(0.1); };
        if (zReset) zReset.onclick = function (e) { e.preventDefault(); resetView(); };

        modal.querySelector('[data-cancel]').onclick = function (e) {
            e.preventDefault();
            closeCrop(null);
        };
        modal.querySelector('[data-close]').onclick = function (e) {
            e.preventDefault();
            closeCrop(null);
        };
        modal.querySelector('[data-confirm]').onclick = function (e) {
            e.preventDefault();
            var ss = stageSize();
            var result = sampleCropToCanvas(img, ss.w, ss.h, getImgLayout(), frame);
            if (!result) {
                closeCrop(dataUrl);
                return;
            }
            /* C6 GIF: prefer static 64 (safe). If small GIF source, attach meta via side channel for addCustom */
            if (isGif && result.cropNorm && dataUrl.length < 28000) {
                state._pendingCropMeta = {
                    nx: result.cropNorm.nx,
                    ny: result.cropNorm.ny,
                    nw: result.cropNorm.nw,
                    nh: result.cropNorm.nh,
                    animated: true,
                    sourceDataUrl: dataUrl
                };
            } else {
                state._pendingCropMeta = result.cropNorm
                    ? {
                        nx: result.cropNorm.nx,
                        ny: result.cropNorm.ny,
                        nw: result.cropNorm.nw,
                        nh: result.cropNorm.nh,
                        animated: false
                    }
                    : null;
            }
            closeCrop(result.dataURL);
        };

        modal.inert = false;
        modal.classList.add('is-open');
        requestAnimationFrame(function () {
            if (closed || modal._cropSession !== cropSession) return;
            modal.classList.add('is-visible');
            if (global.NewtabMotion) NewtabMotion.enter($('.icon-crop-modal-panel', modal), { y: 18, scale: .975 });
            if (img.complete && img.naturalWidth) resetView();
            modal.querySelector('[data-cancel]').focus({ preventScroll: true });
        });
    }

    function getLayout() {
        return global.NewtabWidgets ? NewtabWidgets.getLayout() : { widgets: [] };
    }

    var railIconPaths = {
        close: '<path d="m7 7 10 10M17 7 7 17"/>',
        arrange: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><path d="m17.5 13 1.3 3.2 3.2 1.3-3.2 1.3-1.3 3.2-1.3-3.2-3.2-1.3 3.2-1.3Z" fill="#b7d9e9"/>',
        reset: '<path d="M4 9a8 8 0 1 1 1 8M4 4v5h5"/><path d="m12 8 1 2.8 3 1.2-3 1.2-1 2.8-1-2.8L8 12l3-1.2Z" fill="#b7d9e9" stroke-width="1.2"/>',
        play: '<path d="m9 5 11 7-11 7Z" fill="#b7d9e9"/>',
        pause: '<rect x="6" y="5" width="4" height="14" rx="1.4" fill="#b7d9e9"/><rect x="14" y="5" width="4" height="14" rx="1.4" fill="#b7d9e9"/>',
        muted: '<path d="m11 4-5 4H3v8h3l5 4Z"/><path d="m16 9 5 6m0-6-5 6"/>',
        sound: '<path d="m11 4-5 4H3v8h3l5 4Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
        about: '<path d="M6 5 8 2l3 3h2l3-3 2 3a8 8 0 1 1-12 0Z"/><path d="M12 11v5"/><circle cx="12" cy="8" r=".7" fill="currentColor" stroke="none"/>'
    };

    function railIcon(name) {
        return '<svg data-rail-icon="' + name + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + railIconPaths[name] + '</svg>';
    }

    function updateRailIcon(button, name) {
        var icon = $('[data-rail-icon]', button);
        if (icon && icon.dataset.railIcon !== name) {
            icon.innerHTML = railIconPaths[name];
            icon.dataset.railIcon = name;
        }
    }

    function reduceMotion() {
        return global.NewtabMotion ? NewtabMotion.reduced() : global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    // The same numeric springs own each pose throughout a reversal. No delayed
    // display swap, opacity gap, or second animation resetting the current frame.
    function spring(owner, key, target, options, immediate) {
        var motion = global.NewtabMotion;
        if (!immediate && motion && motion.spring) return motion.spring(owner, key, target, options);
        if (motion && motion.cancelSpring) motion.cancelSpring(owner, key);
        options.update(target);
        return Promise.resolve(true);
    }

    var panelSequence = 0;
    function movePanel(panel, selected, direction, animate) {
        var hidden = panel.hidden;
        var token = (panel._railToken || 0) + 1;
        panel._railToken = token;
        panel.inert = !selected;
        panel.setAttribute('aria-hidden', String(!selected));
        panel.classList.toggle('is-active', selected);
        panel.classList.toggle('is-leaving', !selected && !hidden && animate);
        if (selected) panel.style.zIndex = String(++panelSequence);
        if (!selected && hidden) return;
        panel.hidden = false;
        var target = { x: selected ? 0 : -direction };
        return spring(panel, 'rail-panel', target, {
            from: hidden ? { x: direction } : (panel._railPose || { x: 0 }),
            stiffness: 420, damping: 36, precision: .001, maxDuration: 1000,
            update: function (pose) {
                panel._railPose = pose;
                panel.style.setProperty('--rail-panel-x', (pose.x * 100).toFixed(4) + '%');
            }
        }, !animate || reduceMotion()).then(function (complete) {
            if (!complete || token !== panel._railToken) return;
            if (!selected) {
                panel.hidden = true;
                panel.classList.remove('is-leaving');
            }
        });
    }

    function moveIndicator(animate) {
        var nav = $('.side-rail-tabs'), indicator = $('.rail-tab-indicator');
        var selected = $('.side-rail-tabs button[aria-selected="true"]');
        if (!nav || !indicator || !selected) return;
        var left = selected.offsetLeft, right = left + selected.offsetWidth;
        var old = indicator._railEdges;
        var direction = !old || left >= old.target ? 1 : -1;
        var edges = old || { left: left, right: right };
        edges.target = left;
        indicator._railEdges = edges;
        function paint() {
            indicator.style.transform = 'translate3d(' + edges.left.toFixed(3) + 'px,0,0)';
            indicator.style.width = Math.max(1, edges.right - edges.left).toFixed(3) + 'px';
        }
        ['left', 'right'].forEach(function (edge) {
            var leading = direction > 0 ? edge === 'right' : edge === 'left';
            spring(indicator, 'rail-pill-' + edge, { x: edge === 'left' ? left : right }, {
                from: { x: edges[edge] }, stiffness: leading ? 620 : 390,
                damping: leading ? 39 : 31, precision: .04, maxDuration: 1000,
                update: function (pose) { edges[edge] = pose.x; paint(); }
            }, !animate || !old || reduceMotion());
        });
    }

    function moveDrawer(open, animate) {
        var rail = $('#side-rail');
        if (!rail) return;
        var token = (rail._railToken || 0) + 1;
        rail._railToken = token;
        rail.dataset.motionReady = 'true';
        rail.style.visibility = 'visible';
        spring(rail, 'rail-drawer', { reveal: open ? 1 : 0 }, {
            from: rail._railPose || { reveal: 0 }, stiffness: open ? 380 : 460,
            damping: open ? 34 : 38, precision: .001, maxDuration: 1000,
            update: function (pose) {
                rail._railPose = pose;
                rail.style.setProperty('--rail-hidden', (1 - pose.reveal).toFixed(5));
            }
        }, !animate || reduceMotion()).then(function (complete) {
            if (complete && token === rail._railToken && !state.open) rail.style.visibility = 'hidden';
        });
    }

    function syncToggle(button) {
        var track = $('.rail-toggle-track', button);
        if (!track) return;
        var on = button.getAttribute('aria-pressed') === 'true';
        if (track._railOn === on) return;
        var initial = typeof track._railOn !== 'boolean';
        track._railOn = on;
        track.dataset.motionReady = 'true';
        spring(track, 'rail-toggle', { value: on ? 1 : 0 }, {
            from: { value: on ? 0 : 1 }, stiffness: 520, damping: 31,
            precision: .001, maxDuration: 800,
            update: function (pose) {
                var progress = Math.max(0, Math.min(1, pose.value));
                var stretch = Math.sin(progress * Math.PI) * 4;
                track.style.setProperty('--rail-toggle-x', (pose.value * 14 - stretch / 2).toFixed(3) + 'px');
                track.style.setProperty('--rail-toggle-width', (16 + stretch).toFixed(3) + 'px');
                track.style.setProperty('--rail-toggle-on', (progress * 100).toFixed(2) + '%');
            }
        }, initial || !state.open || reduceMotion());
    }

    function syncRailControls() {
        var video = document.getElementById('video-background');
        var play = $('#side-rail [data-action="play-pause"]');
        var sound = $('#side-rail [data-action="mute"]');
        if (video && play) {
            play.dataset.playing = String(!video.paused);
            updateRailIcon(play, video.paused ? 'play' : 'pause');
        }
        if (video && sound) {
            sound.setAttribute('aria-pressed', String(!video.muted));
            // A stable toggle name accompanies the existing action description.
            sound.setAttribute('aria-label', '背景聲音');
            updateRailIcon(sound, video.muted ? 'muted' : 'sound');
        }
        $$('#side-rail .rail-action[aria-pressed]').forEach(syncToggle);
    }

    function setOpen(open) {
        var was = state.open;
        if (open && !was) {
            state.returnFocus = document.activeElement && document.activeElement !== document.body
                ? document.activeElement : document.getElementById('side-rail-tab');
        }
        state.open = !!open;
        document.body.classList.toggle('side-rail-open', state.open);
        var tabBtn = $('#side-rail-tab');
        var dim = $('#side-rail-dim');
        var rail = $('#side-rail');
        if (rail) {
            rail.inert = !state.open;
            rail.setAttribute('aria-hidden', state.open ? 'false' : 'true');
            rail.setAttribute('aria-modal', state.open ? 'true' : 'false');
            if (was !== state.open || !rail.dataset.motionReady) moveDrawer(state.open, was !== state.open);
        }
        if (tabBtn) {
            tabBtn.setAttribute('aria-expanded', state.open ? 'true' : 'false');
            tabBtn.setAttribute('aria-label', state.open ? '關閉工具選單' : '開啟工具選單');
            tabBtn.title = '組件、應用與個人化';
            tabBtn.tabIndex = state.open ? -1 : 0;
            tabBtn.inert = state.open;
            tabBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h5m9 0h1M5 12h15M5 17h15"/><path d="m14 7-3-3v6l3-3 3-3v6Z" fill="#b7d9e9" stroke-linejoin="round"/></svg><span>工具</span>';
        }
        if (dim) dim.hidden = !state.open;

        if (global.NewtabWidgets) {
            NewtabWidgets.setRailState({ open: state.open, tab: state.tab });
        }

        if (state.open) {
            refreshLists();
            if (!was) {
                var selected = $('.side-rail-tabs button[aria-selected="true"]');
                if (selected) selected.focus({ preventScroll: true });
            }
        }
        // Opening catalog no longer auto-enters arrange mode
        if (!state.open && was) {
            document.body.classList.remove('side-rail-hot');
            var returnTarget = state.returnFocus && state.returnFocus.isConnected ? state.returnFocus : tabBtn;
            if (returnTarget && !returnTarget.inert) returnTarget.focus({ preventScroll: true });
        }
    }

    function setTab(name) {
        var next = name || 'personalize';
        var order = ['components', 'apps', 'personalize', 'about'];
        if (order.indexOf(next) < 0) next = 'personalize';
        var previous = state.tab;
        var focusedPanel = document.activeElement && document.activeElement.closest('.side-rail-panel');
        state.tab = next;
        var direction = order.indexOf(next) >= order.indexOf(previous) ? 1 : -1;
        var animate = state.open && previous !== next;

        $$('.side-rail-tabs button').forEach(function (btn) {
            var name = btn.getAttribute('data-panel');
            btn.setAttribute('aria-selected', name === next ? 'true' : 'false');
            btn.tabIndex = name === next ? 0 : -1;
            btn.id = 'rail-tab-' + name;
            btn.setAttribute('aria-controls', 'rail-panel-' + name);
        });
        $$('.side-rail-panel').forEach(function (p) {
            var name = p.getAttribute('data-panel');
            p.id = 'rail-panel-' + name;
            p.setAttribute('aria-labelledby', 'rail-tab-' + name);
            if (previous !== next || !p.dataset.motionReady) {
                if (!p.dataset.motionReady) p.hidden = !p.classList.contains('is-active');
                p.dataset.motionReady = 'true';
                movePanel(p, name === next, direction, animate);
            }
        });
        var indicator = $('.rail-tab-indicator');
        if (indicator && (previous !== next || !indicator._railEdges)) moveIndicator(animate);

        if (global.NewtabWidgets) {
            NewtabWidgets.setRailState({ open: state.open, tab: state.tab });
        }
        refreshLists();
        if (animate) {
            if (focusedPanel && focusedPanel.inert) $('.side-rail-tabs button[aria-selected="true"]').focus({ preventScroll: true });
        }
    }

    function refreshLists() {
        var active = document.activeElement;
        var activeRow = active && active.closest && active.closest('.list-row');
        var focusType = activeRow && activeRow.getAttribute('data-place-type');
        var focusKind = active && active.classList.contains('list-delete') ? '.list-delete' : '.list-add';
        renderComponents();
        renderApps();
        if (focusType && state.open) {
            var row = $$('.list-row').filter(function (el) { return el.getAttribute('data-place-type') === focusType; })[0];
            var next = row && $(focusKind, row);
            if (!next || next.disabled) next = $('.side-rail-tabs button[aria-selected="true"]');
            if (next) next.focus({ preventScroll: true });
        }
        if (global.NewtabBackground && NewtabBackground.syncControls) NewtabBackground.syncControls();
        syncRailControls();
    }

    function renderComponents() {
        var host = $('#component-list');
        if (!host || !global.NewtabCatalog) return;
        var layout = getLayout();
        // A small, consistent set drawn for the character palette. Functional
        // silhouettes lead; a ribbon or paw is the secondary identifying detail.
        var ribbon = '<path d="m24 7-3-2v5l3-1 3 1V5Z" fill="var(--component-fill)" stroke-width="1.3"/>';
        var paw = '<path d="M12 17q3-5 6 0c1 3-1 3-3 2-2 1-4 1-3-2Z" fill="currentColor" stroke="none"/><g fill="currentColor" stroke="none"><ellipse cx="12" cy="12.5" rx="1" ry="1.4"/><ellipse cx="15" cy="11" rx="1" ry="1.4"/><ellipse cx="18" cy="12.5" rx="1" ry="1.4"/></g>';
        var symbols = {
            clock: '<circle cx="15" cy="17" r="10" fill="var(--component-paper)"/><path d="M15 11v6l4 2"/>' + ribbon,
            search: '<circle cx="14" cy="14" r="10" fill="var(--component-fill)"/><path d="m21 21 7 7" stroke-width="2.5"/>' + paw,
            notes: '<rect x="6" y="4" width="20" height="25" rx="4" fill="var(--component-paper)"/><path d="M10 13h11m-11 5h11m-11 5h7"/><path d="m16 5-4-2v6l4-2 4 2V3Z" fill="var(--component-fill)" stroke-width="1.3"/>',
            todo: '<rect x="5" y="6" width="23" height="23" rx="4" fill="var(--component-paper)"/><path d="m16 6-4-3v6l4-2 4 2V3Z" fill="var(--component-fill)" stroke-width="1.3"/><path d="m9 15 2 2 3-4m-5 11 2 2 3-4m4-7h6m-6 8h6"/>',
            countdown: '<path d="M9 5h14M9 28h14M10 6v4c0 5 12 8 12 13v4M22 6v4c0 5-12 8-12 13v4"/><path d="M12 10h8c-1 3-4 4-4 4s-3-1-4-4Zm0 16c0-3 4-5 4-5s4 2 4 5Z" fill="var(--component-fill)" stroke="none"/>' + ribbon,
            weather: '<circle cx="22" cy="10" r="5" fill="var(--component-fill)"/><path d="M22 2v1m8 7h-1m-1-6-1 1"/><path d="M9 25a5 5 0 1 1 0-10 8 8 0 0 1 15-1 6 6 0 0 1 0 11Z" fill="var(--component-paper)"/><path d="m23 21-3-2v5l3-1 3 1v-5Z" fill="var(--component-fill)" stroke-width="1.2"/>',
            bookmarks: '<path d="M8 7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v22l-8-5-8 5Z" fill="var(--component-fill)"/><g transform="translate(1 1)">' + paw + '</g>'
        };
        host.innerHTML = '';
        NewtabCatalog.listComponents().forEach(function (meta) {
            var on = NewtabCatalog.isComponentOnCanvas(layout, meta.type);
            var singleton = NewtabCatalog.isSingletonType
                ? NewtabCatalog.isSingletonType(meta.type)
                : true;
            // Multi-instance types stay placeable even if one is already on canvas
            var placeable = !singleton || !on;
            var row = document.createElement('div');
            row.className = 'list-row' + (placeable ? ' is-placeable' : ' is-on-canvas');
            row.setAttribute('data-place-kind', 'component');
            row.setAttribute('data-place-type', meta.type);
            row.setAttribute('data-place-label', meta.label);
            var stateHtml = placeable
                ? '<button type="button" class="list-add" data-place-add aria-label="新增' + escapeHtml(meta.label) + '">' + (on ? '再新增' : '新增') + '</button>'
                : '<span class="list-state is-placed">已新增</span>';
            row.innerHTML =
                '<div class="list-icon list-icon-component"><svg class="component-symbol" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (symbols[meta.type] || symbols.notes) + '</svg></div>' +
                '<div class="list-meta"><div class="list-label">' + escapeHtml(meta.label) + '</div>' +
                '<div class="list-desc">' + escapeHtml(meta.desc || '') + '</div></div>' +
                stateHtml;
            host.appendChild(row);
        });
    }

    function renderApps() {
        var host = $('#app-list');
        if (!host || !global.NewtabApps) return;
        var layout = getLayout();
        host.innerHTML = '';
        NewtabApps.list().forEach(function (meta) {
            var on = global.NewtabLayout && NewtabLayout.hasApp
                ? NewtabLayout.hasApp(layout, meta.appId)
                : false;
            var src = NewtabApps.iconUrl(meta.appId) || '';
            var isCustom = !!(meta.custom || (meta.appId && String(meta.appId).indexOf('custom-') === 0));
            var row = document.createElement('div');
            row.className = 'list-row' + (on ? ' is-on-canvas' : ' is-placeable') + (isCustom ? ' has-delete' : '');
            row.setAttribute('data-place-kind', 'app');
            row.setAttribute('data-place-type', meta.appId);
            row.setAttribute('data-place-label', meta.label);
            if (isCustom) row.setAttribute('data-custom-id', meta.appId);
            var stateHtml = on ? '<span class="list-state is-placed">已新增</span>'
                : '<button type="button" class="list-add" data-place-add aria-label="新增' + escapeHtml(meta.label) + '">新增</button>';
            var delHtml = isCustom
                ? '<button type="button" class="list-delete" data-delete-app="' + escapeHtml(meta.appId) +
                  '" aria-label="刪除' + escapeHtml(meta.label) + '" title="刪除此自訂應用"><i class="fas fa-trash" aria-hidden="true"></i></button>'
                : '';
            var hostname = '';
            try { hostname = new URL(meta.url).hostname.replace(/^www\./, ''); } catch (err) { /* invalid saved app */ }
            row.innerHTML =
                '<div class="list-icon list-icon-img">' +
                (src ? '<img src="' + escapeHtml(src) + '" alt="" width="28" height="28" loading="lazy" draggable="false">' : '') +
                '</div>' +
                '<div class="list-meta"><div class="list-label">' + escapeHtml(meta.label) + '</div>' +
                '<div class="list-desc">' + escapeHtml(hostname) + '</div></div>' +
                stateHtml + delHtml;
            var img = row.querySelector('img');
            if (img) img.onerror = function () { img.onerror = null; img.src = NewtabApps.defaultGlyphDataUrl(meta.label); };
            host.appendChild(row);
        });

        var addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.id = 'app-add-btn';
        addBtn.className = 'app-add-row';
        addBtn.innerHTML = '<span class="app-add-icon" aria-hidden="true">+</span><span>新增自訂應用</span>';
        addBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            openCustomAppModal();
        });
        host.appendChild(addBtn);
    }

    /* ---------- Custom app modal (R7) ---------- */
    var customModal = null;
    var pendingFavicon = '';
    var pendingCropMeta = null;
    var customSession = 0;
    var faviconVersion = 0;
    var customIconChosen = false;
    var customReturnFocus = null;

    function ensureCustomModal() {
        if (customModal) return customModal;
        customModal = document.createElement('div');
        customModal.className = 'custom-app-modal';
        customModal.innerHTML =
            '<button type="button" class="custom-app-modal-backdrop" data-close="1" aria-label="關閉"></button>' +
            '<div class="custom-app-modal-panel" role="dialog" aria-modal="true" aria-label="新增自訂應用">' +
            '<div class="custom-app-modal-header"><span>新增自訂應用</span>' +
            '<button type="button" class="custom-app-modal-close" data-close="1" aria-label="關閉">×</button></div>' +
            '<div class="custom-app-icon-preview" id="custom-app-icon-preview" tabindex="0" role="button" aria-label="上傳圖標">' +
            '<span class="app-glyph">☆</span>' +
            '<span class="icon-upload-overlay">上傳圖標</span>' +
            '<button type="button" class="icon-edit-pencil" id="custom-app-upload-btn" aria-label="編輯圖標">✎</button>' +
            '</div>' +
            '<input type="file" id="custom-app-file" accept="image/*" hidden>' +
            '<div class="custom-app-field"><label for="custom-app-name">名稱</label>' +
            '<input id="custom-app-name" type="text" maxlength="40" placeholder="例如：GitHub"></div>' +
            '<div class="custom-app-field"><label for="custom-app-url">網址</label>' +
            '<input id="custom-app-url" type="url" placeholder="example.com 或 https://…" autocomplete="url" spellcheck="false" aria-describedby="custom-app-error"></div>' +
            '<p class="custom-app-error" id="custom-app-error" role="status" aria-live="polite"></p>' +
            '<div class="custom-app-actions">' +
            '<button type="button" class="btn-ghost" data-close="1">取消</button>' +
            '<button type="button" class="btn-primary" id="custom-app-submit">新增</button>' +
            '</div></div>';
        document.body.appendChild(customModal);

        customModal.addEventListener('click', function (e) {
            if (e.target.getAttribute('data-close') === '1') closeCustomAppModal();
        });

        var urlInput = customModal.querySelector('#custom-app-url');
        var nameInput = customModal.querySelector('#custom-app-name');
        var err = customModal.querySelector('#custom-app-error');
        var preview = customModal.querySelector('#custom-app-icon-preview');
        var fileInput = customModal.querySelector('#custom-app-file');
        var faviconTimer = null;

        function setPreviewSrc(src, label, cropMeta) {
            pendingFavicon = src || '';
            if (cropMeta === undefined) {
                /* keep pendingCropMeta when only label glyph refresh */
            } else {
                pendingCropMeta = cropMeta || null;
            }
            var overlay = '<span class="icon-upload-overlay">上傳圖標</span>' +
                '<button type="button" class="icon-edit-pencil" id="custom-app-upload-btn" aria-label="編輯圖標">✎</button>';
            if (src) {
                preview.innerHTML = '<img src="' + escapeHtml(src) + '" alt="">' + overlay;
            } else {
                var ch = (label || '☆').charAt(0);
                preview.innerHTML = '<span class="app-glyph">' + escapeHtml(ch) + '</span>' + overlay;
                pendingCropMeta = null;
            }
            bindPreviewUpload();
        }

        function bindPreviewUpload() {
            var btn = customModal.querySelector('#custom-app-upload-btn');
            if (btn) {
                btn.addEventListener('click', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    fileInput.click();
                });
            }
            preview.onclick = function (e) {
                if (e.target.closest && e.target.closest('.icon-edit-pencil')) return;
                fileInput.click();
            };
        }
        bindPreviewUpload();
        preview.addEventListener('keydown', function (e) {
            if (e.target === preview && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                fileInput.click();
            }
        });
        customModal.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && e.target.matches('input[type="text"], input[type="url"]') && !e.isComposing && e.keyCode !== 229) {
                e.preventDefault();
                customModal.querySelector('#custom-app-submit').click();
            }
        });

        function autoFavicon() {
            if (customIconChosen || !customModal.classList.contains('is-visible')) return;
            var url = urlInput.value;
            if (!url || !global.NewtabApps || !NewtabApps.resolveFavicon) return;
            if (!NewtabApps.normalizeUrl(url)) return;
            var version = ++faviconVersion;
            var session = customSession;
            preview.querySelector('.app-glyph') && (preview.querySelector('.app-glyph').className = 'app-glyph is-skeleton');
            NewtabApps.resolveFavicon(url, function (src) {
                if (version !== faviconVersion || session !== customSession || customIconChosen || url !== urlInput.value) return;
                setPreviewSrc(src, nameInput.value || url, null);
            });
        }

        urlInput.addEventListener('input', function () {
            faviconVersion++;
            clearTimeout(faviconTimer);
            err.textContent = '';
            urlInput.removeAttribute('aria-invalid');
            if (!customIconChosen) {
                setPreviewSrc('', nameInput.value, null);
                faviconTimer = setTimeout(autoFavicon, 350);
            }
        });

        urlInput.addEventListener('blur', function () {
            clearTimeout(faviconTimer);
            faviconTimer = setTimeout(autoFavicon, 80);
        });
        urlInput.addEventListener('change', autoFavicon);

        fileInput.addEventListener('change', function (ev) {
            var file = ev.target.files && ev.target.files[0];
            if (!file) return;
            err.textContent = '';
            if (!/^image\//i.test(file.type) || file.size > 10 * 1024 * 1024) {
                err.textContent = '請選擇 10 MB 以下的圖片。';
                fileInput.value = '';
                return;
            }
            var session = customSession;
            faviconVersion++;
            clearTimeout(faviconTimer);
            var reader = new FileReader();
            reader.onload = function () {
                if (session !== customSession) return;
                var data = String(reader.result || '');
                openIconCrop(data, function (cropped) {
                    if (!cropped || session !== customSession) return;
                    customIconChosen = true;
                    faviconVersion++;
                    var meta = state._pendingCropMeta || null;
                    state._pendingCropMeta = null;
                    if (meta && meta.animated && meta.sourceDataUrl) {
                        setPreviewSrc(cropped, nameInput.value, {
                            nx: meta.nx, ny: meta.ny, nw: meta.nw, nh: meta.nh, animated: true
                        });
                        pendingCropMeta = {
                            nx: meta.nx, ny: meta.ny, nw: meta.nw, nh: meta.nh, animated: true
                        };
                        /* keep source for addCustom size check */
                        pendingCropMeta._sourceDataUrl = meta.sourceDataUrl;
                    } else {
                        setPreviewSrc(cropped, nameInput.value, meta);
                    }
                    err.textContent = '';
                });
            };
            reader.onerror = function () {
                err.textContent = '讀取圖檔失敗';
            };
            reader.readAsDataURL(file);
            fileInput.value = '';
        });

        customModal.querySelector('#custom-app-submit').addEventListener('click', function () {
            if (!customModal.classList.contains('is-visible')) return;
            err.textContent = '';
            if (!global.NewtabApps || !NewtabApps.addCustom) {
                err.textContent = '系統尚未就緒';
                return;
            }
            var label = nameInput.value.trim();
            var url = urlInput.value.trim();
            var norm = NewtabApps.normalizeUrl ? NewtabApps.normalizeUrl(url) : url;
            if (!norm) {
                err.textContent = '請輸入有效的網址';
                urlInput.setAttribute('aria-invalid', 'true');
                urlInput.focus();
                return;
            }
            if (!label) {
                try { label = new URL(norm).hostname.replace(/^www\./, ''); } catch (ex) { label = '自訂應用'; }
            }

            function finish(icon) {
                var meta = pendingCropMeta;
                var opts = { label: label, url: norm, icon: icon || '' };
                if (meta) {
                    opts.cropMeta = {
                        nx: meta.nx, ny: meta.ny, nw: meta.nw, nh: meta.nh, animated: !!meta.animated
                    };
                    if (meta.animated && meta._sourceDataUrl) {
                        opts.sourceDataUrl = meta._sourceDataUrl;
                    }
                }
                var id = NewtabApps.addCustom(opts);
                if (!id) {
                    err.textContent = '無法儲存應用，請檢查瀏覽器儲存空間後再試一次。';
                    return;
                }
                pendingCropMeta = null;
                closeCustomAppModal();
                refreshLists();
            }

            // Save immediately so slow favicon requests cannot duplicate or resurrect a closed form.
            finish(pendingFavicon || NewtabApps.defaultGlyphDataUrl(label));
        });

        return customModal;
    }

    function openCustomAppModal() {
        var m = ensureCustomModal();
        customSession++;
        var openingSession = customSession;
        faviconVersion++;
        customIconChosen = false;
        var opener = document.activeElement;
        if (opener && opener !== document.body && !m.contains(opener) && !opener.closest('[inert]')) customReturnFocus = opener;
        else if (!customReturnFocus || !customReturnFocus.isConnected || m.contains(customReturnFocus)) customReturnFocus = $('#app-add-btn');
        pendingFavicon = '';
        pendingCropMeta = null;
        state._pendingCropMeta = null;
        m.querySelector('#custom-app-name').value = '';
        m.querySelector('#custom-app-url').value = '';
        m.querySelector('#custom-app-url').removeAttribute('aria-invalid');
        m.querySelector('#custom-app-error').textContent = '';
        m.querySelector('#custom-app-file').value = '';
        // Trigger setPreview via click path: rebuild using blur-ready default
        var preview = m.querySelector('#custom-app-icon-preview');
        var fileInput = m.querySelector('#custom-app-file');
        preview.innerHTML =
            '<span class="app-glyph">☆</span>' +
            '<span class="icon-upload-overlay">上傳圖標</span>' +
            '<button type="button" class="icon-edit-pencil" id="custom-app-upload-btn" aria-label="編輯圖標">✎</button>';
        var pencil = m.querySelector('#custom-app-upload-btn');
        if (pencil) {
            pencil.onclick = function (e) {
                e.preventDefault();
                e.stopPropagation();
                fileInput.click();
            };
        }
        preview.onclick = function (e) {
            if (e.target.closest && e.target.closest('.icon-edit-pencil')) return;
            fileInput.click();
        };
        m.inert = false;
        m.classList.add('is-open');
        requestAnimationFrame(function () {
            if (customSession !== openingSession || m.inert) return;
            m.classList.add('is-visible');
            if (global.NewtabMotion) NewtabMotion.enter($('.custom-app-modal-panel', m), { y: 18, scale: .975 });
            m.querySelector('#custom-app-name').focus({ preventScroll: true });
        });
    }

    function closeCustomAppModal() {
        if (!customModal) return;
        customSession++;
        var closingSession = customSession;
        faviconVersion++;
        pendingCropMeta = null;
        customModal.classList.remove('is-visible');
        customModal.inert = true;
        var closing = global.NewtabMotion ? NewtabMotion.exit($('.custom-app-modal-panel', customModal), { y: 12, scale: .975 }) : Promise.resolve(true);
        closing.then(function (complete) {
            if (!complete || customSession !== closingSession) return;
            if (customModal) customModal.classList.remove('is-open');
            var target = customReturnFocus && customReturnFocus.isConnected ? customReturnFocus : $('#app-add-btn');
            if (target && state.open) target.focus({ preventScroll: true });
        });
    }

    function cancelHideRailTab() {
        if (state.hideTimer) {
            clearTimeout(state.hideTimer);
            state.hideTimer = null;
        }
        document.body.classList.add('side-rail-hot');
    }

    function armHideRailTab() {
        if (state.open) return;
        if (state.hideTimer) clearTimeout(state.hideTimer);
        state.hideTimer = setTimeout(function () {
            state.hideTimer = null;
            if (!state.open) document.body.classList.remove('side-rail-hot');
        }, HIDE_DELAY_MS);
    }

    function findWidgetIdByType(type) {
        var layout = getLayout();
        var w = (layout.widgets || []).filter(function (x) { return x.type === type; })[0];
        return w ? w.id : null;
    }

    function afterSuccessfulAdd(res) {
        if (!res || !res.ok) return;
        refreshLists();
        // Adding normally stays usable; an existing arrangement draft stays open.
        setOpen(false);
        if (global.NewtabWidgets) {
            if (global.NewtabExperience && document.body.classList.contains('is-focus-mode')) NewtabExperience.setFocusMode(false);
            if (res.widget && res.widget.id && NewtabWidgets.bringToFront) {
                NewtabWidgets.bringToFront(res.widget.id);
                var added = res.widget;
                requestAnimationFrame(function () {
                    var element = document.querySelector('.widget[data-id="' + added.id + '"]');
                    if (element && window.innerWidth <= 600) element.scrollIntoView({ block: 'nearest', behavior: 'instant' });
                    var announcement = document.getElementById('home-announcement');
                    var meta = global.NewtabCatalog && NewtabCatalog.get(added.type);
                    if (announcement) announcement.textContent = '已新增' + (meta ? meta.label : '應用') + '。';
                });
            }
        }
    }

    function addComponent(type) {
        if (!global.NewtabWidgets) return { ok: false, error: 'no-host' };
        var res = NewtabWidgets.addFromCatalog(type);
        if (!res || !res.ok) {
            if (res && res.error === 'singleton') {
                console.warn('[SideRail] component already on canvas', type);
            }
            refreshLists();
            return res || { ok: false };
        }
        afterSuccessfulAdd(res);
        return res;
    }

    function addApp(appId) {
        if (!global.NewtabWidgets) return { ok: false, error: 'no-host' };
        var res = NewtabWidgets.addApp(appId);
        if (!res || !res.ok) {
            if (res && res.error === 'singleton') {
                console.warn('[SideRail] app already on canvas', appId);
            }
            refreshLists();
            return res || { ok: false };
        }
        afterSuccessfulAdd(res);
        return res;
    }

    function removeComponent(type) {
        var id = findWidgetIdByType(type);
        if (id) NewtabWidgets.removeById(id);
        refreshLists();
    }

    function removeApp(appId) {
        NewtabWidgets.removeAppByAppId(appId);
        refreshLists();
    }

    function onRailClick(e) {
        if (Date.now() < state.suppressClickUntil) {
            e.preventDefault();
            return;
        }
        var add = e.target.closest && e.target.closest('[data-place-add]');
        if (add) {
            e.preventDefault();
            var addRow = add.closest('.list-row.is-placeable');
            if (!addRow) return;
            var type = addRow.getAttribute('data-place-type');
            if (addRow.getAttribute('data-place-kind') === 'app') addApp(type);
            else addComponent(type);
            return;
        }
        var del = e.target.closest && e.target.closest('[data-delete-app]');
        if (del) {
            e.preventDefault();
            e.stopPropagation();
            var appId = del.getAttribute('data-delete-app');
            if (!appId) return;
            var row = del.closest('.list-row');
            if (global.NewtabApps && NewtabApps.removeCustom) {
                if (!NewtabApps.removeCustom(appId)) {
                    del.title = '刪除失敗，請檢查瀏覽器儲存空間後再試一次';
                    return;
                }
            }
            if (row) row.classList.add('is-removing');
            if (global.NewtabWidgets && NewtabWidgets.removeAppByAppId) {
                NewtabWidgets.removeAppByAppId(appId);
            }
            setTimeout(function () { refreshLists(); }, 160);
            return;
        }

        var tbtn = e.target.closest && e.target.closest('.side-rail-tabs button');
        if (tbtn) {
            e.preventDefault();
            setTab(tbtn.getAttribute('data-panel'));
            return;
        }

        var action = e.target.closest && e.target.closest('[data-action]');
        if (action && action.closest('#side-rail')) {
            e.preventDefault();
            handleAction(action.getAttribute('data-action'));
            return;
        }
        // The add button supports tapping and keyboard; the row supports long-press dragging.
    }

    /* ---------- Long-press drag from catalog → home ---------- */
    function clearLongPressTimer() {
        if (state.longPressTimer) {
            clearTimeout(state.longPressTimer);
            state.longPressTimer = null;
        }
    }

    function onListPointerDown(e) {
        if (e.button != null && e.button !== 0) return;
        // Don't arm long-press when clicking delete
        if (e.target.closest && e.target.closest('button, input')) return;
        // Long-press only on placeable rows (on-canvas rows never arm)
        var row = e.target.closest && e.target.closest('.list-row.is-placeable');
        if (!row) return;
        // Touch can scroll the list anywhere except the icon's deliberate grip.
        if (e.pointerType === 'touch' && !e.target.closest('.list-icon')) return;
        // Allow long-press on toggle too for placeable items
        if (!global.NewtabWidgets) return;

        var kind = row.getAttribute('data-place-kind');
        var type = row.getAttribute('data-place-type');
        var label = row.getAttribute('data-place-label') || type;

        state.longPressStart = {
            x: e.clientX,
            y: e.clientY,
            kind: kind,
            type: type,
            label: label,
            pointerId: e.pointerId,
            moved: false,
            row: row
        };

        clearLongPressTimer();
        state.longPressTimer = setTimeout(function () {
            state.longPressTimer = null;
            if (!state.longPressStart) return;
            beginPlaceDrag(state.longPressStart, e);
        }, LONG_PRESS_MS);

        document.addEventListener('pointermove', onListPointerMove);
        document.addEventListener('pointerup', onListPointerUp);
        document.addEventListener('pointercancel', onListPointerUp);
    }

    function onListPointerMove(e) {
        if (!state.longPressStart || e.pointerId !== state.longPressStart.pointerId) return;

        if (state.placeDrag) {
            movePlaceGhost(e.clientX, e.clientY);
            return;
        }

        var dx = e.clientX - state.longPressStart.x;
        var dy = e.clientY - state.longPressStart.y;
        if (Math.abs(dx) > MOVE_CANCEL_PX || Math.abs(dy) > MOVE_CANCEL_PX) {
            // Finger moved before long-press fired — cancel long press (allow scroll)
            if (!state.longPressStart.armed) {
                clearLongPressTimer();
                state.longPressStart.moved = true;
            }
        }
    }

    function onListPointerUp(e) {
        if (state.longPressStart && e.pointerId !== state.longPressStart.pointerId) return;

        clearLongPressTimer();
        document.removeEventListener('pointermove', onListPointerMove);
        document.removeEventListener('pointerup', onListPointerUp);
        document.removeEventListener('pointercancel', onListPointerUp);

        if (state.placeDrag) {
            finishPlaceDrag(e.type === 'pointercancel' ? -1 : e.clientX, e.type === 'pointercancel' ? -1 : e.clientY);
            state.longPressStart = null;
            return;
        }

        // brief suppress of synthetic click after long-press attempt
        var start = state.longPressStart;
        state.longPressStart = null;
        if (start && start.moved) {
            // swallow following click
            setTimeout(function () { /* allow next click */ }, 0);
        }
    }

    function beginPlaceDrag(start, e) {
        if (state.placeDrag) return;
        start.armed = true;

        var ghost = document.createElement('div');
        ghost.className = 'catalog-drag-ghost';
        ghost.setAttribute('aria-hidden', 'true');

        var iconWrap = document.createElement('div');
        iconWrap.className = 'ghost-icon';
        if (start.row) {
            var srcIcon = start.row.querySelector('.list-icon');
            if (srcIcon) {
                iconWrap.innerHTML = srcIcon.innerHTML;
            }
        }
        var labelEl = document.createElement('span');
        labelEl.className = 'ghost-label';
        labelEl.textContent = start.label || '';
        ghost.appendChild(iconWrap);
        ghost.appendChild(labelEl);
        document.body.appendChild(ghost);

        state.placeDrag = {
            kind: start.kind,
            type: start.type,
            label: start.label,
            pointerId: start.pointerId,
            ghost: ghost
        };

        document.body.classList.add('is-catalog-placing');
        state.suppressClickUntil = Date.now() + 500;
        // Free the home surface: close rail (dim goes away)
        setOpen(false);
        NewtabWidgets.enterArrange();
        movePlaceGhost(start.x, start.y);

        try {
            if (start.row && e && e.target && e.target.setPointerCapture) {
                /* capture on document listeners already */
            }
        } catch (err) { /* ignore */ }
    }

    function movePlaceGhost(x, y) {
        if (!state.placeDrag || !state.placeDrag.ghost) return;
        var g = state.placeDrag.ghost;
        g.style.left = x + 'px';
        g.style.top = y + 'px';
        var d = state.placeDrag;
        var preview = NewtabWidgets.previewCatalog(d.kind === 'app' ? 'app' : d.type,
            d.kind === 'app' ? { appId: d.type } : {}, x, y);
        g.classList.toggle('is-invalid', !preview || !preview.valid);
    }

    function isDropOnRail(x, y) {
        if (typeof x !== 'number' || typeof y !== 'number') return true;
        if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return true;
        var pad = 20;
        var rail = document.getElementById('side-rail');
        if (rail) {
            var r = rail.getBoundingClientRect();
            // Only cancel when the rail still has on-screen presence
            if (r.width > 8 && r.height > 8 &&
                x >= r.left - pad && x <= r.right + pad &&
                y >= r.top - pad && y <= r.bottom + pad) {
                return true;
            }
        }
        return false;
    }

    function finishPlaceDrag(x, y) {
        var d = state.placeDrag;
        state.placeDrag = null;
        document.body.classList.remove('is-catalog-placing');
        state.suppressClickUntil = Date.now() + 500;
        if (d && d.ghost && d.ghost.parentNode) d.ghost.parentNode.removeChild(d.ghost);
        if (!d || !global.NewtabWidgets) return;

        // Cancel: invalid coords or pointer still over #side-rail rect
        if (isDropOnRail(x, y)) {
            NewtabWidgets.clearCatalogPreview();
            refreshLists();
            return;
        }
        var type = d.kind === 'app' ? 'app' : d.type;
        var opts = d.kind === 'app' ? { appId: d.type } : {};
        NewtabWidgets.previewCatalog(type, opts, x, y);
        var res = NewtabWidgets.commitCatalogPreview(type, opts);
        NewtabWidgets.clearCatalogPreview();

        if (res && res.ok) {
            if (res.widget && res.widget.id && NewtabWidgets.bringToFront) {
                NewtabWidgets.bringToFront(res.widget.id);
            }
        } else {
            var announcement = document.getElementById('home-announcement');
            if (announcement) announcement.textContent = '這個位置沒有足夠空間，請選擇另一個空位。';
        }
        refreshLists();
    }

    function handleAction(act) {
        switch (act) {
            case 'reset-layout':
                if (confirm('重設為預設版面？')) {
                    NewtabWidgets.resetLayout();
                    refreshLists();
                }
                break;
            case 'open-bg':
                setOpen(false);
                if (global.NewtabBackground && NewtabBackground.openUpload) NewtabBackground.openUpload();
                else {
                    var upload = document.getElementById('video-upload-container');
                    if (upload) upload.style.display = 'flex';
                }
                break;
            case 'focus':
                setOpen(false);
                if (global.NewtabExperience) NewtabExperience.toggleFocus();
                break;
            case 'play-pause':
                var pp = document.getElementById('play-pause-btn');
                if (pp) pp.click();
                break;
            case 'mute':
                var mb = document.getElementById('mute-btn');
                if (mb) mb.click();
                break;
            case 'about':
                setOpen(false);
                if (global.NewtabBackground && NewtabBackground.openAbout) NewtabBackground.openAbout();
                else {
                    var about = document.getElementById('about-page-container');
                    if (about) about.style.display = 'flex';
                }
                break;
            case 'arrange':
                setOpen(false);
                if (global.NewtabWidgets && NewtabWidgets.enterArrange) NewtabWidgets.enterArrange();
                break;
            default:
                break;
        }
    }

    function ensureMarkup() {
        if ($('#side-rail')) {
            rebuildInner($('#side-rail'));
            return;
        }

        var hotzone = document.createElement('div');
        hotzone.id = 'side-rail-hotzone';
        hotzone.setAttribute('aria-hidden', 'true');

        var tab = document.createElement('button');
        tab.type = 'button';
        tab.id = 'side-rail-tab';
        tab.setAttribute('aria-expanded', 'false');
        tab.setAttribute('aria-controls', 'side-rail');
        tab.setAttribute('aria-label', '開啟工具選單');
        tab.tabIndex = 0;
        tab.innerHTML = '<i class="fas fa-chevron-left" aria-hidden="true"></i>';

        var dim = document.createElement('button');
        dim.type = 'button';
        dim.id = 'side-rail-dim';
        dim.hidden = true;
        dim.tabIndex = -1;
        dim.setAttribute('aria-label', '關閉選單');

        var rail = document.createElement('div');
        rail.id = 'side-rail';
        rail.className = 'side-rail';
        rail.setAttribute('role', 'dialog');
        rail.setAttribute('aria-label', '個人化選單');
        rebuildInner(rail);

        document.body.appendChild(hotzone);
        document.body.appendChild(tab);
        document.body.appendChild(dim);
        document.body.appendChild(rail);
    }

    function rebuildInner(rail) {
        rail.innerHTML =
            '<div class="side-rail-header">' +
            '<h2>我的分頁</h2>' +
            '<button type="button" class="side-rail-close" id="side-rail-close" aria-label="關閉">' +
            railIcon('close') + '</button></div>' +
            '<nav class="side-rail-tabs" role="tablist" aria-label="工具分類">' +
            '<span class="rail-tab-indicator" aria-hidden="true"></span>' +
            '<button type="button" role="tab" data-panel="components" aria-selected="false">組件</button>' +
            '<button type="button" role="tab" data-panel="apps" aria-selected="false">應用</button>' +
            '<button type="button" role="tab" data-panel="personalize" aria-selected="true">個人化</button>' +
            '<button type="button" role="tab" data-panel="about" aria-selected="false">關於</button>' +
            '</nav>' +
            '<div class="side-rail-panels" id="side-rail-panels">' +
            '<div class="side-rail-panel" data-panel="components" role="tabpanel">' +
            '<p class="rail-hint">按「新增」放入空位，或按住圖示拖到主畫面。排列時可選取組件，再拖曳邊點調整大小。</p>' +
            '<div id="component-list"></div></div>' +
            '<div class="side-rail-panel" data-panel="apps" role="tabpanel">' +
            '<p class="rail-hint">按「新增」或按住圖示拖曳。停在另一個應用上，看到資料夾提示後放開，即可收進資料夾。</p>' +
            '<div id="app-list"></div></div>' +
            '<div class="side-rail-panel is-active" data-panel="personalize" role="tabpanel">' +
            '<h3>版面與背景</h3>' +
            '<div class="rail-action-group">' +
            '<button type="button" class="rail-action" id="arrange-home" data-action="arrange">' +
            railIcon('arrange') + '<span>排列主畫面</span></button>' +
            '<button type="button" class="rail-action" data-action="reset-layout">' +
            railIcon('reset') + '<span>重設版面</span></button>' +
            '<button type="button" class="rail-action" data-action="open-bg" id="background-home"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="m3 16 5-5 4 4 3-3 6 6"/><circle cx="16" cy="9" r="1.2" fill="#b7d9e9"/><path d="m8 5-3-3v6l3-3 3-3v6Z" fill="#b7d9e9" stroke-linejoin="round"/></svg><span>更換背景</span></button>' +
            '<button type="button" class="rail-action focus-button" data-action="focus" id="focus-home" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><path d="M9 14c0-3 6-3 6 0 0 2-2 1-3 1s-3 1-3-1Z" fill="#b7d9e9" stroke-width="1.2"/><g fill="currentColor" stroke="none"><circle cx="8.5" cy="10" r="1.1"/><circle cx="12" cy="8.5" r="1.1"/><circle cx="15.5" cy="10" r="1.1"/></g></svg><span>專注片刻</span><b class="rail-toggle-track" aria-hidden="true"></b></button>' +
            '</div>' +
            '<section class="background-appearance" id="background-appearance" aria-label="背景外觀"></section>' +
            '<p class="rail-hint" id="rail-media-status">目前使用貓貓主題。</p>' +
            '<button type="button" class="rail-action" data-action="play-pause">' +
            railIcon('play') + '<span>播放背景影片</span></button>' +
            '<button type="button" class="rail-action" data-action="mute" aria-label="背景聲音" aria-pressed="false">' +
            railIcon('muted') + '<span>開啟背景聲音</span><b class="rail-toggle-track" aria-hidden="true"></b></button>' +
            '</div>' +
            '<div class="side-rail-panel" data-panel="about" role="tabpanel">' +
            '<button type="button" class="rail-action" data-action="about">' +
            railIcon('about') + '<span>關於此分頁與授權</span></button>' +
            '</div></div>';
    }

    function bind() {
        if (state.bound) return;
        state.bound = true;

        var tab = $('#side-rail-tab');
        var hotzone = $('#side-rail-hotzone');
        var dim = $('#side-rail-dim');
        var rail = $('#side-rail');

        if (tab) tab.addEventListener('click', function (e) {
            e.stopPropagation();
            setOpen(!state.open);
        });
        if (hotzone) {
            hotzone.addEventListener('mouseenter', function () {
                cancelHideRailTab();
            });
            hotzone.addEventListener('mouseleave', function () {
                armHideRailTab();
            });
            hotzone.addEventListener('click', function () {
                if (!state.open) setOpen(true);
            });
        }
        if (tab) {
            tab.addEventListener('mouseenter', function () {
                cancelHideRailTab();
            });
            tab.addEventListener('mouseleave', function () {
                armHideRailTab();
            });
        }
        // Observe proximity without an invisible strip stealing widget clicks.
        var hoverPointer = global.matchMedia('(hover: hover) and (pointer: fine)');
        document.addEventListener('pointermove', function (event) {
            if (!hoverPointer.matches || state.open || event.pointerType === 'touch') return;
            if (event.clientX >= global.innerWidth - 24 || (tab && tab.contains(event.target))) {
                cancelHideRailTab();
            } else if (document.body.classList.contains('side-rail-hot') && !state.hideTimer) {
                armHideRailTab();
            }
        }, { passive: true });
        document.addEventListener('pointerleave', armHideRailTab);
        if (tab) tab.addEventListener('blur', armHideRailTab);
        if (dim) dim.addEventListener('click', function () { setOpen(false); });

        // Single delegated handler on rail (survives rebuildInner of children)
        if (rail) {
            new MutationObserver(function (records) {
                records.forEach(function (record) { syncToggle(record.target); });
            }).observe(rail, { subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });
            rail.addEventListener('click', function () {
                // Reset and media actions are handled by their existing owners.
                // Read their final values once, without creating another setting.
                queueMicrotask(syncRailControls);
            });
            rail.addEventListener('keydown', function (e) {
                var currentTab = e.target.closest && e.target.closest('.side-rail-tabs button');
                if (!currentTab || ['ArrowLeft', 'ArrowRight', 'Home', 'End'].indexOf(e.key) < 0) return;
                var tabs = $$('.side-rail-tabs button');
                var index = tabs.indexOf(currentTab);
                if (e.key === 'Home') index = 0;
                else if (e.key === 'End') index = tabs.length - 1;
                else index = (index + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
                e.preventDefault();
                setTab(tabs[index].getAttribute('data-panel'));
                tabs[index].focus();
            });
            rail.addEventListener('click', function (e) {
                if (e.target.closest && e.target.closest('#side-rail-close')) {
                    e.preventDefault();
                    setOpen(false);
                    return;
                }
                onRailClick(e);
            });
            rail.addEventListener('pointerdown', onListPointerDown);
        }

        document.addEventListener('keydown', function (e) {
            if ($('.appearance-dialog[open], .weather-location-dialog[open], .character-chat-dialog[open]')) return;
            var crop = $('.icon-crop-modal.is-open:not([inert])');
            var appModal = $('.custom-app-modal.is-open:not([inert])');
            var dialog = crop || appModal;
            if (dialog) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    if (crop && crop._close) crop._close();
                    else closeCustomAppModal();
                } else keepFocusIn($('.icon-crop-modal-panel, .custom-app-modal-panel', dialog), e);
                return;
            }
            if (e.key === 'Escape' && (state.placeDrag || state.longPressStart)) {
                e.preventDefault();
                e.stopImmediatePropagation();
                var pointerId = state.longPressStart && state.longPressStart.pointerId;
                onListPointerUp({ type: 'pointercancel', pointerId: pointerId });
                return;
            }
            if (e.key === 'Tab' && state.open) {
                var overlay = $('.bookmark-modal.is-open:not([inert]), .search-expand-layer.is-open');
                var aboutLayer = document.getElementById('about-page-container');
                var uploadLayer = document.getElementById('video-upload-container');
                if (!overlay && !(aboutLayer && aboutLayer.style.display === 'flex') && !(uploadLayer && uploadLayer.style.display === 'flex')) {
                    keepFocusIn($('#side-rail'), e);
                }
            }
            if (e.key !== 'Escape') return;
            if ($('.bookmark-modal.is-open:not([inert])')) return;
            if (global.NewtabFolderUI && NewtabFolderUI.isOpen && NewtabFolderUI.isOpen()) return;
            var about = document.getElementById('about-page-container');
            var upload = document.getElementById('video-upload-container');
            if (about && about.style.display === 'flex') return;
            if (upload && upload.style.display === 'flex') return;
            if (state.open) {
                e.preventDefault();
                e.stopImmediatePropagation();
                setOpen(false);
            }
        }, true);

        document.addEventListener('newtab:layout-change', function () {
            if (state.open) refreshLists();
        });
        var video = document.getElementById('video-background');
        if (video) ['play', 'pause', 'volumechange', 'error', 'loadeddata', 'emptied'].forEach(function (name) {
            video.addEventListener(name, syncRailControls);
        });
        if (global.ResizeObserver) new ResizeObserver(function () { moveIndicator(false); }).observe($('.side-rail-tabs'));
    }

    function init() {
        if (!global.NewtabWidgets) {
            console.warn('[NewtabSideRail] NewtabWidgets missing');
            return;
        }
        ensureMarkup();
        if (global.NewtabAppearance) global.NewtabAppearance.mountBackground($('#background-appearance'));
        bind();

        var rs = NewtabWidgets.getRailState ? NewtabWidgets.getRailState() : defaultRailLike();
        state.tab = rs.tab || 'personalize';
        setTab(state.tab);
        setOpen(!!rs.open);
        // Never leave arrange on just because rail was open on components
        if (!NewtabWidgets.isArranging || !NewtabWidgets.isArranging()) {
            /* idle */
        }
        refreshLists();
    }

    function defaultRailLike() {
        return { open: false, tab: 'personalize' };
    }

    global.NewtabSideRail = {
        init: init,
        open: function () { setOpen(true); },
        close: function () { setOpen(false); },
        toggle: function () { setOpen(!state.open); },
        isOpen: function () { return state.open; },
        setTab: setTab,
        refresh: refreshLists
    };
})(typeof window !== 'undefined' ? window : this);
