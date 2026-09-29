// @vitest-environment node
import { readFileSync } from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  CERTIFIED_GRID_LINES,
  EXPECTED_FOUNDATION_LABELS,
  EXPECTED_PRIORITY_ROWS,
  VERIFIED_COLUMN_MARKER_READS,
} from '../tests/fixtures/foundationPriorityLeftRight';
import type { CertifiedMarker, CertifiedPlacementMap, FoundationPlanGeometry } from '../types';
import {
  applyMarkerCodes,
  readCertifiedDocument,
  readFoundationPlanDocument,
} from './foundationPriorityDocuments';
import { joinFoundationPriorityGeometry } from './foundationPriorityGeometryJoin';
import { buildFoundationPriorityText } from './mergeFoundationPriority';
import { extractPdfPageGeometry, type PdfPageGeometry, type PdfPageLike } from './pdfPageGeometry';

const loadPages = async (path: string): Promise<PdfPageGeometry[]> => {
  const document = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(path)),
    cMapUrl: 'node_modules/pdfjs-dist/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: 'node_modules/pdfjs-dist/standard_fonts/',
  }).promise;
  try {
    const pages: PdfPageGeometry[] = [];
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = (await document.getPage(number)) as unknown as PdfPageLike;
      pages.push(await extractPdfPageGeometry(page, pdfjs.OPS));
    }
    return pages;
  } finally {
    await document.destroy();
  }
};

const lineCrossing = (from: number, to: number, lines: readonly (readonly [string, number])[]) => {
  const centre = (from + to) / 2;
  const crossing = lines.filter(([, position]) => position >= from && position <= to);
  crossing.sort((left, right) => Math.abs(left[1] - centre) - Math.abs(right[1] - centre));
  return crossing[0]?.[0];
};

const gridPositionOf = (marker: CertifiedMarker) => {
  const x = lineCrossing(marker.rect.x0, marker.rect.x1, CERTIFIED_GRID_LINES.x);
  const y = lineCrossing(marker.rect.y0, marker.rect.y1, CERTIFIED_GRID_LINES.y);
  return `${x}/${y}`;
};

/** What a person reads on the marker: colour for P1/P2/C4, verified crop reads for the rest. */
const verifiedRead = (marker: CertifiedMarker): string => {
  const colour = marker.fill.join(',');
  if (colour === '255,0,255') return 'P1';
  if (colour === '255,191,40') return 'P2';
  if (colour === '0,0,255') return 'C4';
  const position = gridPositionOf(marker);
  const code = VERIFIED_COLUMN_MARKER_READS[position];
  if (!code) throw new Error(`No verified read for marker ${marker.id} (${colour}) at ${position}`);
  return code;
};

const naturalSort = (codes: string[]) =>
  [...codes].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

describe('Foundation Priority on Left.pdf (認定柱脚資料) and Right.pdf (基礎伏図)', () => {
  let plan: FoundationPlanGeometry;
  let embedded: CertifiedPlacementMap;
  let certified: CertifiedPlacementMap;

  beforeAll(async () => {
    const [planPages, certifiedPages] = await Promise.all([
      loadPages('Right.pdf'),
      loadPages('Left.pdf'),
    ]);
    plan = readFoundationPlanDocument(planPages)!;
    embedded = readCertifiedDocument(certifiedPages)!;
    // Stand-in for the Gemini crop read, which only runs for markers without embedded text.
    const ocr = embedded.markers
      .filter((marker) => !marker.code)
      .map((marker): [string, string] => [marker.id, verifiedRead(marker)]);
    certified = applyMarkerCodes(embedded, new Map([
      ...embedded.markers.map((marker): [string, string] => [marker.id, marker.code]),
      ...ocr,
    ]));
  });

  it('reads embedded SHX marker labels that agree with the verified reads', () => {
    const labelled = embedded.markers.filter((marker) => marker.code);
    expect(labelled.length).toBe(73);
    for (const marker of labelled) {
      const expected = { id: marker.id, code: verifiedRead(marker) };
      expect({ id: marker.id, code: marker.code }).toEqual(expected);
    }
  });

  it('leaves only the three C2 markers, which have no embedded label, for OCR', () => {
    const unlabelled = embedded.markers.filter((marker) => !marker.code).map(gridPositionOf);
    expect(unlabelled.sort()).toEqual(['X3/Y5', 'X4/Y5', 'X5/Y5']);
  });

  it('reads every plan footing and the certified placement page', () => {
    expect(plan.page).toBe(1);
    expect(plan.footings).toHaveLength(44);
    expect(plan.unassignedLabels).toEqual([]);
    expect(certified.page).toBe(1);
    expect(certified.markers).toHaveLength(76);
  });

  it('resolves every foundation label to the verified codes', () => {
    const join = joinFoundationPriorityGeometry(plan, certified, 'left');
    const result = buildFoundationPriorityText(join.certifiedRows, join.planRows);

    // The P1 post in F6 maps 0.32 pt inside the footing edge (its marker box centre sits
    // right of the post symbol); the join flags it rather than silently deciding.
    expect(join.warnings).toEqual([
      '1 certified marker(s) sit within 1 pt of a footing edge (F6); check their evidence.',
    ]);
    const foundations = result.rows.map((row) => row.foundation).sort();
    expect(foundations).toEqual([...EXPECTED_FOUNDATION_LABELS].sort());
    expect(
      result.rows.map((row) => ({
        foundation: row.foundation,
        codes: naturalSort(row.codes),
        method: row.resolutions[0].method,
      })),
    ).toEqual(EXPECTED_PRIORITY_ROWS);
  });

  it('names each placement by its grid line, or by the lines it sits between', () => {
    const join = joinFoundationPriorityGeometry(plan, certified, 'left');
    const placements = (foundation: string) =>
      join.planRows
        .filter((row) => row.foundation === foundation)
        .map((row) => {
          const certifiedRow = join.certifiedRows
            .find((entry) => entry.locationKey === row.locationKey);
          return `${row.xAxis}/${row.yAxis}=${certifiedRow?.columnType}`;
        })
        .sort();

    expect(placements('F7')).toEqual([
      'X1/Y1=C3', 'X1/Y2=C3', 'X2C-X3/Y1=P1', 'X3/Y1=C3', 'X3/Y2=C1',
    ]);
    expect(placements('F8')).toEqual(['X1/Y4=C3', 'X2/Y4=C1']);
    expect(placements('F1B')).toEqual(['X2C/Y7A=C3', 'X3A/Y8=C3']);
    expect(placements('F2A')).toEqual(['X3/Y7A=C6']);
  });

  it('keeps certified evidence for every certified-fallback placement', () => {
    const join = joinFoundationPriorityGeometry(plan, certified, 'left');
    const result = buildFoundationPriorityText(
      join.certifiedRows.map((row) => ({ ...row, sourceFileId: 'certified' })),
      join.planRows.map((row) => ({ ...row, sourceFileId: 'plan' })),
    );

    for (const row of result.rows.filter((entry) => entry.resolutions[0].method !== 'plan-fc')) {
      for (const location of row.resolutions.flatMap((resolution) => resolution.locations)) {
        expect(location.plan).toMatchObject({ fileId: 'plan', page: 1 });
        expect(location.certified).toMatchObject({ fileId: 'certified', page: 1 });
      }
    }
  });
});
