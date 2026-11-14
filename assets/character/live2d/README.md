# Nacho — gentle head and ear Live2D model

Revision **r7**, authored for this personal Newtab on 2026-11-14. The 32 separated source layers compile to 32 Cubism drawables, 25 parameters and 6 independent hair-physics groups. This is the existing approved blue-cardigan character holding the black three-eyed plush. Original face, hair, garment, hand and plush pixels are retained; local underpainting fills the explicitly occluded eye/hair regions. The generated small open-mouth plate is used only inside its measured mouth contour. The two ear layers retain original registered pixels and a pinned root strip.

The six generic head and body angles deliberately stay at zero. Four measured, custom controls add a gentle head lean, a small vertical nod and independent rooted ear bends. Native rigid rotation keeps the approved face, eyes and mouth together. A shared upper-body follow field keeps neck, hair, collar and shoulder boundaries connected, fading from full motion above source Y620 to zero at Y850; hands and the lower body remain visually steady. Concealed same-source overlaps prevent hard-cut texture seams. Independent eyelid closure, a subtle text-reply mouth expression, chest breathing and 6 hair-tip springs remain. Iris geometry stays round behind the moving aperture. No camera, microphone, head tracking, speech synthesis or audio lip synchronization is implied. The webpage does not play the exporter's generic nod/shake/idle motion files.

The authored custom range is −1…1: tilt up to ±1.25° about the measured source pivot (600,640), nod up to ±2.5 source pixels, and ear-tip bend up to ±2.5° with a 35-pixel pinned root strip. Normal playback uses smaller amplitudes: tilt at most .58 (+.07 while thinking), nod .45 plus a .035 chat-state bias, and a .60–.68 leading ear with a smaller delayed response. Head cycles are slow and blended; ear events rest for 7–12 seconds after completion. Returning from static mode fades the head/ear pose in over .8 seconds. These are authored motions, not face tracking or a full perspective head-turn rig.

## Runtime files

- `nacho.model3.json`: self-contained local references and `Ashbery.PreserveCanvas` to retain original portrait placement.
- `nacho.moc3`: actual compiled model; source canvas 1086×1448, pixels-per-unit 1086.
- `nacho-atlas.webp`: lossless 4096×4096 atlas, 1,382,088 bytes. The 7,144,750-byte editable PNG remains in the separate source package. Alpha and every visible RGB pixel were checked identical during conversion; only invisible RGB at alpha 0 may differ.
- `nacho.physics3.json`: fixed 60 Hz physics with official runtime interpolation. All 6 hair groups use `ParamNachoWind`. Position normalization is ±1 for these angle-only inputs, preventing the SDK's positional zero-motion threshold from suppressing quiet short-strand movement. The generic eye-jelly rule is disabled. These runtime solver settings are finalized by the source export adapter; an authoring editor can use its own preview rate.
- `nacho.cdi3.json`: display names; `artifact-hashes.json` records exact bytes and SHA-256 values.

The SDK is in `../../vendor/cubism/` with its separate official notices. The small page controller loads the model after the original portrait is available. Existing static/image animation remains the fallback if this model or WebGL2 cannot load. Large model resources are not a prerequisite for search or chat controls.

## Authoring and verification

Created using [live2d-agent-kit](https://github.com/Ariakage/live2d-agent-kit), its pinned PSD2Live engine commit `5526f2e16b57e5f83d34f33730d6fa26d8bc8695`, measured masks and model-specific Kotlin eye, breath, head and ear controls. The separate editable package retains registered artwork, CJS/JSON recipes (including `head-regions.json`), source PSD, CMO3, original PNG atlas, custom integration source, pinned patch/licenses and hashes. Software-tool licenses do not grant rights to the character artwork.

Validation scope and results are recorded in the current entry of [VALIDATION.md](../../../VALIDATION.md). Numerical Core checks, rendered pose inspection, continuous playback, website interaction and editable-project reopening are separate checks. Official Cubism Editor GUI and VTube Studio/camera tracking were not part of this web-model acceptance.

Remaining exporter diagnostics are documented rather than hidden: the face's very-low-alpha edge extends beyond its high-alpha content bounds; closed-lash geometry follows the open curve while its neutral opacity is zero; stable IDs disambiguate sided layer names. Ear bounds compare a classifier threshold of alpha≥8/255 with the mesh's full nonzero-alpha bounds. The 60 right-ear and 124 left-ear pixels outside that threshold box have at most 5/255 and 4/255 alpha respectively, all retained from the original artwork; neutral and moving ears were inspected. CMO source layers are rebuilt from the atlas, with the original registered PSD supplied separately. There is no claim that the original PSD edit-link chain survived export.

Character reference: Nachoneko / Amashiro Natsuki. Artwork provenance is in [the parent README](../README.md). This generated personal theme is not an official collaboration or a commercial model license.
