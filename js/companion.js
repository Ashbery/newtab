/* Flat portrait: a fixed head, drawn eyelids and restrained breathing below the neck. */
(function () {
    'use strict';
    var instances = new Map();
    var ART = 'assets/character/nacho-companion.webp';
    var BLINK = 'assets/character/nacho-blink.webp';
    function createFramePacer() {
        var previous = null, sincePaint = 0, samples = [], cursor = 0, count = 0, cycle = 0;
        var refreshMs = 1000 / 60, divisor = 1;
        return {
            reset: function () {
                previous = null; sincePaint = cycle = cursor = count = 0;
                samples.length = 0; refreshMs = 1000 / 60; divisor = 1;
            },
            target: function () { return Math.round(1000 / refreshMs / divisor); },
            advance: function (now, fallback) {
                if (previous === null) { previous = now; return 0; }
                var delta = Math.max(0, now - previous); previous = now;
                // GPU paints every display refresh. The software renderer uses
                // whole refresh periods (60 at120Hz,72 at144Hz,66.7 at200Hz),
                // avoiding the old uneven90/60FPS beat against fast displays.
                if (delta >= 2 && delta <= 40) {
                    samples[cursor++ % 16] = delta; count++;
                    if (count === 8 || count % 16 === 0) {
                        var ordered = samples.slice().sort(function (a, b) { return a - b; });
                        refreshMs = ordered[Math.floor(ordered.length / 2)];
                        var next = fallback ? Math.max(1, Math.floor((1000 / refreshMs + 1) / 60)) : 1;
                        if (next !== divisor) { divisor = next; cycle = 0; }
                    }
                }
                sincePaint += delta;
                if (++cycle < divisor) return null;
                cycle = 0;
                var elapsed = sincePaint; sincePaint = 0;
                // A blocked main thread must not teleport hair or eyelids.
                return Math.min(elapsed, 80);
            }
        };
    }

    function animationMode(options) {
        if (['auto', 'on', 'off'].indexOf(options.animationMode) >= 0) return options.animationMode;
        return options.animation === false ? 'off' : options.animation === true ? 'on' : 'auto';
    }

    function createRig(canvas, image, blinkImage) {
        var gl;
        try { gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: 'low-power', preserveDrawingBuffer: false }); }
        catch (_) { return null; }
        if (!gl) return null;
        var vertex = [
            'attribute vec2 a_uv; varying vec2 v_uv;',
            'uniform float u_motion; uniform float u_breath;',
            'void main(){ v_uv=a_uv; vec2 p=a_uv;',
            // No invented head/neck rig for the flattened artwork. A mesh row
            // at this exact boundary prevents interpolation moving the face.
            'float chest=smoothstep(0.46,0.64,p.y)*(1.0-smoothstep(0.92,1.0,p.y));',
            'p.x+=(a_uv.x-0.5)*u_breath*0.55*chest*u_motion;',
            'p.y-=u_breath*0.28*chest*u_motion;',
            'gl_Position=vec4(p.x*2.0-1.0,1.0-p.y*2.0,0.0,1.0); }'
        ].join('\n');
        var fragment = [
            'precision mediump float; varying vec2 v_uv;',
            'uniform sampler2D u_art; uniform sampler2D u_closed; uniform float u_blink;',
            window.NewtabCompanionEyes.fragment,
            'void main(){ gl_FragColor=applyEyes(v_uv); }'
        ].join('\n');
        var program, v, f, buffer, textures = [];
        function shader(type, source) {
            var item = gl.createShader(type);
            gl.shaderSource(item, source); gl.compileShader(item);
            if (!gl.getShaderParameter(item, gl.COMPILE_STATUS)) { gl.deleteShader(item); throw new Error('Character shader unavailable'); }
            return item;
        }
        function dispose() {
            textures.forEach(function (texture) { gl.deleteTexture(texture); });
            if (buffer) gl.deleteBuffer(buffer); if (program) gl.deleteProgram(program);
            if (v) gl.deleteShader(v); if (f) gl.deleteShader(f);
        }
        try {
            v = shader(gl.VERTEX_SHADER, vertex); f = shader(gl.FRAGMENT_SHADER, fragment);
            program = gl.createProgram(); gl.attachShader(program, v); gl.attachShader(program, f); gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Character renderer unavailable');
            gl.useProgram(program);
            var vertices = [], cols = 32, rowPositions = [];
            for (var ry = 0; ry <= 44; ry++) rowPositions.push(ry / 44);
            rowPositions.push(.46); rowPositions.sort(function (a, b) { return a - b; });
            var rows = rowPositions.length - 1;
            for (var row = 0; row < rows; row++) for (var col = 0; col < cols; col++) {
                var x = col / cols, y = rowPositions[row], x2 = (col + 1) / cols, y2 = rowPositions[row + 1];
                vertices.push(x,y, x2,y, x,y2, x,y2, x2,y, x2,y2);
            }
            buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
            var position = gl.getAttribLocation(program, 'a_uv');
            gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
            [image, blinkImage || image].forEach(function (source, index) {
                // A power-of-two GPU texture permits mipmaps in WebGL 1. This
                // avoids sparkling hair/eyelash edges when the widget is small.
                // UVs restore the original aspect ratio on the character mesh.
                var textureSource = document.createElement('canvas');
                textureSource.width = textureSource.height = 1024;
                var painter = textureSource.getContext('2d');
                painter.imageSmoothingQuality = 'high';
                painter.drawImage(source, 0, 0, 1024, 1024);
                var texture = gl.createTexture(); textures.push(texture);
                gl.activeTexture(gl.TEXTURE0 + index); gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textureSource);
                gl.generateMipmap(gl.TEXTURE_2D);
                gl.uniform1i(gl.getUniformLocation(program, index ? 'u_closed' : 'u_art'), index);
            });
            var uniforms = {};
            ['motion','breath','blink'].forEach(function (name) { uniforms[name] = gl.getUniformLocation(program, 'u_' + name); });
            return {
                kind: 'webgl',
                draw: function (state) {
                    gl.viewport(0, 0, canvas.width, canvas.height);
                    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
                    gl.uniform1f(uniforms.motion, state.motion);
                    gl.uniform1f(uniforms.breath, state.breath);
                    gl.uniform1f(uniforms.blink, blinkImage ? state.blink : 0);
                    gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 2);
                },
                destroy: function () { dispose(); var extension = gl.getExtension('WEBGL_lose_context'); if (extension) extension.loseContext(); }
            };
        } catch (_) { dispose(); return null; }
    }

    // Brave can disable WebGL while ordinary Canvas2D remains available.
    // Draw the same illustrated textures through a small local mesh instead
    // of silently replacing the animated character with a still image.
    function createCanvasRig(canvas, image, blinkImage) {
        var ctx;
        try { ctx = canvas.getContext('2d', { alpha: true }); } catch (_) { return null; }
        if (!ctx) return null;
        var eyeRig = window.NewtabCompanionEyes.createCanvas(image, blinkImage, 544, 725);
        var source = eyeRig.paint(0);
        var cols = 8, rowPositions = [], nodes = [], warped = [], cells = [];
        for (var ry = 0; ry <= 12; ry++) rowPositions.push(ry / 12);
        rowPositions.push(.46); rowPositions.sort(function (a, b) { return a - b; });
        var rows = rowPositions.length - 1;
        for (var row = 0; row <= rows; row++) for (var col = 0; col <= cols; col++) {
            var nx = col / cols, ny = rowPositions[row];
            nodes.push({ x: nx, y: ny, chest: smooth(.46, .64, ny) * (1 - smooth(.92, 1, ny)) });
            warped.push({ x: 0, y: 0 });
        }
        for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) {
            var i = y * (cols + 1) + x;
            cells.push([i, i + 1, i + cols + 1], [i + cols + 1, i + 1, i + cols + 2]);
        }
        function smooth(a, b, v) { var t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); }
        function deform(uv, s, point) {
            var x = uv.x, y = uv.y, m = s.motion;
            y -= s.breath * .28 * uv.chest * m;
            x += (uv.x - .5) * s.breath * .55 * uv.chest * m;
            point.x = x * canvas.width; point.y = y * canvas.height;
        }
        function tracePoint(point, previous, next, orientation, first) {
            // Offset both adjoining edges by a full backing pixel. Moving a
            // vertex away from the centroid leaves smaller perpendicular gaps
            // along diagonal edges, visible as seams on dark backgrounds.
            var ax = point.x - previous.x, ay = point.y - previous.y;
            var bx = next.x - point.x, by = next.y - point.y;
            var al = Math.hypot(ax, ay) || 1, bl = Math.hypot(bx, by) || 1;
            var nx = ay / al * orientation, ny = -ax / al * orientation;
            var mx = by / bl * orientation, my = -bx / bl * orientation;
            var offset = 1 / Math.max(.2, 1 + nx * mx + ny * my);
            var x = point.x + (nx + mx) * offset, y = point.y + (ny + my) * offset;
            if (first) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        function drawTriangle(texture, a, b, c, p, q, r) {
            var ax = a.x * source.width, ay = a.y * source.height;
            var bx = b.x * source.width, by = b.y * source.height;
            var cx = c.x * source.width, cy = c.y * source.height;
            var denominator = ax * (by - cy) + bx * (cy - ay) + cx * (ay - by);
            var aa = (p.x * (by - cy) + q.x * (cy - ay) + r.x * (ay - by)) / denominator;
            var bb = (p.y * (by - cy) + q.y * (cy - ay) + r.y * (ay - by)) / denominator;
            var cc = (p.x * (cx - bx) + q.x * (ax - cx) + r.x * (bx - ax)) / denominator;
            var dd = (p.y * (cx - bx) + q.y * (ax - cx) + r.y * (bx - ax)) / denominator;
            var ee = p.x - aa * ax - cc * ay, ff = p.y - bb * ax - dd * ay;
            var orientation = (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x) >= 0 ? 1 : -1;
            ctx.save(); ctx.beginPath();
            tracePoint(p, r, q, orientation, true); tracePoint(q, p, r, orientation, false); tracePoint(r, q, p, orientation, false);
            ctx.closePath(); ctx.clip(); ctx.setTransform(aa, bb, cc, dd, ee, ff); ctx.drawImage(texture, 0, 0); ctx.restore();
        }
        return {
            kind: 'canvas2d',
            draw: function (state) {
                ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
                var texture = eyeRig.paint(state.blink);
                if (!state.motion) { ctx.drawImage(texture, 0, 0, canvas.width, canvas.height); return; }
                // Regional weights are precomputed; frames allocate no mesh
                // points and the displayed texture remains bounded in size.
                for (var n = 0; n < nodes.length; n++) deform(nodes[n], state, warped[n]);
                for (var c = 0; c < cells.length; c++) {
                    var cell = cells[c];
                    drawTriangle(texture, nodes[cell[0]], nodes[cell[1]], nodes[cell[2]], warped[cell[0]], warped[cell[1]], warped[cell[2]]);
                }
            },
            destroy: function () { eyeRig.destroy(); }
        };
    }

    function mount(body, widget) {
        if (!body || !widget) return function () {};
        if (instances.has(widget.id)) instances.get(widget.id).destroy();
        var options = widget.options || {};
        var root = document.createElement('div');
        root.className = 'home-companion'; root.dataset.motion = 'loading';
        root.innerHTML = '<button class="companion-trigger" type="button" aria-label="與角色聊天" aria-haspopup="dialog">' +
            '<span class="companion-scene" aria-hidden="true"><span class="companion-disc companion-surface"></span>' +
            '<span class="companion-figure"><img class="companion-portrait" src="' + ART + '" alt="" width="1086" height="1448" draggable="false"><canvas class="companion-canvas" width="544" height="725"></canvas></span>' +
            '<span class="companion-flourish"><svg class="companion-spark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z"/></svg></span></span>' +
            '<span class="companion-action-label">和我聊聊 <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M20 11.5a8 8 0 0 1-8 8H5l-3 2v-10a9 9 0 0 1 18 0Z"/><path d="M7 11h.01M12 11h.01M17 11h.01"/></svg></span></button>' +
            '<p class="companion-message" aria-live="polite"></p>';
        body.appendChild(root);
        var trigger = root.querySelector('.companion-trigger');
        var image = root.querySelector('.companion-portrait'), canvas = root.querySelector('canvas'), message = root.querySelector('.companion-message');
        var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
        var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
        var mode = animationMode(options), chatState = 'idle';
        var disposed = false, visible = true, frame = 0, rig = null, greeting = 0, hovered = false, messageTimer = 0;
        var pacer = createFramePacer();
        var target = { x: 0, y: 0 }, motionInput = { x: 0, y: 0, hover: false, greeting: 0, chatState: 'idle' };
        var dynamics = window.NewtabCompanionDynamics && window.NewtabCompanionDynamics.create({ seed: widget.id, fixedHead: true });
        var state = { motion: 0, frames: 0, drawMs: 0, time: 0, headX: 0, headY: 0, headRoll: 0, bodyRoll: 0, breath: 0,
            hairLeft: 0, hairRight: 0, earLeft: 0, earRight: 0, blink: 0, gazeX: 0, gazeY: 0, greet: 0 };
        if (dynamics) Object.assign(state, dynamics.advance(0, motionInput));
        var blinkImage = new Image();
        var ready = { art: false, blink: false, blinkFailed: false };
        function shouldMove() {
            return !!rig && mode !== 'off' && (mode === 'on' || !reduced.matches) && !document.hidden && visible && !document.body.matches('.is-arranging, .is-focus-mode') && !document.querySelector('.appearance-dialog[open]');
        }
        function drawNeutral() {
            if (!rig) return;
            // Keep the last live pose for a seamless resume, even when the
            // user explicitly chooses a neutral still image while paused.
            rig.draw(Object.assign({}, state, { motion: 0, blink: 0, greet: 0 }));
        }
        function sync() {
            if (disposed) return;
            if (shouldMove()) {
                root.dataset.motion = 'running';
                if (!frame) { pacer.reset(); frame = requestAnimationFrame(tick); }
            } else {
                if (frame) cancelAnimationFrame(frame); frame = 0;
                root.dataset.motion = !rig ? 'static' : mode === 'off' ? 'off' : mode === 'auto' && reduced.matches ? 'reduced' : 'paused';
                root.classList.remove('is-greeting');
                if (mode === 'off' || mode === 'auto' && reduced.matches) drawNeutral();
            }
        }
        function tick(now) {
            frame = 0;
            if (!shouldMove()) return sync();
            var delta = pacer.advance(now, rig.kind === 'canvas2d');
            if (delta !== null) {
                motionInput.x = target.x; motionInput.y = target.y; motionInput.hover = hovered;
                motionInput.greeting = greeting; motionInput.chatState = chatState;
                Object.assign(state, dynamics.advance(delta, motionInput)); state.motion = 1;
                var paintStarted = performance.now(); rig.draw(state); state.drawMs = performance.now() - paintStarted; state.frames++;
                root.classList.toggle('is-greeting', state.greet > .02);
            }
            frame = requestAnimationFrame(tick);
        }
        function resize() {
            if (disposed) return;
            var rect = root.getBoundingClientRect();
            root.style.setProperty('--companion-height', rect.height + 'px');
            var rendered = canvas.getBoundingClientRect(), ratio = Math.min(window.devicePixelRatio || 1, 2);
            var longest = rig && rig.kind === 'canvas2d' ? 1024 : 2048;
            ratio = Math.min(ratio, longest / Math.max(1, rendered.width, rendered.height));
            var width = Math.max(1, Math.round(rendered.width * ratio)), height = Math.max(1, Math.round(rendered.height * ratio));
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width; canvas.height = height;
                if (rig) { if (mode === 'off' || mode === 'auto' && reduced.matches) drawNeutral(); else rig.draw(state); }
            }
        }
        function start() {
            if (disposed || rig || !ready.art || (!ready.blink && !ready.blinkFailed)) return;
            // The portrait and chat button remain usable if an optional
            // animation module failed to download on a first uncached visit.
            if (!dynamics || !window.NewtabCompanionEyes) { root.dataset.motion = 'static'; return; }
            rig = createRig(canvas, image, ready.blink ? blinkImage : null);
            if (!rig) useCanvasFallback();
            if (rig) { resize(); drawNeutral(); root.classList.add('has-rig'); root.dataset.renderer = rig.kind; }
            sync();
        }
        function useCanvasFallback() {
            canvas.removeEventListener('webglcontextlost', lost);
            var fallback = document.createElement('canvas'); fallback.className = 'companion-canvas';
            fallback.width = canvas.width; fallback.height = canvas.height; canvas.replaceWith(fallback); canvas = fallback;
            rig = createCanvasRig(canvas, image, ready.blink ? blinkImage : null);
        }
        function loaded() { ready.art = true; start(); }
        function artFailed() { root.dataset.motion = 'unavailable'; root.classList.add('art-unavailable'); }
        image.addEventListener('load', loaded); image.addEventListener('error', artFailed);
        if (image.complete && image.naturalWidth) loaded();
        blinkImage.onload = function () { ready.blink = true; start(); };
        blinkImage.onerror = function () { ready.blinkFailed = true; start(); };
        blinkImage.src = BLINK;
        function greet() {
            if (document.body.classList.contains('is-arranging')) return;
            message.textContent = String(options.greeting || '今天想聊些什麼？').slice(0, 80);
            root.classList.add('is-speaking'); clearTimeout(messageTimer);
            messageTimer = setTimeout(function () { root.classList.remove('is-speaking'); }, 2400);
            greeting++;
        }
        function move(event) {
            if (!shouldMove() || !finePointer.matches || event.pointerType !== 'mouse') return;
            hovered = true;
            var rect = trigger.getBoundingClientRect();
            target.x = Math.max(-1, Math.min(1, (event.clientX - rect.left) / rect.width * 2 - 1));
            target.y = Math.max(-1, Math.min(1, (event.clientY - rect.top) / rect.height * 2 - 1));
        }
        function resetPointer() { target.x = 0; target.y = 0; hovered = false; }
        function escape(event) { if (event.key === 'Escape') root.classList.remove('is-speaking'); }
        function updateChatState(value) {
            if (value === 'speaking') value = 'replying';
            chatState = ['idle', 'thinking', 'replying', 'error'].indexOf(value) >= 0 ? value : 'idle';
            root.dataset.chatState = chatState;
        }
        function chatChanged(event) { if (event.detail && event.detail.widgetId === widget.id) updateChatState(event.detail.state); }
        function openChat(event) {
            event.preventDefault();
            if (document.body.classList.contains('is-arranging')) return;
            greet();
            if (window.NewtabCharacterChat && typeof NewtabCharacterChat.open === 'function') NewtabCharacterChat.open(widget.id);
            else { message.textContent = '聊天面板尚未載入，請重新整理後再試。'; root.classList.add('is-speaking'); }
        }
        trigger.addEventListener('pointermove', move); trigger.addEventListener('pointerenter', greet);
        trigger.addEventListener('pointerleave', resetPointer); trigger.addEventListener('focus', greet);
        trigger.addEventListener('blur', resetPointer); trigger.addEventListener('keydown', escape); trigger.addEventListener('click', openChat);
        document.addEventListener('visibilitychange', sync); reduced.addEventListener('change', sync);
        document.addEventListener('newtab:appearance-dialog', sync);
        document.addEventListener('newtab:chat-state', chatChanged);
        var observer = new MutationObserver(sync);
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        var intersection = window.IntersectionObserver ? new IntersectionObserver(function (entries) { visible = entries[0].isIntersecting; sync(); }, { threshold: .05 }) : null;
        if (intersection) intersection.observe(root);
        var resizeObserver = window.ResizeObserver ? new ResizeObserver(resize) : null;
        if (resizeObserver) resizeObserver.observe(root);
        function lost(event) {
            event.preventDefault(); if (disposed) return;
            if (frame) cancelAnimationFrame(frame); frame = 0;
            var previous = rig; rig = null;
            useCanvasFallback();
            if (previous) previous.destroy();
            if (rig) {
                root.dataset.renderer = rig.kind; resize();
                if (mode === 'off' || mode === 'auto' && reduced.matches) drawNeutral(); else rig.draw(state);
            } else root.classList.remove('has-rig');
            sync();
        }
        canvas.addEventListener('webglcontextlost', lost);
        function destroy() {
            if (disposed) return; disposed = true;
            if (frame) cancelAnimationFrame(frame); clearTimeout(messageTimer);
            document.removeEventListener('visibilitychange', sync); reduced.removeEventListener('change', sync);
            document.removeEventListener('newtab:appearance-dialog', sync);
            document.removeEventListener('newtab:chat-state', chatChanged);
            observer.disconnect(); if (intersection) intersection.disconnect(); if (resizeObserver) resizeObserver.disconnect();
            image.removeEventListener('load', loaded); image.removeEventListener('error', artFailed);
            blinkImage.onload = blinkImage.onerror = null;
            canvas.removeEventListener('webglcontextlost', lost);
            if (rig) rig.destroy(); root.remove(); instances.delete(widget.id);
        }
        instances.set(widget.id, {
            destroy: destroy,
            setAnimation: function (value) { mode = ['auto', 'on', 'off'].indexOf(value) >= 0 ? value : value === false ? 'off' : 'on'; sync(); },
            setChatState: updateChatState,
            state: function () { return { motion: root.dataset.motion, frames: state.frames, blink: state.blink, mode: mode, enabled: mode !== 'off', reduced: reduced.matches, renderer: rig ? rig.kind : 'image', drawMs: state.drawMs, targetFps: rig ? pacer.target() : 0, animationTime: state.time, pointerX: state.gazeX / .004, pointerY: state.gazeY / .003, chatState: chatState,
                pose: { headX: state.headX, headY: state.headY, headRoll: state.headRoll, bodyRoll: state.bodyRoll, breath: state.breath, hairLeft: state.hairLeft, hairRight: state.hairRight, earLeft: state.earLeft, earRight: state.earRight, gazeX: state.gazeX, gazeY: state.gazeY, greet: state.greet } }; }
        });
        return destroy;
    }
    window.NewtabCompanion = {
        mount: mount,
        setAnimation: function (id, value) {
            var mode = ['auto', 'on', 'off'].indexOf(value) >= 0 ? value : value === false ? 'off' : 'on';
            if (window.NewtabWidgets && window.NewtabWidgets.setCompanionOptions) return window.NewtabWidgets.setCompanionOptions(id, { animationMode: mode, animation: mode !== 'off' });
            if (instances.has(id)) instances.get(id).setAnimation(mode);
        },
        setChatState: function (id, value) { if (instances.has(id)) instances.get(id).setChatState(value); },
        getState: function (id) { return instances.has(id) ? instances.get(id).state() : null; }
    };
})();
