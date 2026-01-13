import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { FrameData } from '../types';

interface FrameResultsTableProps {
  data: FrameData[];
}

export const FrameResultsTable: React.FC<FrameResultsTableProps> = ({ data }) => {
  const [exporting, setExporting] = useState(false);

  if (data.length === 0) {
    return null;
  }

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
      ];

      const rows = data.map(row => [
        row.frameName,
        row.b,
        row.h,
        row.topRebarD,
        row.topRebarValue,
        row.bottomRebarD,
        row.bottomRebarValue,
      ]);

      const wsData = [headers, ...rows];

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(wsData);

      ws['!cols'] = [
        { wch: 15 }, // Frame Name
        { wch: 8 },  // B
        { wch: 8 },  // H
        { wch: 10 }, // 上端筋 D
        { wch: 10 }, // 上端筋 Value
        { wch: 10 }, // 下端筋 D
        { wch: 10 }, // 下端筋 Value
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Frame Data');

      const timestamp = new Date().toISOString().slice(0, 10);
      const filename = `frame_data_${timestamp}.xlsx`;

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
          <h2 className="text-lg font-semibold text-gray-800">Frame Data Schedule</h2>
          <span className="text-xs font-medium px-2.5 py-0.5 rounded bg-amber-100 text-amber-800">
            {data.length} {data.length === 1 ? 'Frame' : 'Frames'}
          </span>
        </div>
        <button
          onClick={handleExportExcel}
          disabled={exporting}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 transition-all disabled:opacity-50"
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
              <th className="px-4 py-3 font-semibold border-b border-gray-200">Frame Name</th>
              <th className="px-4 py-3 font-semibold border-b border-gray-200">B</th>
              <th className="px-4 py-3 font-semibold border-b border-gray-200">H</th>
              <th className="px-4 py-3 font-semibold border-b border-gray-200 bg-amber-50" colSpan={2}>上端筋</th>
              <th className="px-4 py-3 font-semibold border-b border-gray-200 bg-orange-50" colSpan={2}>下端筋</th>
            </tr>
            <tr className="bg-gray-50 text-gray-500 text-xs">
              <th className="border-b border-gray-200"></th>
              <th className="border-b border-gray-200"></th>
              <th className="border-b border-gray-200"></th>
              <th className="px-4 py-2 font-medium border-b border-gray-200 bg-amber-50/50">D</th>
              <th className="px-4 py-2 font-medium border-b border-gray-200 bg-amber-50/50">Value</th>
              <th className="px-4 py-2 font-medium border-b border-gray-200 bg-orange-50/50">D</th>
              <th className="px-4 py-2 font-medium border-b border-gray-200 bg-orange-50/50">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map((row, index) => (
              <tr
                key={`${row.frameName}-${index}`}
                className="hover:bg-gray-50 transition-colors duration-150"
              >
                <td className="px-4 py-3 text-sm font-bold text-gray-900">
                  <span className={`inline-flex items-center gap-1 ${row.frameName.startsWith('FW') ? 'text-blue-700' : 'text-purple-700'}`}>
                    {row.frameName}
                    <span className={`text-[10px] px-1 py-0.5 rounded ${row.frameName.startsWith('FW') ? 'bg-blue-100' : 'bg-purple-100'}`}>
                      {row.frameName.startsWith('FW') ? 'Wall' : 'Girder'}
                    </span>
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-700 font-mono">
                  {row.b}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700 font-mono">
                  {row.h}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700 bg-amber-50/30 font-mono">
                  {row.topRebarD}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700 bg-amber-50/30 font-mono">
                  {row.topRebarValue}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700 bg-orange-50/30 font-mono">
                  {row.bottomRebarD}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700 bg-orange-50/30 font-mono">
                  {row.bottomRebarValue}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
