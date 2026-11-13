# Release 2026.11.14.6

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
