# Release 2026.11.14.9

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
