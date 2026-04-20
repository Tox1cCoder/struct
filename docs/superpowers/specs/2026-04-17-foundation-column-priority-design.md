# Foundation Column Priority Tab Design

## Goal

Add a third tab that accepts two PDF inputs, `認定柱脚資料` and `基礎伏図`, then outputs plain text with one line per foundation in the form `Fxx: Cx` or `Fxx: FCx`.

## User Workflow

1. The user opens the third tab.
2. The user uploads one or more `認定柱脚資料` PDFs.
3. The user uploads one or more `基礎伏図` PDFs.
4. The app extracts normalized foundation-to-column rows from each source.
5. The app merges the two sources locally.
6. The app renders a read-only plain-text block and copy action.

## Data Rules

- Output one line per foundation label.
- Preserve the full detected code, such as `C1` or `FC1`.
- If any `FC...` value is present for a foundation in `基礎伏図`, that value wins.
- If no `FC...` value is present in `基礎伏図`, fall back to the `C...` value extracted from `認定柱脚資料`.
- Foundation ordering does not need to match the PDF layout. Natural alphanumeric sorting is acceptable.

## Architecture

The feature extends the existing tabbed React app and reuses the existing PDF upload component. Two Gemini extraction functions return narrow, normalized rows. A dedicated merge utility resolves precedence without relying on model behavior for the final decision. A small presentational component renders the merged plain-text output.

## Components

### App Integration

`App.tsx` will add a third tab, dedicated state for each PDF source, async handlers for both upload zones, and one computed output string derived from successful extraction results.

### Gemini Extraction

`services/geminiService.ts` will add:

- one function for extracting `foundation` plus fallback `columnType` from `認定柱脚資料`
- one function for extracting `foundation` plus detected `columnType` from `基礎伏図`, with explicit instructions to preserve `FC...` values

Both functions will use JSON response schemas and local post-processing for trimming and normalization.

### Merge Utility

`utils/mergeFoundationPriority.ts` will:

- normalize foundation and column labels
- group rows by foundation
- choose an `FC...` value from `基礎伏図` when available
- otherwise choose the fallback `C...` value from `認定柱脚資料`
- return sorted lines plus the final joined plain-text output

### Plain Text Result View

A new component will render:

- the merged output in a read-only, copyable text area or preformatted block
- a copy button
- a small status summary showing the number of resolved foundations

## Error Handling

- Each source keeps the existing per-file status model: `PENDING`, `PROCESSING`, `SUCCESS`, `ERROR`.
- Failed files do not block successful files from contributing to the output.
- If no merged result is available, the plain-text result panel stays hidden.
- The merge utility ignores blank or malformed rows after normalization.

## Testing Strategy

The priority logic will be covered with automated tests before implementation changes:

- `FC` from `基礎伏図` overrides fallback `C`
- fallback `C` is used when no `FC` exists in `基礎伏図`
- duplicate rows collapse to one line per foundation
- natural sorting keeps `F2` before `F10`
- blank and malformed values are ignored

## Scope Boundaries

- No table view
- No Excel export
- No PDF text-parser fallback outside Gemini
- No changes to the existing first two tabs beyond shared utility reuse
