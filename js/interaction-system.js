/* Nacho interaction rhythm. Native WAAPI keeps the static new-tab shell light.
 * References: Cult UI's direction-aware tabs/popover/halo switch and
 * DesignBookmark Motion's toggle, range, spring dropdown and state transitions.
 * This is a native implementation; it does not load React or third-party code.
 */
(function (global) {
    'use strict';
    var preference = global.matchMedia('(prefers-reduced-motion: reduce)');
    var running = new Map();
    var ease = 'cubic-bezier(.22,1,.36,1)';
    function reduced() { return preference.matches; }
    function cancel(element) {
        var current = running.get(element);
        if (current) { running.delete(element); current.cancel(); }
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
        var state = running.has(element) ? getComputedStyle(element) : null;
        var rest = { opacity: 1, translate: '0px 0px', scale: '1' };
        var away = { opacity: 0, translate: (options.x || 0) + 'px ' + (options.y === undefined ? 8 : options.y) + 'px', scale: String(options.scale === undefined ? .985 : options.scale) };
        var from = state ? { opacity: state.opacity, translate: state.translate, scale: state.scale } : (exiting ? rest : away);
        return play(element, [from, exiting ? away : rest], { duration: options.duration === undefined ? (exiting ? 150 : 260) : options.duration, delay: options.delay || 0, easing: options.easing || ease });
    }
    // Finishing (rather than cancelling) also completes pending close cleanup.
    preference.addEventListener('change', function () {
        if (reduced()) running.forEach(function (animation) { animation.finish(); });
    });
    global.NewtabMotion = { reduced: reduced, cancel: cancel, play: play,
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
