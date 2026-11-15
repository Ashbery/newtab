'use strict';
const toggle = document.getElementById('keepAliveToggle');
const radios = Array.from(document.querySelectorAll('[name="icon-theme"]'));
const statusText = document.getElementById('statusText');
const statusLabel = document.getElementById('statusLabel');
const feedback = document.querySelector('.feedback');
const feedbackText = document.getElementById('feedbackText');
const retry = document.getElementById('retry-settings');
const portrait = document.getElementById('portrait');
const names = { blue: '藍色日常', knit: '暖冬針織', ribbon: '緞帶制服' };
let state = null, busy = false, generation = 0;
document.getElementById('version').textContent = 'v' + chrome.runtime.getManifest().version;
function lock(value) { busy = value; toggle.disabled = value; radios.forEach(radio => { radio.disabled = value; }); }
function paint(next) {
    const changed = state && state.theme !== next.theme;
    state = next; toggle.checked = next.enabled;
    radios.forEach(radio => { radio.checked = radio.value === next.theme; });
    statusText.dataset.enabled = String(next.enabled);
    statusLabel.textContent = next.pendingRestoreCount ? '有 ' + next.pendingRestoreCount + ' 個新分頁等待恢復' :
        next.enabled ? (next.protectedCount ? '已保留 ' + next.protectedCount + ' 個新分頁' : '開啟新分頁時自動保留') : '一般節能模式';
    portrait.src = 'icons/nacho-' + next.theme + '-512.png'; portrait.alt = 'Nacho ' + names[next.theme] + '造型';
    if (changed && !matchMedia('(prefers-reduced-motion: reduce)').matches)
        portrait.animate([{ opacity: .6, transform: 'translateY(3px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 220, easing: 'cubic-bezier(.22,1,.36,1)' });
}
function notice(message, error) { feedbackText.textContent = message; feedback.dataset.error = String(!!error); retry.hidden = !error; }
async function request(action, values = {}, saved = false) {
    const id = ++generation; lock(true); notice(saved ? '正在儲存…' : '', false);
    try {
        const result = await chrome.runtime.sendMessage({ action, ...values });
        if (id !== generation) return;
        if (!result?.success || !result.state) throw new Error(result?.error || '設定未能載入，請重試。');
        paint(result.state);
        const pending = result.state.pendingRestoreCount || result.state.pendingProtectCount;
        notice(pending ? '部分分頁未能套用設定，請重試。' : saved ? '已儲存' : '', !!pending); lock(false);
    } catch (error) {
        if (id !== generation) return;
        if (state) paint(state);
        lock(!state); notice(error.message || '設定未能載入，請重試。', true);
    }
}
toggle.addEventListener('change', () => request('updateKeepAliveSetting', { enabled: toggle.checked }, true));
radios.forEach(radio => radio.addEventListener('change', () => { if (radio.checked) request('setIconTheme', { theme: radio.value }, true); }));
retry.addEventListener('click', () => request('getExtensionState'));
document.getElementById('open-newtab').addEventListener('click', async () => {
    try { await chrome.tabs.create({ url: 'chrome://newtab/' }); window.close(); }
    catch (_) { notice('未能開啟新分頁，請重試。', true); }
});
chrome.storage.onChanged.addListener((changes, area) => {
    if (!busy && area === 'local' && (changes.keepAliveEnabled || changes.nachoIconTheme)) request('getExtensionState');
});
request('getExtensionState');
