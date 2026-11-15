/* Legacy media bridge only. New pages own their media and need no heartbeat. */
(function () {
    'use strict';
    let valid = true;
    function send(message) {
        if (!valid) return Promise.reject(new Error('擴充已更新，請重新載入新分頁。'));
        try {
            return chrome.runtime.sendMessage(message).catch(error => {
                if (/context invalidated/i.test(error.message)) valid = false;
                throw error;
            });
        } catch (error) { valid = false; return Promise.reject(error); }
    }
    window.addEventListener('message', event => {
        if (event.source !== window || event.origin !== location.origin || !event.data || event.data.type !== 'FROM_PAGE') return;
        const request = event.data;
        if (!['loadVideo', 'saveVideo'].includes(request.action)) return;
        const message = request.action === 'saveVideo'
            ? { action: 'saveVideo', data: request.data, type: request.fileType, name: request.name }
            : { action: 'loadVideo' };
        send(message).then(result => {
            const response = { type: 'FROM_EXTENSION', action: request.action };
            if (request.action === 'loadVideo') response.data = result && result.customVideo ? result : {};
            else { response.success = !!result?.success; response.error = result?.error; }
            window.postMessage(response, location.origin);
        }, error => window.postMessage({ type: 'FROM_EXTENSION', action: request.action, success: false, data: {}, error: error.message }, location.origin));
    });
    function inject(file) {
        if (document.getElementById('bg-file')) return;
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL(file);
        script.onload = script.onerror = () => script.remove();
        document.head.appendChild(script);
    }
    function initialize() {
        if (!chrome.runtime?.id) return;
        document.documentElement.dataset.newtabExtension = 'ready';
        if (!document.getElementById('bg-file')) { inject('helper.js'); setTimeout(() => inject('inject.js'), 100); }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
    else initialize();
})();
