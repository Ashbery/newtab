/* Action-led motion. No idle loop and no movement of clickable hit targets. */
(function () {
    'use strict';
    document.addEventListener('DOMContentLoaded', function () {
        var canvas = document.getElementById('widget-canvas');
        if (!canvas) return;
        var reduced = matchMedia('(prefers-reduced-motion: reduce)');
        var fine = matchMedia('(hover: hover) and (pointer: fine)');
        var tooltip = document.createElement('div');
        tooltip.id = 'app-destination';
        tooltip.className = 'app-destination';
        tooltip.setAttribute('role', 'tooltip');
        tooltip.setAttribute('aria-hidden', 'true');
        tooltip.hidden = true;
        document.body.appendChild(tooltip);
        var active = null, pending = null, showTimer, hideTimer, removeTimer;
        var pointerFrame = 0, point = null, targets = [], lastShown = 0;
        var dismissed = null;
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
        function describe(link, enabled) {
            if (!link) return;
            var ids = (link.getAttribute('aria-describedby') || '').split(/\s+/).filter(function (id) { return id && id !== tooltip.id; });
            if (enabled) ids.push(tooltip.id);
            if (ids.length) link.setAttribute('aria-describedby', ids.join(' '));
            else link.removeAttribute('aria-describedby');
        }
        function hideTooltip(immediate) {
            clearTimeout(showTimer); clearTimeout(hideTimer); clearTimeout(removeTimer);
            hideTimer = null;
            pending = null;
            describe(active, false);
            active = null;
            tooltip.classList.remove('is-visible');
            tooltip.setAttribute('aria-hidden', 'true');
            if (immediate || reduced.matches) tooltip.hidden = true;
            else removeTimer = setTimeout(function () { tooltip.hidden = true; }, 120);
        }
        function showTooltip(link) {
            if (blocked() || !link.isConnected || link === dismissed) return;
            clearTimeout(hideTimer); clearTimeout(removeTimer);
            hideTimer = null;
            describe(active, false);
            active = link;
            pending = null;
            var hostname;
            try { hostname = new URL(link.href).hostname.replace(/^www\./, ''); } catch (_) { return hideTooltip(true); }
            tooltip.textContent = hostname;
            tooltip.hidden = false;
            var rect = link.getBoundingClientRect();
            var tip = tooltip.getBoundingClientRect();
            var above = rect.top >= tip.height + 20;
            tooltip.dataset.side = above ? 'above' : 'below';
            tooltip.style.left = Math.max(10, Math.min(innerWidth - tip.width - 10, rect.left + rect.width / 2 - tip.width / 2)) + 'px';
            tooltip.style.top = (above ? rect.top - tip.height - 12 : rect.bottom + 10) + 'px';
            tooltip.setAttribute('aria-hidden', 'false');
            describe(link, true);
            requestAnimationFrame(function () { if (active === link) tooltip.classList.add('is-visible'); });
            lastShown = performance.now();
        }
        function queueTooltip(link, keyboard) {
            clearTimeout(hideTimer);
            hideTimer = null;
            if (link === active || link === pending || link === dismissed) return;
            clearTimeout(showTimer);
            pending = link;
            showTimer = setTimeout(function () { showTooltip(link); }, keyboard || performance.now() - lastShown < 700 ? 0 : 240);
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
        function clearInteraction() { hideTooltip(true); resetDock(); resetSubmit(); dismissed = null; }
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
                if (dismissed && dismissed !== link) dismissed = null;
                queueTooltip(link, false);
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
                if (!tooltip.contains(event.target)) {
                    dismissed = null;
                    clearTimeout(showTimer); pending = null;
                    if (!hideTimer) hideTimer = setTimeout(function () { hideTimer = null; hideTooltip(false); }, 120);
                } else { clearTimeout(hideTimer); hideTimer = null; }
            }
        }, { passive: true });
        canvas.addEventListener('focusin', function (event) {
            var link = event.target.closest('.app-tile');
            if (link) { dismissed = null; queueTooltip(link, true); }
        });
        canvas.addEventListener('focusout', function (event) {
            if (event.target.closest('.app-tile')) hideTooltip(false);
        });
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && (active || pending)) {
                dismissed = active || pending;
                hideTooltip(true);
                resetDock();
            }
        });
        document.addEventListener('pointerdown', function (event) {
            if (!event.target.closest('.app-destination')) hideTooltip(true);
        }, { passive: true });
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
