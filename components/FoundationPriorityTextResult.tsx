import React, { useState } from 'react';
import { BoundingBox } from '../types';
import { FoundationPriorityEntry } from '../utils/mergeFoundationPriority';

interface RowSource {
  fileId: string;
  page?: number;
  bbox?: BoundingBox;
}

interface FoundationPriorityTextResultProps {
  text: string;
  entries: FoundationPriorityEntry[];
  selectedRowKey?: string | null;
  onRowSelect?: (rowKey: string, source: RowSource | null) => void;
}

const rowKeyOf = (entry: FoundationPriorityEntry, index: number) =>
  `${entry.foundation}::${entry.columnType}::${index}`;

export const FoundationPriorityTextResult: React.FC<FoundationPriorityTextResultProps> = ({
  text,
  entries,
  selectedRowKey,
  onRowSelect,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error('Copy failed:', error);
    }
  };

  const handleRowClick = (entry: FoundationPriorityEntry, index: number) => {
    if (!onRowSelect) return;
    const key = rowKeyOf(entry, index);
    if (!entry.sourceFileId) {
      onRowSelect(key, null);
      return;
    }
    onRowSelect(key, {
      fileId: entry.sourceFileId,
      page: entry.page,
      bbox: entry.bbox,
    });
  };

  return (
    <div className="w-full mx-auto bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-800">Foundation Priority Text</h2>
          <span className="text-xs font-medium px-2.5 py-0.5 rounded bg-cyan-100 text-cyan-800">
            {entries.length} {entries.length === 1 ? 'Foundation' : 'Foundations'}
          </span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 transition-all"
        >
          {copied ? (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-green-600">
                <path fillRule="evenodd" d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.25 7.313a1 1 0 0 1-1.418.008l-3.25-3.188a1 1 0 0 1 1.4-1.428l2.54 2.49 6.55-6.608a1 1 0 0 1 1.422 0Z" clipRule="evenodd" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-cyan-600">
                <path d="M5.5 4A2.5 2.5 0 0 1 8 1.5h5.5A2.5 2.5 0 0 1 16 4v7.5A2.5 2.5 0 0 1 13.5 14H8A2.5 2.5 0 0 1 5.5 11.5V4Z" />
                <path d="M4 5.75A2.75 2.75 0 0 0 1.25 8.5v7.25A2.25 2.25 0 0 0 3.5 18h6.75A2.75 2.75 0 0 0 13 15.25V15h-1.5v.25c0 .69-.56 1.25-1.25 1.25H3.5A.75.75 0 0 1 2.75 15.75V8.5c0-.69.56-1.25 1.25-1.25H4v-1.5Z" />
              </svg>
              Copy Text
            </>
          )}
        </button>
      </div>
      <div className="p-3">
        <div className="rounded-lg border border-cyan-100 bg-cyan-50/40 divide-y divide-cyan-100">
          {entries.map((entry, index) => {
            const key = rowKeyOf(entry, index);
            const isSelected = key === selectedRowKey;
            const clickable = Boolean(onRowSelect && entry.sourceFileId);
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleRowClick(entry, index)}
                disabled={!clickable}
                className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left transition ${
                  isSelected
                    ? 'bg-cyan-100/70 ring-1 ring-inset ring-cyan-400'
                    : clickable
                      ? 'hover:bg-cyan-100/40'
                      : 'cursor-default'
                } ${isSelected ? 'border-l-[3px] border-l-cyan-500' : ''}`}
              >
                <span className="font-mono text-sm text-gray-800">{entry.text}</span>
                <span className="flex items-center gap-2 text-[10px] uppercase tracking-wide">
                  <span className={`rounded px-1.5 py-0.5 font-semibold ${
                    entry.origin === 'plan' ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'
                  }`}>
                    {entry.origin === 'plan' ? '基礎伏図' : '認定柱脚'}
                  </span>
                  {entry.bbox && (
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-500" title="Source bounding box available" />
                  )}
                </span>
              </button>
            );
          })}
        </div>
        {onRowSelect && (
          <p className="mt-2 px-1 text-[11px] text-gray-500">
            Tip: click any line to highlight its source region in the viewer.
          </p>
        )}
      </div>
    </div>
  );
};
