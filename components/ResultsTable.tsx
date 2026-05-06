import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { BoundingBox, ExpandedReinforcementData } from '../types';

interface RowSource {
  fileId: string;
  page?: number;
  bbox?: BoundingBox;
}

interface ResultsTableProps {
  data: ExpandedReinforcementData[];
  hasFoundationData?: boolean;
  selectedRowKey?: string | null;
  onRowSelect?: (rowKey: string, source: RowSource | null) => void;
}

const rowKeyOf = (row: ExpandedReinforcementData, index: number) =>
  `${row.foundation ?? ''}::${row.columnType}::${index}`;

export const ResultsTable: React.FC<ResultsTableProps> = ({
  data,
  hasFoundationData = false,
  selectedRowKey,
  onRowSelect,
}) => {
  const [exporting, setExporting] = useState(false);

  if (data.length === 0) {
    return (
      <div className="text-center p-8 bg-white rounded-lg shadow-sm border border-gray-100">
        <p className="text-gray-500">No reinforcement data available.</p>
      </div>
    );
  }

  const hasBHData = data.some(row => row.bColumn || row.hColumn);

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

      const rows = data.map(row => {
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

  const handleRowClick = (row: ExpandedReinforcementData, index: number) => {
    if (!onRowSelect) return;
    const key = rowKeyOf(row, index);
    if (!row.sourceFileId) {
      onRowSelect(key, null);
      return;
    }
    onRowSelect(key, {
      fileId: row.sourceFileId,
      page: row.page,
      bbox: row.bbox,
    });
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
        <button
          onClick={handleExportExcel}
          disabled={exporting}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all disabled:opacity-50"
        >
          {exporting ? (
            <>
              <svg className="animate-spin h-4 w-4 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Exporting...
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-green-600">
                <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
                <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
              </svg>
              Export as Excel
            </>
          )}
        </button>
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
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map((row, index) => {
              const key = rowKeyOf(row, index);
              const isSelected = key === selectedRowKey;
              const clickable = Boolean(onRowSelect && row.sourceFileId);
              return (
                <tr
                  key={key}
                  onClick={() => handleRowClick(row, index)}
                  className={`transition-colors duration-150 ${
                    isSelected
                      ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-300'
                      : 'hover:bg-gray-50'
                  } ${clickable ? 'cursor-pointer' : ''}`}
                >
                  {hasFoundationData && (
                    <td className={`px-4 py-3 text-sm font-semibold text-emerald-700 ${isSelected ? 'border-l-[3px] border-l-indigo-500' : ''}`}>
                      {row.foundation || '-'}
                    </td>
                  )}
                  <td className={`px-4 py-3 text-sm font-bold text-gray-900 ${isSelected && !hasFoundationData ? 'border-l-[3px] border-l-indigo-500' : ''}`}>
                    {row.columnType}
                    {row.bbox && (
                      <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-indigo-400" title="Source bounding box available" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 font-mono">{row.dimensionWidth}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 font-mono">{row.dimensionHeight}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 font-mono">{row.mainReinforcementCount}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 font-mono">{row.mainReinforcementSize}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 font-mono">{row.hoopReinforcementSize}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 font-mono">{row.hoopReinforcementSpacing}</td>
                  {hasBHData && (
                    <>
                      <td className="px-4 py-3 text-sm text-indigo-700 font-mono">{row.bColumn || ''}</td>
                      <td className="px-4 py-3 text-sm text-indigo-700 font-mono">{row.hColumn || ''}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {onRowSelect && (
          <div className="border-t border-gray-100 bg-gray-50 px-4 py-2 text-[11px] text-gray-500">
            Tip: click any row to highlight its source region in the viewer.
          </div>
        )}
      </div>
    </div>
  );
};
