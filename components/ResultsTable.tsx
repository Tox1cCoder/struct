import React, { useState } from 'react';
import { ColumnReinforcementData } from '../types';

interface ResultsTableProps {
  data: ColumnReinforcementData[];
}

export const ResultsTable: React.FC<ResultsTableProps> = ({ data }) => {
  const [copied, setCopied] = useState(false);

  if (data.length === 0) {
    return (
      <div className="text-center p-8 bg-white rounded-lg shadow-sm border border-gray-100">
        <p className="text-gray-500">No reinforcement data available.</p>
      </div>
    );
  }

  const handleCopyMarkdown = () => {
    // Generate Markdown Table
    const header = "| File | Column Type | 主筋 | 帯筋 |\n| :--- | :--- | :--- | :--- |";
    const rows = data.map(row => `| ${row.sourceFileName || '-'} | ${row.columnType} | ${row.mainReinforcement} | ${row.hoopReinforcement} |`).join("\n");
    const markdown = `${header}\n${rows}`;

    navigator.clipboard.writeText(markdown).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
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
          onClick={handleCopyMarkdown}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all"
        >
          {copied ? (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-green-600">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-500">
                <path fillRule="evenodd" d="M15.988 3.012A2.25 2.25 0 0 1 18 5.25v6.5A2.25 2.25 0 0 1 15.75 14H13.5V7A2.5 2.5 0 0 0 11 4.5H8.128a2.252 2.252 0 0 1 1.884-1.488A2.25 2.25 0 0 1 12.25 1h1.5a2.25 2.25 0 0 1 2.238 2.012ZM11 7.5a1 1 0 0 1 1-1h2.5a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-2.5a1 1 0 0 1-1-1v-10Zm-9 1a1 1 0 0 1 1-1h2.5a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-10Z" clipRule="evenodd" />
              </svg>
              Copy as Markdown
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