# Foundation Priority Validation — Left.pdf / Right.pdf

**Status:** Automated source review and live API candidate runs recorded on 2026-07-28. Browser click-through remains pending because no in-app browser was available in the verification environment.

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

Canonical codes remove the display apostrophe from certified labels (`1'C1` → `1C1`) without dropping the numeric prefix.

```text
F1: 1C1, 1C2, 1C4
F1A: FC1
F1B: unresolved — confirm two between-grid placements in the evidence viewer
F2: 1C1, P1, P2
F2A: unresolved — confirm the adjacent 1C6/P2 evidence at Y7A
F3: 1C5
F3A: 1C1
F4: P1
F5: 1C3
F6: 1C1
F7: 1C3, 1C1
F8: 1C3
F9: 1C4
F9A: FC1
F10: 1C1
```

`F1A` and `F9A` originate from visible plan `FC1` labels. Other resolved codes use the certified placement map. The two explicitly unresolved labels are retained in the golden fixture so extraction coverage cannot silently omit them.

## Diagnostics (record after live run)

| File | Pass used | Upload (s) | Primary gen (s) | Primary validate (s) | Fallback gen (s) | Fallback validate (s) | Total (s) |
| ---- | --------- | ---------- | --------------- | -------------------- | ---------------- | --------------------- | --------- |
| Left.pdf, legacy independent run 1 | primary | 0.3 | 46.8 | <0.1 | — | — | 47.1 |
| Right.pdf, legacy independent run 1 | escalated | 0.1 | 35.5 | <0.1 | 24.0 | <0.1 | 59.5 |
| Left.pdf, legacy independent run 2 | primary | 0.4 | 23.3 | <0.1 | — | — | 23.7 |
| Right.pdf, legacy independent run 2 | escalated | 0.1 | 41.1 | <0.1 | 74.1 | <0.1 | 115.3 |

The independent-coordinate pipeline achieved full label coverage but only 1/13 exact reviewed resolved mappings in both runs. It was therefore rejected despite passing its structural coverage gate.

The replacement paired-quadrant pipeline renders four corresponding high-resolution regions from page 1 of both PDFs and sends the four region pairs concurrently to Gemini 3.1 Pro Preview with medium thinking. Live candidate results:

| Run | Wall time | Exact reviewed resolved mappings | Notes |
| --- | --------- | -------------------------------- | ----- |
| 1 | 81.1 s | 10/13 | FC precedence applied; remaining errors concentrated in F2/F9/F4 aggregation. |
| 2 | 77.6 s | 11/13 | Exact-grid prompt recovered F2 and F4; F1 had one extra candidate and F9 remained incorrect. |

## Evidence coverage

| Foundation | Code | Plan page | Certified page | Notes |
| ---------- | ---- | --------- | -------------- | ----- |
| F1 | 1C1, 1C2, 1C4 | 1 | 1 | Multiple placements |
| F1A | FC1 | 1 | — | Plan FC priority |
| F1B | unresolved | 1 | 1 | Between-grid viewer confirmation required |
| F2 | 1C1, P1, P2 | 1 | 1 | Multiple placements |
| F2A | unresolved | 1 | 1 | Adjacent 1C6/P2 viewer confirmation required |
| F3 | 1C5 | 1 | 1 | Certified fallback |
| F3A | 1C1 | 1 | 1 | Certified fallback |
| F4 | P1 | 1 | 1 | Repeated perimeter placements |
| F5 | 1C3 | 1 | 1 | Certified fallback |
| F6 | 1C1 | 1 | 1 | Certified fallback |
| F7 | 1C3, 1C1 | 1 | 1 | Two placements |
| F8 | 1C3 | 1 | 1 | Certified fallback |
| F9 | 1C4 | 1 | 1 | Certified fallback |
| F9A | FC1 | 1 | — | Plan FC priority |
| F10 | 1C1 | 1 | 1 | Certified fallback |

## Candidate Comparison (Task 10 Step 3)

| Candidate | Primary config | Escalation config | Run 1 outcome | Run 2 outcome | Accept? |
| --------- | -------------- | ----------------- | ------------- | ------------- | ------- |
| A | Independent 3.1 Pro MEDIUM / MEDIUM PDFs | 3.1 Pro HIGH / MEDIUM PDF | 1/13, 106.6 s | 1/13, 139.0 s | No |
| B | Joint 3.1 Pro MEDIUM / HIGH full-page images | none | 3/13, 68.3 s | — | No |
| C | Four parallel joint quadrants, 3.1 Pro MEDIUM / HIGH images | none | 10/13, 81.1 s | 11/13, 77.6 s | Yes, best measured candidate |

## Decision

Use candidate C when both source PDFs are available, with deterministic native plan-label inventory, code canonicalization, and FC precedence. Keep the independent PDF pipeline as a fallback when paired browser rendering is unavailable.

This is a material accuracy and latency improvement, but not a claim of perfect extraction: the two live runs reached 10/13 and 11/13 exact reviewed resolved rows. The UI must continue to expose warnings/evidence, and F1/F9 should receive manual review for this sample.

## Automated regression record (2026-05-28)

- `npm test`: 17 test files, 69 tests pass.
- `npm run build`: succeeds with no `/index.css` warning and no chunk-size warning.
  Largest chunk: `spreadsheet` 424 kB (xlsx). Tailwind moved off the CDN; PDF.js cMaps and standard fonts copied via `vite-plugin-static-copy`.
- Pre-existing automated-test count before this branch was 7 files / 52 tests.

## Pending manual work (Task 12 — user runs)

1. Multi-upload + edit acceptance (Task 12 Step 2) — exercise all four upload zones while one is processing; edit/add/delete and confirm persistence across edits and re-uploads.
2. Foundation Priority acceptance with Left.pdf/Right.pdf (Task 12 Step 3) — compare merged text and evidence against the PDFs; record diagnostics here.
3. Browser-console walkthrough on production preview (Task 12 Step 4) — `npm run preview`, open each tab, check DevTools console.
