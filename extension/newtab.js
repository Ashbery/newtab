'use strict';

// Keep the outer document on Chrome's native new-tab route. In particular,
// do not redirect it to HTTPS or focus the iframe on startup.
document.getElementById('retry-newtab').addEventListener('click', () => location.reload());
chrome.runtime.sendMessage({ action: 'newtabOpened' }).then(response => {
    if (!response || !response.success) throw new Error('New tab registration failed');
    // Register the exact parent document before the site can start navigating.
    document.getElementById('newtab-frame').src = 'https://ashbery.github.io/newtab/';
}).catch(() => {
    document.getElementById('load-error').hidden = false;
});
