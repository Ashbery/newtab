/* Local 2D character rig: illustrated blinks and a gently deforming mesh. */
(function () {
    'use strict';
    var instances = new Map();
    var ART = 'assets/character/nacho-companion.webp';
    var BLINK = 'assets/character/nacho-blink.webp';
    var FRAME_INTERVAL = 1000 / 30;

    function chatUrl(value) {
        try {
            var url = new URL(value || 'https://chatgpt.com/');
            if (url.protocol === 'https:' && url.hostname === 'chatgpt.com' && !url.username && !url.password && !url.port) return url.href;
        } catch (_) { /* Invalid saved values use the safe default. */ }
        return 'https://chatgpt.com/';
    }

    function createRig(canvas, image, blinkImage) {
        var gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: 'low-power', preserveDrawingBuffer: false });
        if (!gl) return null;
        var vertex = [
            'attribute vec2 a_uv; varying vec2 v_uv;',
            'uniform float u_time; uniform float u_motion; uniform float u_greet; uniform vec2 u_pointer;',
            'void main(){ v_uv=a_uv; vec2 p=a_uv;',
            'float head=1.0-smoothstep(0.38,0.55,p.y);',
            'float breath=sin(u_time*1.35)*0.0027*u_motion;',
            'p.y-=breath*(0.38+0.62*head);',
            'p.x+=(p.x-0.5)*breath*smoothstep(0.4,0.7,p.y);',
            'float hair=smoothstep(0.16,0.3,abs(p.x-0.51))*smoothstep(0.22,0.5,p.y)*(1.0-smoothstep(0.84,1.0,p.y));',
            'p.x+=sin(u_time*1.05+p.y*5.0)*0.0048*hair*u_motion;',
            'p.y+=cos(u_time*0.95+p.x*3.0)*0.0015*hair*u_motion;',
            'float ear=(1.0-smoothstep(0.12,0.23,p.y))*smoothstep(0.10,0.2,abs(p.x-0.5));',
            'float earBeat=pow(max(0.0,sin(u_time*0.68)),18.0);',
            'p.x+=sign(p.x-0.5)*ear*(sin(u_time*12.0)*earBeat*0.003+u_greet*0.005)*u_motion;',
            'p.y-=ear*u_greet*0.004*u_motion;',
            'float headTurn=sin(u_time*0.47)*0.0035*u_motion;',
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

    function mount(body, widget) {
        if (!body || !widget) return function () {};
        if (instances.has(widget.id)) instances.get(widget.id).destroy();
        var options = widget.options || {};
        var root = document.createElement('div');
        root.className = 'home-companion'; root.dataset.motion = 'loading';
        root.innerHTML = '<a class="companion-trigger" target="_blank" rel="noopener noreferrer" aria-label="開啟 ChatGPT 對話">' +
            '<span class="companion-scene" aria-hidden="true"><span class="companion-disc companion-surface"></span>' +
            '<span class="companion-figure"><img class="companion-portrait" src="' + ART + '" alt="" width="1086" height="1448" draggable="false"><canvas class="companion-canvas" width="544" height="725"></canvas></span>' +
            '<span class="companion-flourish"><svg class="companion-spark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z"/></svg></span></span>' +
            '<span class="companion-action-label">和 ChatGPT 聊聊 <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 5h11v11M19 5 5 19"/></svg></span></a>' +
            '<p class="companion-message" aria-live="polite"></p>';
        body.appendChild(root);
        var trigger = root.querySelector('.companion-trigger');
        trigger.href = chatUrl(options.chatUrl || (options.companion && options.companion.chatUrl));
        var image = root.querySelector('.companion-portrait'), canvas = root.querySelector('canvas'), message = root.querySelector('.companion-message');
        var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
        var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
        var enabled = options.animation !== false;
        var disposed = false, visible = true, frame = 0, lastFrame = 0, elapsed = 0, rig = null, greetUntil = 0, messageTimer = 0;
        var target = { x: 0, y: 0 }, pointer = { x: 0, y: 0 };
        var state = { time: 0, motion: 0, greet: 0, x: 0, y: 0, blink: 0, frames: 0 };
        var blinkImage = new Image();
        var ready = { art: false, blink: false, blinkFailed: false };
        function shouldMove() {
            return !!rig && enabled && !reduced.matches && !document.hidden && visible && !document.body.matches('.is-arranging, .is-focus-mode') && !document.querySelector('.appearance-dialog[open]');
        }
        function drawNeutral() {
            if (!rig) return;
            state.motion = 0; state.greet = 0; state.blink = 0; state.x = 0; state.y = 0; rig.draw(state);
        }
        function sync() {
            if (disposed) return;
            if (shouldMove()) {
                root.dataset.motion = 'running';
                if (!frame) { lastFrame = 0; frame = requestAnimationFrame(tick); }
            } else {
                if (frame) cancelAnimationFrame(frame); frame = 0;
                root.dataset.motion = !rig ? 'static' : reduced.matches ? 'reduced' : enabled ? 'paused' : 'off';
                root.classList.remove('is-greeting'); drawNeutral();
            }
        }
        function tick(now) {
            frame = 0;
            if (!shouldMove()) return sync();
            if (!lastFrame || now - lastFrame >= FRAME_INTERVAL - 1) {
                var delta = lastFrame ? Math.min(80, now - lastFrame) : FRAME_INTERVAL;
                lastFrame = now; elapsed += delta;
                pointer.x += (target.x - pointer.x) * .18; pointer.y += (target.y - pointer.y) * .18;
                state.time = elapsed / 1000; state.motion = 1; state.x = pointer.x; state.y = pointer.y;
                state.greet = Math.max(0, Math.min(1, (greetUntil - now) / 600));
                var phase = (state.time + 2.15) % 5.9;
                var blink = phase > 4.3 && phase < 4.5 ? Math.sin((phase - 4.3) / .2 * Math.PI) : 0;
                state.blink = Math.max(blink, state.greet > .4 ? .75 * state.greet : 0);
                rig.draw(state); state.frames++;
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
            if (rig) { resize(); drawNeutral(); root.classList.add('has-rig'); }
            sync();
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
        trigger.addEventListener('pointermove', move); trigger.addEventListener('pointerenter', greet);
        trigger.addEventListener('pointerleave', resetPointer); trigger.addEventListener('focus', greet);
        trigger.addEventListener('blur', resetPointer); trigger.addEventListener('keydown', escape); trigger.addEventListener('click', greet);
        document.addEventListener('visibilitychange', sync); reduced.addEventListener('change', sync);
        document.addEventListener('newtab:appearance-dialog', sync);
        var observer = new MutationObserver(sync);
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        var intersection = window.IntersectionObserver ? new IntersectionObserver(function (entries) { visible = entries[0].isIntersecting; sync(); }, { threshold: .05 }) : null;
        if (intersection) intersection.observe(root);
        var resizeObserver = window.ResizeObserver ? new ResizeObserver(resize) : null;
        if (resizeObserver) resizeObserver.observe(root);
        function lost(event) {
            event.preventDefault(); if (disposed) return;
            if (frame) cancelAnimationFrame(frame); frame = 0;
            rig = null; root.classList.remove('has-rig'); root.dataset.motion = 'static';
        }
        canvas.addEventListener('webglcontextlost', lost); canvas.addEventListener('webglcontextrestored', start);
        function destroy() {
            if (disposed) return; disposed = true;
            if (frame) cancelAnimationFrame(frame); clearTimeout(messageTimer);
            document.removeEventListener('visibilitychange', sync); reduced.removeEventListener('change', sync);
            document.removeEventListener('newtab:appearance-dialog', sync);
            observer.disconnect(); if (intersection) intersection.disconnect(); if (resizeObserver) resizeObserver.disconnect();
            image.removeEventListener('load', loaded); image.removeEventListener('error', artFailed);
            blinkImage.onload = blinkImage.onerror = null;
            canvas.removeEventListener('webglcontextlost', lost); canvas.removeEventListener('webglcontextrestored', start);
            if (rig) rig.destroy(); root.remove(); instances.delete(widget.id);
        }
        instances.set(widget.id, {
            destroy: destroy,
            setAnimation: function (value) { enabled = value; sync(); },
            state: function () { return { motion: root.dataset.motion, frames: state.frames, blink: state.blink, enabled: enabled, renderer: rig ? 'webgl' : 'image' }; }
        });
        return destroy;
    }
    window.NewtabCompanion = {
        mount: mount, safeChatUrl: chatUrl,
        setAnimation: function (id, value) {
            if (window.NewtabWidgets && window.NewtabWidgets.setCompanionOptions) return window.NewtabWidgets.setCompanionOptions(id, { animation: value !== false });
            if (instances.has(id)) instances.get(id).setAnimation(value !== false);
        },
        getState: function (id) { return instances.has(id) ? instances.get(id).state() : null; }
    };
})();
