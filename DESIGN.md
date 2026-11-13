# Ashbery — Nachoneko character interface

## Final direction
The entire interface, including icons, buttons, search and optional widgets, takes its visual identity from the owner's three Nachoneko references: silver-grey hair, aqua eyes, powder-blue and white clothing, charcoal companions, ribbons and paws. The Ashbery identity remains in the title and About; the visible top-left brand has been removed at the owner’s request. Character artwork and attribution remain. The owner delegated iterative refinement; an award-level craft aspiration is not an award or certification claim.

The installed **frontend-design, UI UX Pro Max, Impeccable and logo-design** skills guide design, implementation and critique. Supplied websites are references **only for motion, interaction and animated elements**. Their palettes, branding and page templates do not determine this product's appearance.

## Product and composition
This is a personal start page used repeatedly throughout the day. Search, time and saved destinations remain primary. Fresh desktop layouts place the clock and search to the left of a character depth scene. Phones retain a compact portrait only where clear of controls, centered shortcuts and a focused search sheet. The right-edge Tools entry is hidden on fine-pointer desktops until edge proximity or keyboard focus reveals it; touch devices keep a compact accessible entry. Background, personalization, focus mode and arrangement live inside. There is no top-left brand or bottom helper bar. Existing desktop coordinates, uploaded backgrounds and widget settings survive; explicit mobile arrangement can have its own saved placement profile.

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
| Destination hint | 240ms initial pointer delay; immediate keyboard access. |
| Search submit | Internal motif moves at most 2px; the button stays fixed. |
| Drawer tabs | One shared selected surface travels in 320ms. |
| Press and release | 60–80ms press, 140–220ms release for standard control feedback. |
| Companion | Short greeting response and limited pointer follow; no idle animation loop. |

Reduced motion disables interface movement and transitions. It does not override explicit background-video playback. The owner rejected the display-window/ledge treatment. The character now emerges from a circular silver-blue background; its original transparent contour remains intact above the circle and the lower image follows a softened circular edge. There is no arch, shelf or windowsill. Two depth layers respond subtly to fine-pointer movement; the hitbox stays fixed and touch/reduced motion retains static depth. This is a screen-based depth illusion. Full visual bounds, compact-avatar candidates and the speech bubble are checked against actual controls; no safe place means hidden/inert. Dialogs, focus and arrangement suspend the character.

## Review-driven refinement
Impeccable Assessment A reviewed design independently before seeing Assessment B's detector and browser evidence. The refinement pass addresses their concrete findings:

- Extend character-specific artwork to application and weather icons; give empty todo/bookmark widgets a useful first action.
- Enlarge mobile countdown fields and search/todo controls to the 44px craft target, using projected widget height rather than overwriting saved layouts.
- Give inline and expanded search a consistent visible focus treatment, and improve the narrow clock seconds separator's contrast.
- Group file and URL background inputs with their respective apply actions; condense unavailable image playback/audio controls into a status, revealing actionable video controls when relevant.

Independent design and interaction reviews informed these refinements. Release acceptance and tested behavior are summarized in [VALIDATION.md](VALIDATION.md); review scores are not an award certification.

## Motion references
Specific references and the supplied resource inventory are recorded in [DESIGN_RESOURCES.md](DESIGN_RESOURCES.md). Component-library examples are translated into the existing static HTML/CSS/JavaScript; no React library or shader runtime is required.

## Functional refinement after owner review
Tapping Add now creates an immediately usable widget and brings it into view on phones. It does not silently enter arrangement mode and disable the new controls. Arrangement is explicit in Tools; each widget then exposes a native, named Settings button for touch and keyboard access to its existing menu.

Launcher long-press feedback keeps a stable target. The new editor follows home-screen expectations: freeze visible positions on entry; show a real placement grid and exact landing preview; use 96×104px launcher lanes on desktop and four columns on phones. Moved/resized widgets use meaningful cell spans. Quick app overlap swaps positions; a deliberate 650ms center dwell previews folder creation or insertion. Only the selected item exposes resize affordances. Done commits the draft, Cancel restores entry state, and keyboard movement provides a no-drag path. Adding from the catalog respects an open draft. Preserve legacy geometry until the user explicitly moves/resizes the item. These are the implementation acceptance criteria; final measured results are recorded in VALIDATION.md.

The owner exposed a gap in the earlier acceptance checks: matching one drop preview is not enough if fresh defaults use a different grid or saved sizes scale with the viewport. Fresh defaults and dragging now share a centered desktop stage up to1344px wide and the same cells. Edited placement stores cell coordinates and widget spans with fixed launcher dimensions. Responsive projection and per-breakpoint drafts must return to the original position without rewriting settings when the viewport changes. Legacy positions remain valid return targets. Verification includes moving away and back, saving/reloading at another size, resizing during an active edit, and viewport-edge/short-height cases.

The next owner correction requires cross-item alignment, not just each item's return to its own saved position. Old placements may lie between current grid rows/columns. Preserve those placements while allowing a newly added or moved item to align with their visible row/column. The catalog preview and final placement must use the same alignment candidate as canvas dragging. A restrained guide should identify that alignment. Acceptance compares old and new item bounds, icon containers and label baselines side by side and in a column, followed by Done, reload and viewport roundtrips.

Weather exposes its loading, location fallback, offline and retry states, validates readings, retains useful cached data on failure, and prevents obsolete requests from writing cache. A device-location failure is labelled, not presented as the user's actual city. Bookmarks offer a visible management dialog for URL/name editing and removal. Cancelled renames and CJK composition must not accidentally commit.

Acceptance is based on the owner's requested visual corrections plus working normal, empty, error, saved-data and keyboard/touch flows. Repeated rendered reviews and fixes target the requested Awwwards/Webby/FWA level of craft; automated scores do not establish an award or replace those checks.
