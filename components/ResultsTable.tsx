import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { BoundingBox, EditableExpandedReinforcementData, ExpandedReinforcementData } from '../types';

interface RowSource {
  fileId: string;
  page?: number;
  bbox?: BoundingBox;
}

interface ResultsTableProps {
  data: EditableExpandedReinforcementData[];
  hasFoundationData?: boolean;
  selectedRowKey?: string | null;
  onRowSelect?: (rowKey: string, source: RowSource | null) => void;
  onRowChange?: (rowId: string, patch: Partial<ExpandedReinforcementData>) => void;
  onAddRow?: () => void;
  onDeleteRow?: (rowId: string) => void;
}

const rowLabelOf = (row: EditableExpandedReinforcementData) =>
  row.foundation || row.columnType || row.rowId;

export const ResultsTable: React.FC<ResultsTableProps> = ({
  data,
  hasFoundationData = false,
  selectedRowKey,
  onRowSelect,
  onRowChange,
  onAddRow,
  onDeleteRow,
}) => {
  const [exporting, setExporting] = useState(false);

  if (data.length === 0) {
    return (
      <div className="text-center p-8 bg-white rounded-lg shadow-sm border border-gray-100">
        <p className="text-gray-500">No reinforcement data available.</p>
        {onAddRow && (
          <button
            type="button"
            onClick={onAddRow}
            className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100"
          >
            Add row
          </button>
        )}
      </div>
    );
  }

  const hasBHData = data.some((row) => row.bColumn || row.hColumn);
  const editable = Boolean(onRowChange);

  const handleExportExcel = () => {
    setExporting(true);
    try {
      const headers: string[] = [];
      if (hasFoundationData) headers.push('Foundation (基礎)');
      headers.push('Column Type (柱符号)');
      headers.push(
        '柱型_lx',
        '柱型_ly',
        '柱型_主筋_本数',
        '柱型_主筋_直径',
        '柱型_Hoop_直径',
        '柱型_Hoop_距離_最大',
      );
      if (hasBHData) {
        headers.push('柱_lx');
        headers.push('柱_ly');
      }

      const rows = data.map((row) => {
        const cells: string[] = [];
        if (hasFoundationData) cells.push(row.foundation || '');
        cells.push(row.columnType);
        cells.push(
          row.dimensionWidth,
          row.dimensionHeight,
          row.mainReinforcementCount,
          row.mainReinforcementSize,
          row.hoopReinforcementSize,
          row.hoopReinforcementSpacing,
        );
        if (hasBHData) {
          cells.push(row.bColumn || '');
          cells.push(row.hColumn || '');
        }
        return cells;
      });

      const wsData = [headers, ...rows];

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(wsData);

      const colWidths: { wch: number }[] = [];
      if (hasFoundationData) colWidths.push({ wch: 12 });
      colWidths.push({ wch: 15 });
      colWidths.push(
        { wch: 10 },
        { wch: 10 },
        { wch: 12 },
        { wch: 10 },
        { wch: 10 },
        { wch: 12 },
      );
      if (hasBHData) {
        colWidths.push({ wch: 8 });
        colWidths.push({ wch: 8 });
      }
      ws['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(wb, ws, 'Reinforcement Data');

      const timestamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `reinforcement_data_${timestamp}.xlsx`);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setExporting(false);
    }
  };

  const handleViewSource = (row: EditableExpandedReinforcementData) => {
    if (!onRowSelect) return;
    if (!row.sourceFileId) {
      onRowSelect(row.rowId, null);
      return;
    }
    onRowSelect(row.rowId, {
      fileId: row.sourceFileId,
      page: row.page,
      bbox: row.bbox,
    });
  };

  const handlePatch = (row: EditableExpandedReinforcementData, patch: Partial<ExpandedReinforcementData>) => {
    if (!onRowChange) return;
    onRowChange(row.rowId, patch);
  };

  return (
    <div className="w-full mx-auto bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-800">Consolidated Reinforcement Schedule</h2>
          <span className="text-xs font-medium px-2.5 py-0.5 rounded bg-indigo-100 text-indigo-800">
            {data.length} Rows
          </span>
          {hasFoundationData && (
            <span className="text-xs font-medium px-2.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
              Foundation Linked
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onAddRow && (
            <button
              type="button"
              onClick={onAddRow}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100"
            >
              Add row
            </button>
          )}
          <button
            onClick={handleExportExcel}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all disabled:opacity-50"
          >
            {exporting ? 'Exporting...' : 'Export as Excel'}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider">
              {hasFoundationData && (
                <th className="px-4 py-3 font-semibold border-b border-gray-200">Foundation</th>
              )}
              <th className="px-4 py-3 font-semibold border-b border-gray-200">Column Type</th>
              <th className="px-4 py-3 font-semibold border-b border-gray-200">柱型_lx</th>
              <th className="px-4 py-3 font-semibold border-b border-gray-200">柱型_ly</th>
              <th className="px-4 py-3 font-semibold border-b border-gray-200">柱型_主筋_本数</th>
              <th className="px-4 py-3 font-semibold border-b border-gray-200">柱型_主筋_直径</th>
              <th className="px-4 py-3 font-semibold border-b border-gray-200">柱型_Hoop_直径</th>
              <th className="px-4 py-3 font-semibold border-b border-gray-200">柱型_Hoop_距離_最大</th>
              {hasBHData && (
                <>
                  <th className="px-4 py-3 font-semibold border-b border-gray-200">柱_lx</th>
                  <th className="px-4 py-3 font-semibold border-b border-gray-200">柱_ly</th>
                </>
              )}
              {(onRowSelect || onDeleteRow) && (
                <th className="px-4 py-3 font-semibold border-b border-gray-200">Actions</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map((row) => {
              const label = rowLabelOf(row);
              const isSelected = row.rowId === selectedRowKey;
              return (
                <tr
                  key={row.rowId}
                  className={`transition-colors duration-150 ${
                    isSelected ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-300' : 'hover:bg-gray-50'
                  }`}
                >
                  {hasFoundationData && (
                    <td className={`px-4 py-3 text-sm font-semibold text-emerald-700 ${isSelected ? 'border-l-[3px] border-l-indigo-500' : ''}`}>
                      {row.foundation || '-'}
                      {row.provenance === 'manual' && (
                        <span className="ml-2 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                          Manual
                        </span>
                      )}
                      {row.edited && row.provenance === 'extracted' && (
                        <span className="ml-2 inline-block rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                          Edited
                        </span>
                      )}
                    </td>
                  )}
                  <td className={`px-4 py-3 text-sm font-bold text-gray-900 ${isSelected && !hasFoundationData ? 'border-l-[3px] border-l-indigo-500' : ''}`}>
                    {editable ? (
                      <input
                        aria-label={`${label} column type`}
                        value={row.columnType}
                        onChange={(e) => handlePatch(row, { columnType: e.target.value })}
                        className="w-24 rounded border border-gray-200 px-2 py-1 font-mono text-sm"
                      />
                    ) : (
                      row.columnType
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 font-mono">
                    {editable ? (
                      <input
                        aria-label={`${label} dimension lx`}
                        value={row.dimensionWidth}
                        onChange={(e) => handlePatch(row, { dimensionWidth: e.target.value })}
                        className="w-20 rounded border border-gray-200 px-2 py-1 font-mono text-sm"
                      />
                    ) : (
                      row.dimensionWidth
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 font-mono">
                    {editable ? (
                      <input
                        aria-label={`${label} dimension ly`}
                        value={row.dimensionHeight}
                        onChange={(e) => handlePatch(row, { dimensionHeight: e.target.value })}
                        className="w-20 rounded border border-gray-200 px-2 py-1 font-mono text-sm"
                      />
                    ) : (
                      row.dimensionHeight
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 font-mono">
                    {editable ? (
                      <input
                        aria-label={`${label} main count`}
                        value={row.mainReinforcementCount}
                        onChange={(e) => handlePatch(row, { mainReinforcementCount: e.target.value })}
                        className="w-16 rounded border border-gray-200 px-2 py-1 font-mono text-sm"
                      />
                    ) : (
                      row.mainReinforcementCount
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 font-mono">
                    {editable ? (
                      <input
                        aria-label={`${label} main size`}
                        value={row.mainReinforcementSize}
                        onChange={(e) => handlePatch(row, { mainReinforcementSize: e.target.value })}
                        className="w-16 rounded border border-gray-200 px-2 py-1 font-mono text-sm"
                      />
                    ) : (
                      row.mainReinforcementSize
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 font-mono">
                    {editable ? (
                      <input
                        aria-label={`${label} hoop size`}
                        value={row.hoopReinforcementSize}
                        onChange={(e) => handlePatch(row, { hoopReinforcementSize: e.target.value })}
                        className="w-16 rounded border border-gray-200 px-2 py-1 font-mono text-sm"
                      />
                    ) : (
                      row.hoopReinforcementSize
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 font-mono">
                    {editable ? (
                      <input
                        aria-label={`${label} hoop spacing`}
                        value={row.hoopReinforcementSpacing}
                        onChange={(e) => handlePatch(row, { hoopReinforcementSpacing: e.target.value })}
                        className="w-16 rounded border border-gray-200 px-2 py-1 font-mono text-sm"
                      />
                    ) : (
                      row.hoopReinforcementSpacing
                    )}
                  </td>
                  {hasBHData && (
                    <>
                      <td className="px-4 py-3 text-sm text-indigo-700 font-mono">
                        {editable ? (
                          <input
                            aria-label={`${label} b column`}
                            value={row.bColumn ?? ''}
                            onChange={(e) => handlePatch(row, { bColumn: e.target.value })}
                            className="w-16 rounded border border-gray-200 px-2 py-1 font-mono text-sm"
                          />
                        ) : (
                          row.bColumn || ''
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-indigo-700 font-mono">
                        {editable ? (
                          <input
                            aria-label={`${label} h column`}
                            value={row.hColumn ?? ''}
                            onChange={(e) => handlePatch(row, { hColumn: e.target.value })}
                            className="w-16 rounded border border-gray-200 px-2 py-1 font-mono text-sm"
                          />
                        ) : (
                          row.hColumn || ''
                        )}
                      </td>
                    </>
                  )}
                  {(onRowSelect || onDeleteRow) && (
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        {onRowSelect && row.sourceFileId && (
                          <button
                            type="button"
                            onClick={() => handleViewSource(row)}
                            className="text-xs text-indigo-600 hover:text-indigo-800"
                          >
                            View source
                          </button>
                        )}
                        {onDeleteRow && (
                          <button
                            type="button"
                            aria-label={`Delete ${label}`}
                            onClick={() => onDeleteRow(row.rowId)}
                            className="text-xs text-red-600 hover:text-red-800"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
