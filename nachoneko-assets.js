/**
 * Nachoneko × Elgato icons + wallpaper served as individually cached assets.
 * MIT License — see 設定 → 關於此分頁.
 * Keep assets/nachoneko/ with this file; original license and API are preserved.
 * Source: https://www.elgato.com/us/en/s/stream-deck-nachoneko-icon-and-wallpaper-pack
 */
(function (global) {
  var icons = {"off_icon_01": "assets/nachoneko/icons/off_icon_01.png", "off_icon_02": "assets/nachoneko/icons/off_icon_02.png", "on_icon_01": "assets/nachoneko/icons/on_icon_01.png", "on_icon_02": "assets/nachoneko/icons/on_icon_02.png", "on_icon_03": "assets/nachoneko/icons/on_icon_03.png", "on_icon_04": "assets/nachoneko/icons/on_icon_04.png", "on_icon_05": "assets/nachoneko/icons/on_icon_05.png", "on_icon_06": "assets/nachoneko/icons/on_icon_06.png", "on_icon_07": "assets/nachoneko/icons/on_icon_07.png", "on_icon_08": "assets/nachoneko/icons/on_icon_08.png", "on_icon_09": "assets/nachoneko/icons/on_icon_09.png", "on_icon_10": "assets/nachoneko/icons/on_icon_10.png", "on_icon_11": "assets/nachoneko/icons/on_icon_11.png", "on_icon_12": "assets/nachoneko/icons/on_icon_12.png", "on_icon_13": "assets/nachoneko/icons/on_icon_13.png", "on_icon_14": "assets/nachoneko/icons/on_icon_14.png", "on_icon_15": "assets/nachoneko/icons/on_icon_15.png", "pack-icon": "assets/nachoneko/icons/pack-icon.png"};
  var wallpaper = new URL('assets/nachoneko/wallpaper.png', document.baseURI).href;

  function applyIcons(root) {
    var scope = root || document;
    if (!scope.querySelectorAll) return;
    scope.querySelectorAll('[data-nacho-icon]').forEach(function (el) {
      var key = el.getAttribute('data-nacho-icon');
      if (key && icons[key]) {
        if (el.tagName === 'IMG') el.src = icons[key];
        else el.style.backgroundImage = 'url("' + icons[key] + '")';
      }
    });
  }

  function applyWallpaper() {
    if (wallpaper && document.documentElement) {
      document.documentElement.style.setProperty('--nacho-wallpaper', 'url("' + wallpaper + '")');
    }
  }

  function applyAll() {
    applyWallpaper();
    applyIcons(document);
  }

  global.NACHONEKO_ASSETS = {
    icons: icons,
    wallpaper: wallpaper,
    applyIcons: applyIcons,
    applyAll: applyAll
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyAll);
  } else {
    applyAll();
  }
})(typeof window !== 'undefined' ? window : this);
