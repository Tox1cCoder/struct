export interface CertifiedCoordinateRow {
  xAxis: string;
  yAxis: string;
  columnType: string;
}

export interface FoundationPlanCoordinateRow {
  foundation: string;
  xAxis: string;
  yAxis: string;
  planColumnType: string;
}

export interface FoundationPriorityTextResult {
  lines: string[];
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

  return { xAxis, yAxis, columnType };
};

const normalizeFoundationPlanRow = (row: FoundationPlanCoordinateRow): FoundationPlanCoordinateRow | null => {
  const foundation = normalizeLabel(row.foundation);
  const xAxis = normalizeLabel(row.xAxis);
  const yAxis = normalizeLabel(row.yAxis);
  const planColumnType = normalizeLabel(row.planColumnType);

  if (!isValidFoundation(foundation) || !isValidAxis(xAxis) || !isValidAxis(yAxis)) {
    return null;
  }

  return { foundation, xAxis, yAxis, planColumnType };
};

export const buildFoundationPriorityText = (
  certifiedRows: CertifiedCoordinateRow[],
  foundationPlanRows: FoundationPlanCoordinateRow[],
): FoundationPriorityTextResult => {
  const certifiedByCoordinate = new Map<string, string>();

  for (const row of certifiedRows) {
    const normalizedRow = normalizeCertifiedRow(row);

    if (!normalizedRow) {
      continue;
    }

    const key = toCoordinateKey(normalizedRow.xAxis, normalizedRow.yAxis);
    if (!certifiedByCoordinate.has(key)) {
      certifiedByCoordinate.set(key, normalizedRow.columnType);
    }
  }

  const foundationToColumns = new Map<string, Set<string>>();

  for (const row of foundationPlanRows) {
    const normalizedRow = normalizeFoundationPlanRow(row);

    if (!normalizedRow) {
      continue;
    }

    const resolvedCodes = foundationToColumns.get(normalizedRow.foundation) ?? new Set<string>();

    if (isValidColumnCode(normalizedRow.planColumnType) && isFcCode(normalizedRow.planColumnType)) {
      resolvedCodes.add(normalizedRow.planColumnType);
      foundationToColumns.set(normalizedRow.foundation, resolvedCodes);
      continue;
    }

    const key = toCoordinateKey(normalizedRow.xAxis, normalizedRow.yAxis);
    const certifiedColumnType = certifiedByCoordinate.get(key);

    if (certifiedColumnType) {
      resolvedCodes.add(certifiedColumnType);
      foundationToColumns.set(normalizedRow.foundation, resolvedCodes);
    }
  }

  const lines = [...foundationToColumns.entries()]
    .sort(([leftFoundation], [rightFoundation]) => naturalCompare(leftFoundation, rightFoundation))
    .flatMap(([foundation, columnTypes]) =>
      [...columnTypes]
        .sort((leftColumnType, rightColumnType) => naturalCompare(leftColumnType, rightColumnType))
        .map((columnType) => `${foundation}: ${columnType}`),
    );

  return {
    lines,
    text: lines.join('\n'),
  };
};
