/* Credentials remain in the local service, protected by Windows. */
(function (global) {
    'use strict';
    var base = 'http://127.0.0.1:43127/v1';
    var headers = { 'Content-Type': 'application/json', 'X-Newtab-Client': '1' };
    async function request(route, body) {
        var response = await fetch(base + route, { method: body === undefined ? 'GET' : 'POST', headers: headers,
            body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
        var value = await response.json();
        if (!response.ok) throw new Error(value.error && value.error.message || '本機對話服務暫時無法使用。');
        return value;
    }
    global.NewtabChatTransport = {
        status: async function () {
            try { return await request('/status'); }
            catch (_) { return { available: false, connected: false, canChat: false, error: '本機對話服務尚未連上。請確認服務已啟動，並允許瀏覽器存取本機網路。' }; }
        },
        login: function () { return request('/login', {}); },
        disconnect: function () { return request('/disconnect', {}); },
        stream: async function (options) {
            var response = await fetch(base + '/chat', { method: 'POST', headers: headers,
                body: JSON.stringify({ messages: options.messages, characterPrompt: options.characterPrompt }), signal: options.signal });
            if (!response.ok) { var failure = await response.json(); throw new Error(failure.error && failure.error.message || '暫時無法取得回覆。'); }
            var reader = response.body.getReader(), decoder = new TextDecoder(), pending = '', text = '', completed = false;
            try {
                while (true) {
                    var next = await reader.read(); pending += decoder.decode(next.value || new Uint8Array(), { stream: !next.done });
                    var split;
                    while ((split = pending.indexOf('\n\n')) >= 0) {
                        var frame = pending.slice(0, split); pending = pending.slice(split + 2);
                        var type = '', data = '';
                        frame.split('\n').forEach(function (line) { if (line.startsWith('event: ')) type = line.slice(7); if (line.startsWith('data: ')) data += line.slice(6); });
                        if (!data) continue;
                        var value = JSON.parse(data);
                        if (type === 'delta') { text += value.text; options.onDelta && options.onDelta(value.text); }
                        if (type === 'done') { completed = true; text = value.text; }
                        if (type === 'error') throw new Error(value.message || '回覆中斷，請重試。');
                    }
                    if (next.done) break;
                }
                if (!completed) throw new Error('回覆中斷，請重試。');
                return { text: text };
            } finally { await reader.cancel().catch(function () {}); reader.releaseLock(); }
        }
    };
})(window);
