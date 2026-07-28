# Gemini PDF Accuracy and Latency Design

**Date:** 2026-07-28
**Status:** Approved design

## Objective

Improve extraction accuracy for PDF documents, especially the Foundation Priority tab, while reducing avoidable Gemini latency. Use `gemini-3.1-pro-preview` where document reasoning benefits from it without slowing image-only workflows that already have a lower-latency model.

## Current State and Evidence

The application has three extraction paths:

- Column Reinforcement accepts PDFs and images and currently calls `gemini-3-flash-preview` for both.
- Frame extraction is image-oriented and currently calls `gemini-3.6-flash`.
- Foundation Priority accepts two PDFs and already calls `gemini-3.1-pro-preview` with `HIGH` thinking on both primary and escalated passes.

A live diagnostic run against the repository fixtures produced the following baseline:

- `Left.pdf` primary generation: approximately 140 seconds.
- `Right.pdf` primary generation: approximately 137 seconds.
- File preparation: 3-26 milliseconds, so upload/base64 preparation was not the bottleneck.
- The final merge resolved only `F1`, `F1A`, `F2`, and `F3`, although the foundation plan contains many more visible foundation labels.
- The plan pass found two `FC1` values. Because the fallback condition only checks whether *any* plan code was returned, those two values prevented the direct-mapping fallback from running.

The supplied PDFs are vector documents with native searchable text. `Right.pdf` contains foundation, axis, and column tokens with page coordinates, so the pipeline can use deterministic text anchors rather than relying exclusively on visual OCR.

The repository validation file is currently a procedure scaffold and does not contain a reviewed expected result. Model or prompt changes therefore have no complete accuracy gate.

## Chosen Approach

Use a hybrid document pipeline:

1. Route PDF inputs to `gemini-3.1-pro-preview`.
2. Keep image-only Frame extraction on `gemini-3.6-flash`.
3. Keep non-PDF Column Reinforcement inputs on their existing Flash path unless a fixture demonstrates that Pro materially improves them.
4. Preprocess PDFs locally to extract native text anchors and normalized page coordinates.
5. Run a balanced Pro primary pass with `MEDIUM` thinking and `MEDIUM` PDF media resolution.
6. Validate completeness against the native-text inventory, not merely whether the response contains one usable row.
7. Escalate only missing or unresolved material with a targeted prompt and, when useful, a rendered crop. Avoid repeating the whole high-thinking request by default.

Google documents `MEDIUM` media resolution as the recommended PDF setting and notes that PDF quality usually saturates there. `HIGH` is reserved for cases where evaluation demonstrates a benefit. References:

- <https://ai.google.dev/gemini-api/docs/models/gemini-3.1-pro-preview>
- <https://ai.google.dev/gemini-api/docs/generate-content/media-resolution?hl=en>
- <https://ai.google.dev/gemini-api/docs/document-processing>

## Scope

### Included

- MIME-aware model routing for PDF versus image inputs.
- Native PDF text-anchor extraction with PDF.js.
- Foundation Priority prompt augmentation with compact spatial anchors.
- Coverage-based validation and targeted escalation.
- Request configuration changes for thinking level and media resolution.
- Job-local caching of prepared PDF data.
- Accuracy and latency diagnostics.
- A reviewed golden fixture for `Left.pdf` and `Right.pdf`.
- Automated regression tests for routing, preprocessing, escalation, and merging.

### Excluded

- A general OCR service or server-side document-processing backend.
- Changing the report-generation tab.
- Replacing user editing or evidence-viewer behavior.
- Sending every image through Pro.
- Treating `HIGH` resolution or thinking as the default.

## Architecture

### Model routing

Introduce explicit request policies rather than embedding model names in individual extraction functions:

- `PDF_DOCUMENT_MODEL = 'gemini-3.1-pro-preview'`
- Column PDF requests use the PDF document policy.
- Column image requests retain the existing Flash policy.
- Foundation Priority uses the PDF document policy.
- Frame extraction retains `FRAME_MODEL = 'gemini-3.6-flash'`.

The policy owns model, API version, thinking level, media resolution, and response configuration. Extraction prompts remain task-specific.

### PDF preprocessing

Add a focused PDF preprocessing utility using the existing `pdfjs-dist` dependency. It will:

1. Read each page's native text items.
2. Normalize page rotation and convert item bounds to the application's 0-1000 bounding-box coordinate system.
3. Retain only task-relevant anchors:
   - foundation labels such as `F1`, `F1A`, and `F10`;
   - plan column labels such as `FC1`, `C1`, and `P1`;
   - grid labels such as `X1`, `X2C`, `Y7`, and `Y7A`.
4. Preserve page number, normalized bounding box, and exact source text.
5. Deduplicate repeated labels only when both normalized text and spatial location match.

The preprocessor returns an empty, valid anchor inventory for scanned or malformed PDFs. That condition falls back to the model's native PDF vision without failing the job.

### Foundation Priority primary pass

The primary request contains, in order:

1. The original PDF part.
2. A compact anchor manifest grouped by page and label type.
3. The task prompt and structured-output schema.

Primary configuration:

- Model: `gemini-3.1-pro-preview`
- Thinking: `MEDIUM`
- PDF media resolution: `MEDIUM`
- Candidate count: `1`
- Sampling controls: Gemini defaults
- Structured JSON output: enabled

The prompt states that anchors are deterministic evidence from the same PDF, while the model remains responsible for interpreting spatial relationships and returning the task schema.

### Completeness validation

For a foundation-plan PDF with native anchors, build an expected set from tokens whose leading text matches `^F(?:K?\d+[A-Z]?)(?=$|[（(])`. This accepts standalone labels such as `F1`, `F10`, and `FK1`, plus labels joined to elevation notes such as `F1A(設計GL-1,500)`. Classify `FC...` as plan-column labels first; labels beginning `FG`, `FW`, or `FWS` are frame labels and never enter the expected foundation set. After normalization, compute:

- expected foundation count;
- returned foundation count;
- missing foundation labels;
- rows with readable coordinates;
- rows with a plan column code;
- rows resolvable through either plan code or certified-coordinate evidence.

The primary result is complete only when every expected foundation label appears in at least one normalized plan row and every returned row contains either a readable coordinate or a usable direct code. A few returned `FC` values cannot suppress escalation for missing foundations.

When native anchors are unavailable, retain structural checks: at least one normalized row must exist, at least one plan row must contain a readable X/Y coordinate, and a direct-mapping pass runs when no usable plan code is produced.

Certified-coordinate extraction receives the anchor manifest but retains its structural runtime gate: at least one normalized X/Y/code row must exist. Native anchors do not provide a reliable deterministic pairing between axes and certified codes, so certified completeness is enforced by the reviewed golden fixture rather than an invented runtime pairing heuristic.

### Targeted escalation

Escalation receives:

- the original source;
- the anchor manifest;
- the exact missing labels or unresolved coordinates;
- the accepted primary rows, so the model returns only missing evidence.

Use `HIGH` thinking only for this targeted pass. Keep PDF media resolution at `MEDIUM` by default because higher PDF resolution is not expected to improve normal OCR. If an unresolved label has a known native-text bounding box and the surrounding drawing is visually dense, render a bounded high-resolution image crop around that location and attach it as `HIGH`-resolution image media. Expand the label bounds by 10% of page width and height in each direction, clamp to the page, and enforce a minimum crop size of 20% of the page in each dimension.

Merge targeted results with accepted primary results, normalize once more, and deduplicate by foundation plus coordinate plus code. Do not discard valid primary evidence.

### Column Reinforcement behavior

When the first tab receives a PDF, use the same Pro document policy with `MEDIUM` thinking and `MEDIUM` resolution. Keep its existing prompt, schema, cleanup, and spatial evidence contract. When it receives an image, retain the existing Flash model to avoid imposing Pro latency on screenshots or single-page image uploads.

### Caching and concurrency

Each file job prepares these values once:

- base64 or uploaded file reference;
- PDF text-anchor inventory;
- optional rendered crops keyed by page and bounding box.

Primary and targeted passes reuse the prepared source. The two Foundation Priority upload zones continue processing concurrently. No global cross-user cache is introduced, and prepared data is released with the job.

## Data Flow

1. The user selects a PDF.
2. The file job reads the PDF once and extracts native anchors.
3. The request policy selects Gemini 3.1 Pro Preview with balanced settings.
4. Gemini returns structured rows.
5. Normalization validates labels, coordinates, codes, pages, and bounding boxes.
6. Coverage validation compares normalized rows with the anchor inventory.
7. If complete, the job returns immediately.
8. If incomplete, a targeted high-thinking pass requests only missing evidence, using crops when needed.
9. Primary and escalated rows are merged and validated.
10. Foundation Priority joins plan and certified evidence through existing merge rules.
11. Diagnostics record coverage and stage duration for the status UI and console-quality review.

## Error Handling

- If PDF.js cannot extract native text, continue with Gemini native PDF vision and mark `anchorMode: unavailable` in diagnostics.
- If preprocessing fails unexpectedly, report the preprocessing error but permit one vision-only attempt.
- If the primary model call fails, surface the model error; do not label it an accuracy escalation.
- If targeted escalation fails after primary rows were valid, return the valid rows with an explicit incomplete-coverage warning rather than silently presenting them as complete.
- If no valid rows remain, fail the file job with an actionable message listing unresolved labels where available.
- Continue using inline PDF data for normal-sized files and the Files API only when size requires it.
- Never log PDF bytes, API keys, or full model responses in production diagnostics.

## Diagnostics

Extend Foundation Priority diagnostics with:

- selected model and request policy;
- thinking and media-resolution levels per pass;
- preprocessing duration;
- anchor availability and counts by label type;
- expected, returned, resolved, and missing foundation counts;
- missing label sample;
- whether escalation ran and why;
- crop count;
- primary, escalation, merge, and total durations;
- response usage metadata when the SDK provides it.

Diagnostics must make partial success visible instead of displaying it as a normal primary-pass completion.

## Testing Strategy

### Unit tests

- PDF MIME types route to Gemini 3.1 Pro Preview.
- Image-only Frame extraction remains on `gemini-3.6-flash`.
- Primary PDF configuration uses medium thinking and medium resolution.
- Escalation uses high thinking without automatically increasing PDF resolution.
- Text anchors normalize rotation, bounds, label casing, and duplicate items.
- A partial result containing two `FC1` rows escalates when other anchored foundations are missing.
- Complete anchored coverage does not escalate.
- Scanned PDFs with no anchors use vision-only validation.
- Targeted results merge without replacing valid primary rows.
- Merge behavior continues preferring plan `FC` codes and otherwise uses certified evidence.

### Fixture and integration tests

Before changing production request behavior, manually review `Left.pdf` and `Right.pdf` and check in a golden fixture containing:

- every expected foundation;
- expected resolved code or codes;
- expected resolution method;
- expected plan and certified source page;
- labels that are intentionally unresolved, with a reason.

Mocked integration tests use that fixture to exercise preprocessing, validation, escalation selection, and final merging without calling Gemini.

### Live acceptance

Run the complete pair at least twice with the same model version and compare against the reviewed fixture.

Acceptance requires:

- no expected foundation silently omitted;
- no invented foundation or code accepted;
- evidence pages and bounding boxes open the correct source region;
- stable final codes across both runs;
- mean primary-generation latency across the two live runs at least 25% below the approximately 140-second baseline (105 seconds or less per file);
- total latency recorded separately for non-escalated and escalated runs;
- all automated tests and the production build pass without new warnings.

Because hosted preview-model latency varies, the design does not promise a fixed wall-clock threshold. The measured comparison must use the same fixtures, region, and two-run procedure.

## Rollout

1. Add the golden fixture and tests first.
2. Add request policies and PDF anchor preprocessing behind the existing extraction interfaces.
3. Switch PDF primary configuration to Pro with medium thinking and resolution.
4. Enable coverage validation and targeted escalation.
5. Run live fixture comparison and record diagnostics in the validation document.
6. Keep image-only Flash routing unless reviewed fixtures justify a separate change.

## Risks and Mitigations

- **Preview-model behavior changes:** keep model IDs and policies centralized and cover request shape with tests.
- **Native text order is not reading order:** preserve bounding boxes and treat anchors as spatial evidence, not prose.
- **False expected labels from notes, columns, or frames:** use the defined foundation-prefix pattern, classify `FC...` first, exclude `FG...`/`FW...`/`FWS...`, and record fixture-reviewed exclusions explicitly rather than relying on a hidden spatial heuristic.
- **Crops omit necessary grid context:** always include the anchor manifest and apply the defined 10%-per-side crop margin and 20% minimum crop size.
- **Escalation recreates current latency:** escalate only the missing set and retain primary rows.
- **Scanned PDFs lack anchors:** keep the vision-only fallback and mark its lower-confidence coverage mode explicitly.
