/* Exercise the production motion class without WebGL/network timing. Real
 * authored mesh deformation remains covered by the browser/model acceptance. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/companion-live2d-runtime.ts'), 'utf8');
const start = source.indexOf('class CharacterModel extends CubismUserModel {');
const end = source.indexOf('\nasync function create(', start);
assert(start >= 0 && end > start, 'Locate the production CharacterModel, not a copied motion implementation');
assert.equal(typeof stripTypeScriptTypes, 'function', 'Node22.13+ is required for the TypeScript motion test');
const code = stripTypeScriptTypes(source.slice(start, end) + '\nglobalThis.Model = CharacterModel;');
const generic = ['ParamAngleX', 'ParamAngleY', 'ParamAngleZ', 'ParamBodyAngleX', 'ParamBodyAngleY', 'ParamBodyAngleZ'];
const custom = ['ParamNachoHeadTilt', 'ParamNachoHeadNod', 'ParamNachoEarL', 'ParamNachoEarR'];

function make(includeCustom = true) {
    const ids = [...generic, 'ParamEyeLOpen', 'ParamEyeROpen', 'ParamMouthOpenY', 'ParamBreath', 'ParamNachoWind', ...(includeCustom ? custom : [])];
    const values = ids.map(id => id.includes('Eye') ? 1 : 0), defaults = values.slice();
    const core = { parameters: { ids }, drawables: { count: 1, opacities: [1], vertexPositions: [[-1, -1, 1, -1, 0, 1]] } };
    const cubism = {
        getModel: () => core, update() {}, loadParameters: () => values.splice(0, values.length, ...defaults),
        setParameterValueByIndex: (i, v) => values[i] = v,
        getParameterValueByIndex: i => values[i], getDrawableCount: () => 1
    };
    const context = vm.createContext({ CubismUserModel: class {}, CubismMatrix44: class {}, Math: Object.assign(Object.create(Math), { random: () => .2 }) });
    vm.runInContext(code, context);
    const model = new context.Model(); model._model = cubism;
    // Generic angles must still be locked after a physics/pose calculation.
    model._physics = { stabilization() {}, evaluate() { generic.forEach(id => values[ids.indexOf(id)] = .5); } };
    model.prepare();
    return model;
}
const params = model => model.describe().parameters;
const advance = (model, seconds, hz = 60) => { for (let i = 0; i < Math.round(seconds * hz); i++) model.advance(1 / hz); };

test('idle is bounded, slow and moves custom anatomy while generic angles stay zero', () => {
    const model = make(), samples = []; let previous = params(model), maxTiltStep = 0, maxNodStep = 0;
    for (let i = 0; i < 60 * 60; i++) {
        model.advance(1 / 60); const p = params(model); samples.push(p);
        generic.forEach(id => assert.equal(p[id], 0));
        assert(Math.abs(p.ParamNachoHeadTilt) <= .65); assert(Math.abs(p.ParamNachoHeadNod) <= .485);
        maxTiltStep = Math.max(maxTiltStep, Math.abs(p.ParamNachoHeadTilt - previous.ParamNachoHeadTilt));
        maxNodStep = Math.max(maxNodStep, Math.abs(p.ParamNachoHeadNod - previous.ParamNachoHeadNod)); previous = p;
    }
    assert(samples.some(p => p.ParamNachoHeadTilt > .4)); assert(samples.some(p => p.ParamNachoHeadTilt < -.4));
    assert(samples.some(p => Math.abs(p.ParamNachoHeadNod) > .3));
    assert(maxTiltStep < .007 && maxNodStep < .007, 'No frame-to-frame head snap at 60Hz');
});

test('ears are usually still, occasionally asymmetric, with continuous onset/recoil/rest', () => {
    const model = make(); let rest = 0, asymmetric = 0, recoil = 0, maxStep = 0, previous = params(model);
    for (let i = 0; i < 60 * 60; i++) {
        model.advance(1 / 60); const p = params(model), l = p.ParamNachoEarL, r = p.ParamNachoEarR;
        assert(Math.abs(l) <= .68 && Math.abs(r) <= .68);
        if (l === 0 && r === 0) rest++;
        if (Math.abs(l - r) > .4) asymmetric++;
        if (l < -.02 || r < -.02) recoil++;
        maxStep = Math.max(maxStep, Math.abs(l - previous.ParamNachoEarL), Math.abs(r - previous.ParamNachoEarR)); previous = p;
    }
    assert(rest / 3600 > .85, 'Ears do not flap continuously'); assert(asymmetric > 5); assert(recoil > 5);
    assert(maxStep < .1, 'Twitch samples remain smoothly connected at 60Hz');
});

test('pose timing is independent of 30/60/120/200Hz rendering', () => {
    const run = hz => { const model = make(), result = []; for (let step = 0; step < 48; step++) { model.setActivity(step >= 20 && step < 32 ? 'thinking' : 'idle'); advance(model, .5, hz); result.push(params(model)); } return result; };
    const reference = run(60);
    for (const hz of [30, 120, 200]) {
        const samples = run(hz);
        samples.forEach((p, index) => custom.forEach(id => assert(Math.abs(p[id] - reference[index][id]) < .00001, `${id} at ${hz}Hz t=${(index + 1) / 2}`)));
    }
});

test('neutral clears every custom pose and resumed motion fades in from zero', () => {
    const model = make(); advance(model, 3.25); assert(Math.abs(params(model).ParamNachoHeadTilt) > .1);
    const time = model.describe().animationTime; model.neutral();
    custom.forEach(id => assert.equal(params(model)[id], 0)); assert.equal(model.describe().animationTime, time);
    model.advance(1 / 60);
    custom.forEach(id => assert(Math.abs(params(model)[id]) < .001, `${id} resumes without a neutral-to-active jump`));
    advance(model, 1); assert(Math.abs(params(model).ParamNachoHeadTilt) > .1);
});

test('chat activity changes smoothly and has no synchronous pose jump', () => {
    const model = make(); advance(model, 2); const before = params(model);
    model.setActivity('thinking'); assert.deepEqual(params(model), before);
    model.advance(1 / 60); assert(Math.abs(params(model).ParamNachoHeadTilt - before.ParamNachoHeadTilt) < .007);
    advance(model, 1); const thinking = params(model); model.setActivity('replying'); assert.deepEqual(params(model), thinking);
    model.advance(1 / 60); assert(Math.abs(params(model).ParamNachoHeadNod - thinking.ParamNachoHeadNod) < .007);
});

test('older models without custom anatomy parameters retain normal lifecycle', () => {
    const model = make(false); advance(model, 12); model.setActivity('thinking'); advance(model, 1); model.neutral();
    custom.forEach(id => assert.equal(params(model)[id], undefined)); generic.forEach(id => assert.equal(params(model)[id], 0));
    assert.equal(params(model).ParamEyeLOpen, 1); assert.equal(params(model).ParamMouthOpenY, 0);
});
