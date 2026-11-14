/* Application adapter for the pinned Cubism SDK for Web 5-r.5.
 * Rebuild with tools/build-companion-live2d.cjs; vendor licenses are preserved.
 */
import { CubismFramework, LogLevel } from '@cubism/live2dcubismframework';
import { CubismUserModel } from '@cubism/model/cubismusermodel';
import { CubismMatrix44 } from '@cubism/math/cubismmatrix44';
import { CubismShaderManager_WebGL } from '@cubism/rendering/cubismshader_webgl';
import vertex from '@cubism-shaders/vertshadersrc.vert';
import masked from '@cubism-shaders/vertshadersrcmasked.vert';
import maskVertex from '@cubism-shaders/vertshadersrcsetupmask.vert';
import maskFragment from '@cubism-shaders/fragshadersrcsetupmask.frag';
import fragment from '@cubism-shaders/fragshadersrcpremultipliedalpha.frag';
import maskedFragment from '@cubism-shaders/fragshadersrcmaskpremultipliedalpha.frag';
import inverted from '@cubism-shaders/fragshadersrcmaskinvertedpremultipliedalpha.frag';
import copyVertex from '@cubism-shaders/vertshadersrccopy.vert';
import copyFragment from '@cubism-shaders/fragshadersrccopy.frag';
import colorBlend from '@cubism-shaders/fragshadersrccolorblend.frag';
import alphaBlend from '@cubism-shaders/fragshadersrcalphablend.frag';
import blendVertex from '@cubism-shaders/vertshadersrcblend.vert';
import blendFragment from '@cubism-shaders/fragshadersrcpremultipliedalphablend.frag';

const shaderSources: Record<string, string> = {
    'vertshadersrc.vert': vertex, 'vertshadersrcmasked.vert': masked,
    'vertshadersrcsetupmask.vert': maskVertex, 'fragshadersrcsetupmask.frag': maskFragment,
    'fragshadersrcpremultipliedalpha.frag': fragment,
    'fragshadersrcmaskpremultipliedalpha.frag': maskedFragment,
    'fragshadersrcmaskinvertedpremultipliedalpha.frag': inverted,
    'vertshadersrccopy.vert': copyVertex, 'fragshadersrccopy.frag': copyFragment,
    'fragshadersrccolorblend.frag': colorBlend, 'fragshadersrcalphablend.frag': alphaBlend,
    'vertshadersrcblend.vert': blendVertex, 'fragshadersrcpremultipliedalphablend.frag': blendFragment
};
let owners = 0;
const abortError = () => new DOMException('Character loading cancelled', 'AbortError');
function check(signal: AbortSignal) { if (signal.aborted) throw abortError(); }
function reference(value: unknown, base: URL, version: string): string {
    if (typeof value !== 'string' || !value || value.length > 512) throw new Error('Invalid model resource');
    const url = new URL(value, base);
    if (url.origin !== location.origin || !url.pathname.startsWith(base.pathname) || url.search || url.hash) throw new Error('Model resources must stay in the model directory');
    if (version) url.searchParams.set('v', version);
    return url.href;
}
async function read(url: string, signal: AbortSignal, limit: number): Promise<ArrayBuffer> {
    const response = await fetch(url, { signal, credentials: 'same-origin', cache: 'default' });
    if (!response.ok) throw new Error('Character resource could not be loaded');
    const size = Number(response.headers.get('content-length'));
    if (size > limit) throw new Error('Character resource is too large');
    const bytes = await response.arrayBuffer();
    check(signal);
    if (!bytes.byteLength || bytes.byteLength > limit) throw new Error('Invalid character resource size');
    return bytes;
}

class CharacterModel extends CubismUserModel {
    private parameters: Map<string, number>;
    private time = 0;
    private blinkStart = -1;
    private nextBlink = 2.8 + Math.random() * 3.5;
    private mouth = 0;
    private idleFade = 0;
    private activityTilt = 0;
    private activityNod = 0;
    private earStart = 2.8 + Math.random() * 1.6;
    private earLeft = Math.random() < .5;
    private earAmplitude = .6 + Math.random() * .08;
    private matrix = new CubismMatrix44();
    private bounds: { x: number, y: number, width: number, height: number };
    private preserveCanvas = false;
    private activity = 'idle';

    prepare(preserveCanvas = false) {
        if (!this._model) throw new Error('Model could not be decoded');
        const core = this._model.getModel();
        this.parameters = new Map(core.parameters.ids.map((id, index) => [id, index]));
        this._model.update();
        let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
        for (let i = 0; i < core.drawables.count; i++) {
            if (core.drawables.opacities[i] <= 0) continue;
            const p = core.drawables.vertexPositions[i];
            for (let j = 0; j < p.length; j += 2) { x1 = Math.min(x1, p[j]); x2 = Math.max(x2, p[j]); y1 = Math.min(y1, p[j + 1]); y2 = Math.max(y2, p[j + 1]); }
        }
        if (![x1, y1, x2, y2].every(Number.isFinite) || x1 >= x2 || y1 >= y2) throw new Error('Model has no visible geometry');
        this.bounds = { x: (x1 + x2) / 2, y: (y1 + y2) / 2, width: x2 - x1, height: y2 - y1 };
        if (preserveCanvas) {
            const c = core.canvasinfo;
            if (![c.CanvasWidth, c.CanvasHeight, c.CanvasOriginX, c.CanvasOriginY, c.PixelsPerUnit].every(Number.isFinite) || c.CanvasWidth <= 0 || c.CanvasHeight <= 0 || c.PixelsPerUnit <= 0) throw new Error('Invalid model canvas');
            // Core coordinates are Y-up, with the canvas origin measured from
            // its lower-left corner. Fit the authored canvas just like the
            // portrait's object-fit:contain, with no extra margin or recentering.
            this.bounds = { x: (c.CanvasWidth / 2 - c.CanvasOriginX) / c.PixelsPerUnit,
                y: (c.CanvasHeight / 2 - c.CanvasOriginY) / c.PixelsPerUnit,
                width: c.CanvasWidth / c.PixelsPerUnit, height: c.CanvasHeight / c.PixelsPerUnit };
            this.preserveCanvas = true;
        }
        this.neutral();
    }
    set(id: string, value: number) { const index = this.parameters.get(id); if (index !== undefined) this._model.setParameterValueByIndex(index, value); }
    lockHead() { ['ParamAngleX', 'ParamAngleY', 'ParamAngleZ', 'ParamBodyAngleX', 'ParamBodyAngleY', 'ParamBodyAngleZ'].forEach(id => this.set(id, 0)); }
    neutral() {
        this._model.loadParameters();
        this.set('ParamEyeLOpen', 1); this.set('ParamEyeROpen', 1); this.set('ParamMouthOpenY', 0);
        this.idleFade = 0; this.activityTilt = 0; this.activityNod = 0;
        this.set('ParamNachoHeadTilt', 0); this.set('ParamNachoHeadNod', 0);
        this.set('ParamNachoEarL', 0); this.set('ParamNachoEarR', 0);
        this.lockHead();
        if (this._pose) this._pose.updateParameters(this._model, 0);
        if (this._physics) this._physics.stabilization(this._model);
        this.lockHead(); this._model.update();
    }
    advance(seconds: number) {
        this.time += seconds;
        this._model.loadParameters();
        if (this.blinkStart < 0 && this.time >= this.nextBlink) this.blinkStart = this.time;
        let openness = 1;
        if (this.blinkStart >= 0) {
            const t = this.time - this.blinkStart;
            if (t < .085) openness = 1 - t / .085;
            else if (t < .12) openness = 0;
            else if (t < .27) openness = (t - .12) / .15;
            else { this.blinkStart = -1; this.nextBlink = this.time + 2.8 + Math.random() * 3.5; }
        }
        // This is a text-reply expression, not audio lip synchronization.
        const target = this.activity === 'replying' ? .14 + .09 * Math.sin(this.time * 7.1) : 0;
        this.mouth += (target - this.mouth) * (1 - Math.exp(-seconds * 15));
        this.set('ParamEyeLOpen', openness); this.set('ParamEyeROpen', openness);
        this.set('ParamMouthOpenY', this.mouth);
        this.set('ParamBreath', .5 - .5 * Math.cos(this.time * Math.PI * 2 / 5.2));
        this.set('ParamNachoWind', .17 * Math.sin(this.time * Math.PI * 2 / 6.8) + .06 * Math.sin(this.time * Math.PI * 2 / 10.7));
        this.advanceIdle(seconds);
        this.lockHead();
        if (this._pose) this._pose.updateParameters(this._model, seconds);
        if (this._physics) this._physics.evaluate(this._model, seconds);
        this.lockHead(); this._model.update();
    }
    private advanceIdle(seconds: number) {
        // The authored neck/ear deformers move independently of the generic
        // head and body angles. No pointer position feeds this idle motion.
        // Only active animation advances this clock, so background/drag pauses
        // retain their pose; returning from neutral fades in without a snap.
        this.idleFade = Math.min(1, this.idleFade + seconds / .8);
        const fade = this.idleFade * this.idleFade * (3 - 2 * this.idleFade);
        const blend = 1 - Math.exp(-seconds / .8);
        this.activityTilt += ((this.activity === 'thinking' ? .07 : 0) - this.activityTilt) * blend;
        this.activityNod += ((this.activity === 'thinking' ? -.035 : this.activity === 'replying' ? .035 : 0) - this.activityNod) * blend;
        const cycle = Math.PI * 2 * this.time;
        this.set('ParamNachoHeadTilt', fade * (.42 * Math.sin(cycle / 14.2) + .16 * Math.sin(cycle / 23.7) + this.activityTilt));
        this.set('ParamNachoHeadNod', fade * (.3 * Math.sin(cycle / 11.3) + .15 * Math.sin(cycle / 19.1) + this.activityNod));

        // An occasional leading ear and a smaller, delayed response. Each
        // pulse has zero velocity at its ends and a restrained recoil. Event
        // times use the animation clock, not frame counts or wall-clock timers.
        while (this.time >= this.earStart + 1.04) {
            this.earStart += 1.04 + 7 + Math.random() * 5;
            this.earLeft = Math.random() < .67 ? !this.earLeft : this.earLeft;
            this.earAmplitude = .6 + Math.random() * .08;
        }
        const leading = fade * this.earAmplitude * this.earPulse(this.time - this.earStart);
        const following = fade * this.earAmplitude * .2 * this.earPulse(this.time - this.earStart - .18);
        this.set('ParamNachoEarL', this.earLeft ? leading : following);
        this.set('ParamNachoEarR', this.earLeft ? following : leading);
    }
    private earPulse(t: number) {
        if (t < 0 || t >= .86) return 0;
        if (t < .16) { const v = t / .16; return v * v * (3 - 2 * v); }
        if (t < .46) { const v = (t - .16) / .3; return 1 - v * v * (3 - 2 * v); }
        return -.12 * Math.sin(Math.PI * (t - .46) / .4) ** 2;
    }
    setActivity(value: string) { this.activity = value === 'replying' ? 'replying' : value === 'thinking' ? 'thinking' : 'idle'; }
    paint(gl: WebGL2RenderingContext, width: number, height: number) {
        const aspect = width / height;
        const scale = (this.preserveCanvas ? 1 : .94) * Math.min(2 / (this.bounds.width / aspect), 2 / this.bounds.height);
        const m = this.matrix.getArray(); this.matrix.loadIdentity();
        m[0] = scale / aspect; m[5] = scale; m[12] = -this.bounds.x * m[0]; m[13] = -this.bounds.y * m[5];
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, width, height);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        const renderer = this.getRenderer();
        renderer.setMvpMatrix(this.matrix); renderer.setRenderState(null, [0, 0, width, height]); renderer.drawModel();
    }
    describe() {
        const values: Record<string, number> = {};
        ['ParamAngleX', 'ParamAngleY', 'ParamAngleZ', 'ParamBodyAngleX', 'ParamBodyAngleY', 'ParamBodyAngleZ', 'ParamEyeLOpen', 'ParamEyeROpen', 'ParamMouthOpenY', 'ParamBreath', 'ParamNachoWind', 'ParamNachoHeadTilt', 'ParamNachoHeadNod', 'ParamNachoEarL', 'ParamNachoEarR'].forEach(id => {
            const index = this.parameters.get(id); if (index !== undefined) values[id] = this._model.getParameterValueByIndex(index);
        });
        return { parameters: values, drawables: this._model.getDrawableCount(), animationTime: this.time, activity: this.activity,
            framing: { mode: this.preserveCanvas ? 'canvas' : 'visible', ...this.bounds } };
    }
}

async function create({ canvas, modelUrl, signal, manifest }: { canvas: HTMLCanvasElement, modelUrl: string, signal: AbortSignal, manifest?: ArrayBuffer }) {
    let model: CharacterModel = null, gl: WebGL2RenderingContext = null, retained = false, disposed = false;
    const textures: WebGLTexture[] = [];
    function destroy() {
        if (disposed) return; disposed = true;
        if (model) { model.release(); model = null; }
        if (gl) {
            textures.forEach(texture => gl.deleteTexture(texture));
            // Pinned SDK5-r.5 retains contexts in a private map until global disposal.
            // Remove only this widget's entry; other character widgets keep running.
            const manager = CubismShaderManager_WebGL.getInstance() as any;
            const shader = manager._shaderMap.get(gl);
            if (shader) { shader.release(); manager._shaderMap.delete(gl); }
            gl.getExtension('WEBGL_lose_context')?.loseContext();
        }
        // Retain Framework startup/log registration for this page. Repeating
        // Core.csmSetLogFunction exhausts the pinned Core's fixed WASM table.
        if (retained && --owners === 0) CubismFramework.dispose();
    }
    try {
        const url = new URL(modelUrl, document.baseURI);
        if (url.origin !== location.origin || !/\.model3\.json$/i.test(url.pathname)) throw new Error('A local model3.json is required');
        const base = new URL('./', url);
        const version = url.searchParams.get('v') || '';
        if (version && !/^[A-Za-z0-9._-]{1,80}$/.test(version)) throw new Error('Invalid character release');
        const json = JSON.parse(new TextDecoder().decode(manifest || await read(url.href, signal, 512 * 1024)));
        const files = json && json.FileReferences;
        if (json.Version !== 3 || !files || !Array.isArray(files.Textures) || !files.Textures.length || files.Textures.length > 16) throw new Error('Invalid model manifest');
        const moc = await read(reference(files.Moc, base, version), signal, 32 * 1024 * 1024);
        const physics = files.Physics ? await read(reference(files.Physics, base, version), signal, 2 * 1024 * 1024) : null;
        const pose = files.Pose ? await read(reference(files.Pose, base, version), signal, 512 * 1024) : null;
        check(signal);
        gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'low-power' });
        if (!gl) throw new Error('WebGL2 is unavailable');
        if (!CubismFramework.isStarted()) CubismFramework.startUp({ logFunction: () => {}, loggingLevel: LogLevel.LogLevel_Off });
        if (!CubismFramework.isInitialized()) CubismFramework.initialize(32 * 1024 * 1024);
        owners++; retained = true;
        model = new CharacterModel(); model.loadModel(moc, true); model.prepare(json.Ashbery?.PreserveCanvas === true);
        if (physics) model.loadPhysics(physics, physics.byteLength);
        if (pose) model.loadPose(pose, pose.byteLength);
        model.createRenderer(Math.max(1, canvas.width), Math.max(1, canvas.height));
        const renderer = model.getRenderer(); renderer.startUp(gl); renderer.setIsPremultipliedAlpha(true);
        for (let i = 0; i < files.Textures.length; i++) {
            const bytes = await read(reference(files.Textures[i], base, version), signal, 32 * 1024 * 1024);
            const bitmap = await createImageBitmap(new Blob([bytes]), { premultiplyAlpha: 'premultiply', colorSpaceConversion: 'none' });
            try {
                check(signal);
                const max = Math.min(8192, gl.getParameter(gl.MAX_TEXTURE_SIZE));
                if (bitmap.width > max || bitmap.height > max || bitmap.width * bitmap.height > 32 * 1024 * 1024) throw new Error('Character texture is too large');
                const texture = gl.createTexture(); if (!texture) throw new Error('Texture could not be allocated');
                textures.push(texture); gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap); gl.generateMipmap(gl.TEXTURE_2D);
                renderer.bindTexture(i, texture);
            } finally { bitmap.close(); }
        }
        const shader = CubismShaderManager_WebGL.getInstance().getShader(gl) as any;
        // Version-pinned adaptation: supply untouched official shader text from
        // the bundle, so an unmounted widget never leaves shader HTTP jobs alive.
        shader.loadShader = (path: string) => {
            const source = shaderSources[path.split('/').pop()];
            return source ? Promise.resolve(source) : Promise.reject(new Error('Unknown Cubism shader'));
        };
        renderer.loadShaders('');
        for (let i = 0; i < 12 && !shader._isShaderLoaded; i++) await Promise.resolve();
        if (!shader._isShaderLoaded || !shader._shaderSets[0]?.shaderProgram) throw new Error('Character shaders could not be compiled');
        check(signal); model.neutral();
        return {
            draw(seconds: number, neutral = false) { if (disposed) return; if (neutral) model.neutral(); else if (seconds > 0) model.advance(seconds); model.setRenderTargetSize(canvas.width, canvas.height); model.paint(gl, canvas.width, canvas.height); },
            setActivity(value: string) { if (!disposed) model.setActivity(value); },
            state() { return disposed ? null : model.describe(); },
            destroy
        };
    } catch (error) { destroy(); throw error; }
}
(window as any).NewtabCubismRuntime = Object.freeze({ create, version: '5-r.5' });
