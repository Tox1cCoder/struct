# Foundation Priority C-Code Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display every generated numeric-prefixed C code without its leading numeric prefix and merge it with the equivalent unprefixed code.

**Architecture:** Keep extraction and extraction-response normalization unchanged. Canonicalize the selected code inside `buildFoundationPriorityText` immediately before it becomes the per-foundation resolution key, so rows, copied text, evidence headings, and deduplication all use the same result-layer value while retaining every evidence location.

**Tech Stack:** TypeScript, React, Vitest, Vite

## Global Constraints

- Apply normalization only to generated Foundation Priority results.
- Remove one or more leading digits only when they occur immediately before `C` in a valid code.
- Leave `FC1`, `C3009`, `P1`, raw extraction rows, extraction prompts, and manually entered codes unchanged.
- Preserve existing resolution priority, ordering, and evidence aggregation behavior.

---

### Task 1: Canonicalize and merge generated C-code results

**Files:**
- Modify: `utils/mergeFoundationPriority.test.ts`
- Modify: `utils/mergeFoundationPriority.ts`
- Modify: `tests/fixtures/foundationPriorityLeftRight.ts`
- Modify: `docs/validation/foundation-priority-left-right.md`

**Interfaces:**
- Consumes: `buildFoundationPriorityText(certifiedRows: CertifiedCoordinateRow[], foundationPlanRows: FoundationPlanCoordinateRow[]): FoundationPriorityTextResult`
- Produces: unchanged public interface; generated `codes` and `resolutions[].columnType` values use the canonical result code.

- [ ] **Step 1: Write the failing result-normalization regression test**

Add this test to `utils/mergeFoundationPriority.test.ts`:

```ts
it('removes numeric C prefixes and merges equivalent result codes with all evidence', async () => {
  const { buildFoundationPriorityText } = await import('./mergeFoundationPriority');

  const result = buildFoundationPriorityText(
    [
      { xAxis: 'X1', yAxis: 'Y1', columnType: '1C1' },
      { xAxis: 'X2', yAxis: 'Y2', columnType: 'C1' },
      { xAxis: 'X3', yAxis: 'Y3', columnType: '12C4' },
    ],
    [
      { foundation: 'F1', xAxis: 'X1', yAxis: 'Y1', planColumnType: '' },
      { foundation: 'F1', xAxis: 'X2', yAxis: 'Y2', planColumnType: '' },
      { foundation: 'F1', xAxis: 'X3', yAxis: 'Y3', planColumnType: '' },
    ],
  );

  expect(result.lines).toEqual(['F1: C1, C4']);
  expect(result.rows[0].codes).toEqual(['C1', 'C4']);
  expect(result.rows[0].resolutions.map((resolution) => ({
    columnType: resolution.columnType,
    evidenceCount: resolution.locations.length,
  }))).toEqual([
    { columnType: 'C1', evidenceCount: 2 },
    { columnType: 'C4', evidenceCount: 1 },
  ]);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npx vitest run utils/mergeFoundationPriority.test.ts
```

Expected: FAIL because the current result is `F1: 1C1, C1, 12C4` rather than `F1: C1, C4`.

- [ ] **Step 3: Implement minimal result-layer canonicalization**

In `utils/mergeFoundationPriority.ts`, add the private helper next to the existing code predicates:

```ts
const normalizeResultColumnCode = (value: string) => value.replace(/^\d+(?=C)/, '');
```

After the existing resolution selection and null guard, canonicalize the selected value before `byColumnType.get(...)` and `byColumnType.set(...)` use it:

```ts
if (!resolvedColumnType || !method) continue;
resolvedColumnType = normalizeResultColumnCode(resolvedColumnType);
```

Do not change `normalizeCertifiedRow`, `normalizeFoundationPlanRow`, `coordinateExtraction.ts`, or any Gemini prompt.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
npx vitest run utils/mergeFoundationPriority.test.ts
```

Expected: all tests in the file pass. Existing cases prove `FC1`, `C3009`, and `P1` remain unchanged.

- [ ] **Step 5: Update reviewed golden expectations and validation text**

In `tests/fixtures/foundationPriorityLeftRight.ts`, replace numeric-prefixed C codes in `EXPECTED_PRIORITY_ROWS` with their canonical result values (`1C1` to `C1`, through `1C5` to `C5`) and revise the comment to state that result canonicalization removes both the apostrophe and numeric prefix.

In `docs/validation/foundation-priority-left-right.md`, update the reviewed output, evidence table, and canonicalization explanation to show `C1` through `C5`. Keep source-document descriptions clear that the extracted certified labels can still be `1'C1` through `1'C6`.

- [ ] **Step 6: Run complete verification**

Run:

```powershell
npm test
npm run build
git diff --check
```

Expected: all tests pass, the Vite production build succeeds, and `git diff --check` reports no whitespace errors.

- [ ] **Step 7: Commit the implementation**

```powershell
git add -- utils/mergeFoundationPriority.ts utils/mergeFoundationPriority.test.ts tests/fixtures/foundationPriorityLeftRight.ts docs/validation/foundation-priority-left-right.md
git commit -m "fix: normalize numeric C prefixes in priority results"
```
