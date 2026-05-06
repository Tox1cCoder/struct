import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DocumentViewer } from './DocumentViewer';
import { FileSelector } from './FileSelector';
import { ACCENT_CLASSES, ViewerAccent, ViewerFile, ViewerSelection } from './types';

interface ViewerSidebarProps {
  files: ViewerFile[];
  selection: ViewerSelection | null;
  onSelectionChange: (selection: ViewerSelection | null) => void;
  accent: ViewerAccent;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  width: number;
  onWidthChange: (width: number) => void;
  onPageCountResolved: (fileId: string, pageCount: number) => void;
}

const MIN_WIDTH = 320;
const MAX_WIDTH = 880;
const COLLAPSED_WIDTH = 48;
const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export const ViewerSidebar: React.FC<ViewerSidebarProps> = ({
  files,
  selection,
  onSelectionChange,
  accent,
  collapsed,
  onCollapsedChange,
  width,
  onWidthChange,
  onPageCountResolved,
}) => {
  const colors = ACCENT_CLASSES[accent];
  const [zoom, setZoom] = useState(1);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const selectedFile = useMemo(() => files.find((f) => f.id === selection?.fileId), [files, selection?.fileId]);
  const isPdf = selectedFile?.sourceMimeType === 'application/pdf';
  const pageCount = selectedFile?.pageCount ?? 1;
  const currentPage = Math.min(Math.max(selection?.page ?? 1, 1), Math.max(1, pageCount));

  useEffect(() => {
    if (selection?.fileId && !selectedFile) {
      onSelectionChange(null);
    }
  }, [selection?.fileId, selectedFile, onSelectionChange]);

  const handleSelectFile = useCallback(
    (fileId: string) => {
      onSelectionChange({ fileId, page: 1 });
    },
    [onSelectionChange],
  );

  const handlePageChange = useCallback(
    (newPage: number) => {
      if (!selectedFile) return;
      const clamped = Math.min(Math.max(newPage, 1), Math.max(1, selectedFile.pageCount ?? 1));
      onSelectionChange({ fileId: selectedFile.id, page: clamped });
    },
    [selectedFile, onSelectionChange],
  );

  const handleMouseDown = (e: React.MouseEvent) => {
    if (collapsed) return;
    dragRef.current = { startX: e.clientX, startWidth: width };
    e.preventDefault();
  };

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startX - e.clientX;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragRef.current.startWidth + delta));
      onWidthChange(next);
    };
    const handleUp = () => {
      dragRef.current = null;
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [onWidthChange]);

  const effectiveWidth = collapsed ? COLLAPSED_WIDTH : width;

  if (collapsed) {
    return (
      <aside
        style={{ width: effectiveWidth }}
        className="flex flex-col border-l border-gray-200 bg-white"
      >
        <button
          type="button"
          onClick={() => onCollapsedChange(false)}
          className="flex h-12 w-12 items-center justify-center text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
          title="Expand source viewer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 19.5-7.5-7.5 7.5-7.5" />
          </svg>
        </button>
        <div className="flex flex-1 items-center justify-center">
          <span className="rotate-180 text-[10px] font-semibold uppercase tracking-widest text-gray-400" style={{ writingMode: 'vertical-rl' }}>
            Source viewer
          </span>
        </div>
      </aside>
    );
  }

  return (
    <aside
      style={{ width: effectiveWidth }}
      className="relative flex flex-shrink-0 flex-col border-l border-gray-200 bg-white"
    >
      <div
        onMouseDown={handleMouseDown}
        className="absolute left-0 top-0 z-20 h-full w-1 cursor-col-resize hover:bg-gray-300"
        title="Drag to resize"
      />

      <div className={`border-b border-gray-200 px-3 py-2 ${colors.bgSoft}`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className={`text-xs font-semibold uppercase tracking-wider ${colors.text}`}>Source Viewer</h2>
          <button
            type="button"
            onClick={() => onCollapsedChange(true)}
            className="rounded p-1 text-gray-500 transition hover:bg-white hover:text-gray-700"
            title="Collapse"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
        <div className="mt-2">
          <FileSelector
            files={files}
            selectedFileId={selection?.fileId}
            onSelect={handleSelectFile}
            accent={accent}
          />
        </div>
        {selectedFile && (
          <div className="mt-2 flex items-center justify-between gap-2 text-xs">
            {isPdf && pageCount > 0 ? (
              <div className="flex items-center gap-1 text-gray-600">
                <button
                  type="button"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className="rounded p-1 hover:bg-white disabled:opacity-30"
                  title="Previous page"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
                  </svg>
                </button>
                <span className="font-mono">
                  {currentPage} / {pageCount}
                </span>
                <button
                  type="button"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= pageCount}
                  className="rounded p-1 hover:bg-white disabled:opacity-30"
                  title="Next page"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 1 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            ) : (
              <span className="text-gray-400">{isPdf ? '—' : 'Image'}</span>
            )}
            <div className="flex items-center gap-1 text-gray-600">
              <button
                type="button"
                onClick={() => {
                  const idx = ZOOM_LEVELS.findIndex((z) => z >= zoom);
                  setZoom(ZOOM_LEVELS[Math.max(0, idx - 1)] ?? ZOOM_LEVELS[0]);
                }}
                className="rounded p-1 hover:bg-white"
                title="Zoom out"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h12.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
                </svg>
              </button>
              <span className="w-12 text-center font-mono">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                onClick={() => {
                  const idx = ZOOM_LEVELS.findIndex((z) => z > zoom);
                  setZoom(idx === -1 ? ZOOM_LEVELS[ZOOM_LEVELS.length - 1] : ZOOM_LEVELS[idx]);
                }}
                className="rounded p-1 hover:bg-white"
                title="Zoom in"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                className="ml-1 rounded px-1.5 text-[10px] uppercase tracking-wide text-gray-500 hover:bg-white"
                title="Reset zoom"
              >
                Fit
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1">
        {selectedFile ? (
          <DocumentViewer
            file={selectedFile}
            selection={selection}
            accent={accent}
            zoom={zoom}
            onPageCountChange={onPageCountResolved}
          />
        ) : files.length === 0 ? (
          <ViewerHint
            title="No source files yet"
            message="Upload a document to see the original next to extracted data."
          />
        ) : (
          <ViewerHint
            title="Select a file to preview"
            message="Choose a file from the dropdown above, or click any row in the results table."
          />
        )}
      </div>

      {selectedFile?.error && (
        <div className="border-t border-red-100 bg-red-50 px-3 py-2 text-[11px] text-red-700">
          {selectedFile.error}
        </div>
      )}
    </aside>
  );
};

const ViewerHint: React.FC<{ title: string; message: string }> = ({ title, message }) => (
  <div className="flex h-full items-center justify-center bg-gray-50 p-6 text-center">
    <div>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} className="mx-auto h-10 w-10 text-gray-300">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
      <p className="mt-3 text-sm font-semibold text-gray-700">{title}</p>
      <p className="mt-1 text-xs text-gray-500">{message}</p>
    </div>
  </div>
);
