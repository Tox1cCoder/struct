# Foundation Priority Validation — Left.pdf / Right.pdf

**Status:** Verified 2026-09-29 on branch `fix/priority-geometric-join`. The results below come from the automated golden test and a live browser run (Edge, headless, dev server).

## Inputs

- 認定柱脚資料: `Left.pdf` (= `「ラ・ムー南港店」　認定柱脚資料.pdf`), 6 pages. Page 1 is the placement map.
- 基礎伏図: `Right.pdf` (= `「ラ・ムー南港店」　基礎図　2026.05.08-Model.pdf`), 1 page, rotated 270°.

## Verified expected output

The expected output was verified two independent ways, and both agree:
1. a 600-dpi visual read of both sheets
2. a vector-geometry join computed from the PDFs

```text
F1: C1, C2, C4
F1A: FC1
F1B: C3
F2: C1, P2
F2A: C6
F3: C5
F3A: C1
F4: P1, P2
F5: C3
F6: C1, C3, P1
F7: C1, C3, P1
F8: C1, C3
F9: P1
F9A: FC1
F10: C1
```

Code order within a row is not significant.

Rules applied:
- **Every code in a footing is listed.** Each code whose marker lies inside a footing is reported, including P1/P2 posts.
- **Combined footings list every column.** F6, F7 and F8 each cover two grid intersections.
- **FC codes win.** F1A and F9A carry FC1 in the plan, so FC1 replaces the certified codes.
- **Grade-beam posts are excluded.** 26 P1 posts sit on grade beams outside every footing.

### Earlier fixture was wrong

The previous "reviewed" fixture disagreed with the drawings on 8 of 15 rows:

| Row | Old fixture | Drawings |
| --- | --- | --- |
| F1B | unresolved | C3 (X3A/Y8, X2C/Y7A) |
| F2 | C1, P1, P2 | C1, P2 |
| F2A | unresolved | C6 (X3/Y7A) |
| F4 | P1 | P1, P2 (P2 at X2C/Y7) |
| F6 | C1 | C1, C3, P1 |
| F7 | C3, C1 | C3, C1, P1 |
| F8 | C3 | C3, C1 |
| F9 | C4 | P1 |

The "10/13" and "11/13" accuracy figures recorded for the Gemini quadrant pipeline were measured against that fixture, so they did not measure accuracy.

## What the PDFs contain

- **基礎伏図:** F/FC labels and grid labels are native text. Footings are 0.48 pt stroked rectangles, and all 44 labels have one.
- **Certified map annotations:** the 76 colour markers on 認定柱脚資料 page 1 are PDF Square markup annotations.
- **Embedded labels:** AutoCAD exported its stroke-font text as invisible "AutoCAD SHX Text" annotations, which carry the real characters. They give the code of 73 markers. The three C2 labels have no such annotation and are read by Gemini from rendered crops.
- **Grid label mismatch:** the certified sheet prints the third X grid line as `X2A`, and the plan prints `X2C`. Grids are therefore matched by line order and spacing (scale ratio 1.379 on both axes), never by label.

## Live browser run (2026-09-29)

| Step | Time | Result |
| --- | --- | --- |
| Upload `Right.pdf` (plan) first | 0.3 s | 44 footings, no model call |
| Then upload `Left.pdf` (certified) | 4.9 s | 76 markers, 1 Gemini request for 3 crops |
| Rows shown | — | All 15 match the table above |
| Evidence viewer | — | Plan and certified highlights land on the F8 footing and its C3 marker |

The old pipeline took about 120 s per plan upload and returned different rows between runs.

The only console error is the browser's automatic `/favicon.ico` request returning 404. The app ships no favicon.

## OCR fallback check

The same live check sent all 76 marker crops (not just the 3 unlabelled ones) to `readCertifiedMarkerCodes`. It read 76 of 76 correctly in 16.6 s. That is the expected behaviour for certified PDFs without SHX annotations.

## Automated coverage

- `utils/foundationPriorityGolden.test.ts` runs the real PDFs through pdfjs in Node, with OCR stubbed from the verified reads. It asserts:
  - the table above
  - zero join warnings
  - grid tokens for F7/F8/F1B/F2A
  - certified evidence on every certified-fallback location
  - that embedded labels agree with the visual reads
  - that only the three C2 markers need OCR
- Mutation checks: changing one verified read, or disabling grid-line snapping, makes the golden test fail.
- `npx vitest run`: 44 files, 307 tests pass. `npx tsc --noEmit` and `npm run build` are clean.

## Re-running the browser check

1. `npx vite --port 5199 --strictPort` (needs `VITE_GEMINI_API_KEY` in `.env` for the C2 crops).
2. Open the Foundation Priority tab and upload `Right.pdf`, then `Left.pdf`, in either order.
3. Compare the rows with the table above.
4. Expand F8's evidence and check that both viewer sources highlight the footing and its marker.
