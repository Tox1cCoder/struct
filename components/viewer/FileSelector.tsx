import React, { useEffect, useRef, useState } from 'react';
import { ProcessingStatus } from '../../types';
import { ACCENT_CLASSES, ViewerAccent, ViewerFile } from './types';

interface FileSelectorProps {
  files: ViewerFile[];
  selectedFileId?: string;
  onSelect: (fileId: string) => void;
  accent: ViewerAccent;
}

export const FileSelector: React.FC<FileSelectorProps> = ({ files, selectedFileId, onSelect, accent }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const colors = ACCENT_CLASSES[accent];

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const selected = files.find((f) => f.id === selectedFileId);

  const grouped = files.reduce<Record<string, ViewerFile[]>>((acc, f) => {
    const key = f.group ?? '';
    (acc[key] ||= []).push(f);
    return acc;
  }, {});

  const groupKeys = Object.keys(grouped);

  return (
    <div ref={ref} className="relative w-full min-w-0">
      <button
        type="button"
        onClick={() => files.length > 0 && setOpen((v) => !v)}
        disabled={files.length === 0}
        className={`flex w-full items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-left text-sm shadow-sm transition focus:outline-none focus:ring-2 focus:${colors.ring} disabled:opacity-60`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <StatusDot status={selected?.status ?? 'IDLE'} />
          <span className="min-w-0 truncate text-gray-700">
            {selected ? selected.fileName : files.length === 0 ? 'No files yet' : 'Select a file'}
          </span>
        </span>
        <svg className="h-4 w-4 flex-shrink-0 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
        </svg>
      </button>

      {open && files.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          {groupKeys.map((key) => (
            <div key={key || 'default'}>
              {key && (
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  {key}
                </div>
              )}
              {grouped[key].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    onSelect(f.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-gray-50 ${
                    f.id === selectedFileId ? `${colors.bgSoft} ${colors.text}` : 'text-gray-700'
                  }`}
                >
                  <StatusDot status={f.status} />
                  <span className="min-w-0 flex-1 truncate" title={f.fileName}>
                    {f.fileName}
                  </span>
                  {typeof f.itemCount === 'number' && f.status === 'SUCCESS' && (
                    <span className="text-[11px] text-gray-500">{f.itemCount} items</span>
                  )}
                  {f.status === 'PROCESSING' && (
                    <span className="text-[11px] text-gray-500">processing…</span>
                  )}
                  {f.status === 'ERROR' && (
                    <span className="text-[11px] text-red-500">error</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const StatusDot: React.FC<{ status: ProcessingStatus }> = ({ status }) => {
  const cls =
    status === 'SUCCESS'
      ? 'bg-green-500'
      : status === 'PROCESSING'
        ? 'bg-amber-500 animate-pulse'
        : status === 'ERROR'
          ? 'bg-red-500'
          : status === 'PENDING'
            ? 'bg-gray-300'
            : 'bg-gray-200';
  return <span className={`h-2 w-2 flex-shrink-0 rounded-full ${cls}`} />;
};
