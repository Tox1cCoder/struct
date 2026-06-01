# Foundation Priority Validation — Left.pdf / Right.pdf

**Status:** SCAFFOLD ONLY. Live Gemini run + manual review required to fill in.

## Inputs

- 認定柱脚資料: `Left.pdf` (6 pages, certified column base details)
- 基礎伏図: `Right.pdf` (1 page, foundation plan with FC/F/X/Y labels)

## Procedure

1. Start dev server with `VITE_GEMINI_API_KEY` set:
   ```powershell
   npm run dev
   ```
2. Open the Foundation Priority tab.
3. Upload `Left.pdf` as 認定柱脚資料 and `Right.pdf` as 基礎伏図.
4. After extraction completes:
   - Record the StatusStrip diagnostic line for each file (duration + pass).
   - Copy the merged text from the result panel.
   - Expand each row's evidence; confirm 基礎伏図 is the default and 認定柱脚資料 is available where matched.
5. Compare every output code with the visible PDFs and note any discrepancies.

## Reviewed Expected Output

(Fill after manual review)

```
F?: ?
F?: ?
...
```

For each foundation: note whether each code originates from plan FC or matched certified C/P fallback.

## Diagnostics (record after live run)

| File | Pass used | Upload (s) | Primary gen (s) | Primary validate (s) | Fallback gen (s) | Fallback validate (s) | Total (s) |
| ---- | --------- | ---------- | --------------- | -------------------- | ---------------- | --------------------- | --------- |
| Left.pdf | | | | | | | |
| Right.pdf | | | | | | | |

## Evidence coverage

| Foundation | Code | Plan page+bbox? | Certified page+bbox? | Notes |
| ---------- | ---- | --------------- | -------------------- | ----- |

## Candidate Comparison (Task 10 Step 3)

| Candidate | Primary config | Escalation config | Run 1 outcome | Run 2 outcome | Accept? |
| --------- | -------------- | ----------------- | ------------- | ------------- | ------- |
| A | 3.1 Pro MEDIUM thinking / MEDIUM media | 3.1 Pro HIGH / MEDIUM media | | | |
| B | 3.1 Pro HIGH / MEDIUM media | same | | | |
| C | A + refined prompt | 3.1 Pro HIGH / MEDIUM | | | |

## Decision

(Final accepted config and reasoning after candidate runs)

## Automated regression record (2026-05-28)

- `npm test`: 17 test files, 69 tests pass.
- `npm run build`: succeeds with no `/index.css` warning and no chunk-size warning.
  Largest chunk: `spreadsheet` 424 kB (xlsx). Tailwind moved off the CDN; PDF.js cMaps and standard fonts copied via `vite-plugin-static-copy`.
- Pre-existing automated-test count before this branch was 7 files / 52 tests.

## Pending manual work (Task 12 — user runs)

1. Multi-upload + edit acceptance (Task 12 Step 2) — exercise all four upload zones while one is processing; edit/add/delete and confirm persistence across edits and re-uploads.
2. Foundation Priority acceptance with Left.pdf/Right.pdf (Task 12 Step 3) — compare merged text and evidence against the PDFs; record diagnostics here.
3. Browser-console walkthrough on production preview (Task 12 Step 4) — `npm run preview`, open each tab, check DevTools console.

