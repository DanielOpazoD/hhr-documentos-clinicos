# Design QA · Documentos

## PR10 · Editor compacto

- Source visual truth: `browser://annotations/current-task/comments-1-6` (capturas entregadas por el usuario, viewport 1117 × 786).
- Implementation screenshot: `/tmp/hhr-documentos-desktop-viewport-after.png`.
- Responsive screenshot: `/tmp/hhr-documentos-mobile-after.png`.
- Viewports: 1117 × 786 desktop and 390 × 844 mobile.
- State: new unsaved clinical document, editor visible, library closed, global font size 16.

### Preserved evidence

- The former document-library column is gone and the clinical workspace uses the available width without horizontal overflow.
- “Documentos”, “Nuevo documento”, “Recientes” and the primary actions share the compact workspace header.
- Both section-title textareas remain compact instead of inheriting the global textarea minimum.
- The date aligns to the paper's right content edge while the medical signer remains independently centered.
- Existing application and clinical-paper typography, neutral/cyan/navy/yellow tokens, logo, signature, and stamp behavior remain intact.

## PR11 · Clinical print preflight

- Desktop evidence: [preflight at 1440 × 900](docs/qa/pr11/preflight-desktop.jpg).
- Mobile evidence: [preflight at 390 × 844](docs/qa/pr11/preflight-mobile.jpg).
- Viewports: 1440 × 900 px and 390 × 844 px.
- State: saved draft with no clinical blockers and six explicitly acceptable warnings.

### Visual and responsive result

- The preflight reuses the existing print action and semantic button styles instead of adding a permanent workflow or a second toolbar.
- The proposed sticky toolbar and collapsible identity panels were removed; the current document editor remains the sole visual authority.
- Desktop keeps the document visible below a compact, full-width review surface.
- Mobile presents the same issues in one column, keeps the acceptance action reachable, and has no horizontal overflow (`clientWidth = scrollWidth = 390`).
- The existing spacing, radii, typography and teal/yellow identity remain intact.

### Interaction and runtime evidence

- A blank document reports three blockers and five warnings; no print acceptance action is exposed while blockers remain.
- Selecting the patient-name issue focuses `#patient-first-names`.
- Selecting the signature warning opens and focuses `#signature-settings-panel` on mobile.
- Closing the preflight restores focus to the original “Imprimir” button.
- The preflight blocks printing with missing essential data and accepts non-blocking warnings explicitly.
- Pending edits are saved before readiness is re-evaluated; the resulting document URL and content survive a reload.
- Browser console after local migrations: no errors or warnings.
- Framework overlay: none detected.

### Bundle evidence

- Projected rebased baseline: `723249 / 715000` bytes.
- Final client JS/CSS: `710318 / 715000` bytes.
- Margin: 4682 bytes without changing the budget.
- Duplicate preflight styling was consolidated and the unused Tailwind runtime import was removed after confirming the application uses its existing semantic CSS classes.

final result: passed
