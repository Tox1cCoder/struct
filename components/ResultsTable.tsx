import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { ColumnReinforcementData } from '../types';
import { transformForExport } from '../utils/dataTransform';

interface ResultsTableProps {
  data: ColumnReinforcementData[];
}

export const ResultsTable: React.FC<ResultsTableProps> = ({ data }) => {
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
      // Transform data: split columns and expand rows
      const expandedData = transformForExport(data);

      // Create worksheet data with headers
      const wsData = [
        [
          'File',
          'Column Type (柱符号)',
          'Dimensions (柱形)',
          'Main Reinforcement Count (主筋本数)',
          'Main Reinforcement Size (主筋径)',
          'Hoop Reinforcement Size (帯筋径)',
          'Hoop Reinforcement Spacing (帯筋ピッチ)',
        ],
        ...expandedData.map(row => [
          row.sourceFileName,
          row.columnType,
          row.columnDimensions,
          row.mainReinforcementCount,
          row.mainReinforcementSize,
          row.hoopReinforcementSize,
          row.hoopReinforcementSpacing,
        ]),
      ];

      // Create workbook and worksheet
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Set column widths
      ws['!cols'] = [
        { wch: 25 }, // File
        { wch: 15 }, // Column Type
        { wch: 15 }, // Dimensions
        { wch: 20 }, // Main Count
        { wch: 18 }, // Main Size
        { wch: 18 }, // Hoop Size
        { wch: 22 }, // Hoop Spacing
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
    <div className="w-full max-w-4xl mx-auto bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-800">Consolidated Reinforcement Schedule</h2>
          <span className="text-xs font-medium px-2.5 py-0.5 rounded bg-indigo-100 text-indigo-800">
            {data.length} Entries
          </span>
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
              <th className="px-6 py-3 font-semibold border-b border-gray-200">File</th>
              <th className="px-6 py-3 font-semibold border-b border-gray-200">Column Type</th>
              <th className="px-6 py-3 font-semibold border-b border-gray-200">Dimensions (柱形)</th>
              <th className="px-6 py-3 font-semibold border-b border-gray-200">Main Reinforcement (主筋)</th>
              <th className="px-6 py-3 font-semibold border-b border-gray-200">Hoop Reinforcement (帯筋)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map((row, index) => (
              <tr 
                key={`${row.columnType}-${index}`} 
                className="hover:bg-gray-50 transition-colors duration-150"
              >
                <td className="px-6 py-4 text-xs text-gray-500 font-mono">
                  {row.sourceFileName}
                </td>
                <td className="px-6 py-4 text-sm font-bold text-gray-900">
                  {row.columnType}
                </td>
                <td className="px-6 py-4 text-sm text-gray-700 font-mono">
                  {row.columnDimensions}
                </td>
                <td className="px-6 py-4 text-sm text-gray-700 font-mono">
                  {row.mainReinforcement}
                </td>
                <td className="px-6 py-4 text-sm text-gray-700 font-mono">
                  {row.hoopReinforcement}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

