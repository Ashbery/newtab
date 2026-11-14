# Nacho — fixed-head Live2D model

Revision **r5**, authored for this personal Newtab on 2026-11-14. The 30 separated source layers compile to 30 Cubism drawables, 21 parameters and 6 independent hair-physics groups. This is the existing approved blue-cardigan character holding the black three-eyed plush. Original face, hair, garment, hand and plush pixels are retained; local underpainting fills the explicitly occluded eye/hair regions. The generated small open-mouth plate is used only inside its measured mouth contour.

The head and body angles deliberately stay at zero. Supported visible motion is independent eyelid closure, a subtle text-reply mouth expression, a chest-only breathing field and 6 hair-tip springs. Iris geometry stays round behind the moving aperture; the lower lid follows that aperture. No camera, microphone, head tracking, speech synthesis or audio lip synchronization is implied. The webpage does not play the exporter's generic nod/shake/idle motion files.

## Runtime files

- `nacho.model3.json`: self-contained local references and `Ashbery.PreserveCanvas` to retain original portrait placement.
- `nacho.moc3`: actual compiled model; source canvas 1086×1448, pixels-per-unit 1086.
- `nacho-atlas.webp`: lossless 4096×4096 atlas, 1,338,712 bytes. The 6,872,913-byte editable PNG remains in the separate source package. Alpha and every visible RGB pixel were checked identical during conversion; only invisible RGB at alpha 0 may differ.
- `nacho.physics3.json`: fixed 60 Hz physics with official runtime interpolation. All 6 hair groups use `ParamNachoWind`. Position normalization is ±1 for these angle-only inputs, preventing the SDK's positional zero-motion threshold from suppressing quiet short-strand movement. The generic eye-jelly rule is disabled. These runtime solver settings are finalized by the source export adapter; an authoring editor can use its own preview rate.
- `nacho.cdi3.json`: display names; `artifact-hashes.json` records exact bytes and SHA-256 values.

The SDK is in `../../vendor/cubism/` with its separate official notices. The small page controller loads the model after the original portrait is available. Existing static/image animation remains the fallback if this model or WebGL2 cannot load. Large model resources are not a prerequisite for search or chat controls.

## Authoring and verification

Created using [live2d-agent-kit](https://github.com/Ariakage/live2d-agent-kit), its pinned PSD2Live engine commit `5526f2e16b57e5f83d34f33730d6fa26d8bc8695`, measured masks and model-specific Kotlin eye/breath controls. The separate editable package retains registered artwork, CJS/JSON recipes, source PSD, CMO3, original PNG atlas, custom integration source, pinned patch/licenses and hashes. Software-tool licenses do not grant rights to the character artwork.

Validation scope and results are recorded in the current entry of [VALIDATION.md](../../../VALIDATION.md). Numerical Core checks, rendered pose inspection, continuous playback, website interaction and editable-project reopening are separate checks. Official Cubism Editor GUI and VTube Studio/camera tracking were not part of this web-model acceptance.

Remaining exporter diagnostics are documented rather than hidden: the face's very-low-alpha edge extends beyond its high-alpha content bounds; closed-lash geometry follows the open curve while its neutral opacity is zero; stable IDs disambiguate sided layer names; CMO source layers are rebuilt from the atlas, with the original registered PSD supplied separately. There is no claim that the original PSD edit-link chain survived export.

Character reference: Nachoneko / Amashiro Natsuki. Artwork provenance is in [the parent README](../README.md). This generated personal theme is not an official collaboration or a commercial model license.
