import { CertifiedCoordinateData, FoundationPlanCoordinateData } from '../types';
import { parseBoundingBox, parsePage } from './boundingBox';

const cleanLabel = (value: unknown) =>
  typeof value === 'string'
    ? value.replace(/\s*[\(（].*?[\)）]/g, '').replace(/\s+/g, '').trim().toUpperCase()
    : '';

const cleanAxisText = (value: unknown) =>
  typeof value === 'string'
    ? value.replace(/\s*[\(（].*?[\)）]/g, '').replace(/\s+/g, '').trim().toUpperCase()
    : '';

const normalizeAxisLocatorToken = (value: unknown, axisPrefix: 'X' | 'Y') => {
  const token = cleanAxisText(value);

  if (!token) {
    return '';
  }

  const betweenMatch = token.match(new RegExp(`^BETWEEN${axisPrefix}([A-Z0-9]+)AND${axisPrefix}([A-Z0-9]+)$`));
  if (betweenMatch) {
    return `${axisPrefix}${betweenMatch[1]}-${axisPrefix}${betweenMatch[2]}`;
  }

  const rangeMatch = token.match(new RegExp(`^${axisPrefix}([A-Z0-9]+(?:\\.\\d+)?)[:\\-~/]${axisPrefix}([A-Z0-9]+(?:\\.\\d+)?)$`));
  if (rangeMatch) {
    return `${axisPrefix}${rangeMatch[1]}-${axisPrefix}${rangeMatch[2]}`;
  }

  const halfGridMatch = token.match(new RegExp(`^${axisPrefix}(\\d+)\\.5$`));
  if (halfGridMatch) {
    const start = Number(halfGridMatch[1]);
    return `${axisPrefix}${start}-${axisPrefix}${start + 1}`;
  }

  if (new RegExp(`^${axisPrefix}[A-Z0-9]+$`).test(token)) {
    return token;
  }

  return '';
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;

const getFirstString = (record: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  return '';
};

const getFirstBoolean = (record: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toUpperCase();
      if (['TRUE', 'YES', 'Y', 'COLORED', 'COLOUR', 'HIGHLIGHTED'].includes(normalized)) {
        return true;
      }
      if (['FALSE', 'NO', 'N', 'PLAIN', 'MONOCHROME', 'UNCOLORED', 'UNCOLOURED'].includes(normalized)) {
        return false;
      }
    }
  }

  return undefined;
};

const getAxisLocatorFromText = (value: unknown, axisPrefix: 'X' | 'Y') => {
  const text = cleanAxisText(value);

  if (!text) {
    return '';
  }

  const betweenMatch = text.match(new RegExp(`BETWEEN${axisPrefix}([A-Z0-9]+)AND${axisPrefix}([A-Z0-9]+)`));
  if (betweenMatch) {
    return `${axisPrefix}${betweenMatch[1]}-${axisPrefix}${betweenMatch[2]}`;
  }

  const rangeMatch = text.match(new RegExp(`${axisPrefix}([A-Z0-9]+(?:\\.\\d+)?)[:\\-~/]${axisPrefix}([A-Z0-9]+(?:\\.\\d+)?)`));
  if (rangeMatch) {
    return `${axisPrefix}${rangeMatch[1]}-${axisPrefix}${rangeMatch[2]}`;
  }

  const halfGridMatch = text.match(new RegExp(`${axisPrefix}(\\d+)\\.5(?!\\d)`));
  if (halfGridMatch) {
    const start = Number(halfGridMatch[1]);
    return `${axisPrefix}${start}-${axisPrefix}${start + 1}`;
  }

  const simpleMatch = text.match(new RegExp(`${axisPrefix}[A-Z0-9]+`));
  return simpleMatch ? normalizeAxisLocatorToken(simpleMatch[0], axisPrefix) : '';
};

const getAxisPair = (record: Record<string, unknown>) => {
  const coordinateRecord = asRecord(record.coordinate) ?? asRecord(record.gridCoordinate);
  const xAxis = normalizeAxisLocatorToken(
    getFirstString(record, ['xAxis', 'x_axis', 'x', 'gridX', 'grid_x', 'axisX', 'axis_x', 'xGrid', 'x_grid', 'xCoordinate', 'x_coordinate']) ||
      getFirstString(coordinateRecord ?? {}, ['xAxis', 'x_axis', 'x', 'gridX', 'grid_x', 'axisX', 'axis_x']),
    'X',
  );
  const yAxis = normalizeAxisLocatorToken(
    getFirstString(record, ['yAxis', 'y_axis', 'y', 'gridY', 'grid_y', 'axisY', 'axis_y', 'yGrid', 'y_grid', 'yCoordinate', 'y_coordinate']) ||
      getFirstString(coordinateRecord ?? {}, ['yAxis', 'y_axis', 'y', 'gridY', 'grid_y', 'axisY', 'axis_y']),
    'Y',
  );

  if (xAxis && yAxis) {
    return { xAxis, yAxis };
  }

  const combinedCoordinate =
    getFirstString(record, ['coordinate', 'grid', 'gridCoordinate', 'intersection', 'axisPair']) ||
    getFirstString(coordinateRecord ?? {}, ['label', 'value']);

  const parsedPair = {
    xAxis: getAxisLocatorFromText(combinedCoordinate, 'X'),
    yAxis: getAxisLocatorFromText(combinedCoordinate, 'Y'),
  };

  return {
    xAxis: xAxis || parsedPair.xAxis,
    yAxis: yAxis || parsedPair.yAxis,
  };
};

const dedupeByKey = <T>(rows: T[], getKey: (row: T) => string) => {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = getKey(row);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

export const normalizeCertifiedCoordinateRows = (rawData: unknown[]): CertifiedCoordinateData[] =>
  dedupeByKey(
    rawData
      .map((item) => {
        const record = asRecord(item);
        if (!record) {
          return null;
        }

        const { xAxis, yAxis } = getAxisPair(record);
        const columnType = cleanLabel(
          getFirstString(record, [
            'columnType',
            'columnCode',
            'column',
            'code',
            'type',
            'cCode',
            'c_code',
            'certifiedColumnType',
            'certified_column_type',
          ]),
        );

        if (!xAxis || !yAxis || !columnType) {
          return null;
        }

        const page = parsePage(record.page);
        const bbox = parseBoundingBox(record.bbox);

        return {
          xAxis,
          yAxis,
          columnType,
          ...(page !== undefined ? { page } : {}),
          ...(bbox ? { bbox } : {}),
        };
      })
      .filter((item): item is CertifiedCoordinateData => item !== null),
    (row) => `${row.xAxis}__${row.yAxis}__${row.columnType}`,
  );

export const normalizeFoundationPlanCoordinateRows = (rawData: unknown[]): FoundationPlanCoordinateData[] =>
  dedupeByKey(
    rawData
      .map((item) => {
        const record = asRecord(item);
        if (!record) {
          return null;
        }

        const { xAxis, yAxis } = getAxisPair(record);
        const foundation = cleanLabel(
          getFirstString(record, [
            'foundation',
            'foundation_label',
            'foundationLabel',
            'foundationType',
            'foundation_type',
            'foundationCode',
            'foundation_code',
          ]),
        );
        const planColumnType = cleanLabel(
          getFirstString(record, [
            'planColumnType',
            'plan_column_type',
            'fcCode',
            'fc_code',
            'columnType',
            'column_type',
            'code',
            'visibleCode',
            'visible_code',
          ]),
        );
        const isHighlighted = getFirstBoolean(record, [
          'isHighlighted',
          'hasColor',
          'isColored',
          'hasColoredBackground',
          'isHighlight',
        ]);
        const highlightColor = cleanLabel(
          getFirstString(record, [
            'highlightColor',
            'backgroundColor',
            'color',
            'labelColor',
            'fillColor',
          ]),
        );

        if (!foundation) {
          return null;
        }

        const page = parsePage(record.page);
        const bbox = parseBoundingBox(record.bbox);

        return {
          foundation,
          xAxis,
          yAxis,
          planColumnType,
          ...(typeof isHighlighted === 'boolean' ? { isHighlighted } : {}),
          ...(highlightColor ? { highlightColor } : {}),
          ...(page !== undefined ? { page } : {}),
          ...(bbox ? { bbox } : {}),
        };
      })
      .filter((item): item is FoundationPlanCoordinateData => item !== null),
    (row) => `${row.foundation}__${row.xAxis}__${row.yAxis}__${row.planColumnType}__${row.isHighlighted ?? ''}__${row.highlightColor ?? ''}`,
  );

export const summarizeRawCoordinateRows = (rawData: unknown[], limit = 2) =>
  JSON.stringify(rawData.slice(0, limit), null, 2);
