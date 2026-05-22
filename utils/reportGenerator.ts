import type { ExpandedReinforcementData, ReportTemplate, SourceField } from '../types';

export interface ReportCell {
  value: string;
  hasConflict: boolean;
  allValues: string[];
}

export interface ReportRow {
  groupId: string;
  groupName: string;
  groupColor: string;
  paramId: string;
  paramLabel: string;
  cells: ReportCell[];
}

export interface ReportData {
  foundations: string[];
  rows: ReportRow[];
}

export function generateReport(
  data: ExpandedReinforcementData[],
  template: ReportTemplate,
): ReportData {
  const foundationSet = new Set<string>();
  for (const row of data) {
    if (row.foundation) foundationSet.add(row.foundation);
  }
  const foundations = [...foundationSet];

  const byFoundation = new Map<string, ExpandedReinforcementData[]>();
  for (const row of data) {
    if (!row.foundation) continue;
    const arr = byFoundation.get(row.foundation) ?? [];
    arr.push(row);
    byFoundation.set(row.foundation, arr);
  }

  const rows: ReportRow[] = [];

  for (const group of template.groups) {
    for (const param of group.params) {
      const cells: ReportCell[] = foundations.map((foundation) => {
        const fRows = byFoundation.get(foundation) ?? [];
        const values = fRows
          .map((r) => String((r as unknown as Record<SourceField, unknown>)[param.sourceField] ?? ''))
          .filter(Boolean);

        const uniqueValues = [...new Set(values)];

        let resolved = '';
        if (uniqueValues.length === 0) {
          resolved = '';
        } else if (uniqueValues.length === 1) {
          resolved = uniqueValues[0];
        } else {
          switch (template.multiValueStrategy) {
            case 'first':
              resolved = values[0];
              break;
            case 'most-common': {
              const counts = new Map<string, number>();
              for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
              resolved = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
              break;
            }
            case 'largest': {
              const nums = uniqueValues.map(Number).filter((n) => !isNaN(n));
              resolved = nums.length > 0 ? String(Math.max(...nums)) : uniqueValues[0];
              break;
            }
            case 'all':
              resolved = uniqueValues.join(' / ');
              break;
          }
        }

        return { value: resolved, hasConflict: uniqueValues.length > 1, allValues: uniqueValues };
      });

      rows.push({
        groupId: group.id,
        groupName: group.name,
        groupColor: group.color,
        paramId: param.id,
        paramLabel: param.label,
        cells,
      });
    }
  }

  return { foundations, rows };
}
