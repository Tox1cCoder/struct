import type {
  CertifiedCoordinateData,
  CertifiedCoordinateFileResult,
  FoundationPlanCoordinateData,
  FoundationPlanCoordinateFileResult,
} from '../types';
import { joinFoundationPriorityGeometry, planLocatorRows } from './foundationPriorityGeometryJoin';

export interface PriorityInputs {
  certifiedRows: CertifiedCoordinateData[];
  planRows: FoundationPlanCoordinateData[];
  /** Geometry-join warnings, by plan result id. */
  planWarnings: Record<string, string>;
}

const tagged = <T>(rows: T[], result: { id: string; fileName: string }) =>
  rows.map((row) => ({ ...row, sourceFileId: result.id, sourceFileName: result.fileName }));

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
  return { certifiedRows, planRows, planWarnings };
};
