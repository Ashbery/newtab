/* Cache only this site's public application files after its first usable frame. */
(function (global) {
    'use strict';
    var script = document.currentScript;
    var base = new URL('../', script && script.src || location.href);
    var started = false;
    function start() {
        if (started) return;
        started = true;
        if (!global.isSecureContext || !('serviceWorker' in navigator)) return;
        // No reload or focus change: an updated shell is used by the next tab.
        try {
            navigator.serviceWorker.register(new URL('newtab-sw.js', base).href, {
                scope: base.href, updateViaCache: 'none'
            }).then(function (registration) {
                var worker = registration.installing || registration.waiting || registration.active;
                if (!worker) return;
                function warm() {
                    if (worker.state !== 'activated') return;
                    worker.removeEventListener('statechange', warm);
                    // Optional fonts/artwork warm after activation; they never
                    // delay the atomic critical shell or the first usable frame.
                    worker.postMessage({ type: 'newtab-cache-warm-assets' });
                }
                if (worker.state === 'activated') warm();
                else worker.addEventListener('statechange', warm);
            }).catch(function () { /* Private/blocked storage keeps normal network loading. */ });
        } catch (_) { /* Some embedded/private contexts deny access synchronously. */ }
    }
    global.NewtabSiteCache = { start: start };
    // The startup coordinator normally calls start after layout. Keep a safe
    // fallback for hosts that embed this script without that coordinator.
    if (document.readyState === 'complete') start();
    else global.addEventListener('load', start, { once: true });
})(window);
