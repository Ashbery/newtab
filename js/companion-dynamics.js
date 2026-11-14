/* Small, time-based character dynamics shared by the WebGL and Canvas rigs. */
(function () {
    'use strict';
    var STEP = 1 / 120, MAX_DELTA = 80;
    var KEYS = ['headX', 'headY', 'headRoll', 'bodyRoll', 'breath', 'hairLeft', 'hairRight', 'earLeft', 'earRight', 'blink', 'gazeX', 'gazeY', 'greet'];

    function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
    function finite(value) { return Number.isFinite(value) ? value : 0; }
    function ease(value) { value = clamp(value, 0, 1); return value * value * (3 - 2 * value); }
    function seedNumber(seed) {
        if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0 || 0x4e414348;
        var text = String(seed === undefined ? 'Nacho' : seed), hash = 2166136261;
        for (var i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
        return hash >>> 0 || 0x4e414348;
    }
    function spring() { return { value: 0, velocity: 0 }; }
    function follow(state, target, frequency, damping) {
        state.velocity += ((target - state.value) * frequency * frequency - 2 * damping * frequency * state.velocity) * STEP;
        state.value += state.velocity * STEP;
        return state.value;
    }
    function blankPose() {
        var value = { time: 0 };
        for (var i = 0; i < KEYS.length; i++) value[KEYS[i]] = 0;
        return value;
    }

    function create(options) {
        var randomState = seedNumber((options || {}).seed);
        function random() {
            randomState ^= randomState << 13; randomState ^= randomState >>> 17; randomState ^= randomState << 5;
            return (randomState >>> 0) / 4294967296;
        }
        var elapsed = 0, time = 0, remainder = 0;
        var current = blankPose(), previous = blankPose(), output = blankPose();
        var gazeX = spring(), gazeY = spring(), headX = spring(), headY = spring(), headRoll = spring(), bodyRoll = spring();
        var hairLeft = spring(), hairRight = spring(), earLeft = spring(), earRight = spring();
        var greeting = spring(), thinking = spring(), replying = spring();
        var inputX = 0, inputY = 0, hovered = false, chatState = 'idle';
        var previousGreeting = 0, greetingPending = false, greetingStart = -Infinity;
        var blinkStart = -Infinity, nextBlink = 1.8 + random() * 2;
        var idleX = 0, idleY = 0, idleUntil = 0, nextGlance = 2.5 + random() * 2.5;
        var earStart = -Infinity, earSide = 0, nextEar = 4 + random() * 4;

        function integrate() {
            var i;
            for (i = 0; i < KEYS.length; i++) previous[KEYS[i]] = current[KEYS[i]];
            time += STEP;
            if (greetingPending) { greetingStart = time; greetingPending = false; }
            if (time >= nextBlink) {
                blinkStart = time;
                nextBlink = time + .24 + 2.7 + random() * 3.8;
            }
            if (time >= nextGlance) {
                idleX = (random() * 2 - 1) * .32;
                idleY = (random() * 2 - 1) * .2;
                idleUntil = time + .7 + random() * .9;
                nextGlance = idleUntil + 3.8 + random() * 4.2;
            }
            if (time >= idleUntil) idleX = idleY = 0;
            if (time >= nextEar) {
                earStart = time; earSide = random() < .5 ? -1 : 1;
                nextEar = time + 7 + random() * 8;
            }

            var greetAge = time - greetingStart;
            // A brief acknowledgement has an eased entrance and a slower release.
            var greetTarget = greetAge < .18 ? ease(greetAge / .18) : greetAge < .28 ? 1 : 1 - ease((greetAge - .28) / .65);
            var greet = follow(greeting, greetTarget, 13, 1);
            var think = follow(thinking, chatState === 'thinking' ? 1 : 0, 4, 1);
            var reply = follow(replying, chatState === 'replying' || chatState === 'speaking' ? 1 : 0, 5, 1);
            var gx = follow(gazeX, hovered ? inputX : idleX, 17, 1);
            var gy = follow(gazeY, hovered ? inputY : idleY, 17, 1);
            var breath = Math.sin(time * Math.PI * 2 / 4.7) * .0035 + Math.sin(time * Math.PI * 2 / 9.2) * .0005;
            var hx = follow(headX, gx * .012 + think * Math.sin(time * .65) * .001, 6.2, .96);
            var hy = follow(headY, gy * .006 - think * .0012 + reply * Math.sin(time * 3.4) * .00055 - greet * .0008, 6, .98);
            var roll = follow(headRoll, -gx * .019 + think * .0035 + greet * .004, 5.6, .98);
            var body = follow(bodyRoll, roll * .16, 3.2, 1);
            // Hair follows the head's acceleration with a small delayed recoil.
            var leftHair = follow(hairLeft, clamp(-headX.velocity * .07 + hx * .18 + breath * .12, -.008, .008), 5, .84);
            var rightHair = follow(hairRight, clamp(-headX.velocity * .06 + hx * .15 + breath * .1, -.008, .008), 5.7, .86);
            var earAge = time - earStart;
            var twitch = earAge >= 0 && earAge < .32 ? Math.pow(Math.sin(earAge / .32 * Math.PI), 2) * .018 : 0;
            var leftEar = follow(earLeft, roll * .25 + greet * .005 + (earSide < 0 ? twitch : 0), 12, .86);
            var rightEar = follow(earRight, roll * .22 + greet * .004 + (earSide > 0 ? -twitch : 0), 10.5, .88);
            var blinkAge = time - blinkStart;
            // Close quickly, hold briefly, then open gently. Zero is fully open.
            var blink = blinkAge < .065 ? ease(blinkAge / .065) : blinkAge < .09 ? 1 : 1 - ease((blinkAge - .09) / .15);

            current.headX = clamp(hx, -.014, .014); current.headY = clamp(hy, -.008, .008);
            current.headRoll = clamp(roll, -.028, .028); current.bodyRoll = clamp(body, -.006, .006);
            current.breath = clamp(breath, -.005, .005);
            current.hairLeft = clamp(leftHair, -.008, .008); current.hairRight = clamp(rightHair, -.008, .008);
            current.earLeft = clamp(leftEar, -.025, .025); current.earRight = clamp(rightEar, -.025, .025);
            current.blink = clamp(blink, 0, 1);
            current.gazeX = clamp(gx * .004, -.004, .004); current.gazeY = clamp(gy * .003, -.003, .003);
            current.greet = clamp(greet + reply * .08, 0, 1);
        }

        return {
            // The returned object is reused. Copy it when retaining a pose.
            // Positive greeting tokens trigger on change; booleans on a rising edge.
            // Pausing requires no update: reset the caller's RAF timestamp on resume.
            advance: function (deltaMs, input) {
                input = input || {};
                inputX = clamp(finite(input.x), -1, 1); inputY = clamp(finite(input.y), -1, 1);
                hovered = !!input.hover; chatState = input.chatState || 'idle';
                var token = input.greeting;
                if ((typeof token === 'number' && Number.isFinite(token) && token > 0 && token !== previousGreeting) || (token === true && previousGreeting !== true)) greetingPending = true;
                previousGreeting = token;
                var delta = clamp(finite(deltaMs), 0, MAX_DELTA) / 1000;
                elapsed += delta; remainder += delta;
                // At most ten fixed steps follow a stalled frame; hidden time never catches up.
                while (remainder + 1e-10 >= STEP) { integrate(); remainder = Math.max(0, remainder - STEP); }
                var alpha = clamp(remainder / STEP, 0, 1);
                for (var i = 0; i < KEYS.length; i++) {
                    var key = KEYS[i]; output[key] = previous[key] + (current[key] - previous[key]) * alpha;
                }
                output.time = elapsed;
                return output;
            }
        };
    }
    window.NewtabCompanionDynamics = { create: create };
}());
