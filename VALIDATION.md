# Release 2026.11.15.1

## Continuous, interruptible interface response

Replaced restarted easing animations with a shared damped-spring driver that retains position and velocity when the action reverses. Drawer pages now travel alongside one another; the active tab has independently settling leading/trailing edges, and toggle thumbs stretch toward their destination. Context-menu selection uses one traveling plate. Appearance fields disclose continuously, dialog reversal preserves the current controls, and the chat settings/composer transitions retain live content with no overlapping text. Input, saving and transport cancellation do not wait for animation completion.

Review against the actual Cult UI and DesignBookmark Motion examples found and fixed additional concrete defects: a repeated active-tab click snapped its pill; reopening custom-app settings during dismissal lost return focus; chat settings briefly overlaid two paragraphs; and a reopened folder replayed its icon entrances. The folder now retains its DOM during the reversal and animates only the surrounding panel. The weather review also identified visible curve buffers being overwritten during a third selection and duplicate cursors; curve layers now retain their geometry during handoff, with a single active-data overlay and removal of obsolete layers.

Validation on isolated Brave profiles, using controlled data rather than personal accounts:

- Shared interaction lifecycle: **9/9** cases passed. Same-task context-menu/appearance reversal checks compare rendered opacity and bounds; weather conditional fields are tested at 1440 and 390 px; folder content remains visible after closing for 30 ms and reversing. Dynamic reduced-motion cleanup, focus ownership, safe input deactivation and saved values are retained.
- Drawer: **5/5** groups passed, including real intermediate positions, rapid reversal, repeated selection, per-page scroll, keyboard/touch, persisted appearance, custom-app/crop focus, reduced motion and 320×480, 390×600, 1440×900 and 3440×1440 viewports.
- Chat: the existing **9** functional groups passed; the final continuous-transition implementation passed **2** normal-motion configurations (1440 and 390 px). Assertions cover same-frame panel/view reversal, no overlapping paragraph opacity across 12 frames, composer height continuity within 1 px, immediate abort, stable streaming nodes and reduced-motion cleanup. The final text handoff was refined after inspecting recorded intermediate frames.
- General UI: all **4** desktop/mobile × normal/reduced-motion configurations passed. Existing appearance controls passed at **3** sizes; search/button/suggestion appearance at **5** sizes, including 3440 and 5120 px. Background alpha, resets, keyboard/IME, offline fallback and saved user settings remain covered.
- Context menus: **8** browser cases passed. City/location: **9** cases passed, including request fencing, failed/late responses and small-window recovery.
- Weather dashboard: **13/13** cases passed after the final curve-layer repair. A third selection at 55 ms preserves existing paths and opacity, the cursor immediately agrees with the active keyboard value, 60 reversals reuse at most three metric keys, and settling/reduced motion leaves one curve layer. Existing forecast values, five card/viewport configurations, resizing and provider request counts remain covered.
- Startup: **9/9** cases passed, including delayed scripts/fonts, bounded recovery and saved geometry at 1920×1080, 3440×1440 and 5120×1440. The shared motion code adds no home-screen entrance or remote dependency.

A **32.16-second normal-speed recording** of the actual UI, separate drawer/chat recordings and intermediate screenshots were inspected for continuity, clipping and focus feedback. Evidence remains local under `.impeccable/review/motion-craft-20261115/`, `rail-spring/` and `chat-motion/`. The demonstration recorder uses 25 fps; this is not a measurement of the page's rendering rate. No private Brave profile, installed extension, ChatGPT helper, user wallpaper or real authentication/model request was modified by these checks. This is a product-quality refinement with reproducible acceptance checks, not an award or universal-device performance certification.

# Release 2026.11.14.19

## Shared Nacho interaction and motion system

Redesigned switches, range controls, active tabs, drawer disclosure, context menus, appearance/city/background dialogs, search suggestions and mobile search, weather selection, folders, focus/editing feedback and the in-page chat composer. Cult UI and DesignBookmark Motion are the verified interaction references; the character artwork, silver-blue palette, local data and custom surface settings remain intact. There is no new React/animation dependency and no startup entrance that delays the home screen.

Real-browser review found and fixed three close/reopen races: closing context menus and background sheets could capture Escape intended for a new dialog; the first mobile search reopened during exit could lose input focus. Narrow-pointer submenu intent, stale close cancellation, focus ownership, dynamic reduced motion and duplicate CSS/WAAPI entrances were also corrected. Appearance dialogs now retain their heading, close control and footer while long settings scroll at 320 px.

Validation used isolated Brave profiles and controlled service fixtures:

- Independent interaction matrix: 320×640, 390×844, 1440×900, 1920×1080, 3440×1440 and 5120×1440, each with normal and reduced motion — 12 configurations passed. Covers interrupted search/dialog/folder/focus transitions, custom alpha, unchanged saved geometry and stable app hit boxes (0 CSS-pixel displacement).
- Full UI regression: desktop/mobile × normal/reduced motion, all 4 configurations passed, including IME, offline search fallback, navigation, settings, focus and companion entry.
- Existing appearance controls: 3 sizes passed; search appearance/button/suggestion controls: 5 sizes passed. Clock/background transparency, numeric bounds, resets, persistence and independent icon colors remain verified.
- Context-menu browser regression: 8 cases passed. Five new `interaction-motion.cjs` regressions passed (four-case lifecycle run plus the independently added background-sheet case).
- Weather dashboard and city/location tests: 21 cases passed with synthetic providers; no real location query was requested.
- Existing chat coverage: 9 groups passed; new normal-motion chat lifecycle tests: 2 sizes passed, including eight rapid view switches, immediate transport abort and dynamic reduced-motion cleanup. No real authentication or model request was sent.
- Side rail: 4 viewport sizes plus media/focus states passed, including rapid switching, keyboard operation, reset/reload and inline icons when external fonts are unavailable. Existing optional-widget scenarios passed on desktop and mobile (todo, notes, countdown, bookmarks and boundaries).
- Startup regression: 9 cases passed, including delayed modules/fonts, bounded retry, poster handling and saved geometry at 16:9, 21:9 and 32:9. The browser address bar is not focused or modified by motion code.

An actual 11.36-second UI recording and screenshots were reviewed for clipping, jumps and unexpected repaint; local evidence is in `.impeccable/review/motion-redesign/`. The recording uses the recorder's 25 fps and is a visual demonstration, not a claim about the page's rendering rate. Machine-specific headless samples and design review do not establish an award certification or performance on every device. No personal Brave profile, installed extension, ChatGPT helper, saved wallpaper or real account was modified by validation.

# Release 2026.11.14.18

## Quiet shortcut hover

Removed the app destination tooltip and its timers, positioning, accessibility-description bindings and CSS. Shortcut names, links, dock hover/press effects and search-button motion remain. Bookmark labels no longer expose the raw URL through a native title tooltip; folder links were already free of destination tooltips.

Focused isolated Brave checks passed at 1440 and 390 px with normal/reduced motion (4/4): no hover/focus URL tooltip, retained names, fixed click targets, dock motion, arrange/resize cleanup, search submission and Gmail mouse/keyboard navigation to intercepted test pages. A separate bookmark check passed for absent title, retained name and mouse/keyboard opening. Existing motion regression assertions were updated to the requested behavior; no unrelated full suite was repeated.

# Release 2026.11.14.17

## Weather actions and forecast recovery

Weather locate/refresh actions now use accessible line icons. Their default surface is transparent, so the widget's own background supplies the tint, blur and opacity without a second painted layer. The weather appearance section supports independent button fill, transparency, icon color and radius, live preview, a button-only reset and the existing full reset. Refresh/error rebuilds retain these settings. Attribution and fetch details are available under the city selector instead of occupying the main weather panel.

Legacy current-only caches now request missing forecast details instead of treating a valid current temperature as a complete forecast. A fresh complete primary forecast wins over an incomplete MET record, including after reload. Failed upgrades retain the available conditions, limit automatic primary retries and preserve MET's original three-hour/Expires deadline. The empty-state copy no longer promises that the next update must succeed.

Validated in isolated Brave profiles with synthetic location/provider fixtures; no personal browser settings or authentication helper were changed:

- Independent button/UI checks passed at 1440, 390 and 320 px: inherited and custom surfaces, alpha-zero, hover/active/focus/disabled, pending/error/ready rebuilds, reload, both resets, icon labels/tooltips and 44 px touch targets.
- Weather dashboard browser checks: 12/12 passed, including forecast metric/day/unit changes, keyboard inspection, resize, pointer interaction, compact/large cards and attribution through city settings.
- Data parsing checks: 20/20; cache-selection/retry checks: 7/7. The weather browser regression suite passed 26/26, followed by two focused passing additions for retaining a complete stale forecast and recording a newly fetched partial MET response's refresh deadline without replacing the complete display cache. The last case was rerun with both Open-Meteo and MET as the saved complete source, including reload and repeated refresh. The three migration cases were rerun after the cross-tab retry fix. These are 28 distinct passing browser cases, not a claim of a final repeated full-suite run.
- Existing search appearance checks passed at 1440, 390, 320, 3440 and 5120 px after the shared settings changes.
- Independent review caught and fixed a short-window city-dialog regression. At 320×480, 640×480 and 390×600, city results remain usable, source links scroll into view, selection closes the dialog and focus returns correctly.
- A single real MET response parsed into 90 forecast instants and seven local days; browser fixtures separately exercise failures and old-cache upgrades. Live API availability is not guaranteed by fixture tests.
- Review also corrected equal-fetch-time cache synchronization between tabs: a newer valid retry deadline is adopted without replacing the weather payload or provider timestamps. A later partial response cannot erase an existing complete forecast; its own MET refresh deadline is still saved. Retained complete MET display data must match the exact request-coordinate key and is marked stale; the dedicated MET cache remains authoritative for request timing.

# Release 2026.11.14.16

## Gentle head and ear motion

The layered Nacho model now has 32 source layers/drawables, 45 deformers, 25 parameters and 6 hair-physics groups. Four custom controls add a restrained head lean, small nod and independently rooted ears. The original face and eye bindings remain together under native head rotation. A shared upper-body field connects neck, hair and collar movement and fades to zero below source Y850. Same-source concealed overlaps remove filtering seams. Generic head/body angles remain zero; the image fallback retains its fixed head.

The first new candidate exposed hair-cut, jaw and shoulder/collar seams during both endpoint checks and ordinary playback. The final r7 model corrects the motion ownership and overlaps; it retains the full authored ±1.25° head lean, ±2.5px nod and ±2.5° ear ranges. Normal playback uses smaller amplitudes, slow blended head cycles and occasional asymmetric ear gestures, with a .8s fade from static mode. No full perspective turn or audio lip synchronization is claimed.

| Check | Final evidence |
| --- | --- |
| Actual model | Unmodified official Web Core loaded the MOC, passed consistency and 325 parameter samples. 32 real drawables; MOC SHA-256 `1dda19739bb0405e8053fbf5705519a437100c0edd8e6af9260ff2cff9b56f5f`. |
| Binding direction and geometry | Twelve head tilt/nod combinations matched the measured source-space rigid transform within .00260 source pixels. Nineteen non-expression endpoint/combination poses introduced no signed triangle flips or compression below 10% of the nondegenerate neutral area. The expression cases are assessed separately because eyelid closure intentionally collapses its aperture. |
| Visual review | Independent and owning reviews inspected 21 dark/light poses including independent/opposed ears, four head corners, blink/mouth/hair combinations and close-up neck/hair-root regions. The previous seams were absent. Neutral appearance is retained, but not pixel-identical: whole-image white-background RGB mean absolute difference versus r5 is .0843/255; same-source overlap edges account for small differences. |
| Continuous playback | A separate 20-second actual WebGL run retained 198 timed samples and 13 selected compositor frames. Neck opaque-gap candidates were zero in every sample; selected full/neck contact sheets showed no recurrence of the identified seams. This is sampled visual inspection, not a claim that every video frame was reviewed at full resolution. |
| Motion scope | At full authored head endpoints, hands did not move; the plush's uppermost tip moved at most .499 source pixels with the shared upper field. All vertices originally below Y850 had at most .0896px interpolation residue, and below Y870 at most .0115px. Upper garment movement is intentional. These are raw mesh measurements, not whole-body translation. |
| Runtime | 13/13 isolated Brave browser scenarios passed against the final repository WebP/MOC, including actual custom-parameter mesh movement, pause/resume/resize, reduced motion/off, multi-widget/remount, failure fallback and in-page chat. Layouts 1920×1080, 3440×1440 and 5120×1440 at DPR2 remained within their widgets. |
| Motion timing | 6/6 production-class unit checks passed: bounded slow movement, asymmetric ear pulse/rest/recoil, equivalent poses at 30/60/120/200Hz, neutral/resume fade, chat-state transitions and older-model compatibility. Actual frame rate still depends on the device. |
| Editable model | Final CMO imported, rendered, saved and reopened in PSD2Live3.6.7 with the same 32 layers/meshes, 45 deformers, 25 parameters and 6 physics groups. All 11 frozen source hashes matched. CMO SHA-256 `62232b10371b120af492a75ee61fe716e1ad6dd6010f96e1ab2fcd3272e10697`. Official Cubism Editor GUI was not tested. |
| Final preview and source package | Recorded the final repository model at 600×800 and at its normal 280×360 widget size, including head cycles, asymmetric ears and chat-state transitions. The 19.5-second 60fps MP4 contains 1,170 frames; it is a recording format, not a universal runtime frame-rate guarantee. The editable/source ZIP's 81 members were reread and SHA-verified after creation. |

The lossless WebP preserves alpha and every visible RGB pixel of the exported PNG. Exact runtime hashes are in `assets/character/live2d/artifact-hashes.json`. Existing settings, extension, authentication helper and personal Brave profile were not changed. Local QA artifacts remain outside the published application. The original r5 source package and rejected r6 candidate remain available separately.

# Release 2026.11.14.15

Validation date: 2026-11-14 (Asia/Taipei). Model revision: **r5**.

Nacho now uses a real, layered Cubism model while retaining the approved portrait and fixed head. The authoring pass produced 30 source layers/meshes, 25 deformers, 21 parameters and 6 hair-physics groups. Local underpainting, measured eye/lash masks, a moving lower aperture/lid, localized mouth features and a chest-only breath field replace the flattened primary animation. The prior portrait rig remains the automatic fallback.

Review caught and corrected upward-shifted closed lashes, duplicated old eye outlines, a floating iris strip at half closure, a missing mouth-base alpha exemption and short hair motion suppressed by the SDK's zero-motion threshold. The finalized model disables generic eye-jelly physics, uses fixed 60 Hz physics with interpolation, and retains all head/body angle parameters at zero. The website does not play generic nod/shake motions.

| Verification | Observed result |
| --- | --- |
| Actual model | Unmodified official Web Core loaded the final MOC, passed its consistency check and 273 parameter samples with finite geometry/opacity. 30 actual drawables; no placeholder MOC. MOC SHA-256: `9428f9b3bcffefbcb8640b67a92a6cb3b572f7adacb6f53670ae43dc59d5db82`. |
| Eyes, mouth and seams | Actual Brave WebGL renders inspected on light/dark backgrounds: independent eyes, both-eye closure including .9 handoff, 15 mouth-form/open combinations, breath and individual hair extrema. Independent facial review passed; continuous opening/closing and secondary motion were checked separately. Original portrait and neutral model high-alpha bounds match exactly. |
| Website integration | Final repository-model suite passed 12/12, including 1920×1080, 3440×1440 and 5120×1440 at DPR2, resize bounds, in-page chat input, animation preferences, reduced motion, arrange/drag/offscreen pauses, destroy/remount, missing assets, WebGL2/context failure and fallback. Personal Brave profile, extension files, login helper, backgrounds and layout data were not modified. |
| Startup | With model loading deliberately held, search and the portrait were usable in 229 ms; after release the model was ready in 767 ms in the local fixture. Lazy manifest, Core, renderer, MOC, physics and atlas shared release `.15`. These local controlled timings are not an internet cold-start guarantee. |
| Actual paints | Final runtime at the test machine's 200 Hz refresh: 601 paints in about 3 seconds, median interval 5.0 ms, p95 5.1 ms, maximum 5.3 ms. CPU submission p95 0.9 ms is recorded separately from paint cadence. All 6 hair outputs varied gently; eye-jelly output remained zero. Results are specific to this RTX5070Ti/Brave environment. |
| Fixed head | All 6 head/body angles stayed zero. A separate browser-compositor comparison across 12 blink/reply/breath frames found zero changed pixels in the lower-face ROI outside the mouth. Ear/hair-root ROI had at most 32 of 57,600 pixels differ by only 1/255, with no visible contour displacement; this is not a claim of universal bit-identical head pixels. |
| Existing fallback/features | Portrait fallback browser + still-head tests passed 13/13; its actual WebGL/Canvas motion suite passed. Search and responsive-resize unit checks passed 27/27. Independent read-only lifecycle/chat/cache review found no blocking regression. |
| Editable delivery | Final CMO imported, rendered, saved to a portable project and reopened in PSD2Live3.6.7 with the same 30 layers/meshes, 25 deformers, 21 parameters and 6 physics groups. CMO SHA-256: `bbe1c1579cddea341b932b5d924ef712ae9feed25e2b158f76048be4af6b1196`. All 9 frozen source hashes matched. The self-contained source ZIP's 73 members and hashes were independently reread after creation. |

The 4096² atlas was losslessly reduced from 6,872,913-byte PNG to 1,338,712-byte WebP. Every visible RGB pixel and all alpha values match; the editable source retains the original PNG. Exact runtime artifact hashes and model/tool attribution are in [assets/character/live2d](assets/character/live2d/README.md); official SDK licenses and rebuild details are in [assets/vendor/cubism](assets/vendor/cubism/README.md). Detailed captures and scripts remain in local ignored review storage.

The retained exporter diagnostics concern low-alpha face bounds, invisible neutral closed-lash bounds, duplicate sided display names resolved by stable IDs, and atlas-reconstructed CMO source layers. The original PSD edit-link chain is not retained; a separate registered layered PSD and reproducible recipe are supplied. Official Cubism Editor GUI, native Java Core and VTube Studio/camera workflows were not tested. Mouth movement responds to text reply activity and is not audio lip synchronization. Missing uncached model files offline fall back to the portrait.

# Release 2026.11.14.14 (historical results)

Validation date: 2026-11-14 (Asia/Taipei).

The owner rejected head movement on the flattened portrait. All head translation/rotation, torso roll, and hair/ear deformation are disabled. Both renderers add a mesh row exactly at normalizedY0.46 and restrict subtle breathing below it; eye-aperture blinking remains. This is a still-headed portrait, not an authored Live2D model. Existing display-synced cadence, pause/preferences and in-page chat remain.

Actual Brave pixel regression passed2/2:99 WebGL and91 Canvas frames each inspect149,247head/face pixels outside the declared eyelid windows, with zero changed pixels during pointer/greeting/chat/breath interactions. Eye and torso motion and keyboard/pointer chat remain functional. A blink reset now redraws original artwork instead of restoring privacy-perturbed canvas readback bytes. Full companion browser integration passed11/11; dynamics units passed8/8.

# Release 2026.11.14.13 (historical results)

Validation date: 2026-11-14 (Asia/Taipei).

- Replaced the portrait's synchronized sine waves and full-eye crossfade with fixed120Hz spring dynamics, interpolated display poses and continuous illustrated eyelid apertures. Head, torso, hair and ears have distinct response times. Greeting/chat transitions ease in; hidden or temporarily paused animation retains its pose.
- WebGL renders on every display refresh. Canvas uses whole refresh periods instead of a fractional60FPS cadence on faster screens. The refresh estimator resets on resume, including moving from200Hz to60Hz. CPU/GPU backing dimensions are bounded independently.
- Fixed Canvas triangle-edge seams exposed by the enlarged character on dark backgrounds. Existing character artwork, saved widget appearance/layout and in-page chat behavior remain intact.

| Verification | Observed result |
| --- | --- |
| Physical dynamics | 7 unit tests passed:30–240Hz consistency, interpolation, gaze/head/hair response ordering, irregular blink timing, greetings/chat transitions, bounded stalls and amplitude limits. |
| Browser integration | Full10-case Brave suite passed, followed by5 focused final cases including a new200→60Hz resume regression. Covers8viewport bounds, preference persistence, chat input, Canvas fallback, context loss, iframe visibility, missing optional modules and even synthetic refresh cadence. |
| Actual paints | Independent probes hash artwork after real GPU/Canvas draws, separately from an uninstrumented timing pass. The old build produced90/60 actual changing frames per second; the new build follows native~200Hz on this RTX5070Ti test environment and uses~67FPS in Canvas. These measurements are environment-specific; CPU submission cost is not GPU completion time. |
| Visual review | Default280×360 and enlarged600×800 on light/dark backgrounds, pointer direction, greetings, thinking/replying and explicitly labelled simulated maximum poses. Head/neck silhouette remained intact; the detected Canvas seams were corrected and rechecked. |
| Eyelids | Open state restores exactly; pixels outside the eye regions remain unchanged. Near-full closure converges continuously. Canvas/WebGL eye-region mean channel difference0.025/255,max2/255 in the isolated parity fixture. |
| Existing site | 9 startup cases,4 general desktop/mobile motion-preference cases and all character-chat fixtures passed. Personal Brave profile, installed extension and authentication helper were not modified. |

This remains a procedural portrait mesh, not an imported Cubism model. It borrows motion principles from official Live2D guidance; separated and underpainted artwork would be required for a full perspective/expression rig. Local measurements, visual contact sheets and the60FPS preview recording are kept in ignored `.impeccable/review/`.

# Release 2026.11.14.9 (historical results)

Validation date: 2026-11-14 (Asia/Taipei).

- Reproduced the cold-start flash in the actual installed Brave wrapper: unpositioned search appeared before saved geometry, with the full character/icons arriving around 1.74 seconds in the recorded baseline. The 1,029,528-byte legacy asset script was the largest measured startup request.
- Replaced embedded legacy artwork with a roughly 2.4KB registry pointing to the existing licensed files. Kept its public API and made the wallpaper URL absolute. Preloaded primary character/launcher artwork, loaded local modules in dependency order with `defer`, and made optional external font styles nonblocking.
- A small pre-paint step restores valid cached background previews and background opacity/blur. Main controls remain hidden until stored layout and appearance are applied; a bounded failure message provides keyboard-operable reload. Background decoding proceeds independently of usable search. Original media, layout, extension settings and authentication storage are unchanged.
- A preview is bounded to 180,000 characters/960px and paired with exact saved background metadata. Decode/selection/reset guards prevent stale previews; no seek, extra playback restart or per-loop capture occurs. Invalid or unavailable media clears the temporary preview.
- Prepared public HTML/code snapshots serve repeat navigation locally. New HTML becomes current only after all required versioned CSS/JS succeed; current and previous snapshots remain available. Optional artwork warming occurs after activation. External APIs, conversations and personal uploaded media are excluded; denied storage falls back to ordinary loading.

| Verification | Observed result |
| --- | --- |
| First paint and recovery | 9/9 actual Brave suites passed: delayed essential JS never reveals raw/unpositioned widgets, unresolved external fonts do not block usable UI, missing/late modules recover through a 12-second bounded message and real reload, exact-identity WebP/JPEG previews obey saved effects, malformed/mismatched/default/oversized preview cases fail safely, and 1920/3440/5120 layouts retain positions. |
| Preview/media | 7/7 preview scenarios passed, including bounded/reused capture, same-name replacements, original-byte preservation, late reset, quota/security errors and corrupt/slow media. Existing playback 2/2 and legacy compatibility 5/5 passed. |
| Cache | Final 10/10 Brave scenarios passed; prior 9 Edge scenarios passed. A cached fixture navigation took about 28ms despite a 1.2-second HTML delay. Optional artwork did not delay critical activation. Atomic rollback/update, old-version URL lookup, offline shell, cache bounds and storage-denied fallback were covered. These fixture timings are not the actual site's complete render time. |
| Existing features | Four desktop/mobile × motion-preference UI scenarios, full character-chat fixtures and 27 search/resize unit checks passed. |
| Actual installed extension | Compatibility suite passed: website search/shortcut/in-page chat, website-to-iframe localStorage/IndexedDB, settings/alarms and cold restart. Actual GitHub iframe permits CacheStorage and service-worker APIs in the disposable Brave profile. Installed extension files and personal profile were not modified. |

After-publication native-wrapper filmstrip and cache-control measurements are recorded separately in ignored `.impeccable/review/`. First network load, media decode and browser-owned new-tab painting cannot be guaranteed instantaneous on every device; the fix removes the observed raw-layout flash and avoids repeating completed downloads where caching is permitted.

# Release 2026.11.14.8 (historical results)

Validation date: 2026-11-14 (Asia/Taipei).

- Search suggestions now share the search widget's fill, transparency, blur, border, radius and shadow. Matched/unmatched text, icons and pointer/keyboard selection follow the selected light/dark text scheme.
- The original search container carries its complete appearance when moved into the compact search dialog. That dialog paints one connected surface; its outer shell, input and suggestion children remain transparent, preventing an opaque parent or stacked alpha from hiding the selected settings. Focus feedback uses an outline independently of the user's shadow.
- Existing button-only reset keeps the surface settings; whole-widget reset restores the search and suggestions together. Changed CSS/script URLs are versioned. Search navigation and suggestion-fetching logic are unchanged.

| Verification | Observed result |
| --- | --- |
| Search behavior | 14/14 unit checks passed, including original-query versus selected-suggestion submission, IME, late responses, URL handling and dismissal. |
| Rendered search appearance | Five viewport scenarios passed at 1440×900,390×844,320×640,3440×1440 and5120×1440. Real settings and synthetic Google JSONP suggestions exercise shared surface/text styling, selected/hover rows, expanded live updates, reload, independent button settings and both reset scopes. |
| Existing appearance | 1440/390/320px scenarios passed against this release preview: percentage bounds, persistence, scoped reset, transparent clocks/labels and readable text. |
| Independent Brave review | Desktop1440px and mobile390px verified dark/light schemes, alpha0, a single expanded surface and no page errors. Review identified a competing fixed inner-list radius; the final scoped active-list rule makes clipping inherit the configured corners. |
| Visual review | Desktop and320px custom-search screenshots inspected; mobile retains the connected sheet and desktop retains its detached dropdown. |

The initial generic appearance run used its old default preview port and timed out before the app was ready; rerunning with the authoritative4174 preview passed all three widths. Isolated browser profiles/screenshots remain in ignored `.impeccable/review/`; personal Brave settings were not changed.

# Release 2026.11.14.7 (historical results)

Validation date: 2026-11-14 (Asia/Taipei).

- Split location-permission waiting from weather-network timeouts. Explicit relocation requests a fresh device fix. Failed legacy Taipei fallbacks no longer prevent a new lookup; a failure preserves a genuinely selected city but does not silently invent a successful location.
- Added an accessible city picker with Open-Meteo geocoding and an explicitly requested GeoJS city estimate. Estimated results require confirmation, remain labelled, and never retain the returned IP address. Abort/generation guards prevent old requests, removed widgets and closed dialogs from changing current state. Keyboard and focus recovery survive weather repainting.
- Added MET Norway Locationforecast fallback after an unsuccessful Open-Meteo attempt. The widget identifies its active provider and license, shows acquisition time, and leaves unavailable optional metrics empty. Four-decimal coordinates and a bounded per-location cache respect at least three hours and later response expiry; refresh and A → B → A selections cannot bypass a fresh MET entry.
- Preserved the actual installed Brave extension, native blank address bar, private profile, authentication helper, saved layouts and unrelated appearance controls. Website asset versions carry this update without reinstalling the extension.

| Verification | Observed result |
| --- | --- |
| Search and resize | 27/27 tests passed. |
| Existing UI | All four desktop/mobile × normal/reduced-motion scenarios passed. |
| Weather recovery and providers | 23/23 scenarios passed, including legacy fallback recovery, fresh relocation, permission/provider errors, manual selection versus pending GPS, old replies, mobile recovery, Open-Meteo failure to MET fallback, malformed and late provider results, three-hour/Expires boundaries, force/reload/city roundtrips, blocked storage, capacity reservations and sleet conditions. |
| City picker | 8/8 browser suites passed, including explicit network opt-in and confirmation, validation, IP exclusion, IME/keyboard, abort and late replies, close/reopen/removal, error recovery, focus replacement and responsive layouts. |
| Actual Brave wrapper and live services | In an isolated profile, the actual installed extension loaded this source under the GitHub Pages origin. A real Kaohsiung city search succeeded; Open-Meteo forecast timed out, MET returned a valid temperature, and Update reused the fresh MET entry. No weather response was mocked in this check. The original profile and its permissions were not changed. |
| Independent review | Separate reviewer reproduced and verified fixes for concurrent cache capacity, then checked provider parsing, cancellation, expiry and displayed valid forecast time. No remaining actionable findings in that scope. |
| Visual review | The 320px picker, network-estimate confirmation and long permission-error guidance were inspected. The actual 1920×1080 weather result showed its city, temperature, recovery controls and provider attribution without clipping. At 160×160, the cached real result retained a visible temperature, no horizontal overflow, and scroll-accessible provider links. Reopening the same isolated Brave profile made zero weather API requests. |

The owner's native location permission state and physical device location remain unverified. The repair provides recovery paths when that browser/system service is unavailable. External API reachability can change. Isolated browser profiles, screenshots and detailed test evidence remain ignored under `.impeccable/review/`.

# Release 2026.11.14.6 (historical results)

Validation date:2026-11-14 (Asia/Taipei).

- Added search-submit appearance controls: background color, background transparency0–100%, icon color, and corner radius0–22px. The inert preview follows the selected values; button-only reset preserves the search surface, while the existing whole-widget reset restores both.
- Removed fixed hover/disabled colors that would override those settings. Hover uses an inset ring, keyboard focus stays outlined, and pressing retains its scale feedback. Disabled state dims only the icon, preserving the chosen background transparency and44px hit area.
- Appearance tokens travel with the original search container when it moves into the mobile/compact search popup. Ownership matching also updates an already-open popup. No cloned search controls or extra event listeners were introduced.
- The longer search appearance panel keeps Close, Restore and Done visible while its fields scroll. Other widget settings retain their existing layout. Versioned CSS/script URLs prevent cached styles from masking the new options.

| Verification | Observed result |
| --- | --- |
| Search/unit interactions |27/27 search and resize tests passed, including IME, suggestions, safe navigation, Enter and submit/long-press separation. |
| Dedicated search appearance |5/5 rendered scenarios at1440×900,390×844,320×640,3440×1440 and5120×1440 passed. Covers real settings controls, transparency extremes, radius bounds, enabled/disabled/hover/focus/press, preview, reload, mobile popup updates, viewport roundtrip, per-widget isolation, both resets and button/Enter navigation. |
| Existing appearance |1440/390/320px passed: background percentages, persistence, reset scope, clock/labels, readable text and companion settings. |
| Existing UI |All four desktop/mobile × normal/reduced-motion scenarios passed, including real search-button and Enter navigation. |
| Independent Brave audit |1440/390px verified exact custom colors across enabled/disabled/hover, mobile reparenting, live updates while expanded, persistence and button reset; no page errors or duplicate search controls. Dialog checks at320×640,390×844,844×390 and1440×900 kept Close/Done visible and fields scrollable. |
| Visual review |Desktop and320px custom-button previews inspected; the chosen colors, alpha and radius match the actual control, with fixed dialog actions remaining reachable. |

This update changes search appearance settings and state feedback only. Earlier character, authentication and video-loop results below remain historical. Browser profiles/screenshots stay in ignored `.impeccable/review/`.

# Release 2026.11.14.5 (historical results)

Validation date:2026-11-14 (Asia/Taipei).

- Revised the shared Nacho default using verified public character details, the official profile's drawing/gaming/pineapple-pizza interests, and AVIOT's description of a relaxed voice. Original Traditional Chinese conversation guidance and examples give the page a coherent, gentle and playful voice. Source limitations and the distinction between reference facts and interpretation are recorded in [CHARACTER_PERSONA.md](CHARACTER_PERSONA.md).
- Read-time migration upgrades only an exact match of the previous shipped default. Edited prompts, including a single added character, are preserved. No migration storage write occurs, so read-only storage still works. Restore/Save continues to be explicit.
- Bumped the persona and chat script URLs. Updated the idle installed helper's shared default and restarted only its owned process; encrypted account storage was untouched.

| Verification | Observed result |
| --- | --- |
| Browser regression | Full character-chat suite passed, including legacy/default/custom migration, blocked writes, reload, next-message payload, explicit Restore/Save, imports, lifecycle and responsive dialog coverage. |
| Backend/transport |25/25 tests passed, including per-request persona, shared default, limits and existing authentication/streaming protections. |
| Real default response | Isolated Brave loaded the updated source through the actual newtab extension with the existing authorized helper. An unedited default request produced a short Traditional Chinese reply about drawing, gaming and pineapple pizza, with57 streamed deltas and1 completion. The full current prompt was present in the request; no model override or new tab. |
| Review | Independently verified the legacy text against the previous commit byte-for-byte; syntax and whitespace checks passed. Existing custom prompts remain user-owned. |

This is a prompt/content update, not a new animation or layout implementation. Earlier motion, resolution and video-loop results below remain historical. Test evidence stays in ignored `.impeccable/review/`.

# Release 2026.11.14.4 (historical results)

Validation date:2026-11-14 (Asia/Taipei).

- Removed the model selector and model override from website requests. Responses use a30px portrait and **Nacho** signature; account login retains its ChatGPT name.
- Added editable/importable character instructions with a shared default, explicit Save/Cancel/Restore, local persistence and an8,000-character limit. `.txt`/`.md` imports use strict UTF-8; invalid/oversized inputs and failed storage writes preserve the saved setting. Every next request carries the saved persona. The helper enforces the same limits and retains its actual no-tools capability boundary.
- Completed replies render basic bold/list/inline-code formatting with DOM text nodes, never raw HTML. Streaming and all cancellation/lifecycle safeguards remain.
- Raised render targets from WebGL30 to90FPS and Canvas2D24 to60FPS. Fractional frame budgets prevent cadence loss; time-based pointer smoothing keeps movement speed unchanged. Reused Canvas mesh points reduce allocation pressure. Visibility/editing/reduced-motion pauses remain intact.
- Added versioned URLs for the changed chat/motion scripts and stylesheet, preventing an updated page from mixing their old cached implementations.

| Verification | Observed result |
| --- | --- |
| Motion |9/9 Brave suites passed, including WebGL-disabled rendering, context loss, hidden-frame pause, mode persistence and deterministic60/120/144/240Hz cadence/time tests. |
| Measured cadence |In isolated Brave at DPR2 with approximately200Hz RAF callbacks: WebGL28.79→90.00FPS; Canvas2D21.98→60.00FPS. JS draw p95 stayed0.10ms/0.60ms. These are measured render callbacks, not physical display certification; a60Hz display presents at most60FPS. |
| Chat and persona |Full fixture suite passed: import/edit/save/reset/cancel/reload; failed persistence, invalid UTF-8, Unicode/length bounds, older-helper capability checks; safe formatting, no selector/override, streaming/IME/retry/stop/focus and deferred lifecycle regressions. Desktop16:9/21:9/32:9 and1440/390/320px layouts reviewed. |
| Independent review |Separate reviewer checked UI/import/backend boundaries and ran320/390/1440px browser flows. No unresolved findings. |
| Backend/transport |25/25 tests passed, covering exact per-request prompt/defaults, bounds, safe request shape, busy/capabilities, existing authentication/stream/cancel protections, UTF-8 and DPAPI. |
| Existing UI |All four desktop/mobile × normal/reduced-motion regression scenarios passed. |
| Real authorized inference |Actual Brave extension loading the new source reached the installed helper1.1.0 with the owner's existing authorization. Imported and saved a test `.md` persona; the model returned「Nacho 的角色設定已載入」with8 deltas,1 completion, correct Nacho avatar/name and thinking/speaking/idle reactions, no model override and no new tab. No account identity or tokens are included in public evidence. |

The installed helper was updated while preserving its encrypted account and startup configuration. Test/browser evidence stays in ignored `.impeccable/review/`. Earlier release results below are historical.

# Release 2026.11.14.3 (historical results)

Validation date: 2026-11-14 (Asia/Taipei). This release corrects the previous test definition of an "edge": placement now reaches the **actual viewport** rather than the edges of the centered 1344px composition.

## Current changes and evidence

- Full-width and full-height desktop placement, with16px edge slots. Default composition remains centered; existing v2 geometry retains its original projection until intentionally edited. v3 profiles retain new edge anchors across viewport changes. Deliberate edge dwell scrolls; quick edge drops do not unexpectedly shift the page.
- A quick pointer click no longer selects or reveals an editing frame. A560ms hold selects and starts dragging. Explicit keyboard selection remains available.
- Final rendered review also removed the old immediate long-press-hint shadow. Four computed-style pointer checks cover idle/editing × normal/reduced motion: unchanged shadow and no frame/handles at100ms and after quick release; a confirmed560ms hold reveals the editing frame.
- WebGL character motion now has an animated Canvas2D fallback. Actual Brave with WebGL disabled still changes rendered pixels and blinks using the illustrated eyelid texture. Modes are automatic/on/off; legacy checked animation is honored as on. Hidden/offscreen/editing/focus/appearance states pause work. No new image generation was required.
- The character opens an in-page chat dialog. Official ChatGPT token-sharing authentication and inference run in a loopback-only Windows helper; credentials are DPAPI-encrypted outside the repository. The page receives streamed text, never tokens. This is not a Dot memory bridge. Helper installation adds a per-user hidden startup shortcut and provides a reversible uninstall script.

| Verification | Observed result |
| --- | --- |
| Full canvas |8 real-pointer corner scenarios passed at1920×1080,3440×1440,3440 at125%,5120 at150%, fresh/legacy; reload and viewport-return checks; actual saved v2 fractional profiles preserved. |
| Ultrawide matrix |20 fresh/legacy resolution and DPI cases passed, now using actual viewport edge expectations. |
| Home editing | Unit geometry, full home-editor flow, layout roundtrip including intentionally below-view content,8 context-menu scenarios and desktop/mobile widget functionality passed. |
| Search, geometry and clock/tools |60/60 combined checks passed. The clock fixture now fixes Date while preserving real timers, preventing its noon assertion from racing the live clock's next tick. |
| Character animation |7 real-Brave suites passed including WebGL-disabled fallback, context loss, actual pixel/blink changes,8 viewports, iframe visibility and playback modes. |
| Appearance and UI | Appearance1440/390/320; desktop/mobile UI under both motion preferences; no external chat destination or obsolete URL field. |
| In-page chat UI |1440/390/320 streaming/IME/stop/retry/literal-text/XSS/history/model/focus fixtures passed.1920/3440/5120 placement inspected. No localhost request before character activation. Mock model replies were explicit test fixtures only. |
| Helper security and protocol |19 tests passed: Origin/Host/header checks, bounds/model validation, concurrent requests, UTF-8 request splitting, cancel/disconnect/login races, complete vs interrupted streams, safe errors, DPAPI roundtrip and corrupt ciphertext rejection. |
| Native Brave wrapper | Actual installed extension files tested in an isolated profile. In-page chat opens without a new tab; actual loopback service is reachable after simulated local-network permission. Search/shortcut whole-tab navigation, media/storage migration, popup/keep-alive settings and cold restart remain functional. |
| Runtime dependencies | npm production audit returned0 vulnerabilities. SDK source pinned and license/notices retained. |

**Real account validation completed after owner authorization:** on2026-11-14 at07:24 Asia/Taipei, the actual published website in an isolated Brave profile with the actual installed extension reached the installed Windows helper and `gpt-6.1-sol`. A short connection-test message received the real reply「連線成功」inside the newtab:3 streamed text events, exactly1 completion event, no new tab, and character states `thinking → speaking → idle`. Account identity and credentials are excluded from published evidence. The first attempt encountered an already-active request and correctly reported busy; retry after it completed succeeded. The owner performed OpenAI authorization personally. Local-network permission was simulated only in the disposable test profile, not altered in the personal Brave profile.

Test evidence and browser profiles remain ignored under `.impeccable/review/`. No award certification or universal physical-monitor testing is claimed. The earlier video-loop investigation is unchanged and remains documented below.

# Previous release 2026.11.14.2 (historical results)

Validation date: 2026-11-14 (Asia/Taipei). Static HTML/CSS/JavaScript site; no build step.

## Included changes in this update

- Numeric percentages and sliders for background transparency/blur; per-widget appearance, independent text contrast and scoped defaults. Ordinary surfaces default to 70% transparency, clocks to 100%; shortcut labels have no backing.
- Right-click/Shift+F10 settings, touch access through the shared editing toolbar, no per-widget three-dot buttons. Movement requires a 560ms hold; empty-space clicks only deselect.
- The character is a removable, resizable widget with one-time migration, illustrated blinks and local mesh motion. Reduced motion, hidden/offscreen views, editing, focus and the appearance dialog stop animation. No graphics support falls back to the original portrait.
- Explicit character activation opens ChatGPT in a separate tab. A custom ChatGPT conversation URL is optional; this is not an embedded GPT backend, a ChatGPT Pet installation, or a Dot memory/status connection.
- Search suggestions no longer change the submitted query merely by appearing under or being passed over by the pointer. Keyboard selection and clicking a suggestion still work.

## Retained capabilities

- Character-themed interface and local artwork, one-line light clock, circular companion composition and hidden edge tools.
- Search, direct URL navigation, Chinese IME handling and suggestion failure fallback.
- Home-screen arrangement with shared placement previews, alignment to existing rows/columns, saved desktop/mobile layouts and explicit Done/Cancel.
- New cards use stable grid footprints on ultrawide screens. Existing custom dimensions, positions and stored content remain supported.
- Background image/video selection, local storage migration and playback controls; existing native new-tab extension compatibility.

## Checks completed before release

| Coverage | Result |
| --- | --- |
| Search, home grid, resize and alignment unit checks | 44/44 passed. Includes migration, fresh companion layout across 13 widths and compact phone placement preserving custom dimensions. |
| Ultrawide functional matrix | 20/20 passed: fresh and legacy layouts at seven resolutions, plus three scaled viewports. |
| Rendered review | Desktop, 390px phone, 21:9 and 32:9 home views, appearance dialogs, dark backgrounds and recorded character motion inspected. |
| Existing/new alignment | Real Add and drag interactions, row/column alignment, preview, Done/reload and resolution return passed. |
| Legacy layout migration | Off-grid placement, earlier saved profiles, content, appearance and fixed dimensions passed. |
| Widget interactions | Desktop/mobile editing, cancellation, persistence, long lists, clock settings, folders and custom icons passed. |
| Background compatibility | Existing local Blob records, extension media cache and URL preferences retained; explicit theme choice takes precedence. |
| UI interactions | Four desktop/mobile × motion/reduced-motion scenarios passed: search, IME, offline fallback, shortcuts, character ChatGPT link, settings, focus and motion. |
| Appearance controls | 1440×900, 390×900 and 320×640 passed: number clamping/empty edits, reset, persistence, light text, old image alpha, invalid ChatGPT URL rejection and data preservation. |
| Context menus | 8/8 passed across keyboard/touch, 320/390px and both motion preferences. |
| Character | 4/4 suites passed, including 8 viewports, rendered pixel changes/blinks, pause/resume, persistent options, real navigation, removal and no reappearance. Independent context-loss/recovery and graphics cleanup checks also passed. |
| Clock and hidden tools | 14/14 passed from 320 to 2560px, both motion preferences. |
| Weather | 8/8 passed: location/network failures, retry/recovery, stale requests and touch controls. The direct-API fixture scrolls to the new free slot just as a user can; visible targets are still hit-tested. |
| Background playback | Both motion preferences passed: looping, pause, failed replacement, image persistence and theme restore. No playback algorithm change. |
| Native extension compatibility | Isolated Brave tested native wrapper, whole-tab search/link navigation, separate ChatGPT tab without an opener, shared storage and retained keep-alive settings. |

Resolution matrix: 1920×1080, 2560×1440, 2560×1080, 3440×1440, 3840×1600, 3840×1080 and 5120×1440. Additional functional cases use 3440×1440 at125%, 3840×1600 at150% and 5120×1440 at150%, reducing the CSS viewport as well as changing pixel density. Each runs fresh and legacy layouts, new cards, alignment, edge drops, Notes/Weather interactions, save/reload and a return through1280 px and390 px widths. These are isolated browser viewport simulations, not physical-monitor certification.

The repository includes repeatable tests in `tests/`. Browser scenarios require Playwright, a running local HTTP server and an installed supported browser. Extension tests additionally require `NEWTAB_EXTENSION_PATH`; the separately installed extension is not distributed in this website repository. Reports and screenshots are generated locally under ignored `.impeccable/review/`.

This update builds on the previously published release. Three implementation workers covered appearance, home interactions and character motion, then performed cross-reviews. Findings fixed before release included pointer-hover suggestion selection, light text on empty widgets, character border/caption settings and pausing the renderer behind its appearance dialog. Local assistant settings, browser profiles and review recordings remain excluded from the published repository. A local static scan of the four new/replaced appearance/character files was limited to regex rules; it is not a browser accessibility certification.

## Video-loop investigation remains open

Native looping remains unchanged. A new frame-presentation diagnostic compared actual boundary intervals with ordinary cadence on generated1080p30 H.264 and VP9 clips. Isolated Edge and Brave did not reproduce a significant extra seam pause. In Brave, four boundaries per format had maximum intervals36.90 ms and35.90 ms, with ordinary p95 of35.10 ms. A normal30 fps interval is about33.3 ms; these numbers are not a measured fix for a user's source-specific hitch.

The original affected file is still needed to distinguish decoder seeking, held/duplicated tail frames, container padding and nonmatching first/last content. This release does not claim to resolve that unconfirmed source-specific issue. Timing samples use compositor callbacks, not a physical-display recording; mute tests check player state rather than audio waveform continuity.

No award certification, every possible saved layout or continuous availability of third-party services is claimed. The Weather geometry matrix uses controlled fixtures; network and failure handling are covered separately.

## Weather forecast dashboard — 2026.11.14.10

The weather widget now offers Celsius/Fahrenheit, temperature/rain/wind charts with pointer and keyboard inspection, and selectable seven-day forecasts. New widgets use four by four home-screen cells; existing saved geometry is unchanged. Compact cards expose an inline forecast expansion and internal scrolling. All sizing follows the widget container, including wide monitors, and the existing long-press resize/Done/Cancel workflow remains in use.

Validation performed against this implementation:

- Weather data adapters: 19 unit tests, including real interval semantics, nulls versus zero, partial-day ranges, timezone correction without refetch, DST and old cache compatibility.
- Weather lifecycle: 23 browser cases for location recovery, network/manual city selection, request cancellation, stale responses, old small widgets and the MET three-hour/Expires cache protections.
- Dashboard: 12 isolated Brave cases covering 160×160, 320×360, 640×400, 900×440; 5120-wide edge placement; negative temperatures and touch; selected-day/metric values; keyboard access; unit persistence; chart-versus-drag gestures; real handle resizing and reload; midnight caches; irregular forecast cadence; and custom transparency/text appearance.
- Location picker: 9 browser cases including timezone validation. Layout sizing/alignment: 34 unit cases. Startup gating: 9 browser cases; atomic shell cache: 10 browser cases. General UI: four desktop/mobile and reduced/normal-motion runs.
- Separate isolated Brave checks requested public Tokyo weather: the primary source timed out and MET returned 88–89 forecast samples across seven days, with no browser errors. The visual fixture now seeds both cache stores and forbids further provider requests when the saved forecast exists. This establishes the fallback path on this connection, not uninterrupted availability of either provider.

Independent reviews and rendered inspection caught and corrected inherited density rules hiding full-size details, touch-width overflow at 160px, stale timezone/date handling and uneven time-axis labels. Forecast ranges and source attribution remain visible; sparse MET intervals retain their original duration. No changes to the installed Brave extension, personal browser profile or chat helper were required.

## Focused character chat — 2026.11.14.11

The main conversation now shows the portrait/name, gear/close controls, messages and a 54px empty composer. Account details, login/refresh/logout, persona editing/import/reset and storage information live in the settings view. Clear-conversation controls and their confirmation state were removed. Routine announcements remain available to assistive technology without a visible footer; connection and reply failures retain visible recovery actions. Opening settings focuses its heading rather than raising the phone keyboard. The dialog backdrop is fully transparent with no filter.

`tests/character-chat.cjs` passed eight complete fixture groups in isolated Brave, plus a ninth focused keyboard group. Existing persona migration, import, persistence failures, safe reply formatting, IME, streaming, retry, stop, retained history, stale-login cancellation and oversized-response coverage remain. Added checks cover hidden account controls, absent clear controls, compact composer, settings during streaming/close abort, and an already-open side rail's Tab/Escape/search-shortcut isolation. Desktop placement was checked at 1920, 3440 and 5120 widths; ordinary chat flows at 1440×900, 390×844 and 320×640.

Independent rendered review also covered 390×480, settings scrolling, login failures and a dark wallpaper. A background pixel patch outside the panel was byte-identical before and after opening chat. No console errors were observed. General UI regression passed four desktop/mobile, reduced/normal-motion runs. These use fixture responses, not a real model request or changes to the user's account, browser profile or local helper.
