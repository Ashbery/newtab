# Nachoneko assets (for GitHub / GitHub Pages)

PNG icons and wallpaper extracted from the free official pack:

**[Nachoneko Icon and Wallpaper Pack](https://www.elgato.com/us/en/s/stream-deck-nachoneko-icon-and-wallpaper-pack)** by Elgato × Nachoneko.

## Files

| Path | Description |
|------|-------------|
| `icons/*.png` | Stream Deck key icons (144×144, RGBA PNG) |
| `wallpaper.png` | Pack wallpaper (used in UI panels) |
| `LICENSE.txt` | MIT license (required attribution) |
| `manifest.json` | Original pack metadata |

## License

MIT — see `LICENSE.txt`.

When redistributing this folder (including on GitHub), keep `LICENSE.txt` and copyright notice.

## Usage in this project

Referenced from `index.html` with relative URLs, for example:

```html
<img src="assets/nachoneko/icons/on_icon_01.png" alt="">
```

```css
background-image: url("assets/nachoneko/wallpaper.png");
```

These paths work on:

- Local `index.html` / static server
- GitHub repository file browser
- GitHub Pages (`https://<user>.github.io/<repo>/`)
