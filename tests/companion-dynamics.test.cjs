const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/companion-dynamics.js'), 'utf8'), sandbox);
const create = sandbox.window.NewtabCompanionDynamics.create;
const limits = { headX: .014, headY: .008, headRoll: .028, bodyRoll: .006, breath: .005, hairLeft: .008, hairRight: .008, earLeft: .025, earRight: .025, gazeX: .004, gazeY: .003, blink: 1, greet: 1 };
const copy = pose => ({ ...pose });
function run(rig, milliseconds, input = {}, fps = 120) {
    const count = Math.round(milliseconds / 1000 * fps), delta = milliseconds / count;
    let pose;
    for (let i = 0; i < count; i++) pose = rig.advance(delta, input);
    return copy(pose);
}
function near(a, b, tolerance = 1e-9) { assert.ok(Math.abs(a - b) <= tolerance, `${a} differs from ${b}`); }

test('normal refresh rates preserve elapsed time and the same physical pose', () => {
    const poses = [30, 60, 90, 120, 144, 200, 240].map(fps => run(create({ seed: 'same' }), 3000, { x: .65, y: -.3, hover: true, greeting: 1, chatState: 'thinking' }, fps));
    for (const pose of poses) {
        near(pose.time, 3);
        for (const key of Object.keys(limits)) near(pose[key], poses[0][key]);
    }
});

test('render interpolation updates the pose between fixed physics steps', () => {
    const rig = create({ seed: 3 });
    run(rig, 1000, { x: 1, hover: true });
    const before = copy(rig.advance(0, { x: 1, hover: true }));
    const between = copy(rig.advance(2, { x: 1, hover: true }));
    const later = copy(rig.advance(2, { x: 1, hover: true }));
    assert.ok(between.headX > before.headX && later.headX > between.headX);
    assert.ok(between.breath !== before.breath && later.breath !== between.breath);
});

test('gaze leads the head while hair and body settle behind the head', () => {
    const rig = create({ seed: 1 }), input = { x: 1, y: .5, hover: true };
    const neutral = copy(rig.advance(0, input));
    assert.equal(neutral.headX, 0);
    const early = run(rig, 50, input);
    assert.ok(early.gazeX / .004 > 5 * early.headX / .012, 'eyes react before the heavier head');
    assert.ok(early.headX > 0 && early.hairLeft < 0, 'hair initially trails the turn');
    const middle = run(rig, 450, input);
    assert.ok(middle.headX > early.headX && middle.hairLeft < 0, 'hair has a delayed recoil');
    assert.ok(Math.abs(middle.bodyRoll) < Math.abs(middle.headRoll) * .16, 'body has its own slower spring');
    const settled = run(rig, 2500, input);
    assert.ok(settled.hairLeft > 0 && settled.hairRight > 0, 'hair settles without perpetual oscillation');
    near(settled.headX, .012, 1e-5);
});

test('blinks close quickly, hold briefly and open more slowly at irregular intervals', () => {
    const rig = create({ seed: 'blink-test' }), episodes = [];
    let episode = null;
    for (let ms = 1; ms <= 25000; ms++) {
        const value = rig.advance(1, {}).blink;
        if (value > .000001 && !episode) episode = { start: ms, fullStart: 0, fullEnd: 0 };
        if (episode && value > .999999) { if (!episode.fullStart) episode.fullStart = ms; episode.fullEnd = ms; }
        if (episode && value <= .000001) { episode.end = ms; episodes.push(episode); episode = null; }
    }
    assert.ok(episodes.length >= 4);
    for (const item of episodes) {
        const closing = item.fullStart - item.start, hold = item.fullEnd - item.fullStart, opening = item.end - item.fullEnd;
        assert.ok(closing >= 45 && closing <= 90, JSON.stringify(item));
        assert.ok(hold >= 10 && hold <= 40, JSON.stringify(item));
        assert.ok(opening >= 125 && opening <= 175, JSON.stringify(item));
        assert.ok(opening > closing * 1.5);
    }
    const gaps = episodes.slice(1).map((item, index) => item.start - episodes[index].start);
    assert.ok(Math.max(...gaps) - Math.min(...gaps) > 500, 'blink spacing is not a repeating metronome');
});

test('greeting tokens and chat changes enter smoothly without repeating held greetings', () => {
    const rig = create({ seed: 'greet' });
    const first = copy(rig.advance(1000 / 60, { greeting: 1 }));
    assert.ok(first.greet < .01);
    const acknowledgement = run(rig, 350, { greeting: 1 });
    assert.ok(acknowledgement.greet > .6 && acknowledgement.greet < 1);
    const settled = run(rig, 2650, { greeting: 1 });
    assert.ok(settled.greet < .001, 'a held serial does not retrigger');
    const immediate = copy(rig.advance(0, { greeting: 2, chatState: 'replying' }));
    near(immediate.greet, settled.greet);
    const again = run(rig, 350, { greeting: 2, chatState: 'replying' });
    assert.ok(again.greet > .6, 'a new positive serial retriggers without first resetting to zero');
    const boolRig = create({ seed: 'greet' });
    run(boolRig, 3000, { greeting: true });
    assert.ok(boolRig.advance(16, { greeting: true }).greet < .001);
    boolRig.advance(0, { greeting: false });
    assert.ok(run(boolRig, 350, { greeting: true }).greet > .6);
});

test('long stalls are bounded and zero-time resumes preserve the rendered pose', () => {
    const rig = create({ seed: 'pause' }), input = { x: .6, y: .2, hover: true };
    const before = run(rig, 1000, input);
    const resume = copy(rig.advance(0, input));
    assert.deepEqual(resume, before);
    const after = copy(rig.advance(100000, input));
    near(after.time - before.time, .08);
    assert.ok(Math.abs(after.headX - before.headX) < .001);
    for (const badDelta of [NaN, Infinity, -50, undefined]) {
        const stable = copy(rig.advance(badDelta, input));
        assert.deepEqual(stable, after);
    }
});

test('seeded idle movement is reproducible, restrained and finite under input changes', () => {
    const first = create({ seed: 'bounded' }), same = create({ seed: 'bounded' }), other = create({ seed: 'different' });
    let sawIdleGaze = false, sawEarResponse = false, different = false;
    for (let i = 0; i < 7200; i++) {
        const input = i < 3600 ? {} : { x: Math.sin(i / 13) * 5, y: Math.cos(i / 17) * 5, hover: true, greeting: 1 + Math.floor(i / 300), chatState: i % 400 < 200 ? 'thinking' : 'replying' };
        const a = first.advance(1000 / 120, input), b = same.advance(1000 / 120, input), c = other.advance(1000 / 120, input);
        for (const [key, limit] of Object.entries(limits)) {
            assert.ok(Number.isFinite(a[key]) && Math.abs(a[key]) <= limit + 1e-10, `${key}: ${a[key]}`);
            near(a[key], b[key]);
        }
        assert.ok(a.blink >= 0 && a.greet >= 0);
        if (i < 3600 && Math.abs(a.gazeX) > .0002) sawIdleGaze = true;
        if (Math.abs(a.earLeft) > .005 || Math.abs(a.earRight) > .005) sawEarResponse = true;
        if (a.blink !== c.blink) different = true;
    }
    assert.ok(sawIdleGaze && sawEarResponse && different);
});
