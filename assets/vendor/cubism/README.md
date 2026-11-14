# Local Cubism renderer

`live2dcubismcore.min.js` is the **unmodified** Core distributed in the official Cubism SDK for Web **5-r.5**. SHA-256:

`8741f739779b5d5210872bd3d7d99f0f1e56e6c87409e7d26d6bb4b80aa1ef47`

`companion-runtime.js` bundles that same SDK archive's Framework and WebGL shaders, together with the application adapter in `js/companion-live2d-runtime.ts`. It does not use Pixi or an unofficial Core download. No sample model or sample artwork is bundled here.

Official sources: [SDK download](https://www.live2d.com/en/sdk/download/web/), [Framework repository](https://github.com/Live2D/CubismWebFramework), [SDK manual](https://docs.live2d.com/en/cubism-sdk-manual/top/).

## Preserved licenses

Core is proprietary Live2D software; the Framework uses the Live2D Open Software License. Keep `CORE-LICENSE.md`, `FRAMEWORK-LICENSE.md`, `SDK-LICENSE.md`, `SDK-NOTICE.md` and `RedistributableFiles.txt` with these runtime files. Core's redistributable list expressly includes `live2dcubismcore.min.js`. The applicable SDK release-license conditions remain those linked in the preserved licenses; bundling this runtime does not grant rights to a character model or artwork. Copyright(c) Live2D Inc. All rights reserved.

## Rebuild

Use the complete official **5-r.5** archive so Core, Framework and shaders match. From the repository root:

```powershell
npm install --prefix .impeccable/tools/live2d --no-save --ignore-scripts esbuild@0.27.0
node tools/build-companion-live2d.cjs 'C:\path\to\CubismSdkForWeb-5-r.5'
```

Alternatively set `LIVE2D_SDK_PATH` and `ESBUILD_MODULE`. The builder validates the Core hash, copies its unmodified redistribution file and notices, and generates the application bundle. The source adapter has two deliberately version-pinned hooks: embedded shader loading and per-WebGL-context shader cleanup. Review both when upgrading the SDK. Framework startup is retained for the page lifetime to avoid repeatedly registering a Core WASM log callback; unused models, renderers, textures and per-context shaders are still released.

## Model and application integration

`index.html` loads the small `js/companion-live2d.js` controller before `js/companion.js`. The companion continues to create its portrait, accessible chat button and widget DOM immediately. It requests `assets/character/live2d/nacho.model3.json`; Core and the runtime are fetched only after that manifest exists. The sanitized `newtab-release` meta value versions the manifest and vendor URLs; MOC, physics, pose and textures inherit the manifest's same `?v=` value to prevent mixing cached releases. These large resources remain outside the blocking app shell. All model references must remain within the same local model directory. A missing/invalid model, WebGL2 failure or context loss returns to the existing portrait animation. The original chat and customization flows remain available.

The model needs a `.moc3` and texture atlas; optional `.physics3.json` and `.pose3.json` references are supported. Nacho's manifest includes `"Ashbery":{"PreserveCanvas":true}`: the renderer fits the original MOC canvas using its size, origin and pixels-per-unit, matching the portrait's `object-fit:contain` without moving or shrinking the character at load. Other models use visible-geometry bounds with a small margin. Standard eye-open, mouth-open and breath parameters are driven only if authored. `ParamNachoWind` supplies a gentle periodic physics input; authored hair outputs come from the model's physics file. All six standard head/body angle parameters are kept at zero before and after physics. No pointer-driven head transform or authored idle motion is applied. The small mouth expression during a text reply is **not** speech or audio tracking.

The controller API is `NewtabCompanionLive2D.mount({root, canvas, animationMode, modelUrl?, onReady?, onError?})`. Its return value exposes `ready`, `setMode('auto'|'on'|'off')`, `setPaused(boolean)`, `setActivity({state})`, `resize()`, `state()` and `destroy()`. `companion.js` forwards character chat state and persisted animation preferences. Off/reduced-motion mode paints a neutral pose; hidden pages, offscreen widgets, arranging/dragging and the appearance dialog stop animation frames. Destruction aborts in-flight model loads and removes observers/listeners.

`tests/companion-live2d.cjs` uses the repository's own Nacho model by default. Set `LIVE2D_TEST_MODEL` to another Nacho export directory or an official **external** Haru directory for SDK compatibility testing. Sample fixtures are never copied into production. Runtime acceptance and model visual review are separate checks.
