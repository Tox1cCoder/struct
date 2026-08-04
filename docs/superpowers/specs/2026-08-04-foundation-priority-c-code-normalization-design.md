# Foundation Priority C-Code Normalization Design

## Goal

Canonicalize numeric-prefixed C codes in generated Foundation Priority results so values such as `1C1` and `C1` are treated as the same code and displayed as `C1`.

## Scope

- Apply normalization after extraction, inside the Foundation Priority result builder.
- Remove one or more leading digits only when they occur immediately before `C` in a valid code: `1C1` becomes `C1`, `1C4` becomes `C4`, and `12C4` becomes `C4`.
- Leave `FC1`, `C3009`, `P1`, and other codes without a numeric prefix before `C` unchanged.
- Do not modify extraction prompts, extraction response normalization, or stored raw extraction rows.
- Do not normalize codes entered manually by the user.

## Result Merging

The canonical code is the key used to accumulate Foundation Priority resolutions. If the same foundation resolves to both `1C1` and `C1`, the generated result contains one `C1` code. Its resolution retains the combined evidence locations and the existing strongest-method selection behavior.

Normalization therefore remains consistent across the editable result row, copied text, and displayed evidence heading.

## Data Flow

1. Extraction continues to return the source code exactly as it currently does.
2. The result builder selects the resolved column code using the existing FC and coordinate priority rules.
3. The selected code is canonicalized from a numeric-prefixed C form to a plain C form.
4. Resolutions are grouped by the canonical code and rendered through the existing output path.

## Testing

Regression tests will verify that:

- a generated `1C1` result is displayed as `C1`;
- `1C1` and `C1` for one foundation merge into a single `C1` resolution with evidence from both locations;
- multi-digit prefixes such as `12C4` are removed;
- `FC1`, `C3009`, and `P1` are unchanged; and
- the existing test suite and production build still pass.
