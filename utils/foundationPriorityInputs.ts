import type {
  CertifiedCoordinateData,
  CertifiedCoordinateFileResult,
  FoundationPlanCoordinateData,
  FoundationPlanCoordinateFileResult,
} from '../types';
import {
  certifiedLocatorRows,
  joinFoundationPriorityGeometry,
  planLocatorRows,
} from './foundationPriorityGeometryJoin';

export interface PriorityInputs {
  certifiedRows: CertifiedCoordinateData[];
  planRows: FoundationPlanCoordinateData[];
  /** Geometry-join warnings, by plan result id. */
  planWarnings: Record<string, string>;
}

const tagged = <T>(rows: T[], result: { id: string; fileName: string }) =>
  rows.map((row) => ({ ...row, sourceFileId: result.id, sourceFileName: result.fileName }));

const LABEL_ONLY =
  'This 基礎伏図 was read by the Gemini fallback, so it is matched to the 認定柱脚資料 by ' +
  'printed grid labels only; labels spelled differently on the two sheets will not match.';

const UNMATCHABLE =
  'This 基礎伏図 was read by the Gemini fallback and the 認定柱脚資料 has no readable grid ' +
  'labels, so certified codes cannot be matched to it.';

/** Plans read by Gemini carry only grid labels; give them the map's label-keyed rows. */
const addLabelMatching = (
  inputs: PriorityInputs,
  latestMap: CertifiedCoordinateFileResult,
  legacyPlans: FoundationPlanCoordinateFileResult[],
) => {
  if (!latestMap.placementMap || legacyPlans.length === 0) return;
  const rows = certifiedLocatorRows(latestMap.placementMap);
  inputs.certifiedRows.push(...tagged(rows, latestMap));
  const warning = rows.length ? LABEL_ONLY : UNMATCHABLE;
  for (const plan of legacyPlans) inputs.planWarnings[plan.id] = warning;
};

/**
 * The rows the priority merge sees, rebuilt from current results so upload order
 * never matters. Plan geometry is joined with the most recent certified placement
 * map; without a map it yields grid-label rows for Gemini certified rows to match.
 */
export const collectPriorityInputs = (
  certifiedResults: CertifiedCoordinateFileResult[],
  planResults: FoundationPlanCoordinateFileResult[],
): PriorityInputs => {
  const certified = certifiedResults.filter((result) => result.status === 'SUCCESS');
  const latestMap = [...certified].reverse().find((result) => result.placementMap);
  const certifiedRows = certified.flatMap((result) => tagged(result.data, result));
  const planRows: FoundationPlanCoordinateData[] = [];
  const planWarnings: Record<string, string> = {};

  for (const plan of planResults.filter((result) => result.status === 'SUCCESS')) {
    if (!plan.geometry) {
      planRows.push(...tagged(plan.data, plan));
    } else if (!latestMap?.placementMap) {
      planRows.push(...tagged(planLocatorRows(plan.geometry), plan));
    } else {
      const { placementMap, id } = latestMap;
      const join = joinFoundationPriorityGeometry(plan.geometry, placementMap, id);
      certifiedRows.push(...tagged(join.certifiedRows, latestMap));
      planRows.push(...tagged(join.planRows, plan));
      if (join.warnings.length > 0) planWarnings[plan.id] = join.warnings.join(' ');
    }
  }
  const inputs = { certifiedRows, planRows, planWarnings };
  if (latestMap) {
    const legacyPlans = planResults
      .filter((result) => result.status === 'SUCCESS' && !result.geometry);
    addLabelMatching(inputs, latestMap, legacyPlans);
  }
  return inputs;
};
