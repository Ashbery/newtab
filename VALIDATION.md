# Release 2026.11.14.1

Validation date: 2026-11-14 (Asia/Taipei). Static HTML/CSS/JavaScript site; no build step.

## Included changes

- Character-themed interface and local artwork, one-line light clock, circular companion composition and hidden edge tools.
- Search, direct URL navigation, Chinese IME handling and suggestion failure fallback.
- Home-screen arrangement with shared placement previews, alignment to existing rows/columns, saved desktop/mobile layouts and explicit Done/Cancel.
- New cards use stable grid footprints on ultrawide screens. Existing custom dimensions, positions and stored content remain supported.
- Background image/video selection, local storage migration and playback controls; existing native new-tab extension compatibility.

## Checks completed before release

| Coverage | Result |
| --- | --- |
| Search, home grid, resize and alignment unit checks | 40/40 passed. |
| Ultrawide functional matrix | 20/20 passed: fresh and legacy layouts at seven resolutions, plus three scaled viewports. |
| Ultrawide visual review | Nine rendered views inspected; no surplus scrollbars or character/widget collisions; hidden edge menu and drawer remained usable. |
| Existing/new alignment | Real Add and drag interactions, row/column alignment, preview, Done/reload and resolution return passed. |
| Legacy layout migration | Off-grid placement, earlier saved profiles, content, appearance and fixed dimensions passed. |
| Widget interactions | Desktop/mobile editing, cancellation, persistence, long lists, clock settings, folders and custom icons passed. |
| Background compatibility | Existing local Blob records, extension media cache and URL preferences retained; explicit theme choice takes precedence. |
| Native extension compatibility | Isolated Brave tested native wrapper, whole-tab search/link navigation, storage sharing and retained keep-alive settings. |

Resolution matrix: 1920×1080, 2560×1440, 2560×1080, 3440×1440, 3840×1600, 3840×1080 and 5120×1440. Additional functional cases use 3440×1440 at125%, 3840×1600 at150% and 5120×1440 at150%, reducing the CSS viewport as well as changing pixel density. Each runs fresh and legacy layouts, new cards, alignment, edge drops, Notes/Weather interactions, save/reload and a return through1280 px and390 px widths. These are isolated browser viewport simulations, not physical-monitor certification.

The repository includes repeatable tests in `tests/`. Browser scenarios require Playwright, a running local HTTP server and an installed supported browser. Extension tests additionally require `NEWTAB_EXTENSION_PATH`; the separately installed extension is not distributed in this website repository. Reports and screenshots are generated locally under ignored `.impeccable/review/`.

The release was assembled on the latest published `master` history. The assembled files were rechecked with40 unit cases, desktop/mobile UI scenarios with both motion preferences, background migration scenarios and real isolated Brave extension integration. All passed. One concurrent background-test attempt produced an invalid generated MediaRecorder fixture; the isolated rerun passed without changing playback or migration code. Local assistant settings, browser profiles, original extension backups and review screenshots are excluded from the published repository.

## Video-loop investigation remains open

Native looping remains unchanged. A new frame-presentation diagnostic compared actual boundary intervals with ordinary cadence on generated1080p30 H.264 and VP9 clips. Isolated Edge and Brave did not reproduce a significant extra seam pause. In Brave, four boundaries per format had maximum intervals36.90 ms and35.90 ms, with ordinary p95 of35.10 ms. A normal30 fps interval is about33.3 ms; these numbers are not a measured fix for a user's source-specific hitch.

The original affected file is still needed to distinguish decoder seeking, held/duplicated tail frames, container padding and nonmatching first/last content. This release does not claim to resolve that unconfirmed source-specific issue. Timing samples use compositor callbacks, not a physical-display recording; mute tests check player state rather than audio waveform continuity.

No award certification, every possible saved layout or continuous availability of third-party services is claimed. The Weather geometry matrix uses controlled fixtures; network and failure handling are covered separately.
