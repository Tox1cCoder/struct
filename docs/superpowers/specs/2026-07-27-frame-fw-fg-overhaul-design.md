# Frame FW/FG Overhaul Design

## Goal

Replace the generic Frame rebar schedule with type-specific FW and FG extraction, display, editing, and Excel-export schemas.

## Scope

Each Frame upload contains one type only: FW or FG.  The results table therefore selects one type-specific column set for the current results rather than showing irrelevant empty columns.

Every row retains these shared fields:

- `Frame Name`
- `b`
- `h`

## FW schema and extraction

The FW table and Excel sheet contain these additional columns, in this order:

1. `FW_ベース筋_直径`
2. `FW_タテ筋_直径`
3. `FW_ヨコ筋_本数`
4. `FW_ヨコ筋_直径`

Rules:

- `FW_ベース筋_直径` is always `13`.
- `FW_タテ筋_直径` is the numeric part after `D` in the タテ callout. If no callout exists, it is `13`.
- `FW_ヨコ筋_本数` is the number of white circles left of the vertical white line and below the left extended green line. It is `0` when there are no qualifying circles.
- `FW_ヨコ筋_直径` is the numeric part after `D` in the ヨコ callout. If no callout exists, it is `10`.
- `b` and `h` use the existing FW dimension-selection logic.

## FG schema and extraction

The FG table and Excel sheet contain these additional columns, in this order:

1. `FG_上端筋_直径`
2. `FG_下端筋_直径`
3. `FG_St_直径`
4. `FG_St_距離_最大`
5. `FG_腹筋_直径`
6. `FG_巾止筋_直径`
7. `FG_巾止筋_距離_最大`

Rules:

- Extract each value from its corresponding FG table row.
- Diameter fields store only the numeric part after `D`; for example, `4-D22` produces `22`.
- St. and 巾止筋 maximum-distance fields store the numeric value following `@` or the maximum-distance notation in their corresponding row.
- `b` and `h` are read from `B×D` using the existing dimension parsing logic.
- A logical FG symbol produces one row. If a symbol such as `FG1B` is visually split into two subcolumns, read its shared diameter values from either subcolumn and do not create duplicate rows.

## Architecture

`FrameData` becomes a discriminated union keyed by `frameType` (`FW` or `FG`). The Gemini response schema and prompt request only the fields that apply to each type, while the client normalizes numerical diameter values and applies the FW defaults.

`FrameResultsTable` determines its columns from the row type, so the UI and Excel export use the same exact type-specific field sequence. The manual-row factory creates a row matching the displayed type.

## Error handling

The extractor still rejects responses lacking a frame name, `b`, or `h`. It normalizes blank optional FG values to empty strings. FW required output values are always present after applying their defaults and zero-count rule.

## Testing

Tests will verify type-specific columns, editable field patches, Excel row/header construction, FW defaults and numeric normalization, and FG split-column instructions/normalization. Existing frame tests will migrate away from the removed generic top/bottom/stirrup fields.
