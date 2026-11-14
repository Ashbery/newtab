/* Nacho interaction rhythm. Native springs and WAAPI keep the static shell light.
 * References: Cult UI's direction-aware tabs/popover/halo switch and
 * DesignBookmark Motion's toggle, range, spring dropdown and state transitions.
 * This is a native implementation; it does not load React or third-party code.
 */
(function (global) {
    'use strict';
    var preference = global.matchMedia('(prefers-reduced-motion: reduce)');
    var running = new Map();
    var springs = new Map();
    var springFrame = 0;
    var poseStyles = new WeakMap();
    var ease = 'cubic-bezier(.22,1,.36,1)';
    function reduced() { return preference.matches; }
    function valuesCopy(values) { return Object.assign({}, values); }
    function finishState(state, complete) {
        var group = springs.get(state.owner);
        if (!group || group.get(state.key) !== state) return;
        group.delete(state.key);
        if (!group.size) springs.delete(state.owner);
        if (complete) { state.values = valuesCopy(state.target); state.update(valuesCopy(state.values)); }
        state.resolve(complete);
    }
    function cancelSpring(owner, key) {
        var group = springs.get(owner);
        if (group) Array.from(group.values()).forEach(function (state) { if (key === undefined || state.key === key) finishState(state, false); });
    }
    function finishSpring(owner, key) {
        var group = springs.get(owner);
        if (group) Array.from(group.values()).forEach(function (state) { if (key === undefined || state.key === key) finishState(state, true); });
    }
    // Exact damped-spring integration is independent of the display's refresh
    // rate. Reversals retain velocity, instead of restarting an easing curve.
    function advance(value, velocity, target, dt, stiffness, damping, mass) {
        var omega = Math.sqrt(stiffness / mass), zeta = damping / (2 * Math.sqrt(stiffness * mass));
        var error = value - target, next, speed;
        if (zeta < .999) {
            var damped = omega * Math.sqrt(1 - zeta * zeta), decay = Math.exp(-zeta * omega * dt);
            var sine = Math.sin(damped * dt), cosine = Math.cos(damped * dt), b = (velocity + zeta * omega * error) / damped;
            next = decay * (error * cosine + b * sine);
            speed = decay * (velocity * cosine - (zeta * omega * b + damped * error) * sine);
        } else if (zeta > 1.001) {
            var root = Math.sqrt(zeta * zeta - 1), r1 = -omega * (zeta - root), r2 = -omega * (zeta + root);
            var c1 = (velocity - r2 * error) / (r1 - r2), c2 = error - c1;
            var e1 = Math.exp(r1 * dt), e2 = Math.exp(r2 * dt);
            next = c1 * e1 + c2 * e2; speed = c1 * r1 * e1 + c2 * r2 * e2;
        } else {
            var coefficient = velocity + omega * error, falloff = Math.exp(-omega * dt);
            next = (error + coefficient * dt) * falloff;
            speed = (velocity - coefficient * omega * dt) * falloff;
        }
        return { value: target + next, velocity: speed };
    }
    function tickSprings(now) {
        springFrame = 0;
        var states = [];
        springs.forEach(function (group) { group.forEach(function (state) { states.push(state); }); });
        states.forEach(function (state) {
            if (!springs.get(state.owner) || springs.get(state.owner).get(state.key) !== state) return;
            var dt = Math.min(.064, Math.max(0, (now - state.last) / 1000)); state.last = now;
            var settled = true;
            Object.keys(state.target).forEach(function (property) {
                var next = advance(state.values[property], state.velocity[property], state.target[property], dt, state.stiffness, state.damping, state.mass);
                state.values[property] = next.value; state.velocity[property] = next.velocity;
                if (Math.abs(next.value - state.target[property]) > state.precision || Math.abs(next.velocity) > state.precision * 15) settled = false;
            });
            if (settled || now - state.started >= state.maxDuration || !state.owner.isConnected) finishState(state, true);
            else state.update(valuesCopy(state.values));
        });
        if (springs.size) springFrame = requestAnimationFrame(tickSprings);
    }
    function spring(owner, key, target, options) {
        options = options || {};
        if (!owner) return Promise.resolve(false);
        var group = springs.get(owner);
        if (!group) { group = new Map(); springs.set(owner, group); }
        var previous = group.get(key), values = {}, velocity = {};
        Object.keys(target).forEach(function (property) {
            values[property] = previous && Number.isFinite(previous.values[property]) ? previous.values[property] :
                options.from && Number.isFinite(options.from[property]) ? options.from[property] : target[property];
            velocity[property] = previous && Number.isFinite(previous.velocity[property]) ? previous.velocity[property] : 0;
        });
        if (previous) previous.resolve(false);
        var resolve, promise = new Promise(function (done) { resolve = done; });
        var now = performance.now();
        var state = { owner: owner, key: key, values: values, velocity: velocity, target: valuesCopy(target),
            update: typeof options.update === 'function' ? options.update : function () {}, resolve: resolve,
            stiffness: Math.max(1, options.stiffness || 420), damping: Math.max(.01, options.damping || 32),
            mass: Math.max(.01, options.mass || 1), precision: Math.max(.0001, options.precision || .001),
            maxDuration: options.maxDuration || 1200, started: now, last: now };
        group.set(key, state);
        if (reduced() || !owner.isConnected || document.hidden) finishState(state, true);
        else { state.update(valuesCopy(values)); if (!springFrame) springFrame = requestAnimationFrame(tickSprings); }
        return promise;
    }
    function cancel(element) {
        var current = running.get(element);
        if (current) { running.delete(element); current.cancel(); }
        cancelSpring(element, 'presence');
        restorePose(element);
    }
    function play(element, frames, options) {
        if (!element) return Promise.resolve(false);
        cancel(element);
        if (reduced() || !element.animate || !element.isConnected) return Promise.resolve(true);
        var animation = element.animate(frames, Object.assign({ duration: 220, easing: ease, fill: 'none' }, options));
        running.set(element, animation);
        return animation.finished.then(function () {
            if (running.get(element) === animation) running.delete(element);
            return true;
        }, function () {
            if (running.get(element) === animation) running.delete(element);
            return false;
        });
    }
    function transition(element, options, exiting) {
        options = options || {};
        if (!element) return Promise.resolve(false);
        var rest = { opacity: 1, x: 0, y: 0, scale: 1 };
        var away = { opacity: 0, x: options.x || 0, y: options.y === undefined ? 12 : options.y, scale: options.scale === undefined ? .975 : options.scale };
        var original = poseStyles.get(element);
        if (!original) {
            original = { opacity: element.style.opacity, translate: element.style.translate, scale: element.style.scale,
                willChange: element.style.willChange, presence: element.style.getPropertyValue('--motion-presence'),
                backdrop: element.matches('.appearance-dialog, .weather-location-dialog') };
            poseStyles.set(element, original);
        }
        if (!reduced()) element.style.willChange = 'transform, opacity';
        var duration = options.duration || (exiting ? 180 : 360);
        var stiffness = options.stiffness || (exiting ? 850 : 380);
        // Legacy callers' timings select a physical response, not a hard cutoff.
        if (!exiting && duration <= 200) stiffness = options.stiffness || 520;
        return spring(element, 'presence', exiting ? away : rest, { from: exiting ? rest : away,
            stiffness: stiffness, damping: options.damping || (exiting ? 52 : 30), precision: exiting ? .01 : .002,
            maxDuration: exiting ? 220 : 780,
            update: function (pose) {
                element.style.opacity = Math.max(0, Math.min(1, pose.opacity));
                if (original.backdrop) element.style.setProperty('--motion-presence', Math.max(0, Math.min(1, pose.opacity)));
                element.style.translate = pose.x.toFixed(3) + 'px ' + pose.y.toFixed(3) + 'px';
                element.style.scale = pose.scale.toFixed(5);
            }
        }).then(function (complete) { if (complete) restorePose(element); return complete; });
    }
    function restorePose(element) {
        var original = poseStyles.get(element);
        if (!original) return;
        element.style.opacity = original.opacity; element.style.translate = original.translate; element.style.scale = original.scale;
        element.style.willChange = original.willChange;
        if (original.presence) element.style.setProperty('--motion-presence', original.presence); else element.style.removeProperty('--motion-presence');
        poseStyles.delete(element);
    }
    // Finishing (rather than cancelling) also completes pending close cleanup.
    preference.addEventListener('change', function () {
        if (reduced()) {
            running.forEach(function (animation) { animation.finish(); });
            Array.from(springs.keys()).forEach(function (owner) { finishSpring(owner); });
        }
    });
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) Array.from(springs.keys()).forEach(function (owner) { finishSpring(owner); });
    });
    global.NewtabMotion = { reduced: reduced, cancel: cancel, play: play, spring: spring, cancelSpring: cancelSpring, finishSpring: finishSpring,
        enter: function (element, options) { return transition(element, options, false); },
        exit: function (element, options) { return transition(element, options, true); } };

    function rangeFill(input) {
        var minimum = Number(input.min || 0), maximum = Number(input.max || 100);
        var progress = maximum > minimum ? (Number(input.value) - minimum) / (maximum - minimum) * 100 : 0;
        input.style.setProperty('--range-progress', Math.max(0, Math.min(100, progress)) + '%');
    }
    function enhance(root) {
        if (root.nodeType !== 1) return;
        if (root.matches('input[type="range"]')) rangeFill(root);
        root.querySelectorAll('input[type="range"]').forEach(rangeFill);
    }
    document.addEventListener('DOMContentLoaded', function () {
        enhance(document.body);
        document.addEventListener('input', function (event) {
            if (event.target.matches('input[type="range"]')) rangeFill(event.target);
        });
        // Controls in appearance/city/bookmark dialogs are created on demand.
        new MutationObserver(function (records) {
            records.forEach(function (record) { record.addedNodes.forEach(enhance); });
        }).observe(document.body, { childList: true, subtree: true });
    });
})(window);
