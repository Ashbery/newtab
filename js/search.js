/* Search, suggestions and keyboard navigation. Loaded after the search markup. */
(function (global) {
    'use strict';

    const input = document.getElementById('search-input');
    const box = document.getElementById('search-box');
    const clearButton = document.getElementById('clear-btn');
    const submitButton = document.getElementById('search-submit');
    const container = document.getElementById('suggestions-container');
    const list = document.getElementById('suggestions-list');
    if (!input || !box || !clearButton || !container || !list) return;

    let debounceTimer = null;
    let openFrame = null;
    let request = null;
    let revision = 0;
    let callbackSequence = 0;
    let wantsSuggestions = false;
    let hasOpened = false;
    let composing = false;
    let selectedIndex = -1;
    let suggestions = [];
    let renderedQuery = '';
    let queryActionOnly = false;
    let suggestionsReady = false;

    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-label', '搜尋 Google 或輸入網址');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', list.id);
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('enterkeyhint', 'search');
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', '搜尋建議');
    container.setAttribute('aria-hidden', 'true');

    function updateClearButton() {
        const hasText = input.value.length > 0;
        box.classList.toggle('has-text', hasText);
        clearButton.disabled = !hasText;
        clearButton.tabIndex = hasText ? 0 : -1;
        if (submitButton) submitButton.disabled = !input.value.trim() || composing;
    }

    function updateSelection() {
        const items = list.querySelectorAll('.suggestion-item:not(.skeleton)');
        items.forEach(function (item, index) {
            const selected = index === selectedIndex;
            item.classList.toggle('selected', selected);
            item.setAttribute('aria-selected', String(selected));
        });
        if (selectedIndex >= 0 && items[selectedIndex]) {
            input.setAttribute('aria-activedescendant', items[selectedIndex].id);
            items[selectedIndex].scrollIntoView({ block: 'nearest' });
        } else {
            input.removeAttribute('aria-activedescendant');
        }
    }

    function openSuggestions() {
        if (!wantsSuggestions || !input.value.trim()) return;
        input.setAttribute('aria-expanded', 'true');
        container.setAttribute('aria-hidden', 'false');
        if (box.classList.contains('active') || openFrame !== null) return;
        // Keep the existing height transition, but never reopen after dismissal.
        openFrame = requestAnimationFrame(function () {
            openFrame = null;
            if (wantsSuggestions) box.classList.add('active');
        });
    }

    function cancelPending() {
        revision += 1;
        clearTimeout(debounceTimer);
        debounceTimer = null;
        if (request) request.cancel();
    }

    function closeSuggestions() {
        wantsSuggestions = false;
        cancelPending();
        if (openFrame !== null) cancelAnimationFrame(openFrame);
        openFrame = null;
        box.classList.remove('active');
        input.setAttribute('aria-expanded', 'false');
        container.setAttribute('aria-hidden', 'true');
        list.setAttribute('aria-busy', 'false');
        hasOpened = false;
        selectedIndex = -1;
        updateSelection();
    }

    function clearSuggestions() {
        suggestions = [];
        renderedQuery = '';
        queryActionOnly = false;
        suggestionsReady = false;
        selectedIndex = -1;
        list.innerHTML = '';
        input.removeAttribute('aria-activedescendant');
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, function (character) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
        });
    }

    function highlightMatch(suggestion, query) {
        const index = suggestion.toLowerCase().indexOf(query.toLowerCase());
        if (index < 0) return '<span class="rest">' + escapeHtml(suggestion) + '</span>';
        return '<span class="rest">' + escapeHtml(suggestion.slice(0, index)) + '</span>' +
            '<span class="match">' + escapeHtml(suggestion.slice(index, index + query.length)) + '</span>' +
            '<span class="rest">' + escapeHtml(suggestion.slice(index + query.length)) + '</span>';
    }

    function renderSuggestions(values, query, isQueryAction) {
        const animate = !hasOpened;
        const existing = Array.from(list.querySelectorAll('.suggestion-item:not(.skeleton)'));
        if (!existing.length) list.innerHTML = '';
        suggestions = values;
        renderedQuery = query;
        queryActionOnly = Boolean(isQueryAction);
        suggestionsReady = true;
        selectedIndex = -1;
        input.removeAttribute('aria-activedescendant');
        list.setAttribute('aria-busy', 'false');
        const count = Math.max(existing.length, values.length);
        for (let index = 0; index < count; index += 1) {
            if (index >= values.length) {
                existing[index].remove();
                continue;
            }
            const suggestion = values[index];
            const item = existing[index] || document.createElement('div');
            item.id = 'search-suggestion-' + index;
            item.className = 'suggestion-item' + (animate ? ' is-entering' : '');
            item.style.animationDelay = animate ? (0.04 + index * 0.03) + 's' : '';
            item.setAttribute('role', 'option');
            item.setAttribute('aria-selected', 'false');
            item.dataset.suggestion = suggestion;
            item.dataset.queryAction = String(queryActionOnly);
            const isAddress = queryActionOnly && navigationUrl(suggestion);
            if (queryActionOnly) item.setAttribute('aria-label', (isAddress ? '前往 ' : '搜尋 ') + suggestion);
            else item.removeAttribute('aria-label');
            item.innerHTML = '<div class="suggestion-icon"><i class="fas fa-search" aria-hidden="true"></i></div>' +
                '<span class="suggestion-text">' + highlightMatch(suggestion, query) + '</span>';
            item.onmouseenter = function () {
                if (!wantsSuggestions || query !== input.value.trim()) return;
                selectedIndex = index;
                updateSelection();
            };
            item.onclick = function () {
                if (composing || query !== input.value.trim()) return;
                input.value = suggestion;
                updateClearButton();
                performSearch(suggestion, !isQueryAction);
            };
            if (!existing[index]) list.appendChild(item);
        }
        hasOpened = true;
        openSuggestions();
    }

    function fetchSuggestions(query, expectedRevision) {
        if (!wantsSuggestions || expectedRevision !== revision || input.value.trim() !== query) return;
        const script = document.createElement('script');
        const callbackName = '__newtabSuggestions_' + Date.now() + '_' + (++callbackSequence);
        let settled = false;
        let timeout;
        const pending = { cancel: function () { finish(null, true); } };
        request = pending;

        function finish(data, cancelled) {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            script.onerror = null;
            script.onload = null;
            script.remove();
            // A removed JSONP script may already be queued to execute. Keep a short
            // no-op callback for that response; each request owns its own cleanup.
            global[callbackName] = function () {};
            setTimeout(function () { delete global[callbackName]; }, 30000);
            if (request === pending) request = null;
            if (cancelled || expectedRevision !== revision || !wantsSuggestions || input.value.trim() !== query) return;

            const raw = data && Array.isArray(data[1]) ? data[1] : [];
            const values = Array.from(new Set(raw.filter(function (value) {
                return typeof value === 'string' && value.trim().length > 0 && value.length <= 500;
            }))).slice(0, 8);
            // The query remains actionable if the service is blocked, slow or empty.
            renderSuggestions(values.length ? values : [query], query, !values.length);
        }

        global[callbackName] = function (data) { finish(data, false); };
        script.async = true;
        script.src = 'https://suggestqueries.google.com/complete/search?client=firefox&q=' +
            encodeURIComponent(query) + '&callback=' + callbackName;
        script.onerror = function () { finish(null, false); };
        script.onload = function () { finish(null, false); };
        timeout = setTimeout(function () { finish(null, false); }, 5000);
        document.head.appendChild(script);
    }

    function scheduleSuggestions(immediate) {
        cancelPending();
        updateClearButton();
        selectedIndex = -1;
        updateSelection();
        const query = input.value.trim();
        if (!query || composing) {
            clearSuggestions();
            closeSuggestions();
            return;
        }
        wantsSuggestions = true;
        if (renderedQuery === query && suggestions.length && suggestionsReady) {
            openSuggestions();
            return;
        }
        // Keep the current input actionable immediately, including offline. Old
        // results must never remain clickable while a different query is loading.
        renderSuggestions([query], query, true);
        suggestionsReady = false;
        list.setAttribute('aria-busy', 'true');
        openSuggestions();
        const expectedRevision = revision;
        debounceTimer = setTimeout(function () {
            debounceTimer = null;
            fetchSuggestions(query, expectedRevision);
        }, immediate ? 0 : 260);
    }

    function navigationUrl(query) {
        // Text with punctuation, incomplete hosts and unsafe schemes stays a search.
        if (/[\s\\\u0000-\u001f\u007f]/.test(query)) return null;
        const explicit = /^https?:\/\//i.test(query);
        let url;
        try { url = new URL(explicit ? query : 'https://' + query); } catch (_) { return null; }
        if (!/^https?:$/.test(url.protocol) || !url.hostname || url.username || url.password) return null;
        if (explicit) return url.href;
        const host = url.hostname;
        const originalHost = query.split(/[/?#]/)[0].replace(/:\d+$/, '');
        if (host === 'localhost' || /^\[[0-9a-f:]+\]$/i.test(host)) return url.href;
        if (/^\d{1,3}(\.\d{1,3}){3}$/.test(originalHost)) return url.href;
        const labels = host.split('.');
        if (labels.length < 2 || !labels.every(function (label) {
            return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label);
        })) return null;
        if (!/^(?:[a-z]{2,63}|xn--[a-z0-9-]+)$/i.test(labels[labels.length - 1])) return null;
        return url.href;
    }

    function performSearch(query, forceSearch) {
        query = query.trim();
        if (!query) return;
        closeSuggestions();
        const destination = !forceSearch && navigationUrl(query);
        global.location.href = destination || 'https://www.google.com/search?q=' + encodeURIComponent(query);
    }

    function submitSearch() {
        if (composing) return;
        const selected = wantsSuggestions && renderedQuery === input.value.trim() && selectedIndex >= 0;
        performSearch(selected ? suggestions[selectedIndex] : input.value, selected && !queryActionOnly);
    }

    if (submitButton) {
        // A mouse press otherwise blurs the input before the click can submit
        // the selected suggestion. Touch continues to use the native click.
        submitButton.addEventListener('mousedown', function (event) { event.preventDefault(); });
        submitButton.addEventListener('click', submitSearch);
    }

    clearButton.addEventListener('click', function (event) {
        event.stopPropagation();
        input.value = '';
        clearSuggestions();
        closeSuggestions();
        updateClearButton();
        input.focus();
    });
    input.addEventListener('focus', function () { scheduleSuggestions(true); });
    input.addEventListener('click', function () {
        if (!wantsSuggestions && input.value.trim()) scheduleSuggestions(true);
    });
    input.addEventListener('input', function (event) {
        if (event.isComposing) composing = true;
        scheduleSuggestions(false);
    });
    input.addEventListener('compositionstart', function () {
        composing = true;
        updateClearButton();
        closeSuggestions();
    });
    input.addEventListener('compositionend', function () {
        composing = false;
        scheduleSuggestions(false);
    });
    input.addEventListener('blur', function () { closeSuggestions(); });
    document.addEventListener('click', function (event) {
        if (!box.contains(event.target)) closeSuggestions();
    });
    container.addEventListener('mousedown', function (event) { event.preventDefault(); });
    input.addEventListener('keydown', function (event) {
        if (composing || event.isComposing || event.keyCode === 229) return;
        const current = renderedQuery === input.value.trim();
        if (event.key === 'Escape') {
            if (wantsSuggestions) event.preventDefault();
            closeSuggestions();
            return;
        }
        if (event.key === 'Tab') {
            closeSuggestions();
            return;
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            if (!input.value.trim()) return;
            event.preventDefault();
            if (!wantsSuggestions) scheduleSuggestions(true);
            if (current && suggestions.length) {
                selectedIndex = event.key === 'ArrowDown'
                    ? (selectedIndex + 1) % suggestions.length
                    : (selectedIndex <= 0 ? suggestions.length - 1 : selectedIndex - 1);
                updateSelection();
            }
            return;
        }
        if (event.key === 'Enter') {
            if (input.value.trim()) {
                event.preventDefault();
                submitSearch();
            }
        }
    });

    updateClearButton();
    global.NewtabSearch = {
        focus: function () { input.focus(); },
        submit: submitSearch,
        dismiss: closeSuggestions
    };
})(window);
