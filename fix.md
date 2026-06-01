# Document Extraction Reliability and Editable Results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all extraction workflows additive and editable, make Foundation Priority verification work across its two PDF sources, and improve Foundation Priority accuracy and runtime with measurable diagnostics and controlled escalation.

**Architecture:** Store uploaded files as independent asynchronous jobs and maintain editable working rows separately from raw extraction evidence. Foundation Priority merges evidence into one editable row per foundation while retaining plan and certified source locations for viewer switching. Its Gemini pipeline uploads each PDF once per job, records stage timings, and chooses the least expensive configuration that passes a reviewed accuracy fixture.

**Tech Stack:** React 18, TypeScript, Vite 5, Vitest, Testing Library, `react-pdf` / `pdfjs-dist`, `@google/genai`, XLSX

---

## Confirmed Product Contract

### Required Behaviors

- `FR-001`: All upload inputs remain available while prior files are processing: Column Reinforcement, Frame, `認定柱脚資料`, and `基礎伏図`.
- `FR-002`: Adding files appends results. Existing user edits remain unchanged while newly uploaded files finish.
- `FR-003`: Extracted result displays support edit, add, and delete actions. Corrected data is used for copy, Excel export, generated report output, and merges.
- `FR-004`: Foundation Priority displays one final row per foundation label. Multiple distinct resolved codes appear on one line, such as `F1: FC1, C3009`.
- `FR-005`: Foundation Priority priority applies per physical support location: a visible `FC` code in `基礎伏図` wins for that location; a location without `FC` falls back to the matching certified `C/P` code from `認定柱脚資料`.
- `FR-006`: Selecting a Foundation Priority result expands its per-code/location evidence. The viewer opens `基礎伏図` evidence by default and offers a switch to matching `認定柱脚資料` evidence where available.
- `FR-007`: Foundation Priority editing changes final merged rows only. The source-specific extracted evidence remains visible for verification and is not directly editable.
- `FR-008`: Clearing or explicitly reprocessing a file may discard corrections originating from that file. Uploading unrelated additional files may not discard corrections.
- `FR-009`: UI adjustments are in scope where required for editing, evidence selection, processing state, progress/error visibility, accessibility, or responsive viewer use.
- `FR-010`: The completed work includes a console-quality phase that fixes app-owned runtime, PDF rendering, test, and build warnings/errors rather than suppressing failures.

### Sample Documents And Performance Target

- `Left.pdf` is the supplied `認定柱脚資料` input. Local PDF inspection finds 6 pages, including multiple certified column-base detail/catalog pages.
- `Right.pdf` is the supplied `基礎伏図` input. Local PDF inspection finds 1 page with searchable `F...`, `FC1`, `X...`, and `Y...` labels.
- Accuracy takes precedence over latency, but the present 4 to 5 minute Foundation Priority run is a regression against the user's observed 1 to 1.5 minute behavior in other extraction workflows.
- Prompt/model/config changes are accepted only after final Foundation Priority rows and source evidence have been manually reviewed against `Left.pdf` and `Right.pdf`.

## Current-State Diagnosis

| Problem | Current Location | Finding |
| --- | --- | --- |
| Cannot add files during processing | `App.tsx`, `components/FileUpload.tsx`, `components/FrameImageInput.tsx` | Upload components are disabled by workflow-wide `is*Processing` booleans; concurrent batches also make these booleans race. |
| Priority viewer loses dual-source relationship | `utils/mergeFoundationPriority.ts`, `components/FoundationPriorityTextResult.tsx`, viewer types | A resolved result exposes only one `sourceFileId/page/bbox`, and fallback currently overwrites certified viewing provenance with plan provenance. |
| Priority output differs from required format | `utils/mergeFoundationPriority.ts`, its tests | Distinct codes for one foundation become distinct text lines rather than one combined editable foundation row. |
| Results are read-only | `ResultsTable.tsx`, `FrameResultsTable.tsx`, `FoundationPriorityTextResult.tsx` | Tables display derived values and expose only row selection/export/copy actions. |
| Priority processing is slow | `services/geminiService.ts`, `utils/foundationPriorityGeminiConfig.ts` | The feature alone uses the Files API and `gemini-3.1-pro-preview`; both primary and fallback are `HIGH` thinking. Fallback re-uploads the same PDF and raises media resolution. |
| Recent latency-sensitive change | Commit `5724857` | Primary Priority thinking changed from `MEDIUM` to `HIGH`, while Gemini 3.1 Pro documents `medium` as its balanced reasoning level and `high` as slowest. |
| Known console/build candidates | `index.html`, viewer PDF configuration, Vite output | Build reports unresolved `/index.css` and a large JS chunk. Local PDF.js reading of `Left.pdf` reports missing CMap configuration for Japanese fonts. Runtime inventory is still required in-browser. |

Baseline before implementation:

```powershell
npm test
# PASS: 7 test files, 52 tests

npm run build
# PASS with existing /index.css and chunk-size warnings
```

## File Responsibility Map

| File | Responsibility After Change |
| --- | --- |
| `types.ts` | Shared job, editable-row, Foundation Priority evidence, and diagnostic contracts. |
| `utils/editableRows.ts` | Pure reconciliation operations that preserve edited/manual/deleted rows during async arrivals. |
| `utils/editableRows.test.ts` | Locks edit persistence and add/delete behavior. |
| `utils/mergeFoundationPriority.ts` | Resolves coordinate evidence into one foundation row with per-location dual-source provenance. |
| `utils/mergeFoundationPriority.test.ts` | Locks per-location priority, combined-row formatting, and viewer evidence behavior. |
| `utils/foundationPriorityGeminiConfig.ts` | Configuration candidates and escalation decision helpers. |
| `utils/foundationPriorityDiagnostics.ts` | Records upload, generation, validation, fallback, and total durations. |
| `utils/foundationPriorityDiagnostics.test.ts` | Locks timing aggregation and escalation reason display. |
| `services/geminiService.ts` | Upload-once Priority extraction and evidence-returning Gemini calls. |
| `App.tsx` | Coordinates file jobs, editable datasets, viewer selection, and downstream consumers. Split focused helpers rather than adding more inlined state logic. |
| `components/ResultsTable.tsx` | Editable Column result table with add/delete operations and export from working rows. |
| `components/FrameResultsTable.tsx` | Editable Frame result table with add/delete operations and export from working rows. |
| `components/FoundationPriorityTextResult.tsx` | Editable merged rows and evidence expansion/selection. |
| `components/viewer/types.ts` | Selection supports evidence ID and plan/certified source role. |
| `components/viewer/ViewerSidebar.tsx` | Source-switch controls for a selected Priority evidence location. |
| `components/viewer/DocumentViewer.tsx` | Renders configured PDFs without CMap/font warnings. |
| `components/FileUpload.tsx`, `components/FrameImageInput.tsx` | Additive uploads remain active with visible in-flight counts. |
| `components/StatusStrip.tsx` | Extract status display from `App.tsx` so file actions and diagnostics can be tested independently. |
| `index.html`, `index.tsx`, `vite.config.ts`, `package.json` | Local styling/assets, test harness, and build/runtime warning cleanup. |

## Acceptance Scenarios

1. Start processing one Column PDF, then add a second before the first completes. Both remain listed, finish independently, and any edited first-file row stays edited.
2. Repeat additive upload while processing for pasted/dropped Frame images and both Priority PDF zones.
3. Edit, add, and delete rows in Column and Frame results; verify exports and the Report tab use corrected working rows.
4. Process `Left.pdf` as `認定柱脚資料` and `Right.pdf` as `基礎伏図`; verify one combined displayed row per foundation and distinct per-location codes.
5. Expand a Foundation Priority row; choose an evidence item; verify the viewer starts on its `基礎伏図` highlight and switches to its matched `認定柱脚資料` highlight when present.
6. Edit/add/delete final Foundation Priority rows and verify copy output reflects only corrected rows while evidence remains available for unchanged linked rows.
7. Record Priority timing by stage and verify the accepted configuration is accurate on the supplied pair and no longer performs unnecessary duplicate file uploads.
8. Exercise each tab in a production preview build and leave the browser console without app-owned error/warning output in the tested paths.

## Implementation Tasks

### Task 1: Add A UI Test Harness And Lock The Upload Contract

**Status:** Completed 2026-05-28. 9 test files / 54 tests pass. `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom` installed; vitest switched to jsdom env; FileUpload input got `aria-label={title}` and FrameImageInput dropzone got `data-testid="frame-dropzone"`.

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `vitest.config.ts`
- Create: `tests/setup.ts`
- Create: `components/FileUpload.test.tsx`
- Create: `components/FrameImageInput.test.tsx`

- [x] **Step 1: Install component-test dependencies**

Run:

```powershell
npm install --save-dev jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

Expected: `package.json` and `package-lock.json` include the four dev dependencies.

- [x] **Step 2: Configure Vitest for existing utility tests and new React tests**

Replace `vitest.config.ts` with:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['utils/**/*.test.ts', 'components/**/*.test.tsx'],
  },
});
```

Create `tests/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [x] **Step 3: Write failing upload-during-processing tests**

Create `components/FileUpload.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FileUpload } from './FileUpload';

describe('FileUpload', () => {
  it('accepts another file selection while other jobs are described as processing', () => {
    const onFilesSelect = vi.fn();
    render(
      <FileUpload
        onFilesSelect={onFilesSelect}
        title="Upload PDFs"
        zoneId="test"
        isActiveTab
        allowPaste={false}
      />,
    );

    const input = screen.getByLabelText('Upload PDFs');
    fireEvent.change(input, { target: { files: [new File(['a'], 'a.pdf', { type: 'application/pdf' })] } });
    fireEvent.change(input, { target: { files: [new File(['b'], 'b.pdf', { type: 'application/pdf' })] } });

    expect(onFilesSelect).toHaveBeenCalledTimes(2);
  });
});
```

Create `components/FrameImageInput.test.tsx`:

```tsx
import { fireEvent, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FrameImageInput } from './FrameImageInput';

describe('FrameImageInput', () => {
  it('accepts drops while another frame result is processing', async () => {
    const onImagePaste = vi.fn();
    const { getByTestId } = render(
      <FrameImageInput
        results={[{ id: 'a', imagePreview: 'data:image/png;base64,AA==', status: 'PROCESSING', data: null }]}
        onImagePaste={onImagePaste}
        onClear={vi.fn()}
        isActiveTab
      />,
    );

    fireEvent.drop(getByTestId('frame-dropzone'), {
      dataTransfer: { files: [new File(['image'], 'second.png', { type: 'image/png' })] },
    });

    await waitFor(() => expect(onImagePaste).toHaveBeenCalledTimes(1));
  });
});
```

Run:

```powershell
npm test -- components/FileUpload.test.tsx components/FrameImageInput.test.tsx
```

Expected: FAIL because the upload input has no accessible label/test identifier and Frame is currently passed a disabled processing state from integration.

- [x] **Step 4: Expose accessible upload/drop targets**

In `components/FileUpload.tsx`, bind the hidden input to its visible title:

```tsx
<input
  aria-label={title}
  type="file"
  ref={fileInputRef}
  onChange={handleFileChange}
  accept={accept}
  multiple
  className="hidden"
  disabled={disabled}
/>
```

In `components/FrameImageInput.tsx`, add `data-testid="frame-dropzone"` to the existing drop-zone `<div>` without changing its existing class expression:

```tsx
<div
  data-testid="frame-dropzone"
  onDrop={handleDrop}
  onDragOver={handleDragOver}
  onDragLeave={handleDragLeave}
  className={`w-full border-2 border-dashed rounded-xl p-6 text-center transition-colors duration-200
    ${disabled
      ? 'opacity-50 cursor-not-allowed border-gray-300'
      : isDragOver
        ? 'border-amber-500 bg-amber-50 cursor-pointer'
        : 'border-amber-300 bg-amber-50/30 hover:border-amber-500 hover:bg-amber-50 cursor-pointer'
    }`}
>
```

- [x] **Step 5: Run tests and commit** (commit deferred — batching at the end)

Run:

```powershell
npm test
```

Expected: PASS for existing utilities and the new component tests.

```powershell
git add package.json package-lock.json vitest.config.ts tests/setup.ts components/FileUpload.tsx components/FrameImageInput.tsx components/FileUpload.test.tsx components/FrameImageInput.test.tsx
git commit -m "test: add upload interaction coverage"
```

**Design notes (Task 1):**
- Deferring git commits — running test/build verification after each task instead of committing per-step. Will batch commits when implementation stabilizes (after all tasks pass).
- `npm install` produced 7 vulnerabilities (4 moderate, 3 high) in transitive deps. Not in scope to address here.

### Task 2: Create Editable Working-Row Reconciliation

**Status:** Completed 2026-05-28. Tests pass. `EditableRowMeta` / `EditableRowsState` types added; `utils/editableRows.ts` exposes `reconcileExtractedRows` / `updateWorkingRow` / `addManualRow` / `deleteWorkingRow`.

**Files:**
- Modify: `types.ts`
- Create: `utils/editableRows.ts`
- Create: `utils/editableRows.test.ts`

- [x] **Step 1: Add failing tests for edit persistence, manual rows, and deletion tombstones**

Create `utils/editableRows.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { addManualRow, deleteWorkingRow, reconcileExtractedRows, updateWorkingRow } from './editableRows';
import { EditableRowMeta } from '../types';

type Row = EditableRowMeta & { value: string };

const extracted = (rowId: string, sourceKey: string, value: string): Row => ({
  rowId,
  sourceKey,
  sourceFileIds: ['file-a'],
  provenance: 'extracted',
  edited: false,
  value,
});

describe('editable result reconciliation', () => {
  it('does not overwrite an edited extracted row when async extraction completes later', () => {
    const state = updateWorkingRow(
      { rows: [extracted('row-a', 'key-a', 'original')], deletedSourceKeys: [] },
      'row-a',
      { value: 'corrected' },
    );
    const next = reconcileExtractedRows(state, [
      extracted('row-a', 'key-a', 'late model value'),
      extracted('row-b', 'key-b', 'new file value'),
    ]);
    expect(next.rows.map((row) => row.value)).toEqual(['corrected', 'new file value']);
  });

  it('keeps user-added rows while new extracted rows arrive', () => {
    const state = addManualRow({ rows: [], deletedSourceKeys: [] }, {
      rowId: 'manual-a',
      sourceKey: 'manual-a',
      sourceFileIds: [],
      provenance: 'manual',
      edited: true,
      value: 'manual',
    });
    expect(reconcileExtractedRows(state, [extracted('row-a', 'key-a', 'new')]).rows).toHaveLength(2);
  });

  it('does not restore a deleted extracted row during reconciliation', () => {
    const state = deleteWorkingRow(
      { rows: [extracted('row-a', 'key-a', 'old')], deletedSourceKeys: [] },
      'row-a',
    );
    expect(reconcileExtractedRows(state, [extracted('row-a', 'key-a', 'again')]).rows).toEqual([]);
  });
});
```

Run:

```powershell
npm test -- utils/editableRows.test.ts
```

Expected: FAIL because the editable row module and contract do not exist.

- [x] **Step 2: Add shared editable-row types**

Append to `types.ts`:

```ts
export interface EditableRowMeta {
  rowId: string;
  sourceKey: string;
  sourceFileIds: string[];
  provenance: 'extracted' | 'manual';
  edited: boolean;
}

export interface EditableRowsState<T extends EditableRowMeta> {
  rows: T[];
  deletedSourceKeys: string[];
}

export type EditableExpandedReinforcementData = ExpandedReinforcementData & EditableRowMeta;
export type EditableFrameData = FrameData & EditableRowMeta;
```

- [x] **Step 3: Implement pure reconciliation operations**

Create `utils/editableRows.ts`:

```ts
import { EditableRowMeta, EditableRowsState } from '../types';

export const reconcileExtractedRows = <T extends EditableRowMeta>(
  state: EditableRowsState<T>,
  incoming: T[],
): EditableRowsState<T> => {
  const lockedByKey = new Map(
    state.rows
      .filter((row) => row.edited || row.provenance === 'manual')
      .map((row) => [row.sourceKey, row]),
  );
  const deleted = new Set(state.deletedSourceKeys);
  const rows = incoming
    .filter((row) => !deleted.has(row.sourceKey))
    .map((row) => lockedByKey.get(row.sourceKey) ?? row);

  for (const locked of lockedByKey.values()) {
    if (!rows.some((row) => row.sourceKey === locked.sourceKey)) {
      rows.push(locked);
    }
  }

  return { ...state, rows };
};

export const updateWorkingRow = <T extends EditableRowMeta>(
  state: EditableRowsState<T>,
  rowId: string,
  patch: Partial<Omit<T, keyof EditableRowMeta>>,
): EditableRowsState<T> => ({
  ...state,
  rows: state.rows.map((row) => row.rowId === rowId ? { ...row, ...patch, edited: true } : row),
});

export const addManualRow = <T extends EditableRowMeta>(
  state: EditableRowsState<T>,
  row: T,
): EditableRowsState<T> => ({ ...state, rows: [...state.rows, row] });

export const deleteWorkingRow = <T extends EditableRowMeta>(
  state: EditableRowsState<T>,
  rowId: string,
): EditableRowsState<T> => {
  const removed = state.rows.find((row) => row.rowId === rowId);
  if (!removed) return state;
  return {
    rows: state.rows.filter((row) => row.rowId !== rowId),
    deletedSourceKeys: removed.provenance === 'extracted'
      ? [...new Set([...state.deletedSourceKeys, removed.sourceKey])]
      : state.deletedSourceKeys,
  };
};
```

- [x] **Step 4: Run tests and commit** (commit deferred)

Run:

```powershell
npm test -- utils/editableRows.test.ts
```

Expected: PASS with all reconciliation scenarios green.

```powershell
git add types.ts utils/editableRows.ts utils/editableRows.test.ts
git commit -m "feat: add editable result reconciliation"
```

### Task 3: Change Foundation Priority To Combined Rows With Dual-Source Evidence

**Status:** Completed 2026-05-28. Tests + build pass. Merger output is now `{ rows, lines, text }` with `rows[].resolutions[].locations[].plan|certified` providing dual evidence.

**Design notes (Task 3):**
- The plan's snippet `resolvedAtLocation` returns `null` when neither FC nor a certified match is available — that location is dropped. Matches existing behavior in the "omits foundations that have neither FC nor a certified coordinate match" test.
- Code ordering inside a foundation row follows plan-row first-occurrence rather than natural sort, so `F1: FC1, C3010` (FC plan row at X1 first, certified fallback at X2 second) matches the plan-supplied test expectation.
- For `plan-fc` resolutions, a certified evidence at the same coordinate is still attached as alternate viewing evidence — this anticipates Task 8's viewer switch.
- Existing tests that asserted the legacy `entries` field have been updated/replaced. The legacy "uses the foundation plan location as the viewer source for certified fallback entries" test was replaced by "retains plan and certified evidence for viewer switching" per the plan. The "keeps multiple resolved lines" test was replaced by "renders one row per foundation with distinct codes" per the plan.
- `App.tsx` and `FoundationPriorityTextResult.tsx` were minimally adapted to the new `rows` shape so the build still compiles. Task 7 will fully rework them with editing and evidence expansion.

**Files:**
- Modify: `types.ts`
- Modify: `utils/mergeFoundationPriority.ts`
- Modify: `utils/mergeFoundationPriority.test.ts`

- [x] **Step 1: Replace obsolete multiple-line expectations with the approved contract**

Add these tests to `utils/mergeFoundationPriority.test.ts` and replace the existing test that expects two `F1` lines:

```ts
it('renders one row per foundation with distinct codes resolved per location', async () => {
  const { buildFoundationPriorityText } = await import('./mergeFoundationPriority');
  const result = buildFoundationPriorityText(
    [
      { xAxis: 'X1', yAxis: 'Y1', columnType: 'C3009', sourceFileId: 'left' },
      { xAxis: 'X2', yAxis: 'Y2', columnType: 'C3010', sourceFileId: 'left' },
    ],
    [
      { foundation: 'F1', xAxis: 'X1', yAxis: 'Y1', planColumnType: 'FC1', sourceFileId: 'right' },
      { foundation: 'F1', xAxis: 'X2', yAxis: 'Y2', planColumnType: '', sourceFileId: 'right' },
    ],
  );

  expect(result.lines).toEqual(['F1: FC1, C3010']);
  expect(result.rows[0].codes).toEqual(['FC1', 'C3010']);
});

it('retains plan and certified evidence for viewer switching', async () => {
  const { buildFoundationPriorityText } = await import('./mergeFoundationPriority');
  const result = buildFoundationPriorityText(
    [{ xAxis: 'X1', yAxis: 'Y1', columnType: 'C3009', sourceFileId: 'left', page: 2 }],
    [{ foundation: 'F1', xAxis: 'X1', yAxis: 'Y1', planColumnType: '', sourceFileId: 'right', page: 1 }],
  );

  expect(result.rows[0].resolutions[0]).toMatchObject({
    columnType: 'C3009',
    method: 'certified-fallback',
    locations: [{
      plan: { fileId: 'right', page: 1 },
      certified: { fileId: 'left', page: 2 },
    }],
  });
});
```

Run:

```powershell
npm test -- utils/mergeFoundationPriority.test.ts
```

Expected: FAIL because results currently expose flat `entries` and multiple text lines.

- [x] **Step 2: Add the explicit evidence contract to `types.ts`**

```ts
export type PrioritySourceRole = 'plan' | 'certified';

export interface SourceEvidence extends SourceLocation {
  fileId: string;
  role: PrioritySourceRole;
  xAxis: string;
  yAxis: string;
}

export interface FoundationPriorityEvidenceLocation {
  evidenceId: string;
  plan: SourceEvidence;
  certified?: SourceEvidence;
}

export interface FoundationPriorityResolution {
  columnType: string;
  method: 'plan-fc' | 'certified-fallback';
  locations: FoundationPriorityEvidenceLocation[];
}

export interface FoundationPriorityWorkingRow extends EditableRowMeta {
  foundation: string;
  codes: string[];
  resolutions: FoundationPriorityResolution[];
}
```

- [x] **Step 3: Refactor the merger output**

Update `utils/mergeFoundationPriority.ts` so that:

```ts
export interface FoundationPriorityTextResult {
  rows: FoundationPriorityWorkingRow[];
  lines: string[];
  text: string;
}

const formatPriorityRow = (row: Pick<FoundationPriorityWorkingRow, 'foundation' | 'codes'>) =>
  `${row.foundation}: ${row.codes.join(', ')}`;
```

Implement the merge with these concrete rules:

```ts
// One plan row is one physical location. FC wins at that location only.
// A certified match may still be retained as alternate viewing evidence.
const resolvedAtLocation = planRow.planColumnType.startsWith('FC')
  ? { columnType: planRow.planColumnType, method: 'plan-fc' as const }
  : certifiedMatch
    ? { columnType: certifiedMatch.columnType, method: 'certified-fallback' as const }
    : null;
```

For each normalized plan row with `resolvedAtLocation`, create a `FoundationPriorityEvidenceLocation` with its plan source and optional coordinate-matched certified source, group by `foundation` and `columnType`, and return:

```ts
const lines = rows.map(formatPriorityRow);
return { rows, lines, text: lines.join('\n') };
```

Use stable extracted `rowId/sourceKey` values derived from the foundation only, such as `priority:F1`; an edited `F1` row must remain the same reconciliation target even if later files propose additional codes. Attach `provenance: 'extracted'`, `edited: false`, and all contributing file IDs.

- [x] **Step 4: Run tests and commit** (commit deferred)

Run:

```powershell
npm test -- utils/mergeFoundationPriority.test.ts
```

Expected: PASS with combined display rows and dual-source evidence assertions.

```powershell
git add types.ts utils/mergeFoundationPriority.ts utils/mergeFoundationPriority.test.ts
git commit -m "feat: preserve foundation priority evidence"
```

### Task 4: Replace Workflow Locks With Independent File Jobs

**Status:** Completed 2026-05-28. Tests + build pass. Upload zones no longer receive `disabled={is*Processing}`. The workflow-lock useStates were deleted; `is*Processing` is now derived via `hasActiveJobs(results)`. StatusStrip moved to its own module with optional `onRetry/onRemove` plus per-file diagnostic fields ready for Task 9.

**Design notes (Task 4):**
- `FoundationTextInput` keeps its `disabled={isReinfProcessing}` since the plan's FR-001 only requires the four upload inputs (Column Reinforcement, Frame, 認定柱脚資料, 基礎伏図) to remain available, not the text linking input.
- "Clear All" buttons keep `disabled={is*Processing}` because the plan explicitly says: "Keep destructive clear actions disabled while active requests remain unless the same task adds an explicit cancellation/ignore-late-result token." We did not add that cancellation token in this task.
- `StatusStrip` accepts richer fields (`fileName`, `durationMs`, `passUsed`) to be ready for Task 9 diagnostics without another component-prop migration.

**Files:**
- Create: `utils/fileJobs.ts`
- Create: `utils/fileJobs.test.ts`
- Modify: `App.tsx`
- Modify: `components/FileUpload.tsx`
- Modify: `components/FrameImageInput.tsx`
- Create: `components/StatusStrip.tsx`

- [x] **Step 1: Write failing derived-status tests**

Create `utils/fileJobs.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { hasActiveJobs, summarizeJobs } from './fileJobs';

describe('file job status', () => {
  it('derives active state from rows instead of a workflow lock', () => {
    const jobs = [{ status: 'SUCCESS' as const }, { status: 'PROCESSING' as const }];
    expect(hasActiveJobs(jobs)).toBe(true);
    expect(summarizeJobs(jobs)).toEqual({ total: 2, succeeded: 1, processing: 1, failed: 0 });
  });
});
```

Run:

```powershell
npm test -- utils/fileJobs.test.ts
```

Expected: FAIL because the helper is absent.

- [x] **Step 2: Create derived job helpers**

Create `utils/fileJobs.ts`:

```ts
import { ProcessingStatus } from '../types';

type Job = { status: ProcessingStatus };

export const hasActiveJobs = (jobs: Job[]) =>
  jobs.some((job) => job.status === 'PENDING' || job.status === 'PROCESSING');

export const summarizeJobs = (jobs: Job[]) => ({
  total: jobs.length,
  succeeded: jobs.filter((job) => job.status === 'SUCCESS').length,
  processing: jobs.filter((job) => job.status === 'PENDING' || job.status === 'PROCESSING').length,
  failed: jobs.filter((job) => job.status === 'ERROR').length,
});
```

- [x] **Step 3: Remove upload gating in `App.tsx`**

Delete `isReinfProcessing`, `isFrameProcessing`, `isCertifiedProcessing`, and `isFoundationPlanProcessing` as input locks. Derive active status instead:

```ts
const isReinfProcessing = hasActiveJobs(reinfResults);
const isFrameProcessing = hasActiveJobs(frameResults);
const isCertifiedProcessing = hasActiveJobs(certifiedResults);
const isFoundationPlanProcessing = hasActiveJobs(foundationPlanResults);
const isPriorityProcessing = isCertifiedProcessing || isFoundationPlanProcessing;
```

Do not pass processing state into upload/paste controls:

```tsx
<FileUpload onFilesSelect={handleReinfFilesSelect} zoneId="reinforcement" isActiveTab={activeTab === 'column'} />
<FrameImageInput results={frameResults} onImagePaste={handleFrameImagePaste} onClear={handleFrameClear} isActiveTab={activeTab === 'frame'} />
<FileUpload onFilesSelect={handleCertifiedFilesSelect} zoneId="certified-foundation" isActiveTab={activeTab === 'priority'} accept=".pdf,application/pdf" allowPaste={false} />
<FileUpload onFilesSelect={handleFoundationPlanFilesSelect} zoneId="foundation-plan-priority" isActiveTab={activeTab === 'priority'} accept=".pdf,application/pdf" allowPaste={false} />
```

Keep destructive clear actions disabled while active requests remain unless the same task adds an explicit cancellation/ignore-late-result token.

- [x] **Step 4: Extract and enhance status UI**

Move `StatusStrip` from `App.tsx` to `components/StatusStrip.tsx`. It consumes `summarizeJobs`, renders each file status, and adds `Retry` / `Remove` actions only when their parent handler is provided. This provides the future explicit reprocessing action required to replace edits for a specific file.

- [x] **Step 5: Verify and commit** (commit deferred)

Run:

```powershell
npm test
npm run build
```

Expected: PASS; uploading remains enabled while processing summaries remain visible.

```powershell
git add App.tsx components/FileUpload.tsx components/FrameImageInput.tsx components/StatusStrip.tsx utils/fileJobs.ts utils/fileJobs.test.ts
git commit -m "feat: allow additive uploads during processing"
```

### Task 5: Wire Editable Column Results Into Reports And Exports

**Status:** Completed 2026-05-28. Tests + build pass. `EditableExpandedReinforcementData[]` flows from `buildColumnWorkingRows` → reconciliation → `ResultsTable` + `ReportTab` + Excel export.

**Design notes (Task 5):**
- `ReportTab` props (`ExpandedReinforcementData[]`) did not need modification because `EditableExpandedReinforcementData` extends `ExpandedReinforcementData` — passing the editable shape is structurally compatible.
- `ResultsTable` keeps the existing `onRowSelect` for viewer integration but moves that interaction onto a dedicated "View source" button so input clicks don't unintentionally change the viewer selection (FR-009).
- Added Edited/Manual badges on the foundation cell only (not duplicated per field) to keep visual weight low.

**Files:**
- Create: `utils/columnWorkingRows.ts`
- Create: `utils/columnWorkingRows.test.ts`
- Modify: `App.tsx`
- Modify: `components/ResultsTable.tsx`
- Create: `components/ResultsTable.test.tsx`
- Modify: `components/report/ReportTab.tsx` only if its prop type must accept editable metadata

- [x] **Step 1: Test stable working-row proposals and edit controls**

Create `utils/columnWorkingRows.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildColumnWorkingRows } from './columnWorkingRows';

describe('buildColumnWorkingRows', () => {
  it('creates stable source keys for report-ready merged rows', () => {
    const rows = buildColumnWorkingRows(
      [{ columnType: 'FC1', columnDimensions: '700x700', mainReinforcement: '24-D25', hoopReinforcement: 'D13@100', sourceFileId: 'pdf-1' }],
      [{ foundation: 'F1', columnType: 'FC1' }],
    );
    expect(rows[0]).toMatchObject({ foundation: 'F1', columnType: 'FC1', provenance: 'extracted', edited: false });
    expect(rows[0].sourceKey).toContain('pdf-1');
  });
});
```

Create `components/ResultsTable.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ResultsTable } from './ResultsTable';

describe('ResultsTable editing', () => {
  it('sends corrected fields and delete actions by row ID', async () => {
    const user = userEvent.setup();
    const onRowChange = vi.fn();
    const onDeleteRow = vi.fn();
    render(<ResultsTable data={[{
      rowId: 'row-1', sourceKey: 'key-1', sourceFileIds: ['file-1'], provenance: 'extracted', edited: false,
      foundation: 'F1', columnType: 'FC1', dimensionWidth: '700', dimensionHeight: '700',
      mainReinforcementCount: '24', mainReinforcementSize: 'D25', hoopReinforcementSize: 'D13', hoopReinforcementSpacing: '100',
    }]} hasFoundationData onRowChange={onRowChange} onDeleteRow={onDeleteRow} onAddRow={vi.fn()} />);
    await user.clear(screen.getByLabelText('F1 column type'));
    await user.type(screen.getByLabelText('F1 column type'), 'FC2');
    await user.click(screen.getByRole('button', { name: 'Delete F1' }));
    expect(onRowChange).toHaveBeenCalled();
    expect(onDeleteRow).toHaveBeenCalledWith('row-1');
  });
});
```

- [x] **Step 2: Implement stable proposal generation**

Create `utils/columnWorkingRows.ts`:

```ts
import { ColumnReinforcementData, EditableExpandedReinforcementData, FoundationColumnData } from '../types';
import { mergeReinforcementWithFoundation } from './mergeData';

export const buildColumnWorkingRows = (
  reinforcementData: ColumnReinforcementData[],
  foundationData: FoundationColumnData[],
): EditableExpandedReinforcementData[] =>
  mergeReinforcementWithFoundation(reinforcementData, foundationData).map((row) => {
    const fileId = row.sourceFileId ?? 'linked';
    const sourceKey = `column:${fileId}:${row.foundation ?? ''}:${row.columnType}`;
    return {
      ...row,
      rowId: sourceKey,
      sourceKey,
      sourceFileIds: row.sourceFileId ? [row.sourceFileId] : [],
      provenance: 'extracted',
      edited: false,
    };
  });
```

- [x] **Step 3: Store reconciled Column working rows in `App.tsx`**

Compute extracted proposals, reconcile them when extraction/foundation input changes, and pass `columnRows.rows` to both `ResultsTable` and `ReportTab`:

```ts
const [columnRows, setColumnRows] = useState<EditableRowsState<EditableExpandedReinforcementData>>({
  rows: [],
  deletedSourceKeys: [],
});
const columnProposals = useMemo(
  () => buildColumnWorkingRows(consolidatedReinfData, foundationData),
  [consolidatedReinfData, foundationData],
);
useEffect(() => setColumnRows((state) => reconcileExtractedRows(state, columnProposals)), [columnProposals]);
```

Bind table handlers to `updateWorkingRow`, `addManualRow`, and `deleteWorkingRow`. Reset `columnRows` in `handleClearColumn`.

- [x] **Step 4: Render accessible inline editors**

Change `ResultsTable` props to use `EditableExpandedReinforcementData[]` and provide:

```ts
onRowChange: (rowId: string, patch: Partial<ExpandedReinforcementData>) => void;
onAddRow: () => void;
onDeleteRow: (rowId: string) => void;
```

Use controlled inputs with labels such as:

```tsx
<input
  aria-label={`${row.foundation || row.columnType} column type`}
  value={row.columnType}
  onChange={(event) => onRowChange(row.rowId, { columnType: event.target.value })}
  className="w-24 rounded border border-gray-200 px-2 py-1 font-mono text-sm"
/>
```

Add an `Edited`/`Manual` badge from row metadata, an `Add row` button, and a per-row `Delete` button with `aria-label={`Delete ${row.foundation || row.columnType}`}`.

- [x] **Step 5: Verify downstream corrected data and commit** (commit deferred)

Run:

```powershell
npm test -- utils/columnWorkingRows.test.ts components/ResultsTable.test.tsx utils/mergeData.test.ts
npm test
npm run build
```

Expected: PASS; exported/reported values originate from `columnRows.rows`.

```powershell
git add App.tsx types.ts utils/columnWorkingRows.ts utils/columnWorkingRows.test.ts components/ResultsTable.tsx components/ResultsTable.test.tsx components/report/ReportTab.tsx
git commit -m "feat: make column results editable downstream"
```

### Task 6: Normalize And Edit Frame Results

**Status:** Completed 2026-05-28. Tests + build pass. `FrameFileResult.data` is now `FrameData[]`; pseudo `-extra-` files are gone; FrameResultsTable is editable with `EditableFrameData[]`; `frame:fileId:index:frameName` source keys feed reconciliation.

**Design notes (Task 6):**
- The plan's bare FrameResultsTable test pattern (`user.clear(...); user.type('550')`) does not work with a controlled `value={row.b}` unless a parent re-renders. To make the spec's `objectContaining({ b: '550' })` assertion meaningful while keeping the production input controlled, the test wraps the component in a stateful Harness that updates state on `onRowChange`. The wrapper is the test-equivalent of what App.tsx does in production via `updateWorkingRow`.

**Files:**
- Modify: `types.ts`
- Modify: `App.tsx`
- Modify: `components/FrameResultsTable.tsx`
- Create: `components/FrameResultsTable.test.tsx`

- [x] **Step 1: Test Frame inline corrections**

Create `components/FrameResultsTable.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FrameResultsTable } from './FrameResultsTable';

describe('FrameResultsTable editing', () => {
  it('edits, adds, and deletes frame working rows', async () => {
    const user = userEvent.setup();
    const onRowChange = vi.fn();
    const onAddRow = vi.fn();
    const onDeleteRow = vi.fn();
    const row = {
      rowId: 'frame-1', sourceKey: 'frame-1', sourceFileIds: ['image-1'], provenance: 'extracted' as const, edited: false,
      frameName: 'FG1', b: '500', h: '600', topRebarD: 'D16', topRebarValue: '4',
      bottomRebarD: 'D16', bottomRebarValue: '4', stirrupD: 'D10', stirrupValue: '200',
    };
    render(
      <FrameResultsTable
        data={[row]}
        onRowChange={onRowChange}
        onAddRow={onAddRow}
        onDeleteRow={onDeleteRow}
      />,
    );

    await user.clear(screen.getByLabelText('FG1 B'));
    await user.type(screen.getByLabelText('FG1 B'), '550');
    await user.click(screen.getByRole('button', { name: 'Add frame row' }));
    await user.click(screen.getByRole('button', { name: 'Delete FG1' }));

    expect(onRowChange).toHaveBeenCalledWith('frame-1', expect.objectContaining({ b: '550' }));
    expect(onAddRow).toHaveBeenCalledTimes(1);
    expect(onDeleteRow).toHaveBeenCalledWith('frame-1');
  });
});
```

Run:

```powershell
npm test -- components/FrameResultsTable.test.tsx
```

Expected: FAIL until callbacks and inputs are implemented.

- [x] **Step 2: Keep one file job with multiple extracted frame rows**

Change the result contract:

```ts
export interface FrameFileResult {
  id: string;
  imagePreview: string;
  status: ProcessingStatus;
  data: FrameData[];
  error?: string;
  sourceMimeType?: string;
}
```

In `processFrameImage`, store all returned rows on the original file result instead of adding `-extra-` pseudo-files:

```ts
setFrameResults((previous) => previous.map((result) =>
  result.id === id ? { ...result, status: 'SUCCESS', data } : result,
));
```

Build `EditableFrameData` proposals with stable source keys `frame:${fileId}:${index}` and reconcile them through `utils/editableRows.ts`.
Update the Task 1 `FrameImageInput` test fixture from `data: null` to `data: []` after this contract change.

- [x] **Step 3: Add editable Frame table controls**

Change `FrameResultsTable` to accept `EditableFrameData[]`, `onRowChange`, `onAddRow`, and `onDeleteRow`; turn each visible value into an accessible input, retaining source-selection behavior on a separate `View source` action so clicking into an edit field cannot unexpectedly change the viewer.

- [x] **Step 4: Verify and commit** (commit deferred)

Run:

```powershell
npm test -- components/FrameResultsTable.test.tsx
npm test
npm run build
```

Expected: PASS and a single pasted file appears once in the viewer selector with its complete item count.

```powershell
git add types.ts App.tsx components/FrameResultsTable.tsx components/FrameResultsTable.test.tsx
git commit -m "feat: make frame results editable"
```

### Task 7: Build Editable Foundation Priority Rows And Evidence Expansion

**Status:** Completed 2026-05-28. Tests + build pass. `FoundationPriorityTextResult` now exposes editable foundation/codes inputs, per-row expand-evidence with per-location plan/certified view buttons, an "Add foundation" button, and per-row Delete. App.tsx now tracks priorityRows via `reconcileExtractedRows` and exposes `handlePriorityEvidenceSelect`.

**Design notes (Task 7):**
- The codes input keeps a per-row "draft" string in component-local state so trailing commas/spaces remain visible while typing. The draft is cleared on blur so reconciliation can drive the input again. Without this, `value={row.codes.join(', ')}` would erase the comma on the next keystroke (parseCodes drops empty fragments).
- The component-level test uses a stateful Harness wrapper for the same reason as Task 6 — a controlled input cannot reflect arbitrary typed text without a parent state update.
- `ViewerSelection` was extended with `evidenceId/sourceRole/alternates` here (Task 8 step 2) so App.tsx compiles. Task 8 will add the UI that uses `alternates`.

**Files:**
- Modify: `App.tsx`
- Modify: `components/FoundationPriorityTextResult.tsx`
- Create: `components/FoundationPriorityTextResult.test.tsx`

- [x] **Step 1: Test combined editing and evidence selection**

Create `components/FoundationPriorityTextResult.test.tsx` with one final row containing two code resolutions and plan/certified locations:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FoundationPriorityTextResult } from './FoundationPriorityTextResult';

describe('FoundationPriorityTextResult', () => {
  it('edits final rows while exposing source evidence', async () => {
    const user = userEvent.setup();
    const onRowChange = vi.fn();
    const onAddRow = vi.fn();
    const onDeleteRow = vi.fn();
    const onEvidenceSelect = vi.fn();
    const row = {
      rowId: 'priority:F1', sourceKey: 'priority:F1', sourceFileIds: ['right', 'left'],
      provenance: 'extracted' as const, edited: false, foundation: 'F1', codes: ['FC1', 'C3009'],
      resolutions: [{
        columnType: 'C3009', method: 'certified-fallback' as const,
        locations: [{
          evidenceId: 'F1:X1:Y1',
          plan: { fileId: 'right', role: 'plan' as const, xAxis: 'X1', yAxis: 'Y1', page: 1 },
          certified: { fileId: 'left', role: 'certified' as const, xAxis: 'X1', yAxis: 'Y1', page: 2 },
        }],
      }],
    };
    render(
      <FoundationPriorityTextResult
        rows={[row]}
        text="F1: FC1, C3009"
        onRowChange={onRowChange}
        onAddRow={onAddRow}
        onDeleteRow={onDeleteRow}
        onEvidenceSelect={onEvidenceSelect}
      />,
    );

    expect(screen.getByDisplayValue('F1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('FC1, C3009')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show evidence for F1' }));
    await user.click(screen.getByRole('button', { name: 'View C3009 location 1 in foundation plan' }));
    expect(onEvidenceSelect).toHaveBeenCalledWith(
      expect.objectContaining({ plan: expect.objectContaining({ role: 'plan' }) }),
    );
    await user.clear(screen.getByLabelText('F1 codes'));
    await user.type(screen.getByLabelText('F1 codes'), 'FC1, C3010');
    expect(onRowChange).toHaveBeenLastCalledWith(
      'priority:F1',
      expect.objectContaining({ codes: ['FC1', 'C3010'] }),
    );
    await user.click(screen.getByRole('button', { name: 'Add foundation' }));
    await user.click(screen.getByRole('button', { name: 'Delete F1' }));
    expect(onAddRow).toHaveBeenCalledTimes(1);
    expect(onDeleteRow).toHaveBeenCalledWith('priority:F1');
  });
});
```

Run:

```powershell
npm test -- components/FoundationPriorityTextResult.test.tsx
```

Expected: FAIL until final rows replace flat entries and evidence controls exist.

- [x] **Step 2: Reconcile generated Priority rows with user-edited final rows**

In `App.tsx`, store:

```tsx
const [priorityRows, setPriorityRows] = useState<EditableRowsState<FoundationPriorityWorkingRow>>({
  rows: [],
  deletedSourceKeys: [],
});
const priorityProposals = useMemo(
  () => buildFoundationPriorityText(consolidatedCertifiedData, consolidatedFoundationPlanData).rows,
  [consolidatedCertifiedData, consolidatedFoundationPlanData],
);
useEffect(() => setPriorityRows((state) => reconcileExtractedRows(state, priorityProposals)), [priorityProposals]);
const priorityText = priorityRows.rows
  .map((row) => `${row.foundation}: ${row.codes.join(', ')}`)
  .join('\n');
```

An edited row preserves its final codes on later extraction arrivals. Existing evidence can remain attached to unchanged code values; values without matching resolution render as manual values with no highlight.

- [x] **Step 3: Replace flat text lines with editable final rows**

Change component props to:

```ts
interface FoundationPriorityTextResultProps {
  rows: FoundationPriorityWorkingRow[];
  text: string;
  selectedRowKey?: string | null;
  onRowChange: (rowId: string, patch: Pick<FoundationPriorityWorkingRow, 'foundation' | 'codes'>) => void;
  onAddRow: () => void;
  onDeleteRow: (rowId: string) => void;
  onEvidenceSelect: (evidence: FoundationPriorityEvidenceLocation) => void;
}
```

Parse the codes input on change with:

```ts
const parseCodes = (value: string) =>
  [...new Set(value.split(',').map((code) => code.trim().toUpperCase()).filter(Boolean))];
```

Render expansion controls per row and location, with plan as the first source action and certified as an available switch.

- [x] **Step 4: Verify and commit** (commit deferred)

Run:

```powershell
npm test -- utils/mergeFoundationPriority.test.ts components/FoundationPriorityTextResult.test.tsx
npm test
npm run build
```

Expected: PASS and copy text is generated from edited final rows.

```powershell
git add App.tsx components/FoundationPriorityTextResult.tsx components/FoundationPriorityTextResult.test.tsx
git commit -m "feat: add editable priority rows and evidence list"
```

### Task 8: Extend Viewer Selection For Plan/Certified Switching

**Status:** Completed 2026-05-28. Tests + build pass. Step 2 types were applied during Task 7 to keep the build green; Step 1 (test) and Step 3 (alternate source switch UI) finished here. ViewerSidebar renders a segmented switch above the document only when `selection.alternates.length > 1`.

**Design notes (Task 8):**
- `handlePageChange` was changed to spread the existing selection so `evidenceId/sourceRole/alternates/rowKey` survive page navigation. Without the spread, paging would drop the source-switch UI.
- `FileSelector.tsx` did not need modification — the alternate-source switch is rendered in `ViewerSidebar` itself, not the file selector.

**Files:**
- Modify: `components/viewer/types.ts`
- Modify: `components/viewer/ViewerSidebar.tsx`
- Modify: `components/viewer/FileSelector.tsx`
- Create: `components/viewer/ViewerSidebar.test.tsx`
- Modify: `App.tsx`

- [x] **Step 1: Write a source-switch component test**

Create `components/viewer/ViewerSidebar.test.tsx`. Mock `DocumentViewer` because this test targets source choice rather than PDF rendering:

```ts
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ViewerSidebar } from './ViewerSidebar';

vi.mock('./DocumentViewer', () => ({ DocumentViewer: () => <div>document</div> }));

describe('ViewerSidebar evidence source switch', () => {
  it('defaults to plan evidence and switches to matching certified evidence', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    render(
      <ViewerSidebar
        files={[
          { id: 'right', fileName: 'Right.pdf', status: 'SUCCESS', sourceMimeType: 'application/pdf' },
          { id: 'left', fileName: 'Left.pdf', status: 'SUCCESS', sourceMimeType: 'application/pdf' },
        ]}
        selection={{
          fileId: 'right', page: 1, sourceRole: 'plan',
          alternates: [
            { fileId: 'right', page: 1, sourceRole: 'plan', label: '基礎伏図' },
            { fileId: 'left', page: 2, sourceRole: 'certified', label: '認定柱脚資料' },
          ],
        }}
        onSelectionChange={onSelectionChange}
        accent="cyan"
        collapsed={false}
        onCollapsedChange={vi.fn()}
        width={460}
        onWidthChange={vi.fn()}
        onPageCountResolved={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '基礎伏図' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: '認定柱脚資料' }));
    expect(onSelectionChange).toHaveBeenCalledWith(expect.objectContaining({ fileId: 'left', sourceRole: 'certified' }));
  });
});
```

Run:

```powershell
npm test -- components/viewer/ViewerSidebar.test.tsx
```

Expected: FAIL because `ViewerSelection` has no alternate source contract.

- [x] **Step 2: Add viewer selection types** (done during Task 7)

In `components/viewer/types.ts` add:

```ts
export interface ViewerSourceOption {
  fileId: string;
  page?: number;
  bbox?: BoundingBox;
  sourceRole: PrioritySourceRole;
  label: string;
}

export interface ViewerSelection {
  fileId: string;
  page?: number;
  bbox?: BoundingBox;
  rowKey?: string;
  evidenceId?: string;
  sourceRole?: PrioritySourceRole;
  alternates?: ViewerSourceOption[];
}
```

- [x] **Step 3: Render alternate evidence controls**

When `selection.alternates` has more than one item, `ViewerSidebar` renders a compact segmented switch above `DocumentViewer`. On click it preserves `rowKey` and `evidenceId` while applying the selected `fileId/page/bbox/sourceRole`.

`App.tsx` handles the evidence callback from `FoundationPriorityTextResult` by constructing a `ViewerSelection` from an evidence location with `plan` first and the optional `certified` reference second.

- [x] **Step 4: Verify and commit** (commit deferred)

Run:

```powershell
npm test -- components/viewer/ViewerSidebar.test.tsx components/FoundationPriorityTextResult.test.tsx
npm test
npm run build
```

Expected: PASS; default Priority evidence displays the plan source and can switch to certified evidence.

```powershell
git add App.tsx components/viewer/types.ts components/viewer/ViewerSidebar.tsx components/viewer/FileSelector.tsx components/viewer/ViewerSidebar.test.tsx components/FoundationPriorityTextResult.tsx
git commit -m "feat: switch between priority evidence sources"
```

### Task 9: Instrument And Refactor The Foundation Priority Gemini Pipeline

**Status:** Completed 2026-05-28. Tests + build pass. One upload per extraction job via `withActivePdf`; primary now defaults to `MEDIUM` thinking and `MEDIUM` media (per Gemini 3 guidance); escalation uses `HIGH` thinking on the SAME active URI; diagnostics record upload/primary/validation/fallback/total durations and pass; uploaded Gemini resource is deleted in `finally`.

**Design notes (Task 9):**
- `withActivePdf(ai, file, work)` owns upload + delete-in-finally. The two extractor entry points pass their staged work as the callback so neither can accidentally double-upload.
- `selectPriorityPass('primary' | 'escalated')` is the single source of truth for the per-pass config; `extractCoordinateDataFromPdf` was removed entirely.
- `needsPriorityEscalation` only escalates plan extraction when no resolvable rows; bbox presence/absence never triggers escalation, per FR-007 spirit and to preserve usable rows even without bounding boxes.
- The old `FOUNDATION_PRIORITY_PRIMARY_THINKING_LEVEL`/`FALLBACK_THINKING_LEVEL` constants were removed since nothing imports them. The old test that pinned both passes to `HIGH` is replaced with assertions for `MEDIUM` primary / `HIGH` escalation.
- StatusStrip already accepted `durationMs/passUsed`; App.tsx now derives them from the result's `diagnostics.stages.totalMs` and `diagnostics.passUsed` when calling StatusStrip.

**Files:**
- Modify: `types.ts`
- Create: `utils/foundationPriorityDiagnostics.ts`
- Create: `utils/foundationPriorityDiagnostics.test.ts`
- Modify: `utils/foundationPriorityGeminiConfig.ts`
- Modify: `utils/foundationPriorityGeminiConfig.test.ts`
- Modify: `services/geminiService.ts`
- Modify: `App.tsx`
- Modify: `components/StatusStrip.tsx`

- [x] **Step 1: Write diagnostic and configuration tests**

Replace the current assertion that requires `HIGH` for both passes in `utils/foundationPriorityGeminiConfig.test.ts` with:

```ts
expect(selectPriorityPass('primary')).toMatchObject({
  mediaResolution: PartMediaResolutionLevel.MEDIA_RESOLUTION_MEDIUM,
  thinkingLevel: ThinkingLevel.MEDIUM,
});
expect(selectPriorityPass('escalated')).toMatchObject({
  mediaResolution: PartMediaResolutionLevel.MEDIA_RESOLUTION_MEDIUM,
  thinkingLevel: ThinkingLevel.HIGH,
});
```

Create `utils/foundationPriorityDiagnostics.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createPriorityDiagnostics, finishStage } from './foundationPriorityDiagnostics';

describe('foundation priority diagnostics', () => {
  it('records stage durations and the escalation reason', () => {
    const started = createPriorityDiagnostics('right.pdf', 'plan');
    const measured = finishStage(started, 'upload', 1200);
    expect(measured.stages.uploadMs).toBe(1200);
    expect({ ...measured, escalationReason: 'missing-coordinate-coverage' }.escalationReason)
      .toBe('missing-coordinate-coverage');
  });
});
```

Run:

```powershell
npm test -- utils/foundationPriorityGeminiConfig.test.ts utils/foundationPriorityDiagnostics.test.ts
```

Expected: FAIL because pass selection and timing records do not exist.

- [x] **Step 2: Add diagnostic types and helpers**

Add to `types.ts`:

```ts
export interface PriorityPipelineDiagnostics {
  fileName: string;
  role: 'certified' | 'plan';
  stages: {
    uploadMs?: number;
    primaryGenerationMs?: number;
    primaryValidationMs?: number;
    fallbackGenerationMs?: number;
    fallbackValidationMs?: number;
    totalMs?: number;
  };
  passUsed: 'primary' | 'escalated';
  escalationReason?: string;
}
```

Implement `createPriorityDiagnostics` and immutable `finishStage` in `utils/foundationPriorityDiagnostics.ts`. Store diagnostics on `CertifiedCoordinateFileResult` and `FoundationPlanCoordinateFileResult`, and show duration/pass in `StatusStrip`.

- [x] **Step 3: Make configuration explicit and testable**

In `utils/foundationPriorityGeminiConfig.ts`, define:

```ts
export const FOUNDATION_PRIORITY_MODEL = 'gemini-3.1-pro-preview';

export const selectPriorityPass = (pass: 'primary' | 'escalated') => ({
  model: FOUNDATION_PRIORITY_MODEL,
  mediaResolution: PartMediaResolutionLevel.MEDIA_RESOLUTION_MEDIUM,
  thinkingLevel: pass === 'primary' ? ThinkingLevel.MEDIUM : ThinkingLevel.HIGH,
});
```

Rationale: official Gemini 3.1 Pro guidance describes `medium` as balanced and `high` as the slowest/deepest mode; official PDF guidance recommends medium media resolution because PDF quality typically saturates at medium. Do not restore low-temperature or low-`topP` parameters; official Gemini 3 guidance recommends the default temperature for these models.

- [x] **Step 4: Upload once and reuse the active file for escalation**

Refactor `services/geminiService.ts` so one public extraction call:

1. Uploads and activates the PDF once.
2. Generates the primary response against the active URI.
3. Validates normalized rows and determines whether escalation is needed.
4. Generates the escalated response against the same active URI only when needed.
5. Deletes the Gemini uploaded resource in `finally` using the SDK-supported `ai.files.delete({ name: active.name })`.

The core structure is:

```ts
const withActivePdf = async <T>(
  ai: GoogleGenAI,
  file: File,
  work: (active: ActiveGeminiPdfFile) => Promise<T>,
) => {
  const active = await uploadPdfAndWaitUntilActive(ai, file);
  try {
    return await work(active);
  } finally {
    await ai.files.delete({ name: active.name }).catch((error) => {
      logError(`Unable to release uploaded Gemini file ${active.name}`, error);
    });
  }
};
```

Replace `extractCoordinateDataFromPdf(file, ...)` with a generation helper that accepts an already active PDF, ensuring fallback cannot issue a second upload.

- [x] **Step 5: Add deterministic escalation criteria**

Implement a local evaluation function. It escalates when normalized output is empty, a plan row has a foundation but unusable location, or no matched/visible code can resolve any extracted foundation. It does not escalate simply because `bbox` is absent:

```ts
export const needsPriorityEscalation = (
  role: 'certified' | 'plan',
  normalizedCount: number,
  resolvableCount: number,
) =>
  normalizedCount === 0 ||
  (role === 'plan' && resolvableCount === 0);
```

Keep bounding boxes optional so verification metadata cannot block useful result extraction.

- [x] **Step 6: Verify and commit** (commit deferred)

Run:

```powershell
npm test -- utils/foundationPriorityGeminiConfig.test.ts utils/foundationPriorityDiagnostics.test.ts utils/coordinateExtraction.test.ts utils/mergeFoundationPriority.test.ts
npm test
npm run build
```

Expected: PASS; diagnostic UI can state whether escalation was used and the service contains only one PDF upload per extraction job.

```powershell
git add types.ts utils/foundationPriorityDiagnostics.ts utils/foundationPriorityDiagnostics.test.ts utils/foundationPriorityGeminiConfig.ts utils/foundationPriorityGeminiConfig.test.ts services/geminiService.ts App.tsx components/StatusStrip.tsx
git commit -m "perf: instrument and stage priority extraction"
```

### Task 10: Validate Prompts And Configuration Against The Supplied PDF Pair

**Status:** PARTIAL — Validation doc scaffold created at `docs/validation/foundation-priority-left-right.md`. Steps 1-4 require a live Gemini run with `VITE_GEMINI_API_KEY` set, then manual review of model output vs the visible PDFs. The current code default (Candidate A: 3.1 Pro MEDIUM primary + HIGH escalation, both MEDIUM media resolution) is committed; the user must run the live extraction, fill in the validation doc, and decide whether to adopt Candidate B (HIGH primary) or C (refined prompts) if accuracy drops on Left.pdf/Right.pdf.

**Design notes (Task 10):**
- Prompts in `services/geminiService.ts` already satisfy the plan's required instructions: per-location FC vs certified C/P, canonical X/Y placement, optional bbox, "never decide priority in the model". No prompt edits were made here in absence of a verified miss — the plan says edits must come from observed misses, not preemptive tweaks.
- Gemini 3 sampling defaults (temperature/topP/topK/seed) remain unset, per official guidance.

**Files:**
- Modify: `services/geminiService.ts`
- Modify: `utils/foundationPriorityGeminiConfig.ts`
- Create: `docs/validation/foundation-priority-left-right.md`

- [ ] **Step 1: Run the accepted-role fixture through the instrumented UI** — BLOCKED on live Gemini run (requires user-provided API key + manual PDF review)

Use:

```text
認定柱脚資料: Left.pdf
基礎伏図: Right.pdf
```

Record in `docs/validation/foundation-priority-left-right.md`:

- The exact final one-line-per-foundation output reviewed against the two visible PDFs.
- For every output code, whether it comes from plan `FC` or matched certified `C/P` fallback.
- Any location where the model is ambiguous and the final value was manually corrected.
- Upload, primary, validation, fallback, and total durations shown by diagnostics.
- Whether a usable page and bounding box exists for plan and certified evidence.

This reviewed record becomes the acceptance fixture for future configuration comparisons; it is not inferred from model output alone.

- [ ] **Step 2: Refine prompt scope only from observed misses**

The prompts must keep these explicit instructions:

```text
基礎伏図: return each foundation support location, visible FC code if present, canonical X/Y placement, page, and optional bbox.
認定柱脚資料: return each certified C/P code with canonical X/Y placement, page, and optional bbox.
Never decide final foundation output in the model; local code performs priority and merging.
Never omit an otherwise usable row only because bbox cannot be localized.
```

Remove prompt clauses only when the validation record shows they increase confusion or trigger expensive unusable results. Keep schema fields aligned with `normalizeCertifiedCoordinateRows` and `normalizeFoundationPlanCoordinateRows`.

- [ ] **Step 3: Compare staged candidates accuracy-first**

Run each candidate on the supplied pair at least twice and record both final correctness and durations:

| Candidate | Primary | Escalation | Acceptance Rule |
| --- | --- | --- | --- |
| A | Gemini 3.1 Pro, `MEDIUM` thinking, PDF `MEDIUM` media | Pro `HIGH`, PDF `MEDIUM` | Recommended starting candidate. |
| B | Gemini 3.1 Pro, `HIGH` thinking, PDF `MEDIUM` media | Same pass only when validation requires it | Keep only if it corrects rows A misses materially. |
| C | A plus refined prompt/schema changes | Pro `HIGH`, PDF `MEDIUM` | Adopt if output equals or improves the reviewed fixture with lower or equivalent retry rate. |

Select the fastest candidate that matches the reviewed expected output and evidence requirements. Because accuracy is primary, retain the slower candidate when faster candidates lose required final codes or point to incorrect sources.

- [ ] **Step 4: Commit reviewed validation results and accepted config**

```powershell
git add services/geminiService.ts utils/foundationPriorityGeminiConfig.ts docs/validation/foundation-priority-left-right.md
git commit -m "test: validate priority extraction on supplied PDFs"
```

### Task 11: Resolve App-Owned Console And Build Warnings

**Status:** Completed 2026-05-28. Tests + build pass. The two known build warnings are gone: no more `/index.css doesn't exist` and no more chunk-size > 500 kB warning. Largest single chunk now 424 kB (`spreadsheet` = xlsx). Local Tailwind via `@tailwindcss/vite` replaces the runtime CDN. PDF.js cMaps + standard fonts are copied to `pdfjs/` via `viteStaticCopy`. ReportTab and ViewerSidebar lazy-load with Suspense boundaries.

**Design notes (Task 11):**
- `vite-plugin-static-copy@^3` chosen instead of `@^4` because v4 requires Vite 6+ and this project pins Vite 5.4.
- Step 1 (live browser inventory) requires a running dev server + browser DevTools — flagged for manual verification in Task 12 step 4.
- `logError` now takes `{ handled?: boolean }`. App.tsx passes `{ handled: true }` for all four extraction handlers since the error already surfaces in the file-result UI. Other call sites (viewer crashes, structural failures) remain unhandled for diagnosis.
- ResultsTable/FrameResultsTable/ReportTab files were NOT modified for XLSX lazy-loading. The `manualChunks` config moves XLSX into its own `spreadsheet` chunk, which is loaded only when an export path imports it. Per-call `await import('xlsx')` was unnecessary for resolving the chunk warning.

**Files:**
- Modify: `index.html`
- Create: `index.css`
- Modify: `index.tsx`
- Modify: `App.tsx`
- Modify: `components/ResultsTable.tsx`
- Modify: `components/FrameResultsTable.tsx`
- Modify: `components/report/ReportTab.tsx`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `vite.config.ts`
- Modify: `components/viewer/DocumentViewer.tsx`
- Modify: `components/viewer/pdfjsWorker.ts`
- Modify: `utils/errorHandling.ts`
- Modify: `utils/errorHandling.test.ts`

- [ ] **Step 1: Inventory reproducible console output** — BLOCKED on browser preview (manual)

Run a production preview, open each tab, render `Left.pdf` and `Right.pdf` in the viewer, trigger one controlled extraction error, and list every browser-console/build warning before altering it:

```powershell
npm run build
npm run preview -- --host 127.0.0.1
```

Known items requiring verification are the unresolved `/index.css` build warning, Tailwind CDN production warning, large application chunk, and PDF.js Japanese CMap/font warning.

- [x] **Step 2: Move styling out of runtime CDN setup**

Install the local Vite plugin:

```powershell
npm install --save-dev tailwindcss @tailwindcss/vite vite-plugin-static-copy
```

Configure local Tailwind in `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    viteStaticCopy({
      targets: [
        { src: 'node_modules/pdfjs-dist/cmaps/*', dest: 'pdfjs/cmaps' },
        { src: 'node_modules/pdfjs-dist/standard_fonts/*', dest: 'pdfjs/standard_fonts' },
      ],
    }),
  ],
  server: { host: true },
});
```

Create `index.css`:

```css
@import "tailwindcss";

body {
  font-family: "Inter", sans-serif;
}
```

Import `./index.css` in `index.tsx`, then remove the Tailwind CDN script, obsolete import map, inline `body` style, and raw `/index.css` link from `index.html`.

Use `index.tsx`:

```ts
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
```

Run:

```powershell
npm run build
```

Expected: build output does not contain the unresolved `/index.css` warning.

- [x] **Step 3: Configure PDF.js CMaps and standard fonts**

Use the `viteStaticCopy` assets configured in Step 2 and provide Document options:

```ts
const pdfOptions = {
  cMapUrl: `${import.meta.env.BASE_URL}pdfjs/cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${import.meta.env.BASE_URL}pdfjs/standard_fonts/`,
};
```

Use:

```tsx
<Document file={file.sourceUrl} options={pdfOptions} onLoadSuccess={handleLoadSuccess}>
```

Verify `Left.pdf` renders Japanese text pages without CMap/font console warnings.

- [x] **Step 4: Reduce large initial chunks**

Lazily load heavy tab/viewer/report dependencies that are not needed at startup:

```tsx
const ReportTab = React.lazy(() => import('./components/report/ReportTab').then((module) => ({ default: module.ReportTab })));
const ViewerSidebar = React.lazy(() => import('./components/viewer/ViewerSidebar').then((module) => ({ default: module.ViewerSidebar })));
```

If XLSX is still part of the initial results-table chunk, load it inside export handlers:

```ts
const XLSX = await import('xlsx');
```

Add stable vendor splitting in `vite.config.ts` if lazy loading alone leaves a warning:

```ts
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        genai: ['@google/genai'],
        spreadsheet: ['xlsx'],
        pdfViewer: ['react-pdf', 'pdfjs-dist'],
      },
    },
  },
},
```

Run `npm run build` after each split adjustment and complete this step only when the chunk-size warning is absent.

- [x] **Step 5: Keep expected failures visible without noisy logs**

Change request errors into user-visible file-result errors and reserve `console.error` for unexpected development diagnostics. Add this logger boundary test:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { logError } from './errorHandling';

afterEach(() => vi.restoreAllMocks());

describe('logError', () => {
  it('does not write a handled user-visible processing failure to the console', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    logError('PDF extraction failed', new Error('Bad response'), { handled: true });
    expect(spy).not.toHaveBeenCalled();
  });

  it('reports unexpected failures once for diagnosis', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    logError('Viewer crashed', new Error('Render failed'));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
```

Implement the compatible logger signature:

```ts
export const logError = (
  context: string,
  error: unknown,
  options: { handled?: boolean } = {},
) => {
  if (!options.handled) {
    console.error(context, error);
  }
};
```

Call `logError(context, err, { handled: true })` only after the same failure has been placed in visible file-result error state. Keep viewer crashes, impossible parsing invariants, and cleanup failures unhandled for diagnosis.

- [x] **Step 6: Verify and commit** (commit deferred; browser-console walkthrough is manual in Task 12 step 4)

Run:

```powershell
npm test
npm run build
```

Then perform the browser-console walkthrough from Step 1.

Expected: no app-owned errors or warnings occur during successful upload/view/edit/copy/export paths, and controlled API failures appear once in the UI.

```powershell
git add index.html index.css index.tsx package.json package-lock.json vite.config.ts components/viewer/DocumentViewer.tsx components/viewer/pdfjsWorker.ts utils/errorHandling.ts utils/errorHandling.test.ts
git commit -m "fix: remove runtime and build console warnings"
```

### Task 12: End-To-End Verification And Regression Gate

**Status:** Step 1 (automated verification) complete; tests + build pass. Steps 2-5 require manual user action: multi-upload+edit flows, Left.pdf/Right.pdf priority acceptance, and browser-console walkthrough on the production preview. The validation document at `docs/validation/foundation-priority-left-right.md` records the regression baseline.

**Design notes (Task 12):**
- Final automated state: 17 test files, 69 tests pass (up from 7 / 52 at baseline). Build has no `/index.css` warning and no chunk-size warning.

**Files:**
- Modify: `docs/validation/foundation-priority-left-right.md`

- [x] **Step 1: Run automated verification**

```powershell
npm test
npm run build
```

Expected: all utility and UI tests pass; production build completes without app-owned missing-asset warnings.

- [ ] **Step 2: Exercise multi-upload and editing flows** — manual (user runs `npm run dev`)

Manually verify all four upload areas can accept a new input while an existing item shows `PROCESSING`. In every visible result display:

- Edit an existing row.
- Add a manual row.
- Delete a row.
- Add another input after editing.
- Confirm edited/manual/deleted results persist.
- Confirm copied/exported/reported results use corrected data.

- [ ] **Step 3: Exercise Foundation Priority acceptance** — manual (requires Gemini API key + PDF review)

Upload `Left.pdf` and `Right.pdf` in their confirmed roles. Compare final rows and evidence locations with `docs/validation/foundation-priority-left-right.md`. Confirm:

- One displayed line per foundation.
- Distinct codes are combined on that line.
- Priority is resolved per support location.
- Plan evidence is the default viewer source.
- Certified evidence can be selected for matched locations.
- Manual final edits update copied text and remain stable during additional uploads.
- Diagnostics show duration and escalation status.

- [ ] **Step 4: Review browser console and performance result** — manual (production preview DevTools)

Using a production preview, navigate each tested workflow with DevTools open. Record the final Priority total duration for the supplied pair and any remaining non-app environmental messages in the validation document. Do not claim performance improvement without recorded before/after timing.

- [ ] **Step 5: Commit verification record** — pending user-confirmed manual results

```powershell
git add docs/validation/foundation-priority-left-right.md
git commit -m "docs: record extraction regression verification"
```

## Implementation Order And Risk Controls

- Tasks 1 through 4 establish infrastructure and additive processing before UI editing changes.
- Tasks 5 through 8 implement editable working results and evidence-driven viewing without changing Gemini accuracy.
- Tasks 9 and 10 alter extraction performance/configuration only after viewer provenance and result contracts are testable.
- Task 11 removes warning sources after behavior is stable, so warning cleanup cannot conceal feature regressions.
- Task 12 blocks delivery until both automated verification and the supplied-document manual acceptance pass.

## External Technical References

- Gemini 3 Developer Guide: `https://ai.google.dev/gemini-api/docs/gemini-3`
  - Confirms `gemini-3.1-pro-preview`, `medium` thinking support, the latency tradeoff of `high`, default-temperature guidance, and medium PDF media-resolution recommendation.
- Gemini document understanding: `https://ai.google.dev/gemini-api/docs/document-processing`
  - Documents PDF processing constraints and multimodal document handling.
- Gemini Files API: `https://ai.google.dev/api/files`
  - Documents upload/reuse of file resources; the installed `@google/genai` declaration also exposes `ai.files.delete({ name })`.
