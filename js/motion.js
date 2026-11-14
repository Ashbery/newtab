/* Action-led motion. No idle loop and no movement of clickable hit targets. */
(function () {
    'use strict';
    document.addEventListener('DOMContentLoaded', function () {
        var canvas = document.getElementById('widget-canvas');
        if (!canvas) return;
        var reduced = matchMedia('(prefers-reduced-motion: reduce)');
        var fine = matchMedia('(hover: hover) and (pointer: fine)');
        var pointerFrame = 0, point = null, targets = [];
        var submit = document.getElementById('search-submit');
        function resetSubmit() {
            if (!submit) return;
            submit.style.removeProperty('--submit-x');
            submit.style.removeProperty('--submit-y');
        }
        if (submit) {
            submit.addEventListener('pointermove', function (event) {
                if (submit.disabled || reduced.matches || !fine.matches || event.pointerType !== 'mouse') return;
                var rect = submit.getBoundingClientRect();
                submit.style.setProperty('--submit-x', Math.max(-2, Math.min(2, (event.clientX - rect.left - rect.width / 2) * .12)).toFixed(2) + 'px');
                submit.style.setProperty('--submit-y', Math.max(-2, Math.min(2, (event.clientY - rect.top - rect.height / 2) * .12)).toFixed(2) + 'px');
            }, { passive: true });
            submit.addEventListener('pointerleave', resetSubmit);
            submit.addEventListener('blur', resetSubmit);
        }

        function blocked() {
            return document.body.matches('.is-arranging, .is-focus-mode, .side-rail-open') ||
                !!document.querySelector('.search-expand-layer.is-open');
        }
        function links() {
            return Array.from(canvas.querySelectorAll('.widget[data-type="app"][data-active="true"] .app-tile'))
                .filter(function (link) { return link.getClientRects().length && !link.closest('[inert]'); });
        }
        function resetDock() {
            if (pointerFrame) cancelAnimationFrame(pointerFrame);
            pointerFrame = 0; point = null;
            targets.forEach(function (target) {
                target.link.style.removeProperty('--dock-lift');
                target.link.style.removeProperty('--dock-scale');
            });
            targets = [];
        }
        function clearInteraction() { resetDock(); resetSubmit(); }
        function paintDock() {
            pointerFrame = 0;
            if (!point || reduced.matches || blocked()) return resetDock();
            targets.forEach(function (target) {
                var dx = Math.abs(point.x - target.x), dy = Math.abs(point.y - target.y);
                var weight = dx > 190 || dy > 75 ? 0 : Math.pow(.45, dx / 92) * Math.max(0, 1 - dy / 75);
                target.link.style.setProperty('--dock-lift', (-4 * weight).toFixed(2) + 'px');
                target.link.style.setProperty('--dock-scale', (1 + .06 * weight).toFixed(3));
            });
        }
        document.addEventListener('pointermove', function (event) {
            if (event.pointerType !== 'mouse' || !fine.matches || blocked()) return clearInteraction();
            var link = event.target.closest('.widget[data-type="app"] .app-tile');
            if (link && canvas.contains(link)) {
                if (!reduced.matches) {
                    if (!targets.length) targets = links().map(function (item) {
                        var rect = item.getBoundingClientRect();
                        return { link: item, x: rect.left + rect.width / 2, y: rect.top + 28 };
                    });
                    point = { x: event.clientX, y: event.clientY };
                    if (!pointerFrame) pointerFrame = requestAnimationFrame(paintDock);
                }
            } else {
                resetDock();
            }
        }, { passive: true });
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') clearInteraction();
        });
        document.addEventListener('pointerleave', clearInteraction);
        window.addEventListener('blur', clearInteraction);
        window.addEventListener('resize', clearInteraction, { passive: true });
        canvas.addEventListener('scroll', clearInteraction, { passive: true });
        document.addEventListener('newtab:layout-change', clearInteraction);
        reduced.addEventListener('change', clearInteraction);
        fine.addEventListener('change', clearInteraction);
        new MutationObserver(function () { if (blocked()) clearInteraction(); })
            .observe(document.body, { attributes: true, attributeFilter: ['class'] });
        document.documentElement.dataset.motionReady = 'true';
    });
})();
