import React, { useEffect, useRef, useState } from 'react';
import { FrameFileResult } from '../types';

interface FrameImageInputProps {
  results: FrameFileResult[];
  onImagePaste: (imageData: { base64: string; mimeType: string; preview: string }) => void;
  onClear: () => void;
  disabled?: boolean;
  isActiveTab: boolean;
}

export const FrameImageInput: React.FC<FrameImageInputProps> = ({
  results,
  onImagePaste,
  onClear,
  disabled = false,
  isActiveTab = true,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const disabledRef = useRef(disabled);
  const onImagePasteRef = useRef(onImagePaste);
  const isActiveTabRef = useRef(isActiveTab);

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  useEffect(() => {
    onImagePasteRef.current = onImagePaste;
  }, [onImagePaste]);

  useEffect(() => {
    isActiveTabRef.current = isActiveTab;
  }, [isActiveTab]);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (disabledRef.current || !isActiveTabRef.current) return;

      const items = event.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            event.preventDefault();
            const reader = new FileReader();
            reader.onload = (e) => {
              const result = e.target?.result as string;
              if (result) {
                const base64 = result.split(',')[1];
                onImagePasteRef.current({
                  base64,
                  mimeType: file.type,
                  preview: result,
                });
              }
            };
            reader.readAsDataURL(file);
          }
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, []);

  const successCount = results.filter((r) => r.status === 'SUCCESS').length;
  const processingCount = results.filter((r) => r.status === 'PROCESSING').length;
  const errorCount = results.filter((r) => r.status === 'ERROR').length;
  const hasResults = results.length > 0;
  const isProcessing = processingCount > 0;

  const readImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) {
        onImagePasteRef.current({
          base64: result.split(',')[1],
          mimeType: file.type,
          preview: result,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    if (disabled) return;
    const files = Array.from(event.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    files.forEach(readImageFile);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!disabled) setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  return (
    <div className="space-y-3">
      <div
        data-testid="frame-dropzone"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`w-full border-2 border-dashed rounded-xl p-6 text-center transition-colors duration-200
          ${disabled
            ? 'opacity-50 cursor-not-allowed border-gray-300'
            : isDragOver
              ? 'border-amber-500 bg-amber-50 cursor-pointer'
              : 'border-amber-300 bg-amber-50/30 hover:border-amber-500 hover:bg-amber-50 cursor-pointer'
          }`}
      >
        <div className="flex flex-col items-center justify-center space-y-3">
          <div className="p-3 bg-amber-100 rounded-full text-amber-600">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
            </svg>
          </div>
          <div className="flex flex-col items-center">
            <h3 className="text-base font-semibold text-gray-900">Paste Frame Images</h3>
            <p className="text-sm text-gray-500 mt-1">
              Press <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs font-mono">Ctrl+V</kbd> anywhere to paste images
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">FW</span>
              <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">FG</span>
              <span className="text-xs text-gray-400">Foundation Wall &amp; Girder</span>
            </div>
            {isActiveTab && !disabled && (
              <span className="mt-2 text-xs text-green-600 font-medium flex items-center gap-1">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                Ready to receive paste
              </span>
            )}
          </div>
        </div>
      </div>

      {hasResults && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs">
          <div className="flex items-center gap-3">
            <span className="font-medium text-gray-700">{results.length} pasted</span>
            <span className="flex items-center gap-1 text-green-600">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              {successCount} ok
            </span>
            {processingCount > 0 && (
              <span className="flex items-center gap-1 text-amber-600">
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                {processingCount} processing
              </span>
            )}
            {errorCount > 0 && (
              <span className="flex items-center gap-1 text-red-600">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                {errorCount} failed
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClear}
            disabled={isProcessing}
            className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
};
