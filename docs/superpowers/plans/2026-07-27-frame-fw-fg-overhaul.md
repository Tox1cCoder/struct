# Frame FW/FG Overhaul Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

Goal: Replace the generic Frame schedule with FW- and FG-specific extraction, editing, and Excel export fields.

Architecture: Model a frame as a discriminated FrameData union (FW or FG) with shared dimensions and type-specific fields. Normalize Gemini response values in a pure utility, then derive visual-table and Excel columns from frameType.

Tech Stack: React 18, TypeScript, Vite, Vitest, Testing Library, @google/genai, SheetJS (xlsx).

---

## File structure

- Modify: types.ts — replace generic reinforcement fields with a FW/FG union.
- Create: utils/frameData.ts and utils/frameData.test.ts — normalization/defaults and manual row creation.
- Create: utils/frameTable.ts and utils/frameTable.test.ts — shared exact output columns and Excel rows.
- Modify: services/geminiService.ts, services/geminiService.test.ts — prompt/schema and normalized response.
- Modify: components/FrameResultsTable.tsx, components/FrameResultsTable.test.tsx — dynamic schedule and editable cells.
- Modify: App.tsx — type-correct manual row construction.

### Task 1: Define and normalize the FW/FG data contract

Files:
- Modify: types.ts:116-128
- Create: utils/frameData.ts
- Create: utils/frameData.test.ts

- [ ] Step 1: Write the failing normalization tests

Create utils/frameData.test.ts:

    import { describe, expect, it } from 'vitest';
    import { createManualFrameData, normalizeFrameData } from './frameData';

    describe('normalizeFrameData', () => {
      it('applies FW defaults and strips D prefixes', () => {
        expect(normalizeFrameData({
          frameType: 'FW', frameName: 'FW2', b: '300', h: '350',
        })).toMatchObject({
          frameType: 'FW', fwBaseRebarDiameter: '13',
          fwVerticalRebarDiameter: '13', fwHorizontalRebarCount: '0',
          fwHorizontalRebarDiameter: '10',
        });
      });

      it('normalizes all requested FG values from source-like text', () => {
        expect(normalizeFrameData({
          frameType: 'FG', frameName: 'FG1B', b: '600', h: '600',
          fgTopRebarDiameter: '7-D25', fgBottomRebarDiameter: 'D25',
          fgStirrupDiameter: 'D13', fgStirrupMaxDistance: 'D13@150',
          fgBellyRebarDiameter: '2-D13', fgWidthStopRebarDiameter: 'D10',
          fgWidthStopRebarMaxDistance: 'D10@1,000以内',
        })).toMatchObject({
          fgTopRebarDiameter: '25', fgBottomRebarDiameter: '25',
          fgStirrupDiameter: '13', fgStirrupMaxDistance: '150',
          fgBellyRebarDiameter: '13', fgWidthStopRebarDiameter: '10',
          fgWidthStopRebarMaxDistance: '1,000',
        });
      });
    });

    it('creates a complete manual FW row with required defaults', () => {
      expect(createManualFrameData('FW')).toMatchObject({
        frameType: 'FW', fwBaseRebarDiameter: '13',
        fwVerticalRebarDiameter: '13', fwHorizontalRebarCount: '0',
        fwHorizontalRebarDiameter: '10',
      });
    });

- [ ] Step 2: Run the test to verify RED

Run: npm test -- utils/frameData.test.ts
Expected: FAIL because ./frameData does not exist.

- [ ] Step 3: Replace the generic Frame interface

In types.ts, replace the current FrameData interface with:

    interface FrameBaseData {
      frameName: string;
      frameType: 'FW' | 'FG';
      b: string;
      h: string;
      bbox?: BoundingBox;
      sourceFileId?: string;
    }
    export interface FWFrameData extends FrameBaseData {
      frameType: 'FW';
      fwBaseRebarDiameter: string;
      fwVerticalRebarDiameter: string;
      fwHorizontalRebarCount: string;
      fwHorizontalRebarDiameter: string;
    }
    export interface FGFrameData extends FrameBaseData {
      frameType: 'FG';
      fgTopRebarDiameter: string;
      fgBottomRebarDiameter: string;
      fgStirrupDiameter: string;
      fgStirrupMaxDistance: string;
      fgBellyRebarDiameter: string;
      fgWidthStopRebarDiameter: string;
      fgWidthStopRebarMaxDistance: string;
    }
    export type FrameData = FWFrameData | FGFrameData;

- [ ] Step 4: Implement the pure normalizer

Create utils/frameData.ts. It exports normalizeFrameData(raw): FrameData | null and createManualFrameData(frameType): FrameData.

Implement these helpers:

    const clean = (value: unknown) =>
      String(value ?? '').replace(/\s*[（(].*?[）)]/g, '').trim();
    const numberAfterD = (value: unknown, fallback = '') => {
      const text = clean(value);
      return text.match(/D\s*(\d+(?:\.\d+)?)/i)?.[1]
        ?? (/^\d+(?:\.\d+)?$/.test(text) ? text : fallback);
    };
    const maximumDistance = (value: unknown) => {
      const text = clean(value);
      return text.match(/@\s*([\d,]+)/)?.[1]
        ?? (/^[\d,]+$/.test(text) ? text : '');
    };

Return null unless frameType, frameName, b, and h are populated. FW always returns base 13, vertical 13 when absent, horizontal count 0 when absent, and horizontal diameter 10 when absent. FG returns all seven requested FG fields with blanks for unavailable optional values. Manual FW rows use the same defaults; manual FG rows have all seven fields blank.

- [ ] Step 5: Run the tests to verify GREEN

Run: npm test -- utils/frameData.test.ts
Expected: PASS.

- [ ] Step 6: Commit

    git add types.ts utils/frameData.ts utils/frameData.test.ts
    git commit -m "feat: define FW and FG frame data schemas"

### Task 2: Replace the Gemini Frame extraction contract

Files:
- Modify: services/geminiService.ts:907-1109
- Modify: services/geminiService.test.ts

- [ ] Step 1: Write failing prompt tests

Append this block to services/geminiService.test.ts and export FRAME_SYSTEM_PROMPT from the service:

    import { FRAME_SYSTEM_PROMPT } from './geminiService';

    describe('FRAME_SYSTEM_PROMPT FW/FG contract', () => {
      it('requires FW circle counting, numeric diameters, and defaults', () => {
        expect(FRAME_SYSTEM_PROMPT).toMatch(/white circles/i);
        expect(FRAME_SYSTEM_PROMPT).toContain('FW_ヨコ筋_本数');
        expect(FRAME_SYSTEM_PROMPT).toMatch(/default.*13/i);
        expect(FRAME_SYSTEM_PROMPT).toMatch(/default.*10/i);
        expect(FRAME_SYSTEM_PROMPT).toMatch(/numeric.*after D/i);
      });

      it('names every FG output field and handles FG1B once', () => {
        expect(FRAME_SYSTEM_PROMPT).toMatch(/FG1B/i);
        expect(FRAME_SYSTEM_PROMPT).toMatch(/one.*row/i);
        for (const name of [
          'FG_上端筋_直径', 'FG_下端筋_直径', 'FG_St_直径',
          'FG_St_距離_最大', 'FG_腹筋_直径', 'FG_巾止筋_直径',
          'FG_巾止筋_距離_最大',
        ]) expect(FRAME_SYSTEM_PROMPT).toContain(name);
      });
    });

- [ ] Step 2: Run the test to verify RED

Run: npm test -- services/geminiService.test.ts
Expected: FAIL because the old prompt has no white-circle or named output-field contract.

- [ ] Step 3: Implement the prompt, response schema, and normalizer integration

In services/geminiService.ts:

1. Import normalizeFrameData from ../utils/frameData and export FRAME_SYSTEM_PROMPT.
2. Replace old generic topRebar*, bottomRebar*, and stirrup* instructions with the exact approved FW and FG output labels. Require frameType (FW or FG), numeric-only diameters, the FW white-circle spatial rule, and one row for split FG1B.
3. Replace generic response properties with frameType, fwBaseRebarDiameter, fwVerticalRebarDiameter, fwHorizontalRebarCount, fwHorizontalRebarDiameter, fgTopRebarDiameter, fgBottomRebarDiameter, fgStirrupDiameter, fgStirrupMaxDistance, fgBellyRebarDiameter, fgWidthStopRebarDiameter, and fgWidthStopRebarMaxDistance. Require only frameType, frameName, b, and h.
4. Replace validation/mapping with:

    const normalizedData = rawData
      .map((item: Record<string, unknown>) =>
        normalizeFrameData({ ...item, bbox: parseBoundingBox(item.bbox) }),
      )
      .filter((item): item is FrameData => item !== null);

    if (normalizedData.length === 0) {
      throw new Error('No valid frame data found in response');
    }
    return normalizedData;

- [ ] Step 4: Run the test to verify GREEN

Run: npm test -- services/geminiService.test.ts utils/frameData.test.ts
Expected: PASS.

- [ ] Step 5: Commit

    git add services/geminiService.ts services/geminiService.test.ts
    git commit -m "feat: extract FW and FG specific frame fields"

### Task 3: Centralize exact table and Excel columns

Files:
- Create: utils/frameTable.ts
- Create: utils/frameTable.test.ts
- Modify: components/FrameResultsTable.tsx:1-90

- [ ] Step 1: Write failing table-mapping tests

Create utils/frameTable.test.ts. Assert these exact header arrays:

    expect(getFrameColumns('FW').map(({ header }) => header)).toEqual([
      'Frame Name', 'b', 'h', 'FW_ベース筋_直径', 'FW_タテ筋_直径',
      'FW_ヨコ筋_本数', 'FW_ヨコ筋_直径',
    ]);
    expect(getFrameColumns('FG').map(({ header }) => header)).toEqual([
      'Frame Name', 'b', 'h', 'FG_上端筋_直径', 'FG_下端筋_直径',
      'FG_St_直径', 'FG_St_距離_最大', 'FG_腹筋_直径',
      'FG_巾止筋_直径', 'FG_巾止筋_距離_最大',
    ]);
    expect(buildFrameExportRows([fwRow])).toEqual([
      ['FW1', '300', '350', '13', '13', '3', '10'],
    ]);

- [ ] Step 2: Run the test to verify RED

Run: npm test -- utils/frameTable.test.ts
Expected: FAIL because the module does not exist.

- [ ] Step 3: Implement shared column mappings

Create utils/frameTable.ts with FrameColumn { header: string; key: string }. getFrameColumns(frameType) returns the shared Frame Name, b, h fields plus only the exact FW fields listed above for FW or the exact FG fields listed above for FG. Implement:

    export const buildFrameExportRows = (rows: FrameData[]) => {
      const columns = getFrameColumns(rows[0]?.frameType ?? 'FW');
      return rows.map((row) =>
        columns.map(({ key }) => String((row as Record<string, unknown>)[key] ?? '')),
      );
    };

- [ ] Step 4: Update FrameResultsTable

Use:

    const frameType = data[0]?.frameType ?? 'FW';
    const columns = getFrameColumns(frameType);
    const headers = columns.map(({ header }) => header);
    const rows = buildFrameExportRows(data);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = headers.map((header) => ({ wch: Math.max(10, header.length + 2) }));

Replace the fixed grouped top/bottom/stirrup markup with a mapped header and mapped editable cells. Each input must have its frame-name and header as the accessible label and patch the matching column key. Preserve selection, source view, delete, manual, and edited behaviors.

- [ ] Step 5: Run the test to verify GREEN

Run: npm test -- utils/frameTable.test.ts
Expected: PASS.

- [ ] Step 6: Commit

    git add utils/frameTable.ts utils/frameTable.test.ts components/FrameResultsTable.tsx
    git commit -m "feat: render type-specific Frame columns"

### Task 4: Finish app wiring and UI coverage

Files:
- Modify: components/FrameResultsTable.test.tsx
- Modify: App.tsx:223-243

- [ ] Step 1: Replace the generic component test with failing FW and FG cases

Use a typed FW fixture. Assert FW_ヨコ筋_本数 is editable, an FG field is absent, and editing it patches fwHorizontalRebarCount. Add a typed FG fixture asserting FG_巾止筋_距離_最大 is editable and an FW field is absent. Retain add/delete assertions.

- [ ] Step 2: Run the test to verify RED

Run: npm test -- components/FrameResultsTable.test.tsx
Expected: FAIL because the current component renders removed generic fields.

- [ ] Step 3: Use the active type for manual rows

In App.tsx, import createManualFrameData and replace the generic manual fields with:

    const frameType = state.rows[0]?.frameType ?? 'FW';
    return addManualRow(state, {
      rowId: id,
      sourceKey: id,
      sourceFileIds: [],
      provenance: 'manual',
      edited: true,
      ...createManualFrameData(frameType),
    });

- [ ] Step 4: Resolve type narrowing

Keep handlePatch as Partial<FrameData>. Where a mapped type-specific field needs indexing, cast only the computed patch to Partial<FrameData>. Do not restore generic reinforcement fields.

- [ ] Step 5: Run targeted tests to verify GREEN

Run: npm test -- components/FrameResultsTable.test.tsx utils/frameData.test.ts utils/frameTable.test.ts
Expected: PASS.

- [ ] Step 6: Commit

    git add App.tsx components/FrameResultsTable.test.tsx
    git commit -m "feat: edit FW and FG frame schedules"

### Task 5: Verify the complete refactor

Files:
- Verify only.

- [ ] Step 1: Confirm legacy frame fields are gone

Run: rg -n "topRebarD|topRebarValue|bottomRebarD|bottomRebarValue|stirrupD|stirrupValue" App.tsx components services types.ts utils
Expected: no matches.

- [ ] Step 2: Run all automated tests

Run: npm test
Expected: all Vitest suites pass.

- [ ] Step 3: Run a production build

Run: npm run build
Expected: Vite completes successfully.

- [ ] Step 4: Check the worktree

Run: git diff --check && git status --short
Expected: no whitespace errors and only intentional changes.

- [ ] Step 5: Commit final fixes if verification required any

    git add -A
    git commit -m "test: verify Frame FW and FG overhaul"

