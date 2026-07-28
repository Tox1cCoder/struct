import React, { useState } from 'react';
import { FoundationPriorityEvidenceLocation, FoundationPriorityWorkingRow } from '../types';
import { copyTextToClipboard } from '../utils/clipboard';

interface FoundationPriorityTextResultProps {
  text: string;
  rows: FoundationPriorityWorkingRow[];
  selectedRowKey?: string | null;
  onRowChange: (rowId: string, patch: Pick<FoundationPriorityWorkingRow, 'foundation' | 'codes'>) => void;
  onAddRow: () => void;
  onDeleteRow: (rowId: string) => void;
  onEvidenceSelect: (evidence: FoundationPriorityEvidenceLocation) => void;
}

const parseCodes = (value: string) =>
  [...new Set(value.split(',').map((code) => code.trim().toUpperCase()).filter(Boolean))];

export const FoundationPriorityTextResult: React.FC<FoundationPriorityTextResultProps> = ({
  text,
  rows,
  selectedRowKey,
  onRowChange,
  onAddRow,
  onDeleteRow,
  onEvidenceSelect,
}) => {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Track raw typed text per row so trailing commas/spaces remain visible during editing.
  const [codeDrafts, setCodeDrafts] = useState<Record<string, string>>({});

  const handleCopy = async () => {
    const ok = await copyTextToClipboard(text);
    setCopyState(ok ? 'copied' : 'failed');
    window.setTimeout(() => setCopyState('idle'), ok ? 1500 : 4000);
  };

  const toggleExpand = (rowId: string) => {
    setExpanded((prev) => ({ ...prev, [rowId]: !prev[rowId] }));
  };

  return (
    <div className="w-full mx-auto bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-800">Foundation Priority Text</h2>
          <span className="text-xs font-medium px-2.5 py-0.5 rounded bg-cyan-100 text-cyan-800">
            {rows.length} {rows.length === 1 ? 'Foundation' : 'Foundations'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onAddRow}
            aria-label="Add foundation"
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-cyan-700 bg-cyan-50 border border-cyan-200 rounded-md hover:bg-cyan-100"
          >
            Add foundation
          </button>
          <button
            type="button"
            onClick={handleCopy}
            disabled={rows.length === 0}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-md disabled:opacity-50 disabled:cursor-not-allowed ${
              copyState === 'failed'
                ? 'text-red-700 bg-red-50 border-red-300 hover:bg-red-100'
                : 'text-gray-700 bg-white border-gray-300 hover:bg-gray-50'
            }`}
          >
            {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy Text'}
          </button>
        </div>
      </div>

      {copyState === 'failed' && (
        <div role="alert" className="px-6 py-2 bg-red-50 border-b border-red-100 text-xs text-red-700">
          Could not reach the clipboard. This usually means the page is served over plain http on a
          network address — open it on localhost or over https, or select the text below and copy manually.
        </div>
      )}

      {rows.length === 0 ? (
        <div className="px-6 py-8 text-sm text-gray-600">
          <p className="font-semibold text-gray-800">No resolved foundation mappings yet.</p>
          <p className="mt-1">
            Extracted source rows did not produce an FC value or a matching certified coordinate.
          </p>
        </div>
      ) : (
        <div className="p-3 space-y-2">
          {rows.map((row) => {
            const isExpanded = expanded[row.rowId] ?? false;
            // Evidence clicks set the shared selection key to an evidenceId (e.g. "F1:X1:Y1"),
            // not the row's sourceKey ("priority:F1"), so match against both to keep the row highlighted.
            const isSelected =
              row.sourceKey === selectedRowKey ||
              row.resolutions.some((res) =>
                res.locations.some((loc) => loc.evidenceId === selectedRowKey),
              );
            const label = row.foundation || row.rowId;

            return (
              <div
                key={row.rowId}
                className={`rounded-lg border ${isSelected ? 'border-cyan-400 bg-cyan-50/50' : 'border-cyan-100 bg-cyan-50/20'} divide-y divide-cyan-100`}
              >
                <div className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <input
                    aria-label={`${label} foundation`}
                    value={row.foundation}
                    onChange={(e) => onRowChange(row.rowId, { foundation: e.target.value, codes: row.codes })}
                    className="w-20 rounded border border-gray-200 px-2 py-1 font-mono text-sm font-bold"
                  />
                  <span className="text-gray-500">:</span>
                  <input
                    aria-label={`${label} codes`}
                    value={codeDrafts[row.rowId] ?? row.codes.join(', ')}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setCodeDrafts((prev) => ({ ...prev, [row.rowId]: raw }));
                      onRowChange(row.rowId, { foundation: row.foundation, codes: parseCodes(raw) });
                    }}
                    onBlur={() => setCodeDrafts((prev) => {
                      const next = { ...prev };
                      delete next[row.rowId];
                      return next;
                    })}
                    className="flex-1 min-w-[140px] rounded border border-gray-200 px-2 py-1 font-mono text-sm"
                  />
                  {row.provenance === 'manual' && (
                    <span className="inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                      Manual
                    </span>
                  )}
                  {row.edited && row.provenance === 'extracted' && (
                    <span className="inline-block rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                      Edited
                    </span>
                  )}
                  {row.resolutions.length > 0 && (
                    <button
                      type="button"
                      onClick={() => toggleExpand(row.rowId)}
                      aria-label={`Show evidence for ${label}`}
                      aria-expanded={isExpanded}
                      className="text-xs text-cyan-700 hover:text-cyan-900"
                    >
                      {isExpanded ? 'Hide evidence' : 'Show evidence'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onDeleteRow(row.rowId)}
                    aria-label={`Delete ${label}`}
                    className="text-xs text-red-600 hover:text-red-800"
                  >
                    Delete
                  </button>
                </div>

                {isExpanded && row.resolutions.length > 0 && (
                  <div className="px-3 py-2 space-y-2 text-xs">
                    {row.resolutions.map((res) => (
                      <div key={res.columnType} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold">{res.columnType}</span>
                        </div>
                        <ul className="space-y-1 pl-3">
                          {res.locations.map((loc, idx) => (
                            <li key={loc.evidenceId} className="flex flex-wrap items-center gap-2">
                              <span className="text-gray-600">
                                Location {idx + 1}: {loc.plan.xAxis} / {loc.plan.yAxis}
                              </span>
                              <button
                                type="button"
                                onClick={() => onEvidenceSelect(loc)}
                                aria-label={`View ${res.columnType} location ${idx + 1} in foundation plan`}
                                className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700 hover:bg-emerald-100"
                              >
                                基礎伏図
                              </button>
                              {loc.certified && (
                                <button
                                  type="button"
                                  onClick={() => onEvidenceSelect(loc)}
                                  aria-label={`View ${res.columnType} location ${idx + 1} in certified document`}
                                  className="rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-indigo-700 hover:bg-indigo-100"
                                >
                                  認定柱脚
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
