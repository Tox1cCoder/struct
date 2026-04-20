# Foundation Column Priority Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third tab that merges `認定柱脚資料` and `基礎伏図` PDF extractions into plain text with `FC` priority and `C` fallback per foundation.

**Architecture:** Extend the current React tabbed shell with a focused third workflow. Keep extraction responsibilities in `services/geminiService.ts`, precedence logic in a new utility, and the final rendering in a small plain-text result component. Drive the precedence logic with unit tests before implementation.

**Tech Stack:** React 18, TypeScript, Vite, Gemini API, Vitest

---

### Task 1: Add Test Harness And Lock The Merge Contract

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `utils/mergeFoundationPriority.test.ts`
- Create: `utils/mergeFoundationPriority.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { buildFoundationPriorityText } from './mergeFoundationPriority';

describe('buildFoundationPriorityText', () => {
  it('prefers FC values from the foundation plan over fallback C values', () => {
    const result = buildFoundationPriorityText(
      [{ foundation: 'F11', columnType: 'C1' }],
      [{ foundation: 'F11', columnType: 'FC1' }]
    );

    expect(result.lines).toEqual(['F11: FC1']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run utils/mergeFoundationPriority.test.ts`
Expected: FAIL because `buildFoundationPriorityText` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export interface FoundationPriorityRow {
  foundation: string;
  columnType: string;
}

export const buildFoundationPriorityText = (
  fallbackRows: FoundationPriorityRow[],
  planRows: FoundationPriorityRow[],
) => {
  return {
    lines: ['F11: FC1'],
    text: 'F11: FC1',
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run utils/mergeFoundationPriority.test.ts`
Expected: PASS with 1 test passed.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts utils/mergeFoundationPriority.test.ts utils/mergeFoundationPriority.ts
git commit -m "test: add foundation priority merge coverage"
```

### Task 2: Expand Merge Logic Coverage To Final Rules

**Files:**
- Modify: `utils/mergeFoundationPriority.test.ts`
- Modify: `utils/mergeFoundationPriority.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('falls back to certified C values when the foundation plan has no FC value', () => {
  const result = buildFoundationPriorityText(
    [{ foundation: 'F2', columnType: 'C3' }],
    [{ foundation: 'F2', columnType: 'C9' }]
  );

  expect(result.lines).toEqual(['F2: C3']);
});

it('sorts foundations naturally and removes duplicates', () => {
  const result = buildFoundationPriorityText(
    [{ foundation: 'F10', columnType: 'C2' }, { foundation: 'F2', columnType: 'C1' }],
    [{ foundation: 'F2', columnType: 'FC1' }, { foundation: 'F2', columnType: 'FC1' }]
  );

  expect(result.lines).toEqual(['F2: FC1', 'F10: C2']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run utils/mergeFoundationPriority.test.ts`
Expected: FAIL because the hard-coded implementation does not satisfy all rules.

- [ ] **Step 3: Write minimal implementation**

```ts
const isFcCode = (value: string) => /^FC/i.test(value);

const naturalCompare = (left: string, right: string) =>
  left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });

export const buildFoundationPriorityText = (
  fallbackRows: FoundationPriorityRow[],
  planRows: FoundationPriorityRow[],
) => {
  const byFoundation = new Map<string, string>();

  for (const row of fallbackRows) {
    if (row.foundation && row.columnType && !byFoundation.has(row.foundation)) {
      byFoundation.set(row.foundation, row.columnType);
    }
  }

  for (const row of planRows) {
    if (row.foundation && row.columnType && isFcCode(row.columnType)) {
      byFoundation.set(row.foundation, row.columnType);
    }
  }

  const lines = [...byFoundation.entries()]
    .sort(([left], [right]) => naturalCompare(left, right))
    .map(([foundation, columnType]) => `${foundation}: ${columnType}`);

  return { lines, text: lines.join('\n') };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run utils/mergeFoundationPriority.test.ts`
Expected: PASS with all tests passed.

- [ ] **Step 5: Commit**

```bash
git add utils/mergeFoundationPriority.test.ts utils/mergeFoundationPriority.ts
git commit -m "feat: implement foundation priority merge rules"
```

### Task 3: Add Extraction Types And Gemini Service Functions

**Files:**
- Modify: `types.ts`
- Modify: `services/geminiService.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('normalizes foundation priority rows before merging', () => {
  const result = buildFoundationPriorityText(
    [{ foundation: ' F11 ', columnType: ' C1 ' }],
    [{ foundation: 'F11', columnType: ' FC1 ' }]
  );

  expect(result.lines).toEqual(['F11: FC1']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run utils/mergeFoundationPriority.test.ts`
Expected: FAIL because the merge utility does not normalize whitespace yet.

- [ ] **Step 3: Write minimal implementation**

```ts
const normalizeLabel = (value: string) => value.trim().toUpperCase();
```

Update the merge utility to use `normalizeLabel()` for both `foundation` and `columnType`. Then add these types and service signatures:

```ts
export interface FoundationPriorityData {
  foundation: string;
  columnType: string;
  sourceFileName?: string;
}

export interface FoundationPriorityFileResult {
  id: string;
  fileName: string;
  status: ProcessingStatus;
  data: FoundationPriorityData[];
  error?: string;
}
```

```ts
export const extractCertifiedFoundationData = async (
  base64Data: string,
  mimeType: string,
): Promise<FoundationPriorityData[]> => { /* ... */ };

export const extractFoundationPlanPriorityData = async (
  base64Data: string,
  mimeType: string,
): Promise<FoundationPriorityData[]> => { /* ... */ };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run utils/mergeFoundationPriority.test.ts`
Expected: PASS with all tests passed.

- [ ] **Step 5: Commit**

```bash
git add types.ts services/geminiService.ts utils/mergeFoundationPriority.ts utils/mergeFoundationPriority.test.ts
git commit -m "feat: add foundation priority extraction services"
```

### Task 4: Build The Plain Text Result Component

**Files:**
- Create: `components/FoundationPriorityTextResult.tsx`

- [ ] **Step 1: Write the failing test**

Skip UI automation for this repo. Use the tested merge utility contract and keep this component stateless.

- [ ] **Step 2: Run test to verify it fails**

No separate UI test command for this repo. The component will be verified by the final `vite build`.

- [ ] **Step 3: Write minimal implementation**

```tsx
export const FoundationPriorityTextResult = ({ text, count }: Props) => (
  <div>
    <button type="button">Copy</button>
    <pre>{text}</pre>
    <span>{count} foundations</span>
  </div>
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build`
Expected: PASS with a successful Vite production build.

- [ ] **Step 5: Commit**

```bash
git add components/FoundationPriorityTextResult.tsx
git commit -m "feat: add foundation priority text result view"
```

### Task 5: Integrate The Third Tab Into The App

**Files:**
- Modify: `App.tsx`

- [ ] **Step 1: Write the failing test**

Use the existing merge utility coverage as the behavior lock. There is no existing UI test harness for the tab shell.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run utils/mergeFoundationPriority.test.ts`
Expected: PASS. The remaining failure will be at integration time until the app builds cleanly with the new tab wiring.

- [ ] **Step 3: Write minimal implementation**

Wire a new tab that:

- stores `認定柱脚資料` file results
- stores `基礎伏図` file results
- processes files with the new service functions
- computes merged text with `buildFoundationPriorityText()`
- renders two PDF upload zones and the plain-text result component

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run utils/mergeFoundationPriority.test.ts && npm run build`
Expected: PASS with merge tests green and the app building successfully.

- [ ] **Step 5: Commit**

```bash
git add App.tsx
git commit -m "feat: add foundation priority tab"
```
