# Gemini PDF Accuracy and Latency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route PDF extraction through Gemini 3.1 Pro Preview, add native PDF spatial anchors and coverage-driven targeted retries, and lower Foundation Priority latency without hiding incomplete results.

**Architecture:** Keep task prompts separate from centralized request policies. Prepare each Foundation Priority PDF once, extract a compact native-text anchor inventory with PDF.js, run a balanced Pro primary request, validate returned rows against expected foundation coverage, and use a high-thinking targeted pass only for missing evidence. Preserve the existing merge and viewer contracts while extending diagnostics so partial coverage is visible.

**Tech Stack:** React 18, TypeScript 5.5, Vite 5, Vitest 4, `@google/genai` 1.34, `react-pdf` 9, `pdfjs-dist` 4.8.

## Global Constraints

- PDF model: exactly `gemini-3.1-pro-preview`.
- Column image model: retain `gemini-3-flash-preview`.
- Frame image model: retain `gemini-3.6-flash`.
- Primary PDF policy: `MEDIUM` thinking, `MEDIA_RESOLUTION_MEDIUM`, one candidate, Gemini sampling defaults.
- Targeted PDF policy: `HIGH` thinking, `MEDIA_RESOLUTION_MEDIUM`; only high-resolution image crops use `MEDIA_RESOLUTION_HIGH`.
- Continue sending PDFs of 12 MiB or less inline; use the Files API only above the existing threshold.
- Classify foundation prefixes with `^F(?:K?\d+[A-Z]?)(?=$|[（(])`; classify `FC` first and exclude `FG`, `FW`, and `FWS`.
- Normalize certified labels such as `1'C1` to canonical `1C1` without losing the numeric prefix.
- Do not add an OCR service, server backend, global cache, or new package.
- Never log API keys, PDF bytes, or complete model responses.
- Add behavior test-first: observe the focused test fail for the intended reason before changing production code.
- Preserve the user's untracked Japanese-named PDF files; use the tracked `Left.pdf` and `Right.pdf` fixtures in automated checks.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `services/geminiRequestPolicy.ts` | Central model/thinking/media policy for PDF and image extraction. |
| `services/geminiRequestPolicy.test.ts` | Locks MIME-aware model routing and pass configuration. |
| `utils/pdfjsRuntime.ts` | Shared PDF.js instance and worker configuration. |
| `utils/pdfTextAnchors.ts` | Reads native PDF text, classifies task anchors, normalizes boxes, and serializes the compact manifest. |
| `utils/pdfTextAnchors.test.ts` | Covers foundation/axis/code classification, rotation-safe boxes, deduplication, and the tracked plan fixture. |
| `utils/foundationPriorityCoverage.ts` | Computes expected/returned/missing coverage and targeted retry reasons. |
| `utils/foundationPriorityCoverage.test.ts` | Covers partial, complete, scanned, and unresolved plan results. |
| `utils/pdfAnchorCrop.ts` | Calculates crop bounds and renders unresolved anchor regions on demand. |
| `utils/pdfAnchorCrop.test.ts` | Locks the 10%-per-side margin, 20% minimum size, and page clamping. |
| `tests/fixtures/foundationPriorityLeftRight.ts` | Human-reviewed expected foundation rows, codes, methods, and source pages. |
| `utils/foundationPriorityGolden.test.ts` | Validates golden fixture completeness and canonical code format. |
| `utils/foundationPriorityGeminiConfig.ts` | Uses centralized policies and builds per-pass generation config. |
| `services/geminiService.ts` | Orchestrates preparation, primary calls, validation, targeted retries, merging, and Column PDF routing. |
| `services/geminiPriorityTransport.test.ts` | Verifies inline/upload transport, manifests, pass settings, and source reuse. |
| `services/geminiService.test.ts` | Locks Column PDF versus image request routing and stable Frame routing. |
| `utils/coordinateExtraction.ts` | Canonicalizes certified codes without losing source prefixes. |
| `types.ts` | Adds anchor, coverage, request, usage, and warning diagnostics types. |
| `utils/foundationPriorityDiagnostics.ts` | Immutable helpers for preprocessing, request, usage, coverage, warnings, and stage timing. |
| `components/StatusStrip.tsx` | Shows incomplete-coverage warnings and concise missing-label summaries. |
| `components/StatusStrip.test.tsx` | Verifies warning rendering without changing error/retry behavior. |
| `App.tsx` | Maps richer Priority diagnostics into the status strip. |
| `components/App.test.tsx` | Verifies partial success is visibly warned. |
| `components/viewer/pdfjsWorker.ts` | Re-exports shared PDF.js setup while retaining viewer style imports. |
| `docs/validation/foundation-priority-left-right.md` | Records reviewed ground truth and two-run live accuracy/latency results. |

---

### Task 1: Lock the reviewed Left/Right ground truth

**Files:**
- Create: `tests/fixtures/foundationPriorityLeftRight.ts`
- Create: `utils/foundationPriorityGolden.test.ts`
- Modify: `docs/validation/foundation-priority-left-right.md`

**Interfaces:**
- Produces: `EXPECTED_FOUNDATION_LABELS: readonly string[]`
- Produces: `EXPECTED_PRIORITY_ROWS: readonly ExpectedPriorityFixtureRow[]`
- Produces: `ExpectedPriorityFixtureRow` with `foundation`, `codes`, `methods`, `planPages`, `certifiedPages`, and optional `unresolvedReason`.

- [ ] **Step 1: Render and review the tracked fixtures**

Render `Right.pdf` page 1 and `Left.pdf` page 1 at 300 DPI. Review every unique plan label and each corresponding certified/plan code. Do not use current Gemini output as ground truth. The reviewed foundation inventory must contain exactly:

```ts
export const EXPECTED_FOUNDATION_LABELS = [
  'F1', 'F1A', 'F1B', 'F2', 'F2A', 'F3', 'F3A', 'F4',
  'F5', 'F6', 'F7', 'F8', 'F9', 'F9A', 'F10',
] as const;
```

For each label, record every distinct final code after applying the existing priority rule: visible plan `FC...` first; otherwise the canonical certified code at the matching coordinate. Canonicalize the source legend's `1'C1` through `1'C6` as `1C1` through `1C6`.

- [ ] **Step 2: Write the failing fixture-contract test**

```ts
import { describe, expect, it } from 'vitest';
import {
  EXPECTED_FOUNDATION_LABELS,
  EXPECTED_PRIORITY_ROWS,
} from '../tests/fixtures/foundationPriorityLeftRight';

describe('Left/Right Foundation Priority golden fixture', () => {
  it('contains one reviewed entry for every visible foundation label', () => {
    expect(EXPECTED_PRIORITY_ROWS.map((row) => row.foundation).sort()).toEqual(
      [...EXPECTED_FOUNDATION_LABELS].sort(),
    );
    for (const row of EXPECTED_PRIORITY_ROWS) {
      expect(row.codes.length > 0 || row.unresolvedReason).toBeTruthy();
      expect(row.codes.every((code) => /^(?:FC[A-Z0-9]+|\d*C[A-Z0-9]+|\d*P[A-Z0-9]+)$/.test(code))).toBe(true);
      expect(row.planPages).toContain(1);
    }
  });
});
```

- [ ] **Step 3: Run the test and verify the fixture module is missing**

Run: `npm test -- --run utils/foundationPriorityGolden.test.ts`

Expected: FAIL because `tests/fixtures/foundationPriorityLeftRight.ts` does not exist.

- [ ] **Step 4: Add the reviewed fixture**

Use this exact type and populate all 15 reviewed rows from Step 1:

```ts
export interface ExpectedPriorityFixtureRow {
  foundation: string;
  codes: string[];
  methods: Array<'plan-fc' | 'certified-fallback'>;
  planPages: number[];
  certifiedPages: number[];
  unresolvedReason?: string;
}

export const EXPECTED_FOUNDATION_LABELS = [
  'F1', 'F1A', 'F1B', 'F2', 'F2A', 'F3', 'F3A', 'F4',
  'F5', 'F6', 'F7', 'F8', 'F9', 'F9A', 'F10',
] as const;
```

In the same module, define `EXPECTED_PRIORITY_ROWS: readonly ExpectedPriorityFixtureRow[]` with the 15 source-reviewed rows in natural foundation order. Replace the scaffold's “Reviewed Expected Output” and evidence table with the same reviewed values. The source review is the implementation of this data task; no model call supplies these values.

- [ ] **Step 5: Run the fixture test**

Run: `npm test -- --run utils/foundationPriorityGolden.test.ts`

Expected: PASS with 15 unique foundations and no noncanonical apostrophe-bearing codes.

- [ ] **Step 6: Commit**

```powershell
git add -- tests/fixtures/foundationPriorityLeftRight.ts utils/foundationPriorityGolden.test.ts docs/validation/foundation-priority-left-right.md
git commit -m "test: add reviewed foundation priority fixture"
```

---

### Task 2: Centralize MIME-aware Gemini request policies

**Files:**
- Create: `services/geminiRequestPolicy.ts`
- Create: `services/geminiRequestPolicy.test.ts`
- Modify: `utils/foundationPriorityGeminiConfig.ts`
- Modify: `utils/foundationPriorityGeminiConfig.test.ts`
- Modify: `services/geminiService.ts`

**Interfaces:**
- Produces: `PDF_DOCUMENT_MODEL`, `COLUMN_IMAGE_MODEL`, `FRAME_IMAGE_MODEL`.
- Produces: `selectColumnRequestPolicy(mimeType: string): GeminiRequestPolicy`.
- Produces: `selectPriorityRequestPolicy(pass: 'primary' | 'escalated'): GeminiRequestPolicy`.
- Consumed by: Tasks 6 and 7.

- [ ] **Step 1: Write failing routing tests**

```ts
import { PartMediaResolutionLevel, ThinkingLevel } from '@google/genai';
import { describe, expect, it } from 'vitest';
import {
  FRAME_IMAGE_MODEL,
  selectColumnRequestPolicy,
  selectPriorityRequestPolicy,
} from './geminiRequestPolicy';

describe('Gemini request policies', () => {
  it('routes PDFs to balanced Gemini 3.1 Pro', () => {
    expect(selectColumnRequestPolicy('application/pdf')).toEqual({
      model: 'gemini-3.1-pro-preview',
      thinkingLevel: ThinkingLevel.MEDIUM,
      mediaResolution: PartMediaResolutionLevel.MEDIA_RESOLUTION_MEDIUM,
    });
  });

  it('keeps Column images and Frame images on Flash', () => {
    expect(selectColumnRequestPolicy('image/png')).toEqual({ model: 'gemini-3-flash-preview' });
    expect(FRAME_IMAGE_MODEL).toBe('gemini-3.6-flash');
  });

  it('uses high thinking but medium PDF media on targeted escalation', () => {
    expect(selectPriorityRequestPolicy('escalated')).toMatchObject({
      model: 'gemini-3.1-pro-preview',
      thinkingLevel: ThinkingLevel.HIGH,
      mediaResolution: PartMediaResolutionLevel.MEDIA_RESOLUTION_MEDIUM,
    });
  });
});
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npm test -- --run services/geminiRequestPolicy.test.ts utils/foundationPriorityGeminiConfig.test.ts services/geminiService.test.ts`

Expected: FAIL because the policy module is missing and the current Priority primary pass uses `HIGH` thinking.

- [ ] **Step 3: Implement the policy module**

```ts
import { PartMediaResolutionLevel, ThinkingLevel } from '@google/genai';

export const PDF_DOCUMENT_MODEL = 'gemini-3.1-pro-preview';
export const COLUMN_IMAGE_MODEL = 'gemini-3-flash-preview';
export const FRAME_IMAGE_MODEL = 'gemini-3.6-flash';

export interface GeminiRequestPolicy {
  model: string;
  thinkingLevel?: ThinkingLevel;
  mediaResolution?: PartMediaResolutionLevel;
}

export const selectColumnRequestPolicy = (mimeType: string): GeminiRequestPolicy =>
  mimeType === 'application/pdf'
    ? {
        model: PDF_DOCUMENT_MODEL,
        thinkingLevel: ThinkingLevel.MEDIUM,
        mediaResolution: PartMediaResolutionLevel.MEDIA_RESOLUTION_MEDIUM,
      }
    : { model: COLUMN_IMAGE_MODEL };

export const selectPriorityRequestPolicy = (
  pass: 'primary' | 'escalated',
): GeminiRequestPolicy => ({
  model: PDF_DOCUMENT_MODEL,
  thinkingLevel: pass === 'primary' ? ThinkingLevel.MEDIUM : ThinkingLevel.HIGH,
  mediaResolution: PartMediaResolutionLevel.MEDIA_RESOLUTION_MEDIUM,
});
```

Update `selectPriorityPass` to delegate to `selectPriorityRequestPolicy`. Export `FRAME_MODEL = FRAME_IMAGE_MODEL` from `geminiService.ts` so the existing public contract remains stable.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --run services/geminiRequestPolicy.test.ts utils/foundationPriorityGeminiConfig.test.ts services/geminiService.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- services/geminiRequestPolicy.ts services/geminiRequestPolicy.test.ts utils/foundationPriorityGeminiConfig.ts utils/foundationPriorityGeminiConfig.test.ts services/geminiService.ts services/geminiService.test.ts
git commit -m "refactor: centralize Gemini request policies"
```

---

### Task 3: Extract and serialize native PDF text anchors

**Files:**
- Create: `utils/pdfjsRuntime.ts`
- Create: `utils/pdfTextAnchors.ts`
- Create: `utils/pdfTextAnchors.test.ts`
- Modify: `components/viewer/pdfjsWorker.ts`

**Interfaces:**
- Produces: `PdfAnchorKind`, `PdfTextAnchor`, `PdfAnchorInventory`.
- Produces: `classifyPriorityAnchor(text: string)`.
- Produces: `buildPdfAnchorInventory(pages: PdfTextPage[]): PdfAnchorInventory`.
- Produces: `extractPriorityPdfAnchors(file: File): Promise<PdfAnchorInventory>`.
- Produces: `serializePriorityAnchorManifest(inventory: PdfAnchorInventory): string`.

- [ ] **Step 1: Write classifier and normalization tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  buildPdfAnchorInventory,
  classifyPriorityAnchor,
  serializePriorityAnchorManifest,
} from './pdfTextAnchors';

describe('PDF priority anchors', () => {
  it.each([
    ['F1', { kind: 'foundation', label: 'F1' }],
    ['F1A(設計GL-1,500)', { kind: 'foundation', label: 'F1A' }],
    ['FK1', { kind: 'foundation', label: 'FK1' }],
    ['FC1', { kind: 'plan-column', label: 'FC1' }],
    ["1'C3", { kind: 'certified-column', label: '1C3' }],
    ['X2C', { kind: 'x-axis', label: 'X2C' }],
    ['Y7A', { kind: 'y-axis', label: 'Y7A' }],
    ['FG1B', null],
    ['FW2', null],
    ['FWS1', null],
  ])('classifies %s', (text, expected) => {
    expect(classifyPriorityAnchor(text)).toEqual(expected);
  });

  it('deduplicates only the same normalized label at the same location', () => {
    const inventory = buildPdfAnchorInventory([{ page: 1, width: 100, height: 200, items: [
      { text: 'F1', x: 10, y: 20, width: 5, height: 4 },
      { text: 'F1', x: 10, y: 20, width: 5, height: 4 },
      { text: 'F1', x: 50, y: 80, width: 5, height: 4 },
    ] }]);
    expect(inventory.anchors).toHaveLength(2);
    expect(inventory.foundationLabels).toEqual(['F1']);
    expect(inventory.anchors[0].bbox).toEqual({ ymin: 100, xmin: 100, ymax: 120, xmax: 150 });
    expect(serializePriorityAnchorManifest(inventory)).toContain('F1');
  });
});
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `npm test -- --run utils/pdfTextAnchors.test.ts`

Expected: FAIL because the anchor module is missing.

- [ ] **Step 3: Add shared PDF.js setup**

Move worker assignment to `utils/pdfjsRuntime.ts`:

```ts
import { pdfjs } from 'react-pdf';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
export { pdfjs };
```

Keep the viewer's CSS imports in `components/viewer/pdfjsWorker.ts` and re-export the shared instance:

```ts
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
export { pdfjs } from '../../utils/pdfjsRuntime';
```

- [ ] **Step 4: Implement anchor extraction**

Use these public types:

```ts
export type PdfAnchorKind =
  | 'foundation'
  | 'plan-column'
  | 'certified-column'
  | 'x-axis'
  | 'y-axis';

export interface PdfTextAnchor {
  kind: PdfAnchorKind;
  label: string;
  sourceText: string;
  page: number;
  bbox: BoundingBox;
}

export interface PdfAnchorInventory {
  mode: 'native' | 'unavailable';
  anchors: PdfTextAnchor[];
  foundationLabels: string[];
  counts: Record<PdfAnchorKind, number>;
}

export interface PdfTextPageItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfTextPage {
  page: number;
  width: number;
  height: number;
  items: PdfTextPageItem[];
}
```

`extractPriorityPdfAnchors` must call `pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise`, read every page's `getTextContent()`, transform text-item bounds into the page viewport, and call the pure inventory builder. Catch parse/text failures and return an empty `mode: 'unavailable'` inventory.

- [ ] **Step 5: Add a tracked-fixture integration assertion**

Read `Right.pdf` in the test and assert that native extraction returns exactly the 15 labels from Task 1. If the jsdom PDF.js worker cannot load the fixture, keep the file-reading adapter behind an injected `loadPages` argument and test it with real page/text-item objects rather than weakening the pure classification assertion.

- [ ] **Step 6: Run anchor and viewer tests**

Run: `npm test -- --run utils/pdfTextAnchors.test.ts components/viewer/ViewerSidebar.test.tsx`

Expected: PASS with no PDF.js worker warning.

- [ ] **Step 7: Commit**

```powershell
git add -- utils/pdfjsRuntime.ts utils/pdfTextAnchors.ts utils/pdfTextAnchors.test.ts components/viewer/pdfjsWorker.ts
git commit -m "feat: extract native PDF priority anchors"
```

---

### Task 4: Add coverage evaluation and canonical certified codes

**Files:**
- Create: `utils/foundationPriorityCoverage.ts`
- Create: `utils/foundationPriorityCoverage.test.ts`
- Modify: `utils/coordinateExtraction.ts`
- Modify: `utils/coordinateExtraction.test.ts`

**Interfaces:**
- Consumes: `PdfAnchorInventory`, `FoundationPlanCoordinateData[]`.
- Produces: `PriorityCoverageResult`.
- Produces: `evaluateFoundationPlanCoverage(inventory, rows)`.
- Produces: `mergePriorityPlanRows(primary, targeted)`.

- [ ] **Step 1: Write failing code-normalization and coverage tests**

```ts
const inventoryWithFoundations = (labels: string[]): PdfAnchorInventory => ({
  mode: 'native',
  anchors: labels.map((label, index) => ({
    kind: 'foundation', label, sourceText: label, page: 1,
    bbox: { ymin: index * 10, xmin: 10, ymax: index * 10 + 5, xmax: 15 },
  })),
  foundationLabels: labels,
  counts: {
    foundation: labels.length,
    'plan-column': 0,
    'certified-column': 0,
    'x-axis': 0,
    'y-axis': 0,
  },
});

const planRow = (
  foundation: string,
  xAxis: string,
  yAxis: string,
  planColumnType: string,
): FoundationPlanCoordinateData => ({ foundation, xAxis, yAxis, planColumnType });

it('canonicalizes a certified apostrophe without dropping its numeric prefix', () => {
  expect(normalizeCertifiedCoordinateRows([
    { xAxis: 'X1', yAxis: 'Y1', columnType: "1'C1" },
  ])).toEqual([{ xAxis: 'X1', yAxis: 'Y1', columnType: '1C1' }]);
});

it('escalates partial plan output even when two FC1 rows exist', () => {
  const inventory = inventoryWithFoundations(['F1', 'F1A', 'F2', 'F3']);
  const result = evaluateFoundationPlanCoverage(inventory, [
    planRow('F1A', 'X6', 'Y8', 'FC1'),
    planRow('F1A', 'X6', 'Y9', 'FC1'),
  ]);
  expect(result.complete).toBe(false);
  expect(result.missingLabels).toEqual(['F1', 'F2', 'F3']);
  expect(result.reasons).toContain('missing-foundations');
});

it('accepts complete anchored coverage with a coordinate or direct code per row', () => {
  const inventory = inventoryWithFoundations(['F1', 'F2']);
  expect(evaluateFoundationPlanCoverage(inventory, [
    planRow('F1', 'X1', 'Y1', ''),
    planRow('F2', '', '', 'FC1'),
  ]).complete).toBe(true);
});
```

- [ ] **Step 2: Run tests and verify expected failures**

Run: `npm test -- --run utils/foundationPriorityCoverage.test.ts utils/coordinateExtraction.test.ts`

Expected: FAIL because coverage helpers are missing and `1'C1` is not canonicalized.

- [ ] **Step 3: Implement coverage and merge helpers**

```ts
export interface PriorityCoverageResult {
  complete: boolean;
  mode: 'anchored' | 'structural';
  expectedCount: number;
  returnedCount: number;
  coordinateCount: number;
  codeCount: number;
  missingLabels: string[];
  unresolvedLabels: string[];
  reasons: Array<'normalized-rows-empty' | 'missing-foundations' | 'no-readable-coordinates' | 'unresolved-foundations'>;
}
```

Anchored mode requires every expected label plus at least one coordinate-bearing or code-bearing row for each label. Structural mode requires at least one normalized row and at least one readable coordinate. `mergePriorityPlanRows` deduplicates by foundation/X/Y/code while preserving primary rows before targeted rows.

Canonicalize certified source apostrophes before validation with `value.replace(/[\'’]/g, '')`; do not remove digits.

- [ ] **Step 4: Run tests**

Run: `npm test -- --run utils/foundationPriorityCoverage.test.ts utils/coordinateExtraction.test.ts utils/mergeFoundationPriority.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- utils/foundationPriorityCoverage.ts utils/foundationPriorityCoverage.test.ts utils/coordinateExtraction.ts utils/coordinateExtraction.test.ts
git commit -m "feat: validate foundation extraction coverage"
```

---

### Task 5: Render targeted high-resolution anchor crops

**Files:**
- Create: `utils/pdfAnchorCrop.ts`
- Create: `utils/pdfAnchorCrop.test.ts`

**Interfaces:**
- Consumes: `File`, `PdfTextAnchor`.
- Produces: `calculateAnchorCropBox(anchorBox, pageWidth, pageHeight): BoundingBox`.
- Produces: `renderPdfAnchorCrop(file, anchor): Promise<{ data: string; mimeType: 'image/png' }>`.

- [ ] **Step 1: Write failing crop-geometry tests**

```ts
it('adds a 10-percent page margin and clamps to the page', () => {
  expect(calculateAnchorCropBox(
    { ymin: 20, xmin: 10, ymax: 40, xmax: 30 },
    1000,
    1000,
  )).toEqual({ ymin: 0, xmin: 0, ymax: 220, xmax: 220 });
});

it('enforces a 20-percent minimum crop around a tiny label', () => {
  const crop = calculateAnchorCropBox(
    { ymin: 490, xmin: 490, ymax: 510, xmax: 510 },
    1000,
    1000,
  );
  expect(crop.xmax - crop.xmin).toBeGreaterThanOrEqual(200);
  expect(crop.ymax - crop.ymin).toBeGreaterThanOrEqual(200);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --run utils/pdfAnchorCrop.test.ts`

Expected: FAIL because the crop module is missing.

- [ ] **Step 3: Implement crop calculation and rendering**

Use the shared PDF.js runtime. Render only `anchor.page` at 2x viewport scale, map the normalized 0-1000 crop to pixels, draw that rectangle onto a second canvas, and return the PNG base64 payload without its data-URL prefix. Throw an error naming the page when canvas context or PDF rendering fails; the orchestration layer will continue without a crop.

- [ ] **Step 4: Run tests**

Run: `npm test -- --run utils/pdfAnchorCrop.test.ts utils/pdfTextAnchors.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- utils/pdfAnchorCrop.ts utils/pdfAnchorCrop.test.ts
git commit -m "feat: render targeted PDF anchor crops"
```

---

### Task 6: Integrate preparation, manifests, and targeted Priority escalation

**Files:**
- Modify: `services/geminiService.ts`
- Modify: `services/geminiPriorityTransport.test.ts`
- Modify: `utils/foundationPriorityGeminiConfig.ts`
- Modify: `utils/foundationPriorityGeminiConfig.test.ts`
- Modify: `types.ts`

**Interfaces:**
- Consumes: `extractPriorityPdfAnchors`, `serializePriorityAnchorManifest`, `evaluateFoundationPlanCoverage`, `mergePriorityPlanRows`, `renderPdfAnchorCrop`, request policies.
- Preserves: `extractCertifiedCoordinateData(file)` and `extractFoundationPlanCoordinateData(file)` return `{ data, diagnostics }`.
- Extends: `PriorityPipelineDiagnostics` with preprocessing, request, anchor, coverage, crop, usage, and warning information.

- [ ] **Step 1: Add failing orchestration tests**

Mock only external Gemini transport and PDF rendering. Define `planPdf` as a 116,249-byte-reported PDF using the existing `fileOfSize` helper, define `planRow` with the exact `FoundationPlanCoordinateData` signature from Task 4, and define the unavailable inventory as:

```ts
const unavailableAnchorInventory = (): PdfAnchorInventory => ({
  mode: 'unavailable',
  anchors: [],
  foundationLabels: [],
  counts: {
    foundation: 0,
    'plan-column': 0,
    'certified-column': 0,
    'x-axis': 0,
    'y-axis': 0,
  },
});
```

Add tests proving:

```ts
it('sends the PDF once with a compact anchor manifest', async () => {
  await extractFoundationPlanCoordinateData(planPdf());
  expect(generateContent).toHaveBeenCalledTimes(1);
  expect(generateContent.mock.calls[0][0].contents[1]).toContain('NATIVE PDF ANCHORS');
  expect(generateContent.mock.calls[0][0].config.thinkingConfig.thinkingLevel).toBe('MEDIUM');
});

it('targets missing foundations even when primary returned FC1', async () => {
  generateContent
    .mockResolvedValueOnce({ text: JSON.stringify([planRow('F1A', 'X6', 'Y8', 'FC1')]) })
    .mockResolvedValueOnce({ text: JSON.stringify([
      planRow('F1', 'X4', 'Y2', ''),
      planRow('F2', 'X2', 'Y5', ''),
    ]) });
  const result = await extractFoundationPlanCoordinateData(planPdf());
  expect(generateContent).toHaveBeenCalledTimes(2);
  expect(generateContent.mock.calls[1][0].contents.at(-1)).toContain('F1, F2');
  expect(result.data.map((row) => row.foundation)).toEqual(['F1A', 'F1', 'F2']);
  expect(result.diagnostics.passUsed).toBe('escalated');
});

it('returns valid primary rows with an explicit warning when targeting fails', async () => {
  generateContent
    .mockResolvedValueOnce({ text: JSON.stringify([planRow('F1A', 'X6', 'Y8', 'FC1')]) })
    .mockRejectedValueOnce(new Error('targeted request failed'));
  const result = await extractFoundationPlanCoordinateData(planPdf());
  expect(result.data).toHaveLength(1);
  expect(result.diagnostics.warning).toMatch(/incomplete/i);
  expect(result.diagnostics.coverage?.missingLabels.length).toBeGreaterThan(0);
});

it('continues vision-only when native anchor extraction is unavailable', async () => {
  extractPriorityPdfAnchors.mockResolvedValue(unavailableAnchorInventory());
  const result = await extractFoundationPlanCoordinateData(planPdf());
  expect(result.diagnostics.anchorMode).toBe('unavailable');
  expect(result.data.length).toBeGreaterThan(0);
});

it('surfaces a primary model failure instead of calling it escalation', async () => {
  generateContent.mockRejectedValueOnce(new Error('primary request failed'));
  await expect(extractFoundationPlanCoordinateData(planPdf())).rejects.toThrow('primary request failed');
  expect(generateContent).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --run services/geminiPriorityTransport.test.ts utils/foundationPriorityGeminiConfig.test.ts`

Expected: FAIL because preparation, manifests, coverage diagnostics, and targeted merging are not integrated.

- [ ] **Step 3: Prepare each Priority PDF once**

Extend `PriorityPdfSource` to carry the anchor inventory and original file. In `withPriorityPdf`, run base64 preparation and anchor extraction concurrently with `Promise.all`. Record `preprocessMs` separately from existing transport preparation time. Reuse the same source for primary, targeted, and direct-mapping calls.

Extend diagnostics with this shape before wiring it into calls:

```ts
export interface PriorityUsageSummary {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  totalTokenCount?: number;
}

export interface PriorityCoverageDiagnostics {
  mode: 'anchored' | 'structural';
  expectedCount: number;
  returnedCount: number;
  coordinateCount: number;
  codeCount: number;
  missingLabels: string[];
  unresolvedLabels: string[];
}

export interface PriorityAnchorCounts {
  foundation: number;
  'plan-column': number;
  'certified-column': number;
  'x-axis': number;
  'y-axis': number;
}

// Add to PriorityPipelineDiagnostics:
model: string;
anchorMode: 'native' | 'unavailable';
anchorCounts: PriorityAnchorCounts;
coverage?: PriorityCoverageDiagnostics;
cropCount: number;
warning?: string;
usage?: { primary?: PriorityUsageSummary; escalated?: PriorityUsageSummary };
// Add preprocessMs to stages.
```

- [ ] **Step 4: Build pass-specific contents**

Keep the PDF part first. Append the serialized anchor manifest and task prompt as one text part. For a targeted pass, append the exact sorted missing-label list and only attach successfully rendered crops for those labels. Give crop parts `MEDIA_RESOLUTION_HIGH`; leave the PDF part at `MEDIA_RESOLUTION_MEDIUM`.

- [ ] **Step 5: Implement the plan extraction sequence**

```ts
primaryRaw -> normalize -> evaluate coverage
if complete: return primary
if incomplete: targeted call for missing/unresolved labels
merge primary + targeted -> normalize -> evaluate again
if no usable plan code: run existing direct-mapping prompt for unresolved labels only
return valid rows + diagnostics; warn if coverage remains incomplete
```

Certified extraction receives the anchor manifest but keeps its structural gate: at least one normalized X/Y/code row. Do not infer certified coordinate/code pairs from native text.

- [ ] **Step 6: Capture safe usage metadata**

Copy only `promptTokenCount`, `candidatesTokenCount`, `thoughtsTokenCount`, and `totalTokenCount` from `response.usageMetadata` into diagnostics for each pass. Never retain response text in diagnostics.

- [ ] **Step 7: Run Priority service tests**

Run: `npm test -- --run services/geminiPriorityTransport.test.ts utils/foundationPriorityGeminiConfig.test.ts utils/foundationPriorityCoverage.test.ts`

Expected: PASS, including the existing inline/upload behavior.

- [ ] **Step 8: Commit**

```powershell
git add -- services/geminiService.ts services/geminiPriorityTransport.test.ts utils/foundationPriorityGeminiConfig.ts utils/foundationPriorityGeminiConfig.test.ts types.ts
git commit -m "feat: add coverage-driven Priority retries"
```

---

### Task 7: Route Column PDFs to Pro without slowing images

**Files:**
- Modify: `services/geminiService.ts`
- Modify: `services/geminiService.test.ts`

**Interfaces:**
- Consumes: `selectColumnRequestPolicy(mimeType)`.
- Preserves: `extractDataFromPdf(base64Data, mimeType)` response and cleanup behavior.

- [ ] **Step 1: Write failing request-shape tests**

Mock `GoogleGenAI.models.generateContent` and assert:

```ts
it('uses Pro medium/medium for a Column PDF', async () => {
  await extractDataFromPdf('base64', 'application/pdf');
  const request = generateContent.mock.calls[0][0];
  expect(request.model).toBe('gemini-3.1-pro-preview');
  expect(request.contents.parts[0].mediaResolution).toEqual({ level: 'MEDIA_RESOLUTION_MEDIUM' });
  expect(request.config.thinkingConfig.thinkingLevel).toBe('MEDIUM');
});

it('keeps a Column image on Flash without PDF media settings', async () => {
  await extractDataFromPdf('base64', 'image/png');
  expect(generateContent.mock.calls[0][0].model).toBe('gemini-3-flash-preview');
  expect(generateContent.mock.calls[0][0].contents.parts[0]).not.toHaveProperty('mediaResolution');
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --run services/geminiService.test.ts`

Expected: PDF routing assertion FAIL because the function still hardcodes Flash.

- [ ] **Step 3: Apply the selected policy**

Use the selected model in `generateContent`, add media resolution to the inline media part only when present, and add `thinkingConfig` only when the policy supplies a thinking level. Leave schemas, prompts, parsing, cleanup, and error messages unchanged.

- [ ] **Step 4: Run tests**

Run: `npm test -- --run services/geminiService.test.ts services/geminiPriorityTransport.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- services/geminiService.ts services/geminiService.test.ts
git commit -m "feat: route Column PDFs to Gemini Pro"
```

---

### Task 8: Surface incomplete coverage and detailed diagnostics

**Files:**
- Modify: `types.ts`
- Modify: `utils/foundationPriorityDiagnostics.ts`
- Modify: `utils/foundationPriorityDiagnostics.test.ts`
- Modify: `components/StatusStrip.tsx`
- Create: `components/StatusStrip.test.tsx`
- Modify: `App.tsx`
- Modify: `components/App.test.tsx`

**Interfaces:**
- Consumes: extended `PriorityPipelineDiagnostics` from Task 6.
- Produces: StatusStrip input fields `warning?: string` and `missingLabels?: string[]`.

- [ ] **Step 1: Write failing diagnostics/UI tests**

```tsx
it('shows incomplete coverage separately from an extraction error', () => {
  render(<StatusStrip
    accent="cyan"
    results={[{
      id: 'right', fileName: 'Right.pdf', status: 'SUCCESS',
      durationMs: 80000, passUsed: 'escalated',
      warning: 'Incomplete coverage', missingLabels: ['F2', 'F3'],
    }]}
  />);
  expect(screen.getByText(/Incomplete coverage/)).toBeInTheDocument();
  expect(screen.getByText(/F2, F3/)).toBeInTheDocument();
  expect(screen.getByText('1 ok')).toBeInTheDocument();
});
```

Add an App test whose mocked plan result is `SUCCESS` with missing coverage and assert that the warning appears on the Priority tab.

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --run utils/foundationPriorityDiagnostics.test.ts components/StatusStrip.test.tsx components/App.test.tsx`

Expected: FAIL because the diagnostics helpers and StatusStrip do not expose warnings.

- [ ] **Step 3: Add immutable diagnostics helpers**

Add helpers with exact purposes:

```ts
recordPriorityRequest(diag, pass, policy)
recordPriorityAnchors(diag, inventory)
recordPriorityCoverage(diag, coverage)
recordPriorityUsage(diag, pass, usageMetadata)
addPriorityWarning(diag, warning)
incrementPriorityCropCount(diag, count)
```

Each returns a new diagnostics object and preserves previously recorded fields.

- [ ] **Step 4: Render concise warnings**

In StatusStrip, render a warning in amber for successful files. Show at most the first five missing labels followed by `+ N more`. Keep existing error, retry, remove, duration, and pass display unchanged.

- [ ] **Step 5: Map diagnostics in App**

When creating status results for certified and plan jobs, pass `diagnostics.warning` and `diagnostics.coverage?.missingLabels`. Do not change job status from `SUCCESS` to `ERROR` when valid partial rows exist.

- [ ] **Step 6: Run tests**

Run: `npm test -- --run utils/foundationPriorityDiagnostics.test.ts components/StatusStrip.test.tsx components/App.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add -- types.ts utils/foundationPriorityDiagnostics.ts utils/foundationPriorityDiagnostics.test.ts components/StatusStrip.tsx components/StatusStrip.test.tsx App.tsx components/App.test.tsx
git commit -m "feat: surface PDF coverage diagnostics"
```

---

### Task 9: Full verification and two-run live acceptance

**Files:**
- Modify: `docs/validation/foundation-priority-left-right.md`
- Modify only if verification exposes a covered regression: files from Tasks 2-8.

**Interfaces:**
- Consumes: reviewed fixture, final extraction services, diagnostics, and UI.
- Produces: recorded accuracy and latency comparison with no missing acceptance fields.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm test`

Expected: all test files pass with no unhandled errors or warnings.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: exit code 0 with no new Vite, TypeScript, PDF.js, or unresolved-asset warning.

- [ ] **Step 3: Run live fixture pair twice**

For each run, process `Left.pdf` as certified material and `Right.pdf` as the foundation plan. Record:

- final rows versus every `EXPECTED_PRIORITY_ROWS` entry;
- any invented or missing code;
- plan/certified evidence page and bbox;
- model, thinking, and media configuration;
- anchor counts and missing-label coverage;
- primary, targeted, validation, and total duration;
- usage token counts;
- whether a crop or direct-mapping pass ran.

Expected: both runs match the reviewed codes and methods; no expected foundation is omitted and no invented label/code is accepted.

- [ ] **Step 4: Apply the latency gate**

Compute mean primary-generation time per file across the two runs. It must be 105 seconds or less, at least 25% below the approximately 140-second baseline. If hosted variance causes one outlier, record the individual values and rerun once; use the median of three rather than discarding a result.

- [ ] **Step 5: Verify the viewer and warning UI**

Open at least one plan-FC result and one certified-fallback result in the viewer. Confirm page and bbox target the visible evidence. Force a mocked or controlled incomplete response and confirm the status strip shows an amber warning with missing labels while retaining valid rows.

- [ ] **Step 6: Update validation documentation**

Replace all scaffold language with the reviewed fixture, both run tables, coverage results, latency calculation, evidence checks, and the accepted configuration. Do not claim the latency gate passed unless the recorded numbers satisfy Step 4.

- [ ] **Step 7: Run final verification again**

Run: `npm test` and `npm run build`.

Expected: both pass after documentation and any narrowly scoped regression correction.

- [ ] **Step 8: Commit**

```powershell
git add -- docs/validation/foundation-priority-left-right.md
git commit -m "docs: validate Gemini PDF accuracy and latency"
```

If a regression correction changed code in this task, stage those exact reviewed files in the same commit and describe the correction in the validation document.
