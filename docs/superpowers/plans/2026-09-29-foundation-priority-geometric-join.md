# Foundation Priority Geometric Join Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Gemini quadrant-matching Priority pipeline with a deterministic vector-geometry join. Gemini is kept only for reading marker labels.

**Architecture:** Each PDF is reduced to page geometry (text boxes, segments, rectangles) from the pdfjs operator list. The plan side yields named grid lines and labelled footings. The certified side yields colour markers (codes read by one batched OCR request) and grid-line candidates. A pure join registers the grids by order and spacing, maps each marker into plan space, and assigns it to the footing that contains it.

**Tech Stack:** TypeScript, React 18, pdfjs-dist 4.8.69 (via react-pdf in the browser, legacy build in Node tests), @google/genai, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-29-foundation-priority-geometric-join-design.md`

**Execution note:** Executed natively in the session that wrote it. Tasks give exact interfaces and test cases; the implementation is written directly in the files.

## Global Constraints

- Functions ≤ 100 lines, cyclomatic complexity ≤ 8, ≤ 5 positional parameters, lines ≤ 100 chars.
- Zero warnings from `npx tsc --noEmit`, `npm test` and `npm run build`.
- Pure geometry units must not import `utils/pdfjsRuntime` (it pulls react-pdf); they take a page proxy and the `OPS` table as arguments.
- Codes are canonicalized by stripping apostrophes and uppercasing (`1'C1` → `1C1`). The existing merge strips numeric C prefixes for display.

## Review Focus

- A certified marker straddling two close grid lines (Y4/Y3 are 18 pt apart; the marker is 16.6 pt tall) must snap to the line nearest its centre. Pinned in Task 4.
- A label with a leader line placed farther from its footing than a neighbour's footing (F9A) must still get its own footing through unique assignment. Pinned in Task 3.
- Grid-line candidates that include non-grid long lines (dimension lines at x = 287/292 on the certified page) must not break registration. Pinned in Task 2.
- An OCR response missing some marker ids or returning junk must not produce a wrong code; those markers stay unread and are reported. Pinned in Task 5.
- The certified PDF uploaded after the plan must still produce the join (order independence). Pinned in Task 6.

---

### Task 1: Page geometry extraction

**Files:**
- Create: `utils/pdfPageGeometry.ts`
- Create: `utils/priorityLabels.ts` (move `classifyPriorityAnchor` here; `pdfTextAnchors.ts` re-exports it)
- Test: `utils/pdfPageGeometry.test.ts`

**Interfaces (Produces):**

```ts
export interface PageRect { x0: number; y0: number; x1: number; y1: number }   // types.ts
export type Rgb = [number, number, number];
export interface PageSegment { x0: number; y0: number; x1: number; y1: number; lineWidth: number }
export interface PageShapeRect { rect: PageRect; lineWidth: number; stroked: boolean; filled: boolean; fill?: Rgb }
export interface PageText { text: string; rect: PageRect }
export interface PdfPageGeometry {
  width: number; height: number;
  texts: PageText[]; segments: PageSegment[]; rects: PageShapeRect[];
}
export interface PdfPageLike { /* getViewport, getOperatorList, getTextContent */ }
export const extractPdfPageGeometry: (page: PdfPageLike, ops: Record<string, number>) => Promise<PdfPageGeometry>;
```

Tests use a fake page whose operator list contains: `save`/`transform`/`restore` nesting; a `rectangle` op filled with `setFillRGBColor(255,0,255)`; a closed `moveTo`+4×`lineTo` quad stroked at width 0.48; a stroked two-point line; the viewport transform `[0,-1,-1,0,842,595]` (rotated page). Assert display-space rectangles, fill colour, stroke width, and that `endPath` paints nothing.

### Task 2: Grid registration

**Files:** Create `utils/priorityGridRegistration.ts`, Test `utils/priorityGridRegistration.test.ts`

```ts
export const clusterLinePositions: (
  segments: PageSegment[], orientation: 'vertical' | 'horizontal', minExtent: number,
) => number[];
export const registerGridAxis: (planPositions: number[], candidates: number[]) => number[] | null;
export const createAxisMapper: (from: number[], to: number[]) => (value: number) => number;
```

Tests:
- Dash segments on the same x merge.
- Double lines 0.7 pt apart merge into one.
- Short segments are rejected.
- Registration succeeds when candidates hold extra lines.
- Registration returns `null` when the counts can't fit.
- The mapper interpolates between knots and extrapolates past the ends.

### Task 3: Plan geometry

**Files:** Create `utils/foundationPlanGeometry.ts`, Test `utils/foundationPlanGeometry.test.ts`

```ts
export interface PlanGridLine { name: string; position: number }                 // types.ts
export interface PlanFooting { id: string; label: string; rect: PageRect; fcCode?: string }
export interface FoundationPlanGeometry {
  page: number; pageWidth: number; pageHeight: number;
  gridX: PlanGridLine[]; gridY: PlanGridLine[];
  footings: PlanFooting[]; unassignedLabels: string[];
}
export const buildFoundationPlanGeometry: (geometry: PdfPageGeometry, page: number) => FoundationPlanGeometry;
```

Tests:
- Grid lines come from `X\d+`/`Y\d+` text centres, averaged per name and snapped to a long vector line within 2 pt.
- Only rectangles with the dominant stroke width are footings.
- Unique greedy assignment gives a leader-offset label (F9A) the remaining box.
- An FC label inside or beside a footing sets `fcCode`.
- A label with no rectangle lands in `unassignedLabels`.

### Task 4: Certified placement map and join

**Files:** Create `utils/certifiedPlacementMap.ts`, `utils/foundationPriorityGeometryJoin.ts`; modify `utils/mergeFoundationPriority.ts` (use `locationKey`) and `types.ts`. Tests: `utils/certifiedPlacementMap.test.ts`, `utils/foundationPriorityGeometryJoin.test.ts`, `utils/mergeFoundationPriority.test.ts`.

```ts
export interface CertifiedMarker { id: string; rect: PageRect; fill: Rgb; code: string }  // types.ts
export interface CertifiedPlacementMap {
  page: number; pageWidth: number; pageHeight: number;
  gridCandidates: { x: number[]; y: number[] }; markers: CertifiedMarker[];
}
export const buildCertifiedPlacementMap: (geometry: PdfPageGeometry, page: number) => CertifiedPlacementMap;
export interface PriorityGeometryJoinResult {
  certifiedRows: CertifiedCoordinateData[]; planRows: FoundationPlanCoordinateData[]; warnings: string[];
}
export const joinFoundationPriorityGeometry: (
  plan: FoundationPlanGeometry, certified: CertifiedPlacementMap, keyPrefix: string,
) => PriorityGeometryJoinResult;
export const planLocatorRows: (plan: FoundationPlanGeometry) => FoundationPlanCoordinateData[];
```

`CertifiedCoordinateData` and `FoundationPlanCoordinateData` gain `locationKey?: string`. `CertifiedCoordinateFileResult` gains `placementMap?`; `FoundationPlanCoordinateFileResult` gains `geometry?`.

Tests:
- Colour fills inside the grid area become markers; black fills and legend cells outside it are skipped; duplicate rects are dropped.
- Join cases: an on-grid marker lands in the footing at the mapped intersection; a between-grid P1 lands in a small footing; a marker on a grade beam (no footing) is excluded; the FC footing reports FC; a combined footing lists both codes; a registration failure yields FC-only rows plus a warning; an unread code is reported in a warning; a marker box crossing two lines snaps to the nearer one.
- Merge: rows with matching `locationKey` resolve as `certified-fallback` with both evidence sides, and two markers sharing X/Y tokens stay distinct.

### Task 5: Browser orchestration and OCR

**Files:**
- Create: `services/foundationPriorityGeometry.ts`
- Modify: `services/geminiService.ts` (add `readCertifiedMarkerCodes`; delete `extractJoinedFoundationPriorityPlanData`, `JOINT_PRIORITY_REGIONS`, `joinedPriorityResponseSchema`)
- Modify: `services/geminiRequestPolicy.ts` (add `selectMarkerOcrRequestPolicy`)
- Modify: `utils/pdfAnchorCrop.ts` (replace `renderPdfRegionCrops` with `renderPdfPageRegions(file, page, rects, scale)` in points)
- Tests: `services/geminiService.test.ts` or a new `services/markerOcr.test.ts`, plus update `services/geminiPriorityTransport.test.ts`

```ts
export interface MarkerCrop { id: string; data: string; mimeType: 'image/png' }
export const readCertifiedMarkerCodes: (crops: MarkerCrop[]) => Promise<Map<string, string>>;
export const extractFoundationPlanGeometry: (file: File) =>
  Promise<{ geometry: FoundationPlanGeometry; diagnostics: PriorityPipelineDiagnostics }>;
export const extractCertifiedPlacementMap: (file: File) =>
  Promise<{ placementMap: CertifiedPlacementMap; diagnostics: PriorityPipelineDiagnostics }>;
```

OCR tests mock `@google/genai`:
- One request carries one labelled image per marker.
- Codes are canonicalized.
- Invalid or missing ids trigger exactly one retry, limited to those ids.
- Ids still missing after the retry are absent from the map.

### Task 6: App wiring

**Files:** Modify `App.tsx`, `components/App.test.tsx`

- Certified upload: `extractCertifiedPlacementMap`, falling back to `extractCertifiedCoordinateData`.
- Plan upload: `extractFoundationPlanGeometry`, falling back to `extractFoundationPlanCoordinateData`.
- Delete `latestCertifiedPriorityFile`.
- A `useMemo` joins every successful plan geometry with the most recent certified placement map. Plan geometry without a map yields `planLocatorRows`. Join warnings show on the plan file's status line.
- The rule banner text describes geometric matching.
- Test: certified uploaded after plan still yields merged codes (services mocked).

### Task 7: Golden test on the real PDFs, fixture, docs

**Files:**
- Modify: `tests/fixtures/foundationPriorityLeftRight.ts` (verified table)
- Create: `utils/foundationPriorityGeometryGolden.test.ts` (`// @vitest-environment node`, pdfjs legacy build, OCR stubbed from verified reads keyed by colour and grid position)
- Modify: `utils/foundationPriorityGolden.test.ts`
- Modify: `docs/validation/foundation-priority-left-right.md`

The golden test asserts exact codes per foundation. It must fail when any single marker read changes, which is checked by mutating one stub entry once.
