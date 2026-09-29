export type PdfAnchorKind =
  | 'foundation'
  | 'plan-column'
  | 'certified-column'
  | 'x-axis'
  | 'y-axis';

export const canonicalizeCode = (value: string) => value.replace(/['’]/g, '').toUpperCase();

/**
 * Canonical certified support code read from a marker label (`1'C1` → `1C1`,
 * full-width digits folded), or null when the text is not a C/P code.
 */
export const canonicalMarkerCode = (raw: string): string | null => {
  const code = canonicalizeCode(raw.normalize('NFKC').replace(/\s+/g, ''));
  return /^\d*[CP]\d+[A-Z]?$/.test(code) ? code : null;
};

export const classifyPriorityAnchor = (
  sourceText: string,
): { kind: PdfAnchorKind; label: string } | null => {
  const text = sourceText.trim().toUpperCase();
  if (!text) return null;

  const planColumn = text.match(/^(FC[A-Z0-9]+)/);
  if (planColumn) return { kind: 'plan-column', label: planColumn[1] };

  const foundation = text.match(/^(F(?:K?\d+[A-Z]?))(?=$|[（(])/);
  if (foundation) return { kind: 'foundation', label: foundation[1] };

  const xAxis = text.match(/^(X\d+[A-Z]?)$/);
  if (xAxis) return { kind: 'x-axis', label: xAxis[1] };

  const yAxis = text.match(/^(Y\d+[A-Z]?)$/);
  if (yAxis) return { kind: 'y-axis', label: yAxis[1] };

  const certified = text.match(/^((?:\d+['’]?)?[CP][A-Z0-9]+):?$/);
  if (certified) {
    return { kind: 'certified-column', label: canonicalizeCode(certified[1]) };
  }

  return null;
};
