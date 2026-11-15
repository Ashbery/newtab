# Ashbery — Nachoneko character interface

## Final direction
The entire interface, including icons, buttons, search and optional widgets, takes its visual identity from the owner's three Nachoneko references: silver-grey hair, aqua eyes, powder-blue and white clothing, charcoal companions, ribbons and paws. The Ashbery identity remains in the title and About; the visible top-left brand has been removed at the owner’s request. Character artwork and attribution remain. The owner delegated iterative refinement; an award-level craft aspiration is not an award or certification claim.

The installed **frontend-design, UI UX Pro Max, Impeccable and logo-design** skills guide design, implementation and critique. Supplied websites are references **only for motion, interaction and animated elements**. Their palettes, branding and page templates do not determine this product's appearance.

## Product and composition
This is a personal start page used repeatedly throughout the day. Search, time and saved destinations remain primary. The character is a movable, resizable, removable widget in the same placement system as other content. Fresh desktop layouts place the clock and search to the left of the character; narrower layouts flow the character into available space. The right-edge Tools entry is hidden on fine-pointer desktops until edge proximity or keyboard focus reveals it; touch devices keep a compact accessible entry. Background, personalization, focus mode and arrangement live inside. There is no top-left brand or bottom helper bar. Existing desktop coordinates, uploaded backgrounds and widget settings survive; explicit mobile arrangement can have its own saved placement profile.

## Visual system
- Porcelain `#F8FBFD`, silver-grey `#EDF2F6`, graphite `#303945`, slate `#536477`, powder blue `#DCEEF3`, blue ink `#36596E`, and aqua details taken from the character.
- The owner rejected the heavy Outfit treatment and selected a light digital clock with complete time on one line and a separate date. Use locally hosted Manrope Light 300 for the HH:MM:SS group, natural colon spacing and real tabular numerals; no individual numeral boxes or extra spacing around hours/minutes. Date/weekday and the optional 12-hour period use a separate 13px row. Preserve readable contrast and stable width. Manrope and Noto Sans TC remain the interface faces. Tabliss and Momentum were inspected as live reference pages for compact time grouping and a quieter secondary hierarchy; their branding and palettes are not adopted.
- Nine locally generated character application icons share the portrait's ribbons, paws, silver-blue materials and charcoal companions. Service names and destination hints retain recognizability; user-uploaded application icons remain their own images.
- Search uses an authored SVG ribbon/paper-plane motif. It is a clear action control, without the rejected black-cat submit or a cat-ear button outline.
- A light porcelain drawer and light paper forms preserve readable editing surfaces; charcoal text and blue accents define hierarchy. Character details belong in the icon family and restrained control accents, not repeated decorative ears.
- The transparent portrait and nine-icon atlas are served locally. Provenance, dimensions and asset treatment are documented in [assets/character/README.md](assets/character/README.md). Existing Elgato/Nachoneko assets retain their separate attribution and license.

UI UX Pro Max searches for personal productivity/productivity dashboard returned an unsuitable marketing template and teal palette. Only its focus visibility, 44px touch-target and contrast guidance was adopted. The character palette and personal start-page composition remain authoritative.

## Interaction and motion
Desktop search remains inline; mobile search receives a focused sheet. Enter, arrow navigation, Escape, pointer/touch, URLs, Chinese IME, local fallback, `/` and Ctrl/Cmd+K continue to use the same search flow. Modal controls preserve focus management and return to their opener.

Motion responds to action, with stable clickable areas:

| Interaction | Treatment |
| --- | --- |
| Application hover | Artwork lift up to 4px and scale up to 1.06, with distance-based falloff for adjacent icons; hitboxes do not move. |
| Destination hint | Removed at the owner's request; app labels and accessible names remain. |
| Search submit | Internal motif moves at most 2px; the button stays fixed. |
| Drawer tabs | One shared selected surface travels in 320ms. |
| Press and release | 60–80ms press, 140–220ms release for standard control feedback. |
| Companion | Illustrated blink frames, low-amplitude local breathing, hair and ear motion; pause when hidden or requested. Pointer response keeps the interaction target fixed. |

Reduced motion disables interface movement and character animation. It does not override explicit background-video playback. The owner rejected the display-window/ledge treatment. The character emerges from a circular silver-blue background; its transparent contour remains intact above the circle and the lower image follows a softened circular edge. There is no arch, shelf or windowsill. This is an illustrated screen-based depth effect, not a Live2D rig or physical 3D model. Widget bounds contain the entire scene, and the common placement engine prevents overlaps with functional widgets. Focus mode hides the character; editing suspends motion while retaining the widget for placement.

## Review-driven refinement
Impeccable Assessment A reviewed design independently before seeing Assessment B's detector and browser evidence. The refinement pass addresses their concrete findings:

- Extend character-specific artwork to application and weather icons; give empty todo/bookmark widgets a useful first action.
- Enlarge mobile countdown fields and search/todo controls to the 44px craft target, using projected widget height rather than overwriting saved layouts.
- Give inline and expanded search a consistent visible focus treatment, and improve the narrow clock seconds separator's contrast.
- Group file and URL background inputs with their respective apply actions; condense unavailable image playback/audio controls into a status, revealing actionable video controls when relevant.

Independent design and interaction reviews informed these refinements. Release acceptance and tested behavior are summarized in [VALIDATION.md](VALIDATION.md); review scores are not an award certification.

## Motion references
Specific references and the supplied resource inventory are recorded in [DESIGN_RESOURCES.md](DESIGN_RESOURCES.md). Component-library examples are translated into the existing static HTML/CSS/JavaScript; no React library or shader runtime is required.

### Whole-interface motion pass — 2026.11.14.19

The brief is a frequent-use personal new tab, not a promotional animation demo. Preserve the current layout, character artwork, Manrope/Noto typography, porcelain (#f8fbfd), silver (#dce5eb), powder blue (#b7d6e4) and blue ink (#36596e). UI state changes should feel related and finish quickly. Do not add ambient loops, destination tooltips or page-wide whitening.

Cult UI's **Halo Switch**, **Direction-Aware Tabs**, **Popover**, **Side Panel** and **Prompt Composer** inform switch travel, selected surfaces, directional disclosure and composer behavior. DesignBookmark Motion's **Toggle switch**, **Range slider**, **Tab pill**, **Spring dropdown**, **Streaming reply** and **Loading to success** inform control and response states. These are native CSS/WAAPI implementations tailored to this static site, not installed React components or copied branded artwork.

- Controls: 120–180 ms state feedback, restrained spring travel on switch thumbs and selected tabs; the clickable target stays still. Range progress follows both direct dragging and numeric/reset changes.
- Navigation: contained silver-blue drawer with reversible 320 ms entrance / 220 ms exit, transparent dismissal layer, shared active-tab pill, short directional panel changes. Hover submenus require deliberate pointer dwell and open only by click/keyboard on narrow/touch screens.
- Dialogs and folders: small 6–12 px displacement, 140–280 ms transitions, immediate input deactivation on dismissal, cancellation of stale close operations. Folders no longer fly across an ultrawide display.
- Search and weather: shorter first-reveal suggestions, immediate later query updates, reversible mobile search, moving forecast/unit selections and brief directional chart changes. Existing independent surface alpha, icon color and button fill remain authoritative.
- Chat: auto-height composer, one send/stop slot, new-message entrance once, streaming text stays stable, thinking/completion feedback, cancellable settings/page transitions and transparent backdrop. Login, custom persona and message history retain their existing ownership.
- Editing: landing states transition color only; coordinates and drag hit boxes never animate behind the pointer. Todo completion animates the tick; storing edits is synchronous with the action.
- Accessibility: reduced motion resolves the shared animations and pending cleanup immediately, including a preference change while a panel is closing. Native controls, focus restoration, keyboard selection, touch targets and independent appearance settings remain testable product behavior.

Acceptance uses real-browser interaction, screenshots, interruption/reopening, narrow and ultrawide layouts, state persistence and mocked-service error cases. Award-level craft is an aspiration; no award or universal frame-rate claim is made.

### Continuous interaction refinement — 2026.11.15.1

The owner found the first motion pass too rigid. The principal problem was discontinuity: old content disappeared before the next view arrived, and an interrupted action restarted an entrance. The revised system carries the current position and velocity into a new target. One shared requestAnimationFrame driver integrates damped springs; it stops once all activity settles. There is no perpetual decorative loop or new startup delay.

- Drawer tabs use adjacent, opaque live pages. Outgoing content remains visually present but immediately becomes inert; scroll position is preserved per page. The active pill has a leading and trailing spring edge, while the toggle thumb stretches gently toward its destination. Repeated selection cannot snap the traveling pill to its endpoint.
- Dialogs and context menus reverse from their visible pose. Their dismissal deactivates input immediately, with completion guards preventing an old close from hiding a reopened surface. Context-menu selection has one moving background plate; focus rings and pointer targets stay fixed.
- Appearance disclosure animates the actual field region and keeps saved values intact. The Done button compresses its inner face, never the hit box. Folder contents remain present when an in-progress close reverses.
- Chat settings and conversation use real retained views with a reversible fade-through handoff, avoiding overlapping text. The composer changes height continuously, including an interrupted shrink. Closing aborts transport immediately; reopening can inherit the visual exit pose without delaying control response.
- Weather keeps labels and controls stable. Only forecast curves crossfade, while the active data cursor belongs to a single overlay. Metric and unit indicators travel with a restrained spring. Repeated changes must preserve visible geometry and clean up obsolete curves.
- Reduced motion, a newly hidden document, and removed owners resolve pending animation cleanup. Native controls, focus ownership and synchronous preference writes remain authoritative.

DesignBookmark's actual Toggle switch, Tab pill and Spring dropdown examples informed the physical response. Cult UI's actual Direction-Aware Tabs and Popover sources informed directional continuity and restrained settling. This implementation keeps interactions interruptible instead of blocking input until an animation finishes. Review uses normal-speed recordings, intermediate frames, rapid reversals and functional tests; the target is a dependable finished product, not an award claim.

### Display-specific placement and lighter motion — 2026.11.15.2

The user selected separate arrangements with shared content. Screen profiles own widget geometry, sizes, visibility, pinning and home-grid placement. Widget content and appearance remain shared by widget identity. A screen change must not create a second conversation, reset a note, restart an unaffected Live2D renderer or overwrite another tab's newer content. The original common arrangement is retained; disabling the feature restores that geometry with current shared content, and keeps saved screen profiles.

The personalization drawer offers a quiet native switch, a layout selector/name and an explicit automatic-identification action. New/unknown displays copy the current arrangement as a starting point. Window Management permission is requested only by that action; startup may resume a permission already granted. Screen identity uses local descriptors rather than viewport dimensions alone. Duplicate display names use desktop positions; ambiguous reconnections retain the selected layout until explicitly rebound. The browser does not supply a permanent hardware identifier.

Changing screens during a drag, input, settings dialog or arrangement draft queues the change until the operation finishes. Pending automatic changes belong to the automatic detector; stopping it or losing permission cancels only its requests. A late permission result cannot re-enable a choice stopped from another tab. Per-field content records and per-widget profile geometry prevent a stale full-page snapshot from overwriting unrelated changes. Content refreshes preserve unaffected widget DOM and renderers.

The movement refinement targets measured rendering work as well as feel. Drawer/pages now set transform directly instead of updating inherited CSS variables across the entire settings subtree. The selected pill scales a fixed face rather than changing width on every frame. Compositor preparation is temporary and cleaned up after settling, reversal or reduced-motion changes. The selected page spring is 380/32: approximately 4 px of settling on a 342 px pane, less pronounced than the rejected 380/30 response. Hardware acceleration remains a browser/driver decision, not a pretend website setting.

## Functional refinement after owner review
Tapping Add creates an immediately usable widget and brings it into view on phones. Arrangement is explicit in Tools or entered through a deliberate long press. Right-click and Shift+F10 open the selected widget's menu; touch users can select it during editing and use the shared toolbar's Settings action. Individual three-dot buttons have been removed at the owner's request.

## Personalization and deliberate dragging

Preserve the existing silver-blue palette and light Manrope clock. Surface opacity is independent of content: ordinary widget backgrounds start at 30% opacity (70% transparency), the clock at zero, and text stays fully opaque. App and folder labels never gain rectangular backing. Right-click appearance editing combines paired numeric inputs and sliders, a live preview, text contrast choice and a scoped Restore defaults action; it must not overwrite widget content or placement. Background transparency and blur apply to image/video layers only, with 0–100% values and their own reset.

The owner rejected click-to-place movement. A quick click selects; clicking empty space deselects. A hold of roughly half a second arms movement in both normal and editing modes. Preserve visible landing previews, deliberate folder dwell, resize controls, keyboard alternatives, and Done/Cancel semantics. The character uses this same system and receives a one-time migration marker so removing it remains a deliberate saved choice.

The character is the single expressive element. Everything around it stays quiet: no extra mascot badges, noisy particle loops or competing motion. Activating it opens the in-page Nacho conversation through the local ChatGPT helper. The chat header contains the portrait/name, an accessible gear and close control. Account/login controls, persona editing/import/reset and storage information belong inside the gear's settings view. The main view contains messages and a compact composer; routine success announcements do not occupy visible space, while failures keep recovery controls. There is no clear-conversation action. The native dialog backdrop is transparent and never changes the page's colors, opacity or blur. Existing chat history and custom persona text survive this presentation change; no Dot memories or external conversation history are imported.

Launcher long-press feedback keeps a stable target. The new editor follows home-screen expectations: freeze visible positions on entry; show a real placement grid and exact landing preview; use 96×104px launcher lanes on desktop and four columns on phones. Moved/resized widgets use meaningful cell spans. Quick app overlap swaps positions; a deliberate 650ms center dwell previews folder creation or insertion. Only the selected item exposes resize affordances. Done commits the draft, Cancel restores entry state, and keyboard movement provides a no-drag path. Adding from the catalog respects an open draft. Preserve legacy geometry until the user explicitly moves/resizes the item. These are the implementation acceptance criteria; final measured results are recorded in VALIDATION.md.

The owner exposed a gap in the earlier acceptance checks: matching one drop preview is not enough if fresh defaults use a different grid or saved sizes scale with the viewport. Fresh defaults and dragging now share a centered desktop stage up to1344px wide and the same cells. Edited placement stores cell coordinates and widget spans with fixed launcher dimensions. Responsive projection and per-breakpoint drafts must return to the original position without rewriting settings when the viewport changes. Legacy positions remain valid return targets. Verification includes moving away and back, saving/reloading at another size, resizing during an active edit, and viewport-edge/short-height cases.

The next owner correction requires cross-item alignment, not just each item's return to its own saved position. Old placements may lie between current grid rows/columns. Preserve those placements while allowing a newly added or moved item to align with their visible row/column. The catalog preview and final placement must use the same alignment candidate as canvas dragging. A restrained guide should identify that alignment. Acceptance compares old and new item bounds, icon containers and label baselines side by side and in a column, followed by Done, reload and viewport roundtrips.

Weather exposes its loading, location fallback, offline and retry states, validates readings, retains useful cached data on failure, and prevents obsolete requests from writing cache. A device-location failure is labelled, not presented as the user's actual city. Bookmarks offer a visible management dialog for URL/name editing and removal. Cancelled renames and CJK composition must not accidentally commit.

Acceptance is based on the owner's requested visual corrections plus working normal, empty, error, saved-data and keyboard/touch flows. Repeated rendered reviews and fixes target the requested Awwwards/Webby/FWA level of craft; automated scores do not establish an award or replace those checks.

## Weather controls and Nacho extension — 2026.11.16

The weather gear uses the existing weather-button appearance variables alongside locate and refresh. Small widgets wrap their header to retain usable targets. Its centered porcelain settings sheet has a transparent backdrop, deliberate focus/Escape behavior, saved location, independent on-open and periodic refresh controls, and a scoped reset that never removes the city. Location is content, so cancelling a positional arrangement cannot undo a successful location choice. The source/update details remain available within settings.

The extension popup is a compact Operate surface, not a second start page. A single 88px illustrated portrait leads a quiet identity row; the retention switch, actual state, three standard radio choices and Open new tab action fit within the browser popup. At 320px the footer remains visible without a forced page scroll. The control palette uses porcelain, powder blue, silver and blue ink, with locally packaged Manrope for the name. Thumb travel, selected outlines and a short portrait change are the only expressive interaction motion; reduced motion removes those movements and leaves the state changes intact.

Three separately generated static Nacho portraits provide different silhouettes: long hair with a blue cardigan, a bob under a charcoal cat-ear knit hat, and a side braid with an ivory sailor blouse. The matching toolbar size ladder and full transparent masters are documented in `assets/nacho-wardrobe/README.md`. Existing Live2D stays unchanged. Retention copy describes background-tab unloading and its memory cost, never claims perpetual activity or frame-rate guarantees. Fake uptime/counter displays and repeated background heartbeats are removed.
