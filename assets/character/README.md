# Character artwork

nacho-companion.webp is a transparent 1086×1448 portrait, 239,484 bytes. nacho-companion.png is the generation master. Generated with the built-in image-generation tool on 2026-11-14 from the user's supplied Nachoneko reference sheets (X.jpg and the Amashiro Natsuki / Zerochan character illustration).

Direction: silver-grey long hair, aqua eyes, cat ears and charcoal three-eyed cat hair clip; powder-blue cardigan, white blouse and ribbon, holding a three-eyed black cat plush. The WebP keeps alpha and is served locally.

The generated portrait is separate from the existing Elgato / Nachoneko MIT icon pack. Character reference: Nachoneko, illustrated by Amashiro Natsuki. This personal theme is not presented as an official collaboration.

paw.svg is an authored interface motif. Runtime animation uses short pointer/click feedback and stops under reduced-motion preferences.

## Character launcher icons

`launcher-icons.png` is the 1254×1254 transparent generation master (1,240,018 bytes). `launcher-icons.webp` is the locally served, alpha-preserving WebP derivative (251,106 bytes). The atlas contains nine icons in three equal 418×418 cells per row:

| Row | Left | Center | Right |
| --- | --- | --- | --- |
| 1 | Images: cat picture frame | Gmail: envelope and three-eyed cat | Maps: folded map and paw pin |
| 2 | YouTube: ribbon video tile | Play: triangle charm and sleeping cat | News: paper stack and cat clip |
| 3 | Drive: cloud folder and sleeping cat | Calendar: rings, blank grid and paw ribbon | Translate: overlapping cat/dot speech bubbles |

Generated with the built-in image-generation tool on 2026-11-14, using the user's `X.jpg` character reference sheet and the generated companion portrait as visual references. These are original character-themed illustrations of application functions, not official service logos. Their porcelain white, silver grey, powder blue, aqua and charcoal palette, bows, paws and three-eyed cat details deliberately match the portrait.

There were two generation passes. The first established the complete nine-icon family. The second preserved the designs while improving transparent edges and removing surrounding haze. The final PNG is the second pass; WebP encoding preserves its alpha channel. The generation prompt requested polished anime/enamel accessory icons, consistent shading, a transparent 3×3 atlas, clear small-scale silhouettes, and no labels, numbers or human figures.

All artwork fits inside its assigned cell. Generated optical centers vary slightly from the mathematical grid, so presentation cropping centers each complete silhouette rather than assuming every object is exactly at the cell center. The source PNG and WebP remain uncropped. Measured centers in source pixels, using the visible alpha-above-200 bounds, are:

| Icon | Center x | Center y |
| --- | ---: | ---: |
| Images | 226.5 | 216 |
| Gmail | 626.5 | 228 |
| Maps | 1022 | 227 |
| YouTube | 234.5 | 616.5 |
| Play | 617 | 616.5 |
| News | 1022 | 616 |
| Drive | 232 | 1014.5 |
| Calendar | 631.5 | 1028 |
| Translate | 1015.5 | 1028.5 |

The sprite was inspected as actual browser-rendered icons on both light and dark surfaces. An unadjusted 64px cell produces approximately 47–52px of visible artwork. A 360×360 optical view centered at each measured position retains every visible silhouette and antialiased edge: the maximum source alpha outside all nine such views is only 1/255. This view yields approximately 40–46px of artwork when displayed at 48px; a 320px or 340px crop would clip some icons. These generated assets are separate from the existing Elgato / Nachoneko MIT icon pack and do not inherit that pack's license or imply an official collaboration.

`launcher-icons.svg` is an authored presentation wrapper (335,440 bytes), not a separately generated or redrawn vector icon set. It embeds the exact bytes of `launcher-icons.webp` and exposes nine named 360×360 optical views: `#images`, `#gmail`, `#maps`, `#youtube`, `#play`, `#news`, `#drive`, `#calendar` and `#translate`. The same views are used by the home shortcuts, application catalog and folder previews. The original raster artwork and alpha remain unchanged; no remote asset request is needed for the embedded image. Browser inspection verified all nine catalog views and an actual drag-created folder containing two of the icons.
