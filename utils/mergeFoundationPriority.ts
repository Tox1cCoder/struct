import {
  BoundingBox,
  FoundationPriorityEvidenceLocation,
  FoundationPriorityResolution,
  FoundationPriorityWorkingRow,
  PrioritySourceRole,
  SourceEvidence,
} from '../types';

export interface CoordinateSource {
  sourceFileId?: string;
  page?: number;
  bbox?: BoundingBox;
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

export interface FoundationPriorityTextResult {
  rows: FoundationPriorityWorkingRow[];
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

const makeEvidence = (
  fileId: string | undefined,
  role: PrioritySourceRole,
  xAxis: string,
  yAxis: string,
  page?: number,
  bbox?: BoundingBox,
): SourceEvidence | null => {
  if (!fileId) return null;
  return { fileId, role, xAxis, yAxis, page, bbox };
};

const formatPriorityRow = (row: Pick<FoundationPriorityWorkingRow, 'foundation' | 'codes'>) =>
  `${row.foundation}: ${row.codes.join(', ')}`;

export const buildFoundationPriorityText = (
  certifiedRows: CertifiedCoordinateRow[],
  foundationPlanRows: FoundationPlanCoordinateRow[],
): FoundationPriorityTextResult => {
  const certifiedByCoordinate = new Map<string, CertifiedCoordinateRow>();

  for (const row of certifiedRows) {
    const normalizedRow = normalizeCertifiedRow(row);
    if (!normalizedRow) continue;

    const key = toCoordinateKey(normalizedRow.xAxis, normalizedRow.yAxis);
    if (!certifiedByCoordinate.has(key)) {
      certifiedByCoordinate.set(key, normalizedRow);
    }
  }

  // For each foundation, group resolutions by columnType. Each resolution
  // collects all locations where that columnType was resolved.
  type ResolutionAccumulator = {
    columnType: string;
    method: 'plan-fc' | 'certified-fallback';
    locations: FoundationPriorityEvidenceLocation[];
    codeOrder: number;
  };

  const foundationToResolutions = new Map<string, Map<string, ResolutionAccumulator>>();
  const foundationContributingFiles = new Map<string, Set<string>>();
  const foundationFirstSeen = new Map<string, number>();
  let foundationSeq = 0;
  let codeSeq = 0;

  for (const row of foundationPlanRows) {
    const normalizedRow = normalizeFoundationPlanRow(row);
    if (!normalizedRow) continue;

    const planColumnType = normalizedRow.planColumnType;
    const hasFc = isValidColumnCode(planColumnType) && isFcCode(planColumnType);
    const coordKey = toCoordinateKey(normalizedRow.xAxis, normalizedRow.yAxis);
    const certifiedMatch = certifiedByCoordinate.get(coordKey);

    let resolvedColumnType: string | null = null;
    let method: 'plan-fc' | 'certified-fallback' | null = null;

    if (hasFc) {
      resolvedColumnType = planColumnType;
      method = 'plan-fc';
    } else if (certifiedMatch) {
      resolvedColumnType = certifiedMatch.columnType;
      method = 'certified-fallback';
    }

    if (!resolvedColumnType || !method) continue;

    const planEvidence = makeEvidence(
      normalizedRow.sourceFileId,
      'plan',
      normalizedRow.xAxis,
      normalizedRow.yAxis,
      normalizedRow.page,
      normalizedRow.bbox,
    );
    const certifiedEvidence = certifiedMatch
      ? makeEvidence(
          certifiedMatch.sourceFileId,
          'certified',
          certifiedMatch.xAxis,
          certifiedMatch.yAxis,
          certifiedMatch.page,
          certifiedMatch.bbox,
        )
      : null;

    // Plan evidence is required; if it's missing fileId, build a synthetic one
    // so the location is still tracked but viewer cannot open it.
    const planForLocation: SourceEvidence = planEvidence ?? {
      fileId: '',
      role: 'plan',
      xAxis: normalizedRow.xAxis,
      yAxis: normalizedRow.yAxis,
      page: normalizedRow.page,
      bbox: normalizedRow.bbox,
    };

    const evidenceLocation: FoundationPriorityEvidenceLocation = {
      evidenceId: `${normalizedRow.foundation}:${normalizedRow.xAxis}:${normalizedRow.yAxis}`,
      plan: planForLocation,
      ...(certifiedEvidence ? { certified: certifiedEvidence } : {}),
    };

    if (!foundationFirstSeen.has(normalizedRow.foundation)) {
      foundationFirstSeen.set(normalizedRow.foundation, foundationSeq++);
    }

    const filesForFoundation =
      foundationContributingFiles.get(normalizedRow.foundation) ?? new Set<string>();
    if (planEvidence?.fileId) filesForFoundation.add(planEvidence.fileId);
    if (certifiedEvidence?.fileId) filesForFoundation.add(certifiedEvidence.fileId);
    foundationContributingFiles.set(normalizedRow.foundation, filesForFoundation);

    const byColumnType =
      foundationToResolutions.get(normalizedRow.foundation) ?? new Map<string, ResolutionAccumulator>();
    const existing = byColumnType.get(resolvedColumnType);
    if (existing) {
      // Preserve the strongest method: plan-fc beats certified-fallback.
      if (existing.method === 'certified-fallback' && method === 'plan-fc') {
        existing.method = 'plan-fc';
      }
      existing.locations.push(evidenceLocation);
    } else {
      byColumnType.set(resolvedColumnType, {
        columnType: resolvedColumnType,
        method,
        locations: [evidenceLocation],
        codeOrder: codeSeq++,
      });
    }
    foundationToResolutions.set(normalizedRow.foundation, byColumnType);
  }

  const sortedFoundations = [...foundationToResolutions.entries()].sort(([leftF], [rightF]) =>
    naturalCompare(leftF, rightF),
  );

  const rows: FoundationPriorityWorkingRow[] = sortedFoundations.map(([foundation, byColumnType]) => {
    const resolutions: FoundationPriorityResolution[] = [...byColumnType.values()]
      .sort((a, b) => a.codeOrder - b.codeOrder)
      .map(({ columnType, method, locations }) => ({ columnType, method, locations }));

    const codes = resolutions.map((res) => res.columnType);
    const sourceKey = `priority:${foundation}`;
    const fileIds = foundationContributingFiles.get(foundation);

    return {
      rowId: sourceKey,
      sourceKey,
      sourceFileIds: fileIds ? [...fileIds] : [],
      provenance: 'extracted',
      edited: false,
      foundation,
      codes,
      resolutions,
    };
  });

  const lines = rows.map(formatPriorityRow);

  return { rows, lines, text: lines.join('\n') };
};
