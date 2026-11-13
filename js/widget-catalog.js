/**
 * NewtabCatalog — component list helpers
 */
(function (global) {
    'use strict';

    var COMPONENTS = [
        { type: 'clock', label: '時鐘', desc: '時間與日期', icon: 'fa-clock' },
        { type: 'search', label: '搜尋', desc: 'Google 搜尋', icon: 'fa-magnifying-glass' },
        { type: 'weather', label: '天氣', desc: '即時溫度與狀況', icon: 'fa-cloud-sun' },
        { type: 'notes', label: '備註', desc: '快捷便利貼', icon: 'fa-sticky-note' },
        { type: 'countdown', label: '倒數日', desc: '重要日子倒數', icon: 'fa-hourglass-half' },
        { type: 'todo', label: '待辦', desc: '簡易清單', icon: 'fa-list-check' },
        { type: 'bookmarks', label: '書籤列', desc: '常用連結橫列', icon: 'fa-bookmark' },
        { type: 'companion', label: '角色夥伴', desc: '可以移動的動態角色', icon: 'fa-cat', category: 'personalize' }
    ];

    function listComponents() {
        return COMPONENTS.slice();
    }

    function isComponentOnCanvas(layout, type) {
        return (layout.widgets || []).some(function (w) { return w.type === type; });
    }

    function isSingletonType(type) {
        if (global.NewtabLayout && NewtabLayout.SINGLETON_TYPES) {
            return !!NewtabLayout.SINGLETON_TYPES[type];
        }
        return type === 'clock' || type === 'search' || type === 'weather' || type === 'bookmarks';
    }

    function isAppOnCanvas(layout, appId) {
        return global.NewtabLayout && NewtabLayout.hasApp(layout, appId);
    }

    global.NewtabCatalog = {
        listComponents: listComponents,
        isComponentOnCanvas: isComponentOnCanvas,
        isSingletonType: isSingletonType,
        isAppOnCanvas: isAppOnCanvas,
        // compat
        listTypes: listComponents,
        canAdd: function (type, layout) {
            if (!isSingletonType(type)) return true;
            return !isComponentOnCanvas(layout, type);
        },
        get: function (type) {
            return COMPONENTS.filter(function (c) { return c.type === type; })[0] || null;
        },
        listInstalled: function (layout) {
            return (layout.widgets || []).map(function (w) {
                return { id: w.id, type: w.type, label: w.type };
            });
        }
    };
})(typeof window !== 'undefined' ? window : this);
