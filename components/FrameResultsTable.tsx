import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { BoundingBox, EditableFrameData, FrameData } from '../types';

interface RowSource {
  fileId: string;
  bbox?: BoundingBox;
}

interface FrameResultsTableProps {
  data: EditableFrameData[];
  selectedRowKey?: string | null;
  onRowSelect?: (rowKey: string, source: RowSource | null) => void;
  onRowChange?: (rowId: string, patch: Partial<FrameData>) => void;
  onAddRow?: () => void;
  onDeleteRow?: (rowId: string) => void;
}

const rowLabelOf = (row: EditableFrameData) => row.frameName || row.rowId;

export const FrameResultsTable: React.FC<FrameResultsTableProps> = ({
  data,
  selectedRowKey,
  onRowSelect,
  onRowChange,
  onAddRow,
  onDeleteRow,
}) => {
  const [exporting, setExporting] = useState(false);

  if (data.length === 0) {
    return null;
  }

  const editable = Boolean(onRowChange);

  const handleExportExcel = () => {
    setExporting(true);
    try {
      const headers = [
        'Frame Name (符号)',
        'B',
        'H',
        '上端筋 D',
        '上端筋 Value',
        '下端筋 D',
        '下端筋 Value',
        'St. D',
        'St. Value',
      ];

      const rows = data.map((row) => [
        row.frameName,
        row.b,
        row.h,
        row.topRebarD,
        row.topRebarValue,
        row.bottomRebarD,
        row.bottomRebarValue,
        row.stirrupD || '',
        row.stirrupValue || '',
      ]);

      const wsData = [headers, ...rows];

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(wsData);

      ws['!cols'] = [
        { wch: 15 },
        { wch: 8 },
        { wch: 8 },
        { wch: 10 },
        { wch: 10 },
        { wch: 10 },
        { wch: 10 },
        { wch: 10 },
        { wch: 10 },
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Frame Data');

      const timestamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `frame_data_${timestamp}.xlsx`);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setExporting(false);
    }
  };

  const handleViewSource = (row: EditableFrameData) => {
    if (!onRowSelect) return;
    if (!row.sourceFileId) {
      onRowSelect(row.rowId, null);
      return;
    }
    onRowSelect(row.rowId, { fileId: row.sourceFileId, bbox: row.bbox });
  };

  const handlePatch = (row: EditableFrameData, patch: Partial<FrameData>) => {
    if (!onRowChange) return;
    onRowChange(row.rowId, patch);
  };

  return (
    <div className="w-full mx-auto bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-800">Frame Data Schedule</h2>
          <span className="text-xs font-medium px-2.5 py-0.5 rounded bg-amber-100 text-amber-800">
            {data.length} {data.length === 1 ? 'Frame' : 'Frames'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onAddRow && (
            <button
              type="button"
              onClick={onAddRow}
              aria-label="Add frame row"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md hover:bg-amber-100"
            >
              Add frame row
            </button>
          )}
          <button
            onClick={handleExportExcel}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 transition-all disabled:opacity-50"
          >
            {exporting ? 'Exporting...' : 'Export as Excel'}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider">
              <th className="px-4 py-3 font-semibold border-b border-gray-200">Frame Name</th>
              <th className="px-4 py-3 font-semibold border-b border-gray-200">B</th>
              <th className="px-4 py-3 font-semibold border-b border-gray-200">H</th>
              <th className="px-4 py-3 font-semibold border-b border-gray-200 bg-amber-50" colSpan={2}>上端筋</th>
              <th className="px-4 py-3 font-semibold border-b border-gray-200 bg-orange-50" colSpan={2}>下端筋</th>
              <th className="px-4 py-3 font-semibold border-b border-gray-200 bg-blue-50" colSpan={2}>St.</th>
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
                    isSelected ? 'bg-amber-50 ring-1 ring-inset ring-amber-300' : 'hover:bg-gray-50'
                  }`}
                >
                  <td className={`px-4 py-3 text-sm font-bold text-gray-900 ${isSelected ? 'border-l-[3px] border-l-amber-500' : ''}`}>
                    {editable ? (
                      <input
                        aria-label={`${label} frame name`}
                        value={row.frameName}
                        onChange={(e) => handlePatch(row, { frameName: e.target.value })}
                        className="w-24 rounded border border-gray-200 px-2 py-1 font-mono text-sm"
                      />
                    ) : (
                      <span className={row.frameName.startsWith('FW') ? 'text-blue-700' : 'text-purple-700'}>
                        {row.frameName}
                      </span>
                    )}
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
                  <td className="px-4 py-3 text-sm text-gray-700 font-mono">
                    {editable ? (
                      <input
                        aria-label={`${label} B`}
                        value={row.b}
                        onChange={(e) => handlePatch(row, { b: e.target.value })}
                        className="w-16 rounded border border-gray-200 px-2 py-1 font-mono text-sm"
                      />
                    ) : (
                      row.b
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 font-mono">
                    {editable ? (
                      <input
                        aria-label={`${label} H`}
                        value={row.h}
                        onChange={(e) => handlePatch(row, { h: e.target.value })}
                        className="w-16 rounded border border-gray-200 px-2 py-1 font-mono text-sm"
                      />
                    ) : (
                      row.h
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 bg-amber-50/30 font-mono">
                    {editable ? (
                      <input
                        aria-label={`${label} top rebar D`}
                        value={row.topRebarD}
                        onChange={(e) => handlePatch(row, { topRebarD: e.target.value })}
                        className="w-16 rounded border border-gray-200 px-2 py-1 font-mono text-sm"
                      />
                    ) : (
                      row.topRebarD
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 bg-amber-50/30 font-mono">
                    {editable ? (
                      <input
                        aria-label={`${label} top rebar value`}
                        value={row.topRebarValue}
                        onChange={(e) => handlePatch(row, { topRebarValue: e.target.value })}
                        className="w-16 rounded border border-gray-200 px-2 py-1 font-mono text-sm"
                      />
                    ) : (
                      row.topRebarValue
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 bg-orange-50/30 font-mono">
                    {editable ? (
                      <input
                        aria-label={`${label} bottom rebar D`}
                        value={row.bottomRebarD}
                        onChange={(e) => handlePatch(row, { bottomRebarD: e.target.value })}
                        className="w-16 rounded border border-gray-200 px-2 py-1 font-mono text-sm"
                      />
                    ) : (
                      row.bottomRebarD
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 bg-orange-50/30 font-mono">
                    {editable ? (
                      <input
                        aria-label={`${label} bottom rebar value`}
                        value={row.bottomRebarValue}
                        onChange={(e) => handlePatch(row, { bottomRebarValue: e.target.value })}
                        className="w-16 rounded border border-gray-200 px-2 py-1 font-mono text-sm"
                      />
                    ) : (
                      row.bottomRebarValue
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 bg-blue-50/30 font-mono">
                    {editable ? (
                      <input
                        aria-label={`${label} stirrup D`}
                        value={row.stirrupD ?? ''}
                        onChange={(e) => handlePatch(row, { stirrupD: e.target.value })}
                        className="w-16 rounded border border-gray-200 px-2 py-1 font-mono text-sm"
                      />
                    ) : (
                      row.stirrupD || '-'
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 bg-blue-50/30 font-mono">
                    {editable ? (
                      <input
                        aria-label={`${label} stirrup value`}
                        value={row.stirrupValue ?? ''}
                        onChange={(e) => handlePatch(row, { stirrupValue: e.target.value })}
                        className="w-16 rounded border border-gray-200 px-2 py-1 font-mono text-sm"
                      />
                    ) : (
                      row.stirrupValue || '-'
                    )}
                  </td>
                  {(onRowSelect || onDeleteRow) && (
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        {onRowSelect && row.sourceFileId && (
                          <button
                            type="button"
                            onClick={() => handleViewSource(row)}
                            className="text-xs text-amber-700 hover:text-amber-900"
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
