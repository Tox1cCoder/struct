import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { ExpandedReinforcementData } from '../types';

interface ResultsTableProps {
  data: ExpandedReinforcementData[];
  hasFoundationData?: boolean;
}

export const ResultsTable: React.FC<ResultsTableProps> = ({ data, hasFoundationData = false }) => {
  const [exporting, setExporting] = useState(false);

  if (data.length === 0) {
    return (
      <div className="text-center p-8 bg-white rounded-lg shadow-sm border border-gray-100">
        <p className="text-gray-500">No reinforcement data available.</p>
      </div>
    );
  }

  const handleExportExcel = () => {
    setExporting(true);
    try {
      // Build headers dynamically based on whether foundation data exists
      const headers = hasFoundationData
        ? [
            'Foundation (基礎)',
            'Column Type (柱符号)',
            'Width (幅)',
            'Height (せい)',
            'Main Count (主筋本数)',
            'Main Size (主筋径)',
            'Hoop Size (帯筋径)',
            'Hoop Spacing (帯筋ピッチ)',
          ]
        : [
            'Column Type (柱符号)',
            'Width (幅)',
            'Height (せい)',
            'Main Count (主筋本数)',
            'Main Size (主筋径)',
            'Hoop Size (帯筋径)',
            'Hoop Spacing (帯筋ピッチ)',
          ];

      // Build row data
      const rows = data.map(row => 
        hasFoundationData
          ? [
              row.foundation || '',
              row.columnType,
              row.dimensionWidth,
              row.dimensionHeight,
              row.mainReinforcementCount,
              row.mainReinforcementSize,
              row.hoopReinforcementSize,
              row.hoopReinforcementSpacing,
            ]
          : [
              row.columnType,
              row.dimensionWidth,
              row.dimensionHeight,
              row.mainReinforcementCount,
              row.mainReinforcementSize,
              row.hoopReinforcementSize,
              row.hoopReinforcementSpacing,
            ]
      );

      const wsData = [headers, ...rows];

      // Create workbook and worksheet
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Set column widths
      ws['!cols'] = hasFoundationData
        ? [
            { wch: 12 }, // Foundation
            { wch: 15 }, // Column Type
            { wch: 10 }, // Width
            { wch: 10 }, // Height
            { wch: 12 }, // Main Count
            { wch: 10 }, // Main Size
            { wch: 10 }, // Hoop Size
            { wch: 12 }, // Hoop Spacing
          ]
        : [
            { wch: 15 }, // Column Type
            { wch: 10 }, // Width
            { wch: 10 }, // Height
            { wch: 15 }, // Main Count
            { wch: 12 }, // Main Size
            { wch: 12 }, // Hoop Size
            { wch: 15 }, // Hoop Spacing
          ];

      XLSX.utils.book_append_sheet(wb, ws, 'Reinforcement Data');

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().slice(0, 10);
      const filename = `reinforcement_data_${timestamp}.xlsx`;

      // Download the file
      XLSX.writeFile(wb, filename);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setExporting(false);
    }
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
              <th className="px-4 py-3 font-semibold border-b border-gray-200">Width (幅)</th>
              <th className="px-4 py-3 font-semibold border-b border-gray-200">Height (せい)</th>
              <th className="px-4 py-3 font-semibold border-b border-gray-200">Main Count</th>
              <th className="px-4 py-3 font-semibold border-b border-gray-200">Main Size</th>
              <th className="px-4 py-3 font-semibold border-b border-gray-200">Hoop Size</th>
              <th className="px-4 py-3 font-semibold border-b border-gray-200">Hoop Spacing</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map((row, index) => (
              <tr 
                key={`${row.columnType}-${index}`} 
                className="hover:bg-gray-50 transition-colors duration-150"
              >
                {hasFoundationData && (
                  <td className="px-4 py-3 text-sm font-semibold text-emerald-700">
                    {row.foundation || '-'}
                  </td>
                )}
                <td className="px-4 py-3 text-sm font-bold text-gray-900">
                  {row.columnType}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700 font-mono">
                  {row.dimensionWidth}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700 font-mono">
                  {row.dimensionHeight}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700 font-mono">
                  {row.mainReinforcementCount}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700 font-mono">
                  {row.mainReinforcementSize}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700 font-mono">
                  {row.hoopReinforcementSize}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700 font-mono">
                  {row.hoopReinforcementSpacing}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

