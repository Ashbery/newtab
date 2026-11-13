/* Local character companion: deliberate interaction, no persistent motion. */
(function () {
    'use strict';

    function init() {
        var companion = document.getElementById('home-companion');
        var trigger = document.getElementById('companion-trigger');
        var message = document.getElementById('companion-message');
        if (!companion || !trigger || !message || companion.dataset.ready) return;
        companion.dataset.ready = 'true';

        var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
        var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
        var messages = ['今天也陪著你。', '伸個懶腰，再出發吧。', '把今天，過成喜歡的樣子。'];
        var messageIndex = 0;
        var greetingTimer;
        var speakingTimer;
        var layoutFrame = 0;
        var pointerFrame = 0;
        var pointer = { x: 0, y: 0 };
        var scrolling = false;
        var scrollTimer;
        var lastDock = null;
        var observedWidgets = new Set();
        var footprint = document.createElement('span');
        footprint.className = 'companion-footprint';
        footprint.setAttribute('aria-hidden', 'true');
        companion.appendChild(footprint);

        // A fixed hit target contains the optical layers; pointer movement never
        // moves the button or the independently measured collision footprint.
        var portrait = companion.querySelector('.companion-portrait');
        var scene = document.createElement('span');
        scene.className = 'companion-scene';
        scene.setAttribute('aria-hidden', 'true');
        var disc = document.createElement('span');
        disc.className = 'companion-disc';
        var cast = portrait.cloneNode(false);
        cast.className = 'companion-cast';
        cast.removeAttribute('id');
        disc.appendChild(cast);
        var figure = document.createElement('span');
        figure.className = 'companion-figure';
        figure.appendChild(portrait);
        scene.append(disc, figure);
        trigger.prepend(scene);
        var oldOrbit = companion.querySelector('.companion-orbit');
        if (oldOrbit) oldOrbit.remove();

        var flourish = companion.querySelector('.companion-flourish');
        if (flourish) {
            flourish.innerHTML = '<svg class="companion-spark companion-spark--one" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2 14.5 9.5 22 12 14.5 14.5 12 22 9.5 14.5 2 12 9.5 9.5Z"/></svg>' +
                '<svg class="companion-spark companion-spark--two" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 14.5 9.5 22 12 14.5 14.5 12 22 9.5 14.5 2 12 9.5 9.5Z"/></svg>' +
                '<svg class="companion-spark companion-spark--paw" viewBox="0 0 24 24" fill="currentColor"><ellipse cx="7" cy="7" rx="2" ry="2.7"/><ellipse cx="12" cy="5" rx="2" ry="2.7"/><ellipse cx="17" cy="7" rx="2" ry="2.7"/><path d="M6 17c0-3 3-7 6-7s6 4 6 7c0 3-3 3-6 2-3 1-6 1-6-2Z"/></svg>';
        }

        function resetPointer() {
            pointer.x = 0;
            pointer.y = 0;
            if (pointerFrame) cancelAnimationFrame(pointerFrame);
            pointerFrame = 0;
            companion.style.setProperty('--companion-x', '0px');
            companion.style.setProperty('--companion-y', '0px');
            companion.style.setProperty('--companion-tilt-x', '0deg');
            companion.style.setProperty('--companion-tilt-y', '0deg');
            companion.classList.remove('is-tracking');
        }

        function visible(element) {
            if (!element || !element.getClientRects().length) return false;
            if (element.checkVisibility) return element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
            var style = getComputedStyle(element);
            return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0;
        }

        function reservesSpace(element) {
            if (!element || !element.getClientRects().length) return false;
            // A control fading in already owns its space, even on its zero-opacity frame.
            if (element.checkVisibility) return element.checkVisibility({ checkVisibilityCSS: true });
            var style = getComputedStyle(element);
            return style.visibility !== 'hidden' && style.display !== 'none';
        }

        function box(left, top, width, height) {
            return { left: left, top: top, right: left + width, bottom: top + height, width: width, height: height };
        }

        function viewport() {
            var view = window.visualViewport;
            return box(view ? view.offsetLeft : 0, view ? view.offsetTop : 0,
                view ? view.width : innerWidth, view ? view.height : innerHeight);
        }

        function intersects(a, b, gap) {
            return a.right + gap > b.left && a.left - gap < b.right &&
                a.bottom + gap > b.top && a.top - gap < b.bottom;
        }

        function clearAt(rect, obstacles, view, gap) {
            return rect.left >= view.left + 12 && rect.right <= view.right - 12 &&
                rect.top >= view.top + 12 && rect.bottom <= view.bottom - 12 &&
                !obstacles.some(function (obstacle) { return intersects(rect, obstacle, gap); });
        }

        function obstaclesIn(view) {
            var elements = Array.from(document.querySelectorAll('#widget-canvas .widget'))
                .filter(function (widget) { return widget.dataset.active !== 'false'; });
            // Portaled controls and suggestions can extend beyond their widget.
            document.querySelectorAll('button, a[href], input, textarea, select, [role="button"], [role="menu"], .suggestions-container[aria-hidden="false"]')
                .forEach(function (element) {
                    if (companion.contains(element)) return;
                    if (!element.closest('#widget-canvas .widget') || element.classList.contains('suggestions-container')) elements.push(element);
                });
            return elements.filter(function (element) { return element.matches('#widget-canvas .widget') ? reservesSpace(element) : visible(element); })
                .map(function (element) { return element.getBoundingClientRect(); })
                .filter(function (rect) { return rect.width && rect.height && intersects(rect, view, 0); });
        }

        function hide() {
            companion.classList.add('is-space-hidden');
            companion.classList.remove('is-greeting', 'is-speaking');
            companion.dataset.placement = 'hidden';
            companion.inert = true;
            companion.setAttribute('aria-hidden', 'true');
            resetPointer();
        }

        function show() {
            companion.classList.remove('is-space-hidden');
            companion.classList.add('is-positioned');
            companion.inert = false;
            companion.setAttribute('aria-hidden', 'false');
        }

        function positionSpeech(obstacles, view) {
            if (!companion.classList.contains('is-speaking')) return;
            var anchor = trigger.getBoundingClientRect();
            var size = message.getBoundingClientRect();
            var gap = 14;
            var centerX = anchor.left + anchor.width / 2;
            var centerY = anchor.top + anchor.height * (companion.classList.contains('is-docked') ? .5 : .35);
            var candidates = [
                box(anchor.left - size.width - gap, centerY - size.height / 2, size.width, size.height),
                box(anchor.right + gap, centerY - size.height / 2, size.width, size.height),
                box(centerX - size.width / 2, anchor.bottom + gap, size.width, size.height),
                box(centerX - size.width / 2, anchor.top - size.height - gap, size.width, size.height)
            ];
            var place = candidates.find(function (candidate) { return clearAt(candidate, obstacles, view, 10); });
            companion.classList.toggle('is-speech-suppressed', !place);
            if (place) {
                message.style.setProperty('--speech-left', place.left + 'px');
                message.style.setProperty('--speech-top', place.top + 'px');
            }
        }

        function syncLayout() {
            layoutFrame = 0;
            var modal = Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"], .search-expand-layer.is-open, .folder-overlay.is-open')).some(reservesSpace);
            if (scrolling || document.body.matches('.is-focus-mode, .is-arranging, .side-rail-open') || modal) return hide();
            var view = viewport();
            var obstacles = obstaclesIn(view);
            // The independent full-size footprint avoids a dock/portrait feedback loop.
            var measured = footprint.getBoundingClientRect();
            // Reserve the maximum projected extent, including the disc, head,
            // bounded perspective and the soft cast shadow, at every pointer pose.
            var bleed = parseFloat(getComputedStyle(companion).getPropertyValue('--companion-visual-bleed')) || 44;
            var full = box(measured.left - bleed, measured.top - bleed, measured.width + bleed * 2, measured.height + bleed * 2);
            if (view.width >= 1100 && full.width && clearAt(full, obstacles, view, 12)) {
                companion.classList.remove('is-docked', 'is-top-avatar');
                companion.dataset.placement = 'portrait';
                show();
                positionSpeech(obstacles, view);
                return;
            }
            var mobile = view.width <= 600;
            var size = mobile ? 64 : 72;
            var inset = mobile ? 20 : 36;
            var signature = [view.left, view.top, view.width, view.height].join(':');
            var candidates = [];
            if (lastDock && lastDock.signature === signature) candidates.push(lastDock);
            if (mobile && view.height >= 600) candidates.push({ rect: box(view.left + (view.width - 88) / 2, view.top + 96, 88, 88), welcome: true });
            [28, 16, 116].forEach(function (top) {
                candidates.push({ rect: box(view.right - inset - size, view.top + top, size, size) });
                candidates.push({ rect: box(view.left + inset, view.top + top, size, size) });
                candidates.push({ rect: box(view.left + (view.width - size) / 2, view.top + top, size, size) });
            });
            var dock = candidates.find(function (candidate) { return clearAt(candidate.rect, obstacles, view, 14); });
            if (!dock) return hide();
            lastDock = { rect: dock.rect, welcome: !!dock.welcome, signature: signature };
            resetPointer();
            companion.classList.add('is-docked');
            companion.classList.toggle('is-top-avatar', !!dock.welcome);
            companion.style.setProperty('--dock-left', dock.rect.left + 'px');
            companion.style.setProperty('--dock-top', dock.rect.top + 'px');
            companion.style.setProperty('--dock-size', dock.rect.width + 'px');
            companion.dataset.placement = 'dock';
            show();
            positionSpeech(obstacles, view);
        }

        function queueLayout() {
            if (!layoutFrame) layoutFrame = requestAnimationFrame(syncLayout);
        }

        trigger.addEventListener('click', function () {
            if (companion.inert) return;
            messageIndex = (messageIndex + 1) % messages.length;
            message.textContent = messages[messageIndex];
            companion.classList.add('is-speaking');
            positionSpeech(obstaclesIn(viewport()), viewport());
            clearTimeout(speakingTimer);
            speakingTimer = setTimeout(function () { companion.classList.remove('is-speaking'); }, 4800);
            if (!motion.matches && !companion.classList.contains('is-greeting')) {
                companion.classList.add('is-greeting');
                clearTimeout(greetingTimer);
                greetingTimer = setTimeout(function () { companion.classList.remove('is-greeting'); }, 950);
            }
        });
        trigger.addEventListener('pointermove', function (event) {
            if (companion.inert || companion.classList.contains('is-docked') || motion.matches || !finePointer.matches || event.pointerType !== 'mouse') return;
            var rect = trigger.getBoundingClientRect();
            pointer.x = Math.max(-3, Math.min(3, ((event.clientX - rect.left) / rect.width - .5) * 6));
            pointer.y = Math.max(-3, Math.min(3, ((event.clientY - rect.top) / rect.height - .5) * 6));
            companion.classList.add('is-tracking');
            if (!pointerFrame) pointerFrame = requestAnimationFrame(function () {
                pointerFrame = 0;
                companion.style.setProperty('--companion-x', pointer.x.toFixed(2) + 'px');
                companion.style.setProperty('--companion-y', pointer.y.toFixed(2) + 'px');
                companion.style.setProperty('--companion-tilt-x', (-pointer.y * .8).toFixed(2) + 'deg');
                companion.style.setProperty('--companion-tilt-y', pointer.x.toFixed(2) + 'deg');
            });
        });
        trigger.addEventListener('pointerleave', resetPointer);
        trigger.addEventListener('blur', resetPointer);
        trigger.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') companion.classList.remove('is-speaking');
        });
        motion.addEventListener('change', function () {
            if (motion.matches) {
                resetPointer();
                companion.classList.remove('is-greeting');
            }
        });
        function pauseForScroll() {
            scrolling = true;
            hide();
            clearTimeout(scrollTimer);
            scrollTimer = setTimeout(function () { scrolling = false; queueLayout(); }, 140);
        }

        window.addEventListener('resize', queueLayout, { passive: true });
        document.addEventListener('scroll', pauseForScroll, { passive: true, capture: true });
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', queueLayout, { passive: true });
            window.visualViewport.addEventListener('scroll', pauseForScroll, { passive: true });
        }
        document.addEventListener('newtab:layout-change', queueLayout);
        var resizeObserver = window.ResizeObserver ? new ResizeObserver(queueLayout) : null;
        function watchWidgetSizes() {
            if (!resizeObserver) return;
            observedWidgets.forEach(function (widget) {
                if (!widget.isConnected) { resizeObserver.unobserve(widget); observedWidgets.delete(widget); }
            });
            document.querySelectorAll('#widget-canvas .widget').forEach(function (widget) {
                if (!observedWidgets.has(widget)) { resizeObserver.observe(widget); observedWidgets.add(widget); }
            });
        }
        new MutationObserver(function (records) {
            if (!records.some(function (record) { return !companion.contains(record.target); })) return;
            if (records.some(function (record) { return record.type === 'childList'; })) watchWidgetSizes();
            queueLayout();
        }).observe(document.body, { childList: true, attributes: true, subtree: true, attributeFilter: ['class', 'style', 'data-active', 'data-layout', 'hidden', 'aria-hidden'] });
        watchWidgetSizes();
        document.addEventListener('transitionend', function (event) {
            if (!companion.contains(event.target)) queueLayout();
        }, true);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(queueLayout);
        if (portrait) portrait.addEventListener('load', queueLayout);
        syncLayout();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
