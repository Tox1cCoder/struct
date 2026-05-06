# Source Viewer Sidebar & Bounding-Box Reference Design

## Goal

Let users verify AI-extracted structural data against the original document at a glance. Add a persistent right-side viewer that renders the source PDF page or image with the relevant region highlighted, synced from clicks on result rows. Apply across all three tabs (Column Reinforcement, Frame, Foundation Priority).

## User Workflow

1. User uploads/pastes source documents in the active tab. The sidebar's file selector populates with the new files (visible during upload, even before extraction completes).
2. Extraction runs as today; each extracted row now carries a page number (PDFs only) and a normalized bounding box of the source region.
3. Results render in the main pane as today.
4. User clicks any row in the results table. The sidebar viewer:
   - selects the source file the row came from,
   - jumps to the correct page (PDFs),
   - draws a colored rectangle over the bbox.
5. User can also browse files manually via the sidebar's file selector and page navigator without clicking a row.
6. Sidebar can be collapsed to an icon-strip via a header toggle. Width is drag-resizable.

## Layout

Two-pane main area below the existing tab nav:

- Left pane (flex-1): existing tab content — upload zones, results tables, info banners. The current `max-w-7xl` cap on `<main>` is removed so the left pane fills available width.
- Right pane (`ViewerSidebar`): default 440px wide, draggable resize handle on its left edge (clamped 320px–720px), collapse-to-48px-icon-strip toggle in the header. Width and collapsed state persist in `localStorage` (`structextract.sidebar.width`, `structextract.sidebar.collapsed`).
- On viewport widths < 1024px, sidebar overlays the left pane (drawer-style) instead of pushing it.

The small per-tab "Files" lists currently rendered inline (e.g., `renderFileList` in App.tsx, the thumbnail grid in `FrameImageInput`) are removed — the sidebar's file selector is the single source of truth for browsing uploaded files. Status icons (PROCESSING / SUCCESS / ERROR) move into the file selector entries.

## Bounding Box Format

Gemini's spatial-understanding output is normalized 0–1000 `[ymin, xmin, ymax, xmax]`. The schema and types use object form for clarity:

```ts
interface BoundingBox {
  ymin: number; xmin: number; ymax: number; xmax: number; // 0-1000
}
```

Each existing extracted-row type gains:

- `page?: number` — 1-indexed PDF page; omitted for image-sourced rows (Frame tab).
- `bbox?: BoundingBox` — optional; missing bbox is a valid state (graceful degradation).

Affected types in `types.ts`:

- `ColumnReinforcementData` (Column tab) — adds `page`, `bbox`.
- `FrameData` (Frame tab) — adds `bbox` (no `page`).
- `CertifiedCoordinateData` (Foundation Priority) — adds `page`, `bbox`.
- `FoundationPlanCoordinateData` (Foundation Priority) — adds `page`, `bbox`.

`FileResult`, `FrameFileResult`, `CertifiedCoordinateFileResult`, `FoundationPlanCoordinateFileResult` each gain:

- `sourceUrl?: string` — `URL.createObjectURL(file)` blob URL kept alive for the lifetime of the result. Revoked when the result is removed (Clear All, individual delete) or on App unmount.
- `pageCount?: number` — for PDFs, populated by react-pdf on first load; lets the page navigator render bounds.

## Gemini Schema & Prompt Updates

Each extraction function in `services/geminiService.ts` is updated:

- JSON response schema gains `page` (Type.NUMBER, optional via `nullable: true`) and `bbox` (Type.OBJECT with four NUMBER fields).
- System prompts get an appended block:

  > **Spatial output:** For each extracted item, also return `page` (1-indexed page number where the data appears; omit for single-image inputs) and `bbox` as `{ymin, xmin, ymax, xmax}` in normalized 0–1000 coordinates of the rectangle tightly bounding the source data on that page. If you cannot localize confidently, omit `bbox` rather than guessing.

- Validation: `bbox` is accepted only when all four numbers are finite, in `[0, 1000]`, and `xmin < xmax` and `ymin < ymax`. Invalid bbox is dropped (logged via `logError`) and the row is kept without it.
- The Foundation Priority fallback prompts (`*_FALLBACK_PROMPT`) get the same spatial block.

Model-compatibility note: `gemini-3-flash-preview` and `gemini-3.1-pro-preview` are expected to honor spatial output. If during implementation either endpoint fails to return useful bboxes, the implementation plan covers swapping to a known spatial-capable variant for the affected endpoint without changing the rest of the architecture.

## Components

### `ViewerSidebar` (new)

Wrapper. Owns layout (collapse, resize), reads viewer-related state from props, renders header + body.

Props:

- `tabType: TabType`
- `files: ViewerFile[]` — normalized list derived from the active tab's results
- `selection: ViewerSelection | null`
- `onSelectionChange: (sel: ViewerSelection) => void`
- `collapsed: boolean`
- `onCollapsedChange: (v: boolean) => void`
- `width: number`
- `onWidthChange: (v: number) => void`

### `FileSelector` (new)

Dropdown listing all files for the active tab. Each entry shows file name, status icon, item count when available. For Foundation Priority, the dropdown is grouped into two sections: 認定柱脚資料 and 基礎伏図.

### `DocumentViewer` (new)

Unified PDF + image renderer. Internally:

- If source is a PDF, uses `react-pdf` (`<Document>` + `<Page>`) with the `pdfjs-dist` worker.
- If source is an image, uses a plain `<img>` wrapped in the same scaling/pan layer.
- Bbox overlay: an SVG layer absolutely positioned over the rendered page/image with a single `<rect>` whose color matches the active tab's accent (indigo / amber / cyan), 2px stroke + 12% fill alpha. Hidden when `bbox` is undefined.
- Zoom controls: 50 / 75 / 100 / 150 / 200 % buttons + fit-to-width. Pan via drag when zoomed > 100%.
- Page navigator: `‹ Page n / total ›` for PDFs. Hidden for images.
- Loading skeleton while pdfjs renders.
- Error state when blob URL fails to load (file revoked, etc.) with a retry hint.

### `useSourceUrl` (new hook)

Wraps blob-URL lifecycle: creates one URL per File on first call, returns the cached URL on subsequent calls, revokes on cleanup. Used when storing files in result state.

### `App.tsx` (modified)

- New state: `viewerSelection`, `sidebarCollapsed`, `sidebarWidth`.
- New handler: `handleRowSelect(tabType, sel)` updates `viewerSelection`.
- New computed: `viewerFiles` derived per active tab from the relevant `*Results` arrays.
- Layout: replace the current `<main>` with a flex row containing the existing tab content (left) and `<ViewerSidebar>` (right). Tab-switch resets `viewerSelection` to null.
- Source URLs: when a file enters the result list, attach `sourceUrl` via `URL.createObjectURL(file)`. Track a Set of active URLs and revoke on Clear All.
- Remove the inline `renderFileList` helper — its consumers move to the sidebar.

### `ResultsTable`, `FrameResultsTable`, `FoundationPriorityTextResult` (modified)

Each gains:

- `selectedRowKey?: string`
- `onRowSelect?: (rowKey: string, source: { fileId: string; page?: number; bbox?: BoundingBox }) => void`

A row is keyed deterministically (`${fileId}:${index}` or for Foundation Priority, the foundation label). The selected row gets a 3px left accent border in the tab's color and a subtle background tint.

`FoundationPriorityTextResult` currently renders plain text; for selectability it switches to a list of `<button>` rows that visually still look like text lines. Click selects the row's source line; hover shows pointer cursor.

### `FrameImageInput` (modified)

Removes its internal thumbnail grid (moved to sidebar). Keeps the paste zone + status indicator. Pasted images still create a `FrameFileResult`; the sidebar surfaces the thumbnails.

### Status Summary Strip (new, small)

Above each tab's results section, a one-line summary: `3 of 5 succeeded · 1 processing · 1 failed`. Per tab, derived from the existing `*Results` arrays. Replaces nothing; sits where the previous "Files" block was. Errors expand on click into the per-file error list.

## Data Flow

```
File upload → result entry created with sourceUrl
            ↓
       Gemini extraction (now also returns page + bbox per row)
            ↓
     Result rows stored with page/bbox
            ↓
User clicks row in ResultsTable
            ↓
onRowSelect → setViewerSelection({ tabType, fileId, page, bbox, rowKey })
            ↓
ViewerSidebar receives selection
            ↓
DocumentViewer loads file by fileId, jumps to page, draws bbox overlay
```

Manual selection (clicking a file in the sidebar's selector) follows the same path with `bbox` and `rowKey` undefined; the table doesn't get a selected row, the viewer just shows the page.

## Edge Cases & Error Handling

- **Bbox missing or invalid** → row is still selectable; viewer jumps to file/page; overlay is hidden. Logged once per row via `logError`.
- **Page out of range** → clamp to `[1, pageCount]`; show a warning toast inline within the viewer ("Page n not found, showing page 1").
- **Blob URL revoked** → viewer displays an error state with "Source no longer available — re-upload to view." Happens after Clear All if a stale selection persists; selection is cleared on Clear All to prevent this in normal flow.
- **PDF render failure** (corrupt file, worker error) → error state with file name and a retry button that re-mounts the `<Document>`.
- **Tab switch with active selection** → selection cleared so the sidebar shows the new tab's files in their default state.
- **Sidebar collapsed** → row clicks still update selection; opening the sidebar restores the last selected row.
- **Frame tab paste while sidebar shows another file** → newly pasted image becomes the active selection so user immediately sees what they pasted.

## Testing Strategy

- Unit: bbox validation function (in/out-of-range, swapped min/max, NaN, missing fields). New file: `utils/boundingBox.test.ts`.
- Unit: row-key derivation across all three results components.
- Unit: source-URL lifecycle hook (creation idempotent, revoke on cleanup).
- Component: `DocumentViewer` renders a known SVG bbox at expected pixel coords for a fixed mock page size and a fixed normalized bbox.
- Component: `FileSelector` groups Foundation Priority files into two sections.
- Integration: clicking a row in `ResultsTable` sets `viewerSelection` and the sidebar reflects the new selection.
- Manual smoke: upload a real PDF per tab, verify bbox lands on the correct region; verify graceful degradation when bbox is omitted.

## Out of Scope

- Toast notification system — keep using inline error states.
- Keyboard shortcuts (sidebar toggle, row navigation) — additive, not blocking; can be layered later.
- Manual bbox correction or drawing UI.
- Mobile-first responsive overhaul beyond the < 1024px drawer fallback.
- Caching rendered PDF pages across sessions.

## Open Items for Implementation Plan

- Verify each Gemini model variant honors spatial output on a real document before wiring all three tabs. If a specific endpoint refuses or returns garbage bboxes, swap to a known spatial-capable model variant for that endpoint without changing the rest of the architecture.
- Bundle the `pdfjs-dist` worker via Vite's `?worker` import rather than CDN-loading, for offline reliability and version pinning.
