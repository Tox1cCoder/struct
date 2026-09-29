# Foundation Priority Geometric Join — Design

**Date:** 2026-09-29
**Status:** Approved to implement ("okay continue for me", 2026-09-29)

## Problem

The Foundation Priority tab gives different, often wrong, answers for the same two PDFs and takes about 120 s.

Root causes found on `Left.pdf` (認定柱脚資料) and `Right.pdf` (基礎伏図):

1. **Wrong reference answer.** `tests/fixtures/foundationPriorityLeftRight.ts` disagrees with the drawings on 8 of 15 rows (F1B, F2, F2A, F4, F6, F7, F8, F9). The recorded "10/13" and "11/13" accuracy was measured against it.
2. **Multi-hop vision matching.** `extractJoinedFoundationPriorityPlanData` sends four hard-coded quadrant crop pairs (tuned to this one sample) to Gemini. For each footing, Gemini has to find the F label, read its grid position, find that position in the other image and read a code there. Sampling is non-deterministic, and results from overlapping quadrants are combined, so one wrong code survives.
3. **Grid labels differ between documents.** The certified map prints `X2A`; the plan prints `X2C` for the same line. The prompt says to match by grid labels.
4. **Combined footings.** F6, F7 and F8 each cover two grid intersections. The prompt treats each footing as one X/Y position.
5. **Upload order.** The joint path runs only if 認定柱脚資料 was uploaded before 基礎伏図.

## What the PDFs allow

Both files are vector drawings.

- **Plan:** every F/FC label and grid label is native text. Footings are stroked closed rectangles (0.48 pt in this sample).
- **Certified map (page 1):** 76 filled colour markers and all grid lines are vector shapes. Labels and grid labels are outlined glyphs with no text layer. C1/C2/C3 share one green and C5/C6 share one red, so colour alone cannot identify a code.
- **Registration:** both sheets have 9 X and 10 Y grid lines with proportional spacing (ratio about 1.9 on every interval), so they can be aligned by line order.

## Decisions

- **D1:** Every code whose marker lies inside a footing is listed for that footing (F8: C3, C1). This is the default the user accepted by saying to continue without answering.
- **D2:** P1/P2 posts inside a footing count (F6: C1, C3, P1). This default was also accepted by the user continuing without answering.
- **D3:** A footing carrying an FC label reports the FC code instead of the certified codes inside it. This is the FR-005 rule applied per footing.
- **D4:** Grids are matched by line order after a spacing fit, never by label text.
- **D5:** Gemini is used only to read marker labels from high-resolution crops, in one batched request.

## Verified expected output (Left.pdf + Right.pdf)

Verified by a 600-dpi visual read and, independently, by a vector-geometry prototype. Both agree:

```text
F1: C4, C1, C2
F1A: FC1
F1B: C3
F2: C1, P2
F2A: C6
F3: C5
F3A: C1
F4: P1, P2
F5: C3
F6: C1, C3, P1
F7: C3, C1, P1
F8: C3, C1
F9: P1
F9A: FC1
F10: C1
```

Code order within a row is not significant. 26 P1 posts sit on grade beams outside every footing and are correctly excluded.

## Architecture

```text
基礎伏図 file ──► extractFoundationPlanGeometry ──► FoundationPlanGeometry (no Gemini)
                                                     grid lines + names, footings + labels + FC
認定柱脚資料 file ─► extractCertifiedPlacementMap ──► CertifiedPlacementMap
                                                     grid-line candidates, markers + OCR codes
App (useMemo, whenever both exist, any order)
   joinFoundationPriorityGeometry(plan, certified) ──► certified rows + plan rows (shared locationKey)
   buildFoundationPriorityText(...)                 ──► existing editable rows, evidence, viewer
```

### Units

| Unit | Responsibility |
| --- | --- |
| `utils/pdfPageGeometry.ts` | Walk one pdfjs page's operator list and text content. Return display-space text boxes, stroked axis-aligned segments, and closed axis-aligned rectangles with stroke width and fill colour. Pure given a page proxy and the `OPS` table. |
| `utils/priorityGridRegistration.ts` | Cluster grid-line candidates. Fit plan grid positions onto certified candidates by order and spacing. Build per-axis piecewise-linear mappers. |
| `utils/foundationPlanGeometry.ts` | From plan page geometry, derive named grid lines (label centres snapped to nearby vector lines), footings (dominant-stroke rectangles, unique nearest assignment to F labels), and FC codes per footing. |
| `utils/certifiedPlacementMap.ts` | From certified page geometry, derive colour markers inside the grid area and grid-line candidates. |
| `utils/foundationPriorityGeometryJoin.ts` | Register grids, snap each marker's column anchor to grid lines that pass through it, map it into plan space, and assign it to the smallest containing footing. Emit merge rows and warnings. Also emit plan-only locator rows when the certified side has no placement map. |
| `services/foundationPriorityGeometry.ts` | Browser orchestration: load PDF, build geometry, render marker crops, call the OCR request, and record diagnostics. |
| `services/geminiService.ts` | New `readCertifiedMarkerCodes` OCR request. Remove the quadrant joint pipeline. |
| `utils/mergeFoundationPriority.ts` | Match on optional `locationKey` when present, otherwise on X/Y as before. |
| `App.tsx` | Each upload runs its own extractor, falling back to the legacy Gemini extractor when geometry is unavailable. The join runs in `useMemo` against the most recent certified placement map. |

### Marker anchor rule

A marker box surrounds its column symbol and label. For each axis, if exactly one registered grid line crosses the box, the anchor snaps to it. If several cross it, the anchor snaps to the one nearest the box centre. If none cross it, the anchor is the box centre on that axis.

### Checks and failure handling

| Condition | Behaviour |
| --- | --- |
| Plan has no grid labels or no footing assigned to any F label | Plan falls back to the legacy Gemini extractor (warning shown). |
| Certified page has no colour markers or no grid candidates | Certified falls back to the legacy Gemini extractor (warning shown). |
| Grid registration fails (no order/spacing fit) | Join emits only FC rows plus a warning that names the failed axis. |
| OCR misses or returns an invalid code for a marker | One retry for those markers. Remaining ones are left unread and the affected foundations are named in a warning. |
| F label with no marker and no FC | Listed in the warning as unresolved. |

## Testing

- Unit tests for each pure unit with synthetic geometry. They cover edge cases: double grid lines, extra dimension lines, grid-count mismatch, nested FC squares, markers straddling two lines, and missing OCR codes.
- A golden test in the Node environment that runs the real pipeline on `Left.pdf` and `Right.pdf` through pdfjs, with OCR stubbed from the verified label reads (keyed by colour and grid position). It asserts the table above.
- The existing suite stays green. The obsolete joint-pipeline tests are removed with the code.

## Amendments during implementation (2026-09-29)

- **Markers are annotations.** The 認定柱脚資料 colour markers are PDF Square markup annotations. The page walker handles `beginAnnotation`/`endAnnotation` as pdfjs does, starting from the base transform. Without this, the page content's leftover CTM put every marker at the page corner.
- **Embedded labels replace most OCR (changes D5).** AutoCAD exports its stroke-font text as invisible "AutoCAD SHX Text" Square annotations that carry the characters. Page geometry returns them as text, and a marker takes its code from the one code-like text centred inside it. Gemini reads only the markers without one: 3 of 76 on the sample (the C2 labels).
- **Joint grid alignment (after review).** Each axis lists every fit that lands all plan lines on candidates, scored by RMS error in plan points (certified-point error favoured small-scale fits such as title-block rules). `alignGrids` pairs X and Y fits that agree on scale within 3% and cover at least half the markers. It ranks pairs by how many certified grid labels match plan names, then by error. When a materially different alignment scores within 2x of the best with the same name count (for example equal bays with an end label missing), it refuses with a warning instead of guessing, since a one-bay shift would silently move every code to its neighbour.
- **Certified grid labels.** The placement map keeps the certified sheet's own grid labels (native or SHX text). They break alignment ties, pick the placement page over catalog pages with coloured table cells, and key certified rows by printed label when the plan was read by the Gemini fallback. That last path warns that labels spelled differently on the two sheets will not match.
- **Plan labels.** Grid labels are read per row of bubbles, starting from the widest row, so a key plan repeating labels elsewhere is ignored. A label reaches a footing only within 12 text sizes (the F9A leader label is 10). Native and SHX duplicates count once. Footing outlines left without a label are reported when certified markers fall inside them.
- **Near-edge warning.** Post markers are anchored at their box centre, which on the sample sits about 2 pt right of the post symbol; the SHX label rectangles are too coarse to locate the symbol. Any marker within 1 pt of a footing edge is flagged. On the sample that is exactly one: the P1 post in F6, 0.32 pt inside.
- **Robustness.** A failed OCR retry keeps first-pass reads. ExtGState line widths are honoured. Footings with a white mask fill count. Unexpected reader errors are logged, not only folded into the fallback warning.
- **No snapping of plan grid labels to vector lines.** Beam and wall edges run within 1–2 pt of grid lines and pulled positions off the grid. The bubble label centre is the line position.
- **Lines must be drawn, not just aligned.** Clustering by extent alone made short marker-box edges and glyph strokes that line up down the page look like lines. That produced 97 X and 94 Y candidates about 3 pt apart, dense enough for almost any grid fit to find matches. A candidate now also needs a drawn length of at least half the minimum extent, and adjacent survivors within 1.5 pt merge as CAD double lines. On `Left.pdf` this leaves 11 X and 19 Y candidates: every grid line plus dimension and title-block lines, which the spacing fit skips.
- **Viewer fix.** The source viewer's flex row stretched the page wrapper to the pane height, so highlights on landscape pages were scaled wrongly. The wrapper now hugs the page (`items-start`).

## Out of scope

- Other markup conventions: outline-only or pastel (saturation under 60) markers, or boxes over 40 pt, are not detected. Coloured markup other than column markers inside the grid area is treated as a marker.
- A second FC label nearest an already-coded footing is ignored.
- Each OCR crop re-renders the page. That is fine for the 3 crops the sample needs; a certified sheet without SHX labels (76 crops) takes several seconds more.
- Rotated or mirrored certified sheets relative to the plan.
- Raster (scanned) drawings beyond the existing legacy fallback.
- Per-support FC override inside a multi-column footing (D3 applies per footing).
