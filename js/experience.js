/* Secondary actions live in the right drawer; the home keeps its useful content. */
(function () {
    'use strict';
    document.addEventListener('DOMContentLoaded', function () {
        var announcement = document.getElementById('home-announcement');
        var searchBox = document.getElementById('search-box');
        var input = document.getElementById('search-input');
        function syncSearchGeometry() {
            if (!searchBox || searchBox.closest('.search-expand-panel')) return;
            var row = searchBox.querySelector('.search-input-wrapper').getBoundingClientRect();
            var below = window.innerHeight - row.bottom - 80;
            var above = row.top - 60;
            var upwards = below < 160 && above > below;
            searchBox.dataset.suggestionsSide = upwards ? 'above' : 'below';
            searchBox.style.setProperty('--suggestions-room', Math.max(90, Math.min(320, upwards ? above : below)) + 'px');
        }
        function syncFocus() {
            var enabled = document.body.classList.contains('is-focus-mode');
            var button = document.getElementById('focus-home');
            if (button) {
                button.setAttribute('aria-pressed', String(enabled));
                button.querySelector('span').textContent = enabled ? '結束專注' : '專注片刻';
            }
            document.querySelectorAll('.widget[data-type="app"], .widget[data-type="folder"], .widget[data-type="companion"]').forEach(function (element) { element.inert = enabled; });
        }
        function focusMode(enabled) {
            document.body.classList.toggle('is-focus-mode', enabled);
            syncFocus();
            announcement.textContent = enabled ? '已進入專注模式。按 Escape 返回，或從工具選單結束專注。' : '已返回完整主畫面。';
        }
        window.NewtabExperience = {
            toggleFocus: function () { focusMode(!document.body.classList.contains('is-focus-mode')); },
            setFocusMode: focusMode
        };
        input.addEventListener('focus', syncSearchGeometry);
        input.addEventListener('input', syncSearchGeometry);
        function searchPlaceholder() { input.placeholder = innerWidth <= 600 ? '搜尋或輸入網址' : '搜尋 Google，或前往一個網址'; }
        searchPlaceholder();
        window.addEventListener('resize', function () { searchPlaceholder(); syncSearchGeometry(); });
        document.addEventListener('newtab:layout-change', function () {
            requestAnimationFrame(function () { syncSearchGeometry(); syncFocus(); });
        });
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && document.body.classList.contains('is-focus-mode') && !event.defaultPrevented) {
                focusMode(false);
                var menu = document.getElementById('side-rail-tab');
                if (menu) menu.focus();
            }
        });
        new MutationObserver(function () {
            if (document.body.classList.contains('is-arranging') && document.body.classList.contains('is-focus-mode')) focusMode(false);
        }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
        requestAnimationFrame(syncSearchGeometry);
    });
})();
