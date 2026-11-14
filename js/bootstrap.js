/* The parsed, styled document is ready; paint only an arranged home. */
(function (global) {
    'use strict';
    var started = false;
    function init() {
        if (started) return;
        started = true;
        try {
            if (!global.NewtabWidgets || !global.NewtabLayout) throw new Error('Missing home modules');
            // IndexedDB/media decoding runs independently of the usable home.
            if (global.NewtabBackground) global.NewtabBackground.init();
            global.NewtabWidgets.init();
            if (global.NewtabContextMenu) global.NewtabContextMenu.init();
            if (global.NewtabSideRail) global.NewtabSideRail.init();
            if (global.NewtabScreenLayouts) global.NewtabScreenLayouts.init();
            if (global.NewtabStartup) global.NewtabStartup.ready();
            if (global.NewtabSiteCache) global.NewtabSiteCache.start();
        } catch (error) {
            console.error('Newtab initialization failed', error);
            if (global.NewtabStartup) global.NewtabStartup.fail();
        }
    }

    var trigger = document.getElementById('apps-trigger');
    var folder = document.getElementById('google-apps-folder');
    if (trigger && folder) {
        function closeFolder() {
            folder.style.display = 'none'; trigger.classList.remove('active'); trigger.setAttribute('aria-expanded', 'false');
        }
        trigger.addEventListener('click', function (event) {
            event.stopPropagation();
            if (folder.style.display === 'block') closeFolder();
            else { folder.style.display = 'block'; trigger.classList.add('active'); trigger.setAttribute('aria-expanded', 'true'); }
        });
        document.addEventListener('click', function (event) {
            if (!trigger.contains(event.target) && !folder.contains(event.target)) closeFolder();
        });
    }
    // Defer executes after parsing; this fallback also supports explicit loading.
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})(window);
