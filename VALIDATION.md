# Release 2026.11.14.2

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
