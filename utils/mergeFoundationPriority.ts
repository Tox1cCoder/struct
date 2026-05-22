export interface CoordinateSource {
  sourceFileId?: string;
  page?: number;
  bbox?: { ymin: number; xmin: number; ymax: number; xmax: number };
}

export interface CertifiedCoordinateRow extends CoordinateSource {
  xAxis: string;
  yAxis: string;
  columnType: string;
}

export interface FoundationPlanCoordinateRow extends CoordinateSource {
  foundation: string;
  xAxis: string;
  yAxis: string;
  planColumnType: string;
}

export interface FoundationPriorityEntry extends CoordinateSource {
  foundation: string;
  columnType: string;
  text: string;
  origin: 'plan' | 'certified';
}

export interface FoundationPriorityTextResult {
  lines: string[];
  entries: FoundationPriorityEntry[];
  text: string;
}

const normalizeLabel = (value: string | undefined) => value?.trim().toUpperCase() ?? '';

const isValidFoundation = (value: string) => /^F[A-Z0-9]+$/.test(value);

const isValidAxis = (value: string) => /^[XY][A-Z0-9-]+$/.test(value);

const isValidColumnCode = (value: string) => /^(?:FC|C|P)[A-Z0-9]+$/.test(value);

const isFcCode = (value: string) => value.startsWith('FC');

const naturalCompare = (left: string, right: string) =>
  left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });

const toCoordinateKey = (xAxis: string, yAxis: string) => `${xAxis}__${yAxis}`;

const normalizeCertifiedRow = (row: CertifiedCoordinateRow): CertifiedCoordinateRow | null => {
  const xAxis = normalizeLabel(row.xAxis);
  const yAxis = normalizeLabel(row.yAxis);
  const columnType = normalizeLabel(row.columnType);

  if (!isValidAxis(xAxis) || !isValidAxis(yAxis) || !isValidColumnCode(columnType) || isFcCode(columnType)) {
    return null;
  }

  return {
    xAxis,
    yAxis,
    columnType,
    sourceFileId: row.sourceFileId,
    page: row.page,
    bbox: row.bbox,
  };
};

const normalizeFoundationPlanRow = (row: FoundationPlanCoordinateRow): FoundationPlanCoordinateRow | null => {
  const foundation = normalizeLabel(row.foundation);
  const xAxis = normalizeLabel(row.xAxis);
  const yAxis = normalizeLabel(row.yAxis);
  const planColumnType = normalizeLabel(row.planColumnType);

  if (!isValidFoundation(foundation) || !isValidAxis(xAxis) || !isValidAxis(yAxis)) {
    return null;
  }

  return {
    foundation,
    xAxis,
    yAxis,
    planColumnType,
    sourceFileId: row.sourceFileId,
    page: row.page,
    bbox: row.bbox,
  };
};

export const buildFoundationPriorityText = (
  certifiedRows: CertifiedCoordinateRow[],
  foundationPlanRows: FoundationPlanCoordinateRow[],
): FoundationPriorityTextResult => {
  const certifiedByCoordinate = new Map<string, CertifiedCoordinateRow>();

  for (const row of certifiedRows) {
    const normalizedRow = normalizeCertifiedRow(row);

    if (!normalizedRow) {
      continue;
    }

    const key = toCoordinateKey(normalizedRow.xAxis, normalizedRow.yAxis);
    if (!certifiedByCoordinate.has(key)) {
      certifiedByCoordinate.set(key, normalizedRow);
    }
  }

  type ResolvedCode = {
    columnType: string;
    origin: 'plan' | 'certified';
    sourceFileId?: string;
    page?: number;
    bbox?: CoordinateSource['bbox'];
  };

  const foundationToCodes = new Map<string, Map<string, ResolvedCode>>();

  const addCode = (foundation: string, code: ResolvedCode) => {
    const existing = foundationToCodes.get(foundation) ?? new Map<string, ResolvedCode>();
    if (!existing.has(code.columnType)) {
      existing.set(code.columnType, code);
    }
    foundationToCodes.set(foundation, existing);
  };

  for (const row of foundationPlanRows) {
    const normalizedRow = normalizeFoundationPlanRow(row);

    if (!normalizedRow) {
      continue;
    }

    if (isValidColumnCode(normalizedRow.planColumnType) && isFcCode(normalizedRow.planColumnType)) {
      addCode(normalizedRow.foundation, {
        columnType: normalizedRow.planColumnType,
        origin: 'plan',
        sourceFileId: normalizedRow.sourceFileId,
        page: normalizedRow.page,
        bbox: normalizedRow.bbox,
      });
      continue;
    }

    const key = toCoordinateKey(normalizedRow.xAxis, normalizedRow.yAxis);
    const certifiedRow = certifiedByCoordinate.get(key);

    if (certifiedRow) {
      addCode(normalizedRow.foundation, {
        columnType: certifiedRow.columnType,
        origin: 'certified',
        sourceFileId: normalizedRow.sourceFileId ?? certifiedRow.sourceFileId,
        page: normalizedRow.page ?? certifiedRow.page,
        bbox: normalizedRow.bbox ?? certifiedRow.bbox,
      });
    }
  }

  const sortedFoundations = [...foundationToCodes.entries()].sort(([leftFoundation], [rightFoundation]) =>
    naturalCompare(leftFoundation, rightFoundation),
  );

  const entries: FoundationPriorityEntry[] = sortedFoundations.flatMap(([foundation, codes]) => {
    return [...codes.values()]
      .sort((left, right) => naturalCompare(left.columnType, right.columnType))
      .map((code) => ({
        foundation,
        columnType: code.columnType,
        origin: code.origin,
        text: `${foundation}: ${code.columnType}`,
        sourceFileId: code.sourceFileId,
        page: code.page,
        bbox: code.bbox,
      }));
  });

  const lines = entries.map((entry) => entry.text);

  return {
    lines,
    entries,
    text: lines.join('\n'),
  };
};
