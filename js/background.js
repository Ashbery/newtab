/* Background selection: validate first, then apply and persist. */
(function (global) {
    'use strict';

    var video = document.getElementById('video-background');
    var image = document.getElementById('image-background');
    var dialog = document.getElementById('video-upload-container');
    var about = document.getElementById('about-page-container');
    var fileInput = document.getElementById('bg-file');
    var urlInput = document.getElementById('bg-url');
    var loadButton = document.getElementById('load-url-btn');
    var applyButton = document.getElementById('confirm-upload');
    var restoreButton = document.getElementById('restore-theme');
    var status = document.getElementById('background-status');
    var playButton = document.getElementById('play-pause-btn');
    var muteButton = document.getElementById('mute-btn');
    var gear = document.getElementById('settings-gear');
    var menu = document.getElementById('settings-menu');
    var currentType = 'image';
    var activeObjectUrl = null;
    var selectedFile = null;
    var busy = false;
    var revision = 0;
    var dbPromise = null;
    var returnFocus = new WeakMap();

    function message(text, isError) {
        status.textContent = text || '';
        status.classList.toggle('is-error', !!isError);
    }

    function safeRead(key) {
        try { return localStorage.getItem(key); } catch (_) { return null; }
    }

    function openDatabase() {
        if (!dbPromise) {
            dbPromise = new Promise(function (resolve, reject) {
                var request;
                try { request = indexedDB.open('NewtabBackgroundDB', 1); }
                catch (error) { reject(error); return; }
                request.onupgradeneeded = function () {
                    if (!request.result.objectStoreNames.contains('media')) request.result.createObjectStore('media');
                };
                request.onerror = function () { reject(request.error); };
                request.onblocked = function () { reject(new Error('背景儲存空間正在使用中')); };
                request.onsuccess = function () {
                    request.result.onversionchange = function () { request.result.close(); dbPromise = null; };
                    resolve(request.result);
                };
            }).catch(function (error) { dbPromise = null; throw error; });
        }
        return dbPromise;
    }

    async function storedMedia(record) {
        var db = await openDatabase();
        return new Promise(function (resolve, reject) {
            var tx = db.transaction('media', record ? 'readwrite' : 'readonly');
            var store = tx.objectStore('media');
            var request = record ? store.put(record, 'cached_background') : store.get('cached_background');
            // A successful request can still belong to an aborted transaction.
            tx.oncomplete = function () { resolve(request.result); };
            tx.onabort = tx.onerror = function () { reject(tx.error || new Error('無法儲存背景')); };
        });
    }

    async function clearStoredMedia() {
        var db = await openDatabase();
        return new Promise(function (resolve, reject) {
            var tx = db.transaction('media', 'readwrite');
            tx.objectStore('media').delete('cached_background');
            tx.oncomplete = resolve;
            tx.onabort = tx.onerror = function () { reject(tx.error || new Error('無法清除舊背景')); };
        });
    }

    function legacyExtensionMedia() {
        return new Promise(function (resolve) {
            var request;
            try { request = indexedDB.open('VideoCacheDB'); }
            catch (_) { resolve(null); return; }
            // Reading compatibility data must not create an empty legacy store.
            request.onupgradeneeded = function () { request.transaction.abort(); };
            request.onerror = request.onblocked = function () { resolve(null); };
            request.onsuccess = function () {
                var db = request.result;
                if (!db.objectStoreNames.contains('videos')) { db.close(); resolve(null); return; }
                try {
                    var tx = db.transaction('videos', 'readonly');
                    var read = tx.objectStore('videos').get('cached_video');
                    tx.oncomplete = function () { db.close(); resolve(read.result || null); };
                    tx.onabort = tx.onerror = function () { db.close(); resolve(null); };
                } catch (_) { db.close(); resolve(null); }
            };
        });
    }

    function normalizeUrl(raw) {
        try {
            var url = new URL(raw.trim());
            if (!/^https?:$/.test(url.protocol) || !url.hostname || url.username || url.password) return null;
            return url.href;
        } catch (_) { return null; }
    }

    function probe(src, kind) {
        return new Promise(function (resolve, reject) {
            var media = kind === 'image' ? new Image() : document.createElement('video');
            var timeout = setTimeout(function () { finish(false); }, 12000);
            function finish(ok) {
                clearTimeout(timeout);
                media.onload = media.onerror = media.onloadeddata = null;
                if (kind === 'video') { media.pause(); media.removeAttribute('src'); media.load(); }
                if (ok) resolve(kind);
                else reject(new Error('無法載入媒體，請確認網址可直接開啟圖片或影片。'));
            }
            media.onerror = function () { finish(false); };
            if (kind === 'image') media.onload = function () { finish(media.naturalWidth > 0); };
            else { media.muted = true; media.preload = 'auto'; media.onloadeddata = function () { finish(true); }; }
            media.src = src;
        });
    }

    async function detectMedia(src, file) {
        if (file) return probe(src, file.type.indexOf('image/') === 0 || /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(file.name) ? 'image' : 'video');
        var pathname = new URL(src).pathname;
        if (/\.(mp4|webm|ogg)$/i.test(pathname)) return probe(src, 'video');
        if (/\.(jpe?g|png|webp|gif|bmp|avif|svg)$/i.test(pathname)) return probe(src, 'image');
        // Image services often use extensionless URLs; the media itself decides its type.
        try { return await probe(src, 'image'); } catch (_) { return probe(src, 'video'); }
    }

    function syncControls() {
        var playable = currentType === 'video' && !video.error;
        var mediaStatus = document.getElementById('rail-media-status');
        if (mediaStatus) {
            mediaStatus.hidden = playable;
            mediaStatus.textContent = currentType === 'video' ? '影片暫時無法播放，請更換背景。' :
                document.body.classList.contains('has-custom-background') ? '目前使用圖片背景。' : '目前使用貓貓主題。';
        }
        document.querySelectorAll('#side-rail [data-action="play-pause"], #side-rail [data-action="mute"]').forEach(function (button) {
            button.hidden = !playable;
        });
        [playButton, document.querySelector('[data-action="play-pause"]')].forEach(function (button) {
            if (!button) return;
            button.disabled = !playable;
            button.setAttribute('aria-disabled', String(!playable));
            var label = playable ? (video.paused ? '播放背景影片' : '暫停背景影片') : '圖片背景無需播放';
            var span = button.querySelector('span');
            if (span) span.textContent = label;
            else { var icon = button.querySelector('i'); button.textContent = label; if (icon) button.prepend(icon); }
        });
        [muteButton, document.querySelector('[data-action="mute"]')].forEach(function (button) {
            if (!button) return;
            button.disabled = !playable;
            button.setAttribute('aria-disabled', String(!playable));
            var label = playable ? (video.muted ? '開啟背景聲音' : '將背景靜音') : '圖片背景沒有聲音';
            var span = button.querySelector('span');
            if (span) span.textContent = label;
            else { var icon = button.querySelector('i'); button.textContent = label; if (icon) button.prepend(icon); }
        });
    }

    function applyMedia(src, type, name) {
        document.body.classList.add('has-custom-background');
        var previous = activeObjectUrl;
        activeObjectUrl = src.indexOf('blob:') === 0 ? src : null;
        currentType = type;
        video.pause();
        // Remove the original <source> as well, or load() restarts it behind an image.
        video.querySelectorAll('source').forEach(function (source) { source.remove(); });
        if (type === 'image') {
            video.removeAttribute('src');
            video.load();
            video.style.display = 'none';
            image.style.backgroundImage = 'url(' + JSON.stringify(src) + ')';
            image.style.display = 'block';
        } else {
            image.style.display = 'none';
            image.style.backgroundImage = '';
            video.style.display = 'block';
            video.src = src;
            video.loop = true;
            video.muted = true;
            video.autoplay = true;
            video.playsInline = true;
            video.load();
            video.play().catch(function () { syncControls(); });
        }
        if (previous && previous !== src) URL.revokeObjectURL(previous);
        document.getElementById('current-video-info').style.display = 'block';
        document.getElementById('current-video-name').textContent = name;
        syncControls();
    }

    function updateButtons() {
        loadButton.disabled = busy || !urlInput.value.trim();
        applyButton.disabled = busy || !selectedFile;
        if (restoreButton) restoreButton.disabled = busy;
        fileInput.disabled = urlInput.disabled = busy;
        dialog.setAttribute('aria-busy', String(busy));
    }

    async function selectBackground(file) {
        if (busy) return;
        var source = file ? URL.createObjectURL(file) : normalizeUrl(urlInput.value);
        if (!source) { message('請輸入有效的 http:// 或 https:// 媒體網址。', true); urlInput.focus(); return; }
        busy = true;
        revision++;
        updateButtons();
        message('正在檢查背景，請稍候…');
        try {
            var type = await detectMedia(source, file);
            var name = file ? file.name : (type === 'image' ? '自訂網址圖片' : '自訂網址影片');
            var meta = { type: type, source: file ? 'file' : 'url', name: name, url: file ? '' : source };
            var saved = true;
            try {
                if (file) await storedMedia({ blob: file, type: type, name: name });
                else await clearStoredMedia();
                localStorage.setItem('nt_background_v1', JSON.stringify(meta));
            } catch (_) { saved = false; }
            applyMedia(source, type, name);
            source = null; // The active background now owns its object URL.
            if (saved) {
                busy = false;
                closeDialog(dialog);
                resetForm();
            } else {
                message('背景已套用，但瀏覽器無法保存設定。重新整理後可能需要重新選擇。', true);
            }
        } catch (error) { message(error.message, true); }
        finally {
            if (source && file) URL.revokeObjectURL(source);
            busy = false;
            updateButtons();
        }
    }

    function resetForm() {
        fileInput.value = urlInput.value = '';
        selectedFile = null;
        message('選擇本機檔案後套用，或直接載入媒體網址。');
        updateButtons();
    }

    function closeMenu() {
        menu.style.display = 'none';
        gear.classList.remove('active');
        gear.setAttribute('aria-expanded', 'false');
    }

    function openDialog(element) {
        returnFocus.set(element, document.activeElement);
        closeMenu();
        element.style.display = 'flex';
        element.querySelector('button').focus();
    }

    function closeDialog(element) {
        if (element === dialog && busy) return;
        element.style.display = 'none';
        var previous = returnFocus.get(element);
        if (previous && previous.isConnected && previous.getClientRects().length && !previous.disabled && !previous.closest('[inert]')) previous.focus();
        else if (previous && menu.contains(previous) && gear.getClientRects().length) gear.focus();
        else { var tab = document.getElementById('side-rail-tab'); if (tab) tab.focus(); }
    }

    function openUpload() { if (!busy) resetForm(); openDialog(dialog); }
    function openAbout() { openDialog(about); }

    function restoreTheme() {
        if (busy) return;
        revision++;
        var saved = true;
        // An explicit default record supersedes legacy preferences without
        // deleting the user's cached original media.
        try { localStorage.setItem('nt_background_v1', JSON.stringify({ source: 'default', type: 'image', name: '貓貓主題', url: '' })); }
        catch (_) { saved = false; }
        currentType = 'image';
        video.pause();
        video.removeAttribute('src');
        video.querySelectorAll('source').forEach(function (source) { source.remove(); });
        video.load();
        video.style.display = image.style.display = 'none';
        image.style.backgroundImage = '';
        if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
        activeObjectUrl = null;
        document.body.classList.remove('has-custom-background');
        document.getElementById('current-video-info').style.display = 'none';
        resetForm();
        syncControls();
        if (saved) closeDialog(dialog);
        else message('已恢復主題，但瀏覽器無法保存設定。', true);
    }

    async function restore() {
        var started = revision;
        try {
            var meta;
            try { meta = JSON.parse(safeRead('nt_background_v1')); } catch (_) { /* legacy settings */ }
            var legacy = !meta || typeof meta !== 'object';
            if (legacy) {
                var legacySource = safeRead('bgSource') || safeRead('videoSource');
                meta = {
                    type: safeRead('bgType') || 'video',
                    source: legacySource,
                    name: safeRead('bgName') || safeRead('videoName'),
                    url: safeRead('customBackground') || (legacySource === 'url'
                        ? safeRead('videoUrl') || safeRead('customVideo')
                        : safeRead('customVideo') || safeRead('videoUrl'))
                };
            }
            if (meta.source === 'file' || meta.source === 'extension' || (!meta.source &&
                (safeRead('hasIdbBackground') === 'true' || safeRead('hasExtensionVideo') === 'true'))) {
                var record = await storedMedia();
                if (started !== revision) return;
                var blob = record && (record.blob || record);
                var migrated = false;
                if (!(blob instanceof Blob) && (legacy || meta.source === 'extension')) {
                    var oldRecord = await legacyExtensionMedia();
                    if (started !== revision) return;
                    blob = oldRecord && (oldRecord.blob || oldRecord);
                    if (blob instanceof Blob && blob.size) {
                        record = { blob: blob, type: blob.type.indexOf('image/') === 0 ? 'image' : 'video', name: meta.name || '自訂背景' };
                        migrated = true;
                    }
                }
                if (blob instanceof Blob) {
                    if (migrated) {
                        try {
                            await storedMedia(record);
                            if (started !== revision) return;
                            localStorage.setItem('nt_background_v1', JSON.stringify({ type: record.type, source: 'file', name: record.name, url: '' }));
                        } catch (_) { /* Still display the legacy original if copying is unavailable. */ }
                        if (started !== revision) return;
                    }
                    var source = URL.createObjectURL(blob);
                    var type = record.blob ? record.type : (blob.type.indexOf('image/') === 0 ? 'image' : meta.type);
                    applyMedia(source, type, record.name || meta.name || '自訂背景');
                    return;
                }
            }
            if (meta.url && normalizeUrl(meta.url) && started === revision) {
                var kind = await detectMedia(meta.url);
                if (started === revision) {
                    if (legacy) {
                        try { localStorage.setItem('nt_background_v1', JSON.stringify({ type: kind, source: 'url', name: meta.name || '自訂背景', url: meta.url })); }
                        catch (_) { /* The legacy URL remains usable without a metadata migration. */ }
                    }
                    applyMedia(meta.url, kind, meta.name || '自訂背景');
                }
            }
        } catch (_) { /* Keep the default background if saved storage or media is unavailable. */ }
    }

    fileInput.addEventListener('change', function () {
        selectedFile = fileInput.files[0] || null;
        urlInput.value = '';
        if (selectedFile) {
            var isImage = /^image\/(jpeg|png|webp|gif|bmp|avif)$/.test(selectedFile.type) || /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(selectedFile.name);
            var isVideo = /^video\/(mp4|webm)$/.test(selectedFile.type) || /\.(mp4|webm)$/i.test(selectedFile.name);
            var limit = isImage ? 50 : 1000;
            if ((!isImage && !isVideo) || selectedFile.size > limit * 1024 * 1024 || !selectedFile.size) {
                message(!isImage && !isVideo ? '請選擇支援的圖片或 MP4／WebM 影片。' : '檔案必須有內容，且不可超過 ' + limit + 'MB。', true);
                selectedFile = null;
                fileInput.value = '';
            } else message('已選擇「' + selectedFile.name + '」，按下套用即可更換。');
        } else message('請選擇檔案或輸入媒體網址。');
        updateButtons();
    });
    urlInput.addEventListener('input', function () {
        selectedFile = null;
        fileInput.value = '';
        message('載入成功後會自動套用，原本的背景會保留到載入完成。');
        updateButtons();
    });
    urlInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); selectBackground(null); }
    });
    loadButton.addEventListener('click', function () { selectBackground(null); });
    applyButton.addEventListener('click', function () { if (selectedFile) selectBackground(selectedFile); });
    if (restoreButton) restoreButton.addEventListener('click', restoreTheme);
    document.getElementById('upload-video-btn').addEventListener('click', openUpload);
    document.getElementById('about-page-btn').addEventListener('click', openAbout);
    document.getElementById('close-upload').addEventListener('click', function () { closeDialog(dialog); });
    document.getElementById('close-about').addEventListener('click', function () { closeDialog(about); });
    [dialog, about].forEach(function (element) {
        element.addEventListener('click', function (event) { if (event.target === element) closeDialog(element); });
    });
    document.addEventListener('keydown', function (event) {
        var activeDialog = [dialog, about].find(function (element) { return element.style.display === 'flex'; });
        if (!activeDialog) return;
        if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); closeDialog(activeDialog); }
        if (event.key === 'Tab') {
            var focusable = Array.from(activeDialog.querySelectorAll('button:not(:disabled), input:not(:disabled), a[href]'));
            var first = focusable[0], last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
    }, true);
    gear.addEventListener('click', function (event) {
        event.stopPropagation();
        if (menu.style.display === 'block') closeMenu();
        else { menu.style.display = 'block'; gear.classList.add('active'); gear.setAttribute('aria-expanded', 'true'); }
    });
    document.addEventListener('click', function (event) { if (!gear.contains(event.target) && !menu.contains(event.target)) closeMenu(); });
    playButton.addEventListener('click', function () {
        if (currentType !== 'video') return;
        if (video.paused) video.play().catch(syncControls); else video.pause();
        closeMenu();
    });
    muteButton.addEventListener('click', function () { if (currentType === 'video') video.muted = !video.muted; closeMenu(); });
    ['play', 'pause', 'volumechange', 'error', 'loadeddata'].forEach(function (name) { video.addEventListener(name, syncControls); });
    video.addEventListener('error', function () {
        if (currentType === 'video') video.style.display = 'none';
    });
    video.addEventListener('loadeddata', function () {
        if (currentType === 'video') video.style.display = 'block';
    });
    global.NewtabBackground = {
        openUpload: openUpload, openAbout: openAbout, syncControls: syncControls,
        init: function () {
            video.style.display = 'none';
            video.loop = true;
            video.muted = true;
            video.autoplay = true;
            video.playsInline = true;
            image.style.backgroundImage = '';
            image.style.display = 'none';
            resetForm();
            syncControls();
            restore();
        }
    };
})(window);
