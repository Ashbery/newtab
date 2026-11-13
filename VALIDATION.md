# Release 2026.11.14.3

Validation date: 2026-11-14 (Asia/Taipei). This release corrects the previous test definition of an "edge": placement now reaches the **actual viewport** rather than the edges of the centered 1344px composition.

## Current changes and evidence

- Full-width and full-height desktop placement, with16px edge slots. Default composition remains centered; existing v2 geometry retains its original projection until intentionally edited. v3 profiles retain new edge anchors across viewport changes. Deliberate edge dwell scrolls; quick edge drops do not unexpectedly shift the page.
- A quick pointer click no longer selects or reveals an editing frame. A560ms hold selects and starts dragging. Explicit keyboard selection remains available.
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

**Account-dependent validation remains pending:** no user ChatGPT account was logged into and no real model response was obtained by these tests. The helper and UI are ready for the owner's first authorization; successful real inference must be recorded separately. Local-network permission was granted only in disposable test profiles, not changed in the personal Brave profile. The installed wrapper needs one reload for its new loopback permission delegation.

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
