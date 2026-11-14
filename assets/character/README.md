# Character artwork

nacho-companion.webp is a transparent 1086×1448 portrait, 239,484 bytes. nacho-companion.png is the generation master. Generated with the built-in image-generation tool on 2026-11-14 from the user's supplied Nachoneko reference sheets (X.jpg and the Amashiro Natsuki / Zerochan character illustration).

Direction: silver-grey long hair, aqua eyes, cat ears and charcoal three-eyed cat hair clip; powder-blue cardigan, white blouse and ribbon, holding a three-eyed black cat plush. The WebP keeps alpha and is served locally.

The generated portrait is separate from the existing Elgato / Nachoneko MIT icon pack. Character reference: Nachoneko, illustrated by Amashiro Natsuki. This personal theme is not presented as an official collaboration.

paw.svg is an authored interface motif.

## Animated companion

The primary companion now uses an authored, layered **Cubism MOC3** in `live2d/`, with the matching official Web SDK in `../vendor/cubism/`. It preserves the original artwork canvas and fixed head. Separate eye apertures, lashes, local mouth features, garments, hands, plush and hair meshes support continuous blinks, a small text-reply mouth expression, subtle chest breathing and delayed hair-tip motion. Head/body angle parameters stay zero.

The original portrait appears immediately while the optional model loads. The new runtime follows display refresh and respects the existing animation preference, reduced motion, hidden/offscreen state and widget editing pauses. Clicking the character still opens the existing in-page conversation. No camera or microphone is used. Model/runtime details, version hashes and verification scope are documented in `live2d/README.md`, `../vendor/cubism/README.md` and the current release entry in `../../VALIDATION.md`.

### Image fallback (retained for unsupported graphics or failed model loading)

`nacho-blink.png` is a registered 1086×1448 closed-eye alternate frame generated from `nacho-companion.webp` on 2026-11-14. The prompt requested only relaxed, closed eyelids while preserving placement, face, hair, clothes, plush, and transparency. `nacho-blink.webp` is the alpha-preserving local WebP version (236,092 bytes).

The fallback flattened portrait deliberately keeps its head fixed. `js/companion.js` selects `fixedHead:true` in the dynamics controller and has no head, torso-roll, hair or ear deformation in either renderer. Both meshes contain an exact row at normalized artworkY0.46; breathing weights are zero above it, preventing triangle interpolation from moving the face or ears. Only the eye apertures change in the head region. A small chest-only breath remains below the neck. The dynamics controller retains its time-based120Hz simulation/interpolation; its optional articulated values are not applied to this portrait. Blinks use irregular intervals with65ms closure,25ms hold and150ms reopening.

`js/companion-eyes.js` provides continuous eyelid closure using the existing open/closed illustrations; it does not merely dissolve two eye frames. The face outside the eye regions retains its original artwork. Mipmapped GPU textures keep small-scale hair edges stable. This remains a procedural portrait rig, **not an imported Live2D/Cubism model**. This fallback does not use the separated artwork or MOC3; it remains available if the primary model cannot load.

WebGL paints on each display refresh. The Canvas2D fallback uses whole refresh periods, targeting at least60FPS when the display and device permit:60 at120Hz,72 at144Hz and about66.7 at200Hz. This removes the former90FPS cadence mismatch on fast displays. Software backing resolution is bounded to1024px on its longest edge; GPU backing is bounded to2048px. Performance evidence measures actual changed artwork and paint intervals separately from CPU draw submission time. These are device-dependent rates, not a universal FPS guarantee.

Hidden/offscreen pages, arranging and focus mode pause the animation without resetting the live pose. Explicit off/system reduced-motion preferences show the neutral portrait; explicit on can override the system preference. The fallback continues animating without WebGL, and missing optional motion modules leave the portrait and chat button usable. Removing a widget releases animation, observers and graphics resources. Clicking the character opens the existing in-page chat; it does not grant microphone or camera access.

Motion principles were checked against Live2D's official [fixed-frequency physics and interpolation guidance](https://docs.live2d.com/en/cubism-sdk-manual/compatibility-with-cubism-4-2/), [automatic blink timing](https://docs.live2d.com/en/cubism-sdk-manual/autoeyeblink/), [breath parameters](https://docs.live2d.com/en/cubism-sdk-manual/breath/) and [parameter update ordering](https://docs.live2d.com/en/cubism-sdk-manual/model-param-updater/). The amplitudes,120Hz simulation and timing values above are choices for this portrait. The fallback is independent of the optional Cubism runtime described above.

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
