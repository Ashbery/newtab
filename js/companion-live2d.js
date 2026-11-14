/* Optional, local Live2D renderer. The portrait/chat DOM remains owned by companion.js. */
(function (global) {
    'use strict';
    var scriptRoot = new URL('../', document.currentScript ? document.currentScript.src : document.baseURI);
    var releaseMeta = document.querySelector('meta[name="newtab-release"]');
    var release = releaseMeta && /^[A-Za-z0-9._-]{1,80}$/.test(releaseMeta.content) ? releaseMeta.content : '';
    function versioned(url) { if (release) url.searchParams.set('v', release); return url; }
    var library = new URL('assets/vendor/cubism/', scriptRoot), loads = new Map();
    function script(file, ready) {
        if (ready()) return Promise.resolve();
        var url = versioned(new URL(file, library)).href;
        if (loads.has(url)) return loads.get(url);
        var pending = new Promise(function (resolve, reject) {
            var tag = document.createElement('script'), timer = setTimeout(function () { finish(new Error('Character library timed out')); }, 12000);
            function finish(error) {
                clearTimeout(timer); tag.onload = tag.onerror = null;
                if (error) { tag.remove(); loads.delete(url); reject(error); } else resolve();
            }
            tag.src = url; tag.async = true;
            tag.onload = function () { finish(ready() ? null : new Error('Character library is unavailable')); };
            tag.onerror = function () { finish(new Error('Character library could not be loaded')); };
            document.head.appendChild(tag);
        });
        loads.set(url, pending); return pending;
    }
    function loadRuntime() {
        return script('live2dcubismcore.min.js', function () { return !!global.Live2DCubismCore; }).then(function () {
            return script('companion-runtime.js', function () { return !!global.NewtabCubismRuntime; });
        });
    }
    function modeOf(mode) { return ['auto', 'on', 'off'].indexOf(mode) >= 0 ? mode : mode === false ? 'off' : mode === true ? 'on' : 'auto'; }
    function mount(options) {
        var root = options && options.root, canvas = options && options.canvas;
        if (!root || !canvas || !root.contains(canvas)) throw new TypeError('A character root and its canvas are required');
        var controller = new AbortController(), rig = null, disposed = false, failed = false, frame = 0, previous = null;
        var mode = modeOf(options.animationMode), manuallyPaused = false, visible = true, pageActive = true, activity = 'idle';
        var frames = 0, drawMs = 0, lastNeutral = false;
        var reduced = global.matchMedia('(prefers-reduced-motion: reduce)');
        var modelUrl = versioned(new URL(options.modelUrl || 'assets/character/live2d/nacho.model3.json', scriptRoot)).href;
        var timeout = setTimeout(function () { fail(new Error('Character model timed out')); }, 20000);
        root.dataset.live2d = 'loading';

        function notify(name, value) { if (typeof options[name] === 'function') { try { options[name](value); } catch (_) {} } }
        function isNeutral() { return mode === 'off' || mode === 'auto' && reduced.matches; }
        function shouldMove() {
            return !disposed && !failed && rig && !isNeutral() && !manuallyPaused && visible && pageActive && !document.hidden && root.isConnected &&
                !document.body.matches('.is-arranging, .is-focus-mode, .is-dragging-widget') && !document.querySelector('.appearance-dialog[open]');
        }
        function cancel() { if (frame) cancelAnimationFrame(frame); frame = 0; previous = null; }
        function paint(seconds, neutral) {
            if (!rig || disposed || failed) return;
            try { var start = performance.now(); rig.draw(seconds, neutral); drawMs = performance.now() - start; frames++; lastNeutral = !!neutral; }
            catch (error) { fail(error); }
        }
        function sync() {
            if (disposed || failed || !rig) return;
            var neutral = isNeutral();
            root.dataset.motion = shouldMove() ? 'running' : mode === 'off' ? 'off' : neutral ? 'reduced' : 'paused';
            if (neutral && !lastNeutral) paint(0, true);
            if (shouldMove()) { if (!frame) { previous = null; frame = requestAnimationFrame(tick); } }
            else cancel();
        }
        function tick(now) {
            frame = 0;
            if (!shouldMove()) return sync();
            var seconds = previous === null ? 0 : Math.max(0, Math.min(.05, (now - previous) / 1000)); previous = now;
            paint(seconds, false);
            if (shouldMove()) frame = requestAnimationFrame(tick);
        }
        function resize() {
            if (disposed || failed) return;
            root.style.setProperty('--companion-height', root.getBoundingClientRect().height + 'px');
            var rect = canvas.getBoundingClientRect();
            var ratio = Math.min(global.devicePixelRatio || 1, 2, 2048 / Math.max(1, rect.width, rect.height));
            var width = Math.max(1, Math.round(rect.width * ratio)), height = Math.max(1, Math.round(rect.height * ratio));
            if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; paint(0, isNeutral()); }
        }
        function fail(error) {
            if (disposed || failed) return;
            failed = true; clearTimeout(timeout); controller.abort(); cancel();
            root.dataset.live2d = 'unavailable'; root.dataset.renderer = 'image'; root.dataset.motion = 'static'; root.classList.remove('has-rig');
            if (rig) { rig.destroy(); rig = null; }
            notify('onError', error);
        }
        function lost(event) { event.preventDefault(); fail(new Error('Character graphics context was lost')); }
        function pageHide() { pageActive = false; sync(); }
        function pageShow() { pageActive = true; resize(); sync(); }
        var observer = new MutationObserver(sync);
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        var intersection = global.IntersectionObserver ? new IntersectionObserver(function (entries) { visible = entries[0].isIntersecting; sync(); }, { threshold: .01 }) : null;
        if (intersection) intersection.observe(root);
        var resizing = global.ResizeObserver ? new ResizeObserver(function () { resize(); sync(); }) : null;
        if (resizing) { resizing.observe(root); resizing.observe(canvas); }
        document.addEventListener('visibilitychange', sync); document.addEventListener('newtab:appearance-dialog', sync);
        global.addEventListener('resize', resize); global.addEventListener('pagehide', pageHide); global.addEventListener('pageshow', pageShow);
        reduced.addEventListener('change', sync); canvas.addEventListener('webglcontextlost', lost);
        // Missing optional models must not download or initialize Cubism.
        var manifest;
        var ready = Promise.resolve().then(function () {
            var url = new URL(modelUrl);
            if (url.origin !== location.origin || !/\.model3\.json$/i.test(url.pathname)) throw new Error('A local model3.json is required');
            return fetch(modelUrl, { signal: controller.signal, credentials: 'same-origin' });
        }).then(function (response) {
            if (!response.ok || Number(response.headers.get('content-length')) > 512 * 1024) throw new Error('Character model is unavailable');
            return response.arrayBuffer();
        }).then(function (bytes) {
            if (disposed || failed) return;
            if (!bytes.byteLength || bytes.byteLength > 512 * 1024) throw new Error('Invalid model manifest size');
            manifest = bytes; return loadRuntime();
        }).then(function () {
            if (disposed || failed) return null;
            resize();
            return global.NewtabCubismRuntime.create({ canvas: canvas, modelUrl: modelUrl, signal: controller.signal, manifest: manifest });
        }).then(function (loaded) {
            if (!loaded) return false;
            if (disposed || failed) { loaded.destroy(); return false; }
            rig = loaded; rig.setActivity(activity); clearTimeout(timeout);
            paint(0, true);
            if (failed) return false;
            root.dataset.live2d = 'ready'; root.dataset.renderer = 'live2d'; root.classList.add('has-rig');
            sync(); notify('onReady', api); return true;
        }).catch(function (error) { if (!disposed && !failed) fail(error); return false; });

        function destroy() {
            if (disposed) return; disposed = true; clearTimeout(timeout); controller.abort(); cancel();
            observer.disconnect(); if (intersection) intersection.disconnect(); if (resizing) resizing.disconnect();
            document.removeEventListener('visibilitychange', sync); document.removeEventListener('newtab:appearance-dialog', sync);
            global.removeEventListener('resize', resize); global.removeEventListener('pagehide', pageHide); global.removeEventListener('pageshow', pageShow);
            reduced.removeEventListener('change', sync); canvas.removeEventListener('webglcontextlost', lost);
            if (rig) { rig.destroy(); rig = null; }
            root.classList.remove('has-rig'); root.dataset.live2d = 'destroyed'; root.dataset.renderer = 'image';
        }
        var api = {
            ready: ready,
            setMode: function (value) { mode = modeOf(value); sync(); },
            setPaused: function (value) { manuallyPaused = !!value; sync(); },
            setActivity: function (value) { activity = value && ['idle', 'thinking', 'replying', 'error'].indexOf(value.state) >= 0 ? value.state : 'idle'; if (rig) rig.setActivity(activity); },
            resize: resize,
            state: function () { return Object.assign({ renderer: rig ? 'live2d' : 'image', status: root.dataset.live2d, motion: root.dataset.motion, mode: mode, frames: frames, drawMs: drawMs, reduced: reduced.matches, activity: activity, width: canvas.width, height: canvas.height }, rig ? rig.state() : {}); },
            destroy: destroy
        };
        return api;
    }
    global.NewtabCompanionLive2D = Object.freeze({ mount: mount });
})(window);
