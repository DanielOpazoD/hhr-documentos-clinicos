# Design QA · HHR Documentos

## Comparison target

- Source visual truth: `outputs/design-audit/06-direccion-minimalista.png`.
- Baseline audit captures: `outputs/design-audit/02-formularios.png`, `03-ia.png`, `04-documentos.png`, `05-archivos.png`.
- Rendered desktop implementation: `outputs/design-qa/documentos-desktop.png`.
- Rendered mobile implementation: `outputs/design-qa/formularios-mobile.png`, `ia-mobile.png`, `documentos-mobile-preview.png`, `archivos-mobile.png`.
- Combined comparison evidence: `outputs/design-qa/comparison-desktop.png` and `outputs/design-qa/comparison-mobile.png`. In both files the design direction is above and the implementation is below.

The source is a design-system and responsive-direction board rather than a pixel-equivalent application screen. The comparison therefore evaluates the explicit visual rules and responsive behavior without claiming pixel-level identity between different states.

## Capture normalization

- Source pixels: 1465 x 761.
- Desktop implementation pixels and CSS viewport: 1440 x 900 at device scale factor 1.
- Mobile implementation pixels and CSS viewport: 320 x 760 at device scale factor 1.
- Tablet verification CSS viewport: 1121 x 900.
- Desktop combined comparison: source resized proportionally to 1440 px wide; implementation retained at 1440 x 900.
- Mobile combined comparison: source resized proportionally to 1328 px wide; four unscaled 320 x 760 captures placed in one row with 16 px gaps.
- Theme/state: light theme, private prototype, fictitious clinical data. Documentos uses the default certificate template; its mobile capture has `Vista previa` selected.

## Findings

No actionable P0, P1 or P2 differences remain.

- Fonts and typography: Geist is retained; page titles now use a responsive 28-36 px range with reduced tracking and clear hierarchy. Text wraps at 320 px without truncating the core task.
- Spacing and layout rhythm: the working canvas is capped at 1160 px; core radii are 10-12 px with restrained shadows. Desktop keeps editor and preview in parallel, tablet stacks them, and mobile uses an explicit Editar/Vista previa switch.
- Colors and visual tokens: the navy, cyan, paper, positive green and restricted yellow palette match the direction board. Yellow remains focused on the brand and clinical/status communication.
- Image quality and asset fidelity: the real HHR logo is used as an image asset. The four institutional PDFs remain the byte-identical repository originals; no form or logo was redrawn with code.
- Copy and content: the global prototype indicator remains visible, while the IA badge is simplified to `IA real` to avoid duplicating the environment label. Safety, integrity and human-review copy remain explicit.
- Responsive behavior: `documentElement.scrollWidth === clientWidth` at 320, 1121 and 1440 px. Persistent navigation and primary controls remain visible.
- Interaction and accessibility: the document switch is a named tablist with `aria-selected` and `aria-controls`; form tabs, IA radio targets and the file-origin filter update real state.

## Comparison history

### Iteration 1 · blocked

- Earlier evidence: the audit captures showed cropped mobile content and the design board classified reflow as P0. The initial local implementation had no horizontal scrollbar at 320 px, but Documentos required scrolling through the entire editor before reaching the preview, and its desktop minimum tracks could become unsafe around the sidebar/tablet boundary.
- P0/P1 fixes: added mobile Editar/Vista previa tabs; introduced explicit `min-width: 0` contracts for nested grid children; moved the original PDF preview before the long form information on mobile; raised the stacking breakpoint to 1240 px; reduced mobile action and panel density.
- Runtime fix: replaced timezone-dependent stored-date formatting that caused hydration failure and blocked React interactions.
- P2 fix: corrected the IA selection indicator so only the selected result shows a check.

### Iteration 2 · passed

- Post-fix desktop evidence: `outputs/design-qa/documentos-desktop.png` shows the 1160 px workspace, fixed sidebar, restrained surfaces, editor/preview pairing and one dominant CTA.
- Post-fix mobile evidence: `outputs/design-qa/comparison-mobile.png` shows one-column reflow, bottom navigation, the selected original form, simplified IA status, the document preview tab and a complete file toolbar at 320 px.
- Focused interaction evidence: `Vista previa` changes the editor from `display: block` to `none` and the preview from `none` to `block`; the selected form updates its PDF source; IA selection opacities resolve to one visible check; the file origin resolves to `QR móvil`.
- Browser checks: page identity, meaningful DOM, framework-overlay absence and console health passed in a clean final browser session. Final console error/warning list: empty.
- Automated checks: lint completed with no errors; build passed; 4/4 Node tests passed. Four pre-existing non-blocking `no-img-element` warnings remain in unrelated dynamic image/camera surfaces.

## Follow-up polish

- P3: a later typography pass could standardize a few remaining 8-10 px legacy microcopy sizes, but this does not block usability or fidelity at the tested viewports.

## Implementation checklist

- [x] Reflow verified from 320 px.
- [x] Tablet/sidebar boundary verified at 1121 px.
- [x] Desktop editor and preview verified at 1440 px.
- [x] Core mobile interactions exercised.
- [x] Hydration and console checked after a clean server restart.
- [x] Institutional PDF integrity tests preserved.

final result: passed
