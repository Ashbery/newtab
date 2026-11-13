/* Local 2D character rig: illustrated blinks and a gently deforming mesh. */
(function () {
    'use strict';
    var instances = new Map();
    var ART = 'assets/character/nacho-companion.webp';
    var BLINK = 'assets/character/nacho-blink.webp';
    var WEBGL_FPS = 90, CANVAS_FPS = 60;
    // Match the previous 30 Hz response without making the gaze catch up
    // faster on high-refresh screens.
    var POINTER_RESPONSE_MS = -(1000 / 30) / Math.log(.82);

    function createFramePacer() {
        var previous = null, budget = 0, sincePaint = 0;
        return {
            reset: function () { previous = null; budget = sincePaint = 0; },
            advance: function (now, interval) {
                if (previous === null) { previous = now; return 0; }
                var delta = Math.max(0, now - previous); previous = now;
                budget += delta; sincePaint += delta;
                // Keep the fractional remainder. Resetting the deadline to
                // "now" would turn 90 fps into 72 fps on a 144 Hz screen.
                // The tiny tolerance only absorbs timestamp rounding.
                if (budget + .05 < interval) return null;
                budget = Math.max(0, budget - Math.floor((budget + .05) / interval) * interval);
                var elapsed = sincePaint; sincePaint = 0;
                return elapsed;
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
            'uniform float u_time; uniform float u_motion; uniform float u_greet; uniform vec2 u_pointer;',
            'void main(){ v_uv=a_uv; vec2 p=a_uv;',
            'float head=1.0-smoothstep(0.38,0.55,p.y);',
            'float breath=sin(u_time*1.35)*0.005*u_motion;',
            'p.y-=breath*(0.38+0.62*head);',
            'p.x+=(p.x-0.5)*breath*smoothstep(0.4,0.7,p.y);',
            'float hair=smoothstep(0.16,0.3,abs(p.x-0.51))*smoothstep(0.22,0.5,p.y)*(1.0-smoothstep(0.84,1.0,p.y));',
            'p.x+=sin(u_time*1.05+p.y*5.0)*0.008*hair*u_motion;',
            'p.y+=cos(u_time*0.95+p.x*3.0)*0.0025*hair*u_motion;',
            'float ear=(1.0-smoothstep(0.12,0.23,p.y))*smoothstep(0.10,0.2,abs(p.x-0.5));',
            'float earBeat=pow(max(0.0,sin(u_time*0.68)),18.0);',
            'p.x+=sign(p.x-0.5)*ear*(sin(u_time*12.0)*earBeat*0.003+u_greet*0.005)*u_motion;',
            'p.y-=ear*u_greet*0.004*u_motion;',
            'float headTurn=sin(u_time*0.47)*0.007*u_motion;',
            'vec2 d=p-vec2(0.52,0.46); p+=vec2(-d.y,d.x)*headTurn*head;',
            'p+=u_pointer*vec2(0.0045,0.0025)*head*u_motion;',
            'float plush=max(0.0,1.0-length((a_uv-vec2(0.55,0.65))/vec2(0.20,0.15)));',
            'p.y-=plush*u_greet*0.005*u_motion;',
            'gl_Position=vec4(p.x*2.0-1.0,1.0-p.y*2.0,0.0,1.0); }'
        ].join('\n');
        var fragment = [
            'precision mediump float; varying vec2 v_uv;',
            'uniform sampler2D u_art; uniform sampler2D u_closed; uniform float u_blink;',
            'void main(){ vec4 base=texture2D(u_art,v_uv); vec4 closed=texture2D(u_closed,v_uv);',
            // Only the illustrated eye regions replace the original texture.
            'vec2 left=(v_uv-vec2(0.435,0.317))/vec2(0.084,0.041);',
            'vec2 right=(v_uv-vec2(0.619,0.283))/vec2(0.082,0.041);',
            'float eye=max(1.0-smoothstep(0.55,1.0,dot(left,left)),1.0-smoothstep(0.55,1.0,dot(right,right)));',
            'gl_FragColor=mix(base,closed,eye*u_blink); }'
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
            var vertices = [], cols = 32, rows = 44;
            for (var row = 0; row < rows; row++) for (var col = 0; col < cols; col++) {
                var x = col / cols, y = row / rows, x2 = (col + 1) / cols, y2 = (row + 1) / rows;
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
            ['time','motion','greet','pointer','blink'].forEach(function (name) { uniforms[name] = gl.getUniformLocation(program, 'u_' + name); });
            return {
                kind: 'webgl', frameInterval: 1000 / WEBGL_FPS,
                draw: function (state) {
                    gl.viewport(0, 0, canvas.width, canvas.height);
                    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
                    gl.uniform1f(uniforms.time, state.time); gl.uniform1f(uniforms.motion, state.motion);
                    gl.uniform1f(uniforms.greet, state.greet); gl.uniform2f(uniforms.pointer, state.x, state.y);
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
        var source = document.createElement('canvas');
        source.width = 544; source.height = 725;
        var base = source.getContext('2d');
        base.imageSmoothingQuality = 'high'; base.drawImage(image, 0, 0, source.width, source.height);
        var eyes = document.createElement('canvas'); eyes.width = source.width; eyes.height = source.height;
        var eyePainter = eyes.getContext('2d');
        if (blinkImage) {
            eyePainter.drawImage(blinkImage, 0, 0, eyes.width, eyes.height);
            var mask = document.createElement('canvas'); mask.width = eyes.width; mask.height = eyes.height;
            var maskPainter = mask.getContext('2d');
            [[.435,.317,.084,.041],[.619,.283,.082,.041]].forEach(function (eye) {
                maskPainter.save(); maskPainter.translate(eye[0] * mask.width, eye[1] * mask.height);
                maskPainter.scale(eye[2] * mask.width, eye[3] * mask.height);
                var gradient = maskPainter.createRadialGradient(0, 0, .74, 0, 0, 1);
                gradient.addColorStop(0, '#fff'); gradient.addColorStop(1, 'transparent');
                maskPainter.fillStyle = gradient; maskPainter.fillRect(-1, -1, 2, 2); maskPainter.restore();
            });
            eyePainter.globalCompositeOperation = 'destination-in'; eyePainter.drawImage(mask, 0, 0);
        }
        var blended = document.createElement('canvas'); blended.width = source.width; blended.height = source.height;
        var blendPainter = blended.getContext('2d');
        var cols = 8, rows = 12, nodes = [], warped = [], cells = [];
        for (var row = 0; row <= rows; row++) for (var col = 0; col <= cols; col++) {
            nodes.push({ x: col / cols, y: row / rows }); warped.push({ x: 0, y: 0 });
        }
        for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) {
            var i = y * (cols + 1) + x;
            cells.push([i, i + 1, i + cols + 1], [i + cols + 1, i + 1, i + cols + 2]);
        }
        function smooth(a, b, v) { var t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); }
        function deform(uv, s, point) {
            var x = uv.x, y = uv.y, head = 1 - smooth(.38, .55, y);
            var breath = Math.sin(s.time * 1.35) * .005 * s.motion;
            y -= breath * (.38 + .62 * head); x += (x - .5) * breath * smooth(.4, .7, y);
            var hair = smooth(.16, .3, Math.abs(x - .51)) * smooth(.22, .5, y) * (1 - smooth(.84, 1, y));
            x += Math.sin(s.time * 1.05 + y * 5) * .008 * hair * s.motion;
            y += Math.cos(s.time * .95 + x * 3) * .0025 * hair * s.motion;
            var ear = (1 - smooth(.12, .23, y)) * smooth(.1, .2, Math.abs(x - .5));
            var beat = Math.pow(Math.max(0, Math.sin(s.time * .68)), 18);
            x += Math.sign(x - .5) * ear * (Math.sin(s.time * 12) * beat * .003 + s.greet * .005) * s.motion;
            y -= ear * s.greet * .004 * s.motion;
            var turn = Math.sin(s.time * .47) * .007 * s.motion, dx = x - .52, dy = y - .46;
            x -= dy * turn * head; y += dx * turn * head;
            x += s.x * .0045 * head * s.motion; y += s.y * .0025 * head * s.motion;
            var plush = Math.max(0, 1 - Math.hypot((uv.x - .55) / .2, (uv.y - .65) / .15));
            y -= plush * s.greet * .005 * s.motion;
            point.x = x * canvas.width; point.y = y * canvas.height;
        }
        function tracePoint(point, centerX, centerY, first) {
            // A subpixel overlap closes antialiased triangle seams without
            // changing the source silhouette or creating separate layers.
            var vx = point.x - centerX, vy = point.y - centerY, length = Math.hypot(vx, vy) || 1;
            var x = point.x + vx / length * .6, y = point.y + vy / length * .6;
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
            var centerX = (p.x + q.x + r.x) / 3, centerY = (p.y + q.y + r.y) / 3;
            ctx.save(); ctx.beginPath();
            tracePoint(p, centerX, centerY, true); tracePoint(q, centerX, centerY, false); tracePoint(r, centerX, centerY, false);
            ctx.closePath(); ctx.clip(); ctx.setTransform(aa, bb, cc, dd, ee, ff); ctx.drawImage(texture, 0, 0); ctx.restore();
        }
        return {
            kind: 'canvas2d', frameInterval: 1000 / CANVAS_FPS,
            draw: function (state) {
                ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
                var texture = source;
                if (blinkImage && state.blink > .001) {
                    blendPainter.clearRect(0, 0, source.width, source.height); blendPainter.globalAlpha = 1;
                    blendPainter.drawImage(source, 0, 0); blendPainter.globalAlpha = state.blink;
                    blendPainter.drawImage(eyes, 0, 0); blendPainter.globalAlpha = 1; texture = blended;
                }
                if (!state.motion) { ctx.drawImage(texture, 0, 0, canvas.width, canvas.height); return; }
                // Reuse the mesh points rather than allocating a new point
                // array on every frame; the fallback now paints at 60 fps.
                for (var n = 0; n < nodes.length; n++) deform(nodes[n], state, warped[n]);
                for (var c = 0; c < cells.length; c++) {
                    var cell = cells[c];
                    drawTriangle(texture, nodes[cell[0]], nodes[cell[1]], nodes[cell[2]], warped[cell[0]], warped[cell[1]], warped[cell[2]]);
                }
            },
            destroy: function () { source.width = eyes.width = blended.width = 1; }
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
        var disposed = false, visible = true, frame = 0, elapsed = 0, rig = null, greetUntil = 0, messageTimer = 0;
        var pacer = createFramePacer();
        var target = { x: 0, y: 0 }, pointer = { x: 0, y: 0 };
        var state = { time: 0, motion: 0, greet: 0, x: 0, y: 0, blink: 0, frames: 0, drawMs: 0 };
        var blinkImage = new Image();
        var ready = { art: false, blink: false, blinkFailed: false };
        function shouldMove() {
            return !!rig && mode !== 'off' && (mode === 'on' || !reduced.matches) && !document.hidden && visible && !document.body.matches('.is-arranging, .is-focus-mode') && !document.querySelector('.appearance-dialog[open]');
        }
        function drawNeutral() {
            if (!rig) return;
            state.motion = 0; state.greet = 0; state.blink = 0; state.x = 0; state.y = 0; rig.draw(state);
        }
        function sync() {
            if (disposed) return;
            if (shouldMove()) {
                root.dataset.motion = 'running';
                if (!frame) { pacer.reset(); frame = requestAnimationFrame(tick); }
            } else {
                if (frame) cancelAnimationFrame(frame); frame = 0;
                root.dataset.motion = !rig ? 'static' : mode === 'off' ? 'off' : mode === 'auto' && reduced.matches ? 'reduced' : 'paused';
                root.classList.remove('is-greeting'); drawNeutral();
            }
        }
        function tick(now) {
            frame = 0;
            if (!shouldMove()) return sync();
            var delta = pacer.advance(now, rig.frameInterval);
            if (delta !== null) {
                elapsed += delta;
                var follow = -Math.expm1(-delta / POINTER_RESPONSE_MS);
                pointer.x += (target.x - pointer.x) * follow; pointer.y += (target.y - pointer.y) * follow;
                state.time = elapsed / 1000; state.motion = 1; state.x = pointer.x; state.y = pointer.y;
                state.greet = Math.max(0, Math.min(1, (greetUntil - now) / 600));
                if (chatState === 'thinking') state.x += Math.sin(state.time * .7) * .3;
                if (chatState === 'replying') state.greet = Math.max(state.greet, .15 + .12 * Math.sin(state.time * 3));
                var phase = (state.time + 2.1) % 4.6;
                var blink = phase > 3 && phase < 3.26 ? Math.sin((phase - 3) / .26 * Math.PI) : 0;
                state.blink = Math.max(blink, state.greet > .4 ? .75 * state.greet : 0);
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
            var width = Math.max(1, Math.round(rendered.width * ratio)), height = Math.max(1, Math.round(rendered.height * ratio));
            if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
            if (rig) rig.draw(state);
        }
        function start() {
            if (disposed || rig || !ready.art || (!ready.blink && !ready.blinkFailed)) return;
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
            greetUntil = performance.now() + 750;
        }
        function move(event) {
            if (!shouldMove() || !finePointer.matches || event.pointerType !== 'mouse') return;
            var rect = trigger.getBoundingClientRect();
            target.x = Math.max(-1, Math.min(1, (event.clientX - rect.left) / rect.width * 2 - 1));
            target.y = Math.max(-1, Math.min(1, (event.clientY - rect.top) / rect.height * 2 - 1));
        }
        function resetPointer() { target.x = 0; target.y = 0; }
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
            if (rig) { root.dataset.renderer = rig.kind; resize(); drawNeutral(); } else root.classList.remove('has-rig');
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
            state: function () { return { motion: root.dataset.motion, frames: state.frames, blink: state.blink, mode: mode, enabled: mode !== 'off', reduced: reduced.matches, renderer: rig ? rig.kind : 'image', drawMs: state.drawMs, targetFps: rig ? Math.round(1000 / rig.frameInterval) : 0, animationTime: state.time, pointerX: pointer.x, pointerY: pointer.y, chatState: chatState }; }
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
