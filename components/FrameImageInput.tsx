import React, { useRef, useEffect } from 'react';
import { FrameFileResult } from '../types';

interface FrameImageInputProps {
  results: FrameFileResult[];
  onImagePaste: (imageData: { base64: string; mimeType: string; preview: string }) => void;
  onClear: () => void;
  disabled?: boolean;
  isActiveTab: boolean; // New prop to know if Frame tab is active
}

export const FrameImageInput: React.FC<FrameImageInputProps> = ({
  results,
  onImagePaste,
  onClear,
  disabled = false,
  isActiveTab = true
}) => {
  const zoneRef = useRef<HTMLDivElement>(null);
  
  // Use refs to avoid stale closures in event handlers
  const disabledRef = useRef(disabled);
  const onImagePasteRef = useRef(onImagePaste);
  const isActiveTabRef = useRef(isActiveTab);
  
  // Keep refs in sync with props
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
      // Only handle paste when Frame tab is active and not disabled
      if (disabledRef.current || !isActiveTabRef.current) return;

      const items = event.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            // Prevent default to avoid any browser handling
            event.preventDefault();
            
            const reader = new FileReader();
            reader.onload = (e) => {
              const result = e.target?.result as string;
              if (result) {
                const base64 = result.split(',')[1];
                onImagePasteRef.current({
                  base64,
                  mimeType: file.type,
                  preview: result
                });
              }
            };
            reader.readAsDataURL(file);
          }
        }
      }
    };

    // Listen on document level for global paste
    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, []); // Empty deps - only run once, use refs for dynamic values

  const hasResults = results.length > 0;
  const isProcessing = results.some(r => r.status === 'PROCESSING');

  return (
    <div className="space-y-4">
      {/* Paste Zone - now just informational */}
      <div
        ref={zoneRef}
        className={`w-full border-2 border-dashed rounded-xl p-6 text-center transition-colors duration-200
          ${disabled ? 'opacity-50 cursor-not-allowed border-gray-300' : 'border-amber-300 bg-amber-50/30'}`}
      >
        <div className="flex flex-col items-center justify-center space-y-3">
          <div className="p-3 bg-amber-100 rounded-full text-amber-600">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
            </svg>
          </div>
          <div className="flex flex-col items-center">
            <h3 className="text-base font-semibold text-gray-900">Paste Frame Images</h3>
            <p className="text-sm text-gray-500 mt-1">Press <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs font-mono">Ctrl+V</kbd> anywhere to paste images</p>
            <div className="mt-2 flex items-center gap-2">
              <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">FW</span>
              <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">FG</span>
              <span className="text-xs text-gray-400">Foundation Wall & Girder</span>
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

      {/* Image Thumbnails & Status */}
      {hasResults && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
            <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Pasted Images ({results.length})
            </h4>
            <button
              onClick={onClear}
              disabled={isProcessing}
              className="text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Clear All
            </button>
          </div>
          <div className="p-3 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 max-h-60 overflow-y-auto">
            {results.map((result) => (
              <div
                key={result.id}
                className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all
                  ${result.status === 'PROCESSING' ? 'border-amber-400 animate-pulse' : ''}
                  ${result.status === 'SUCCESS' ? 'border-green-400' : ''}
                  ${result.status === 'ERROR' ? 'border-red-400' : ''}
                  ${result.status === 'PENDING' ? 'border-gray-200' : ''}`}
              >
                <img
                  src={result.imagePreview}
                  alt="Frame"
                  className="w-full h-full object-cover"
                />
                {/* Status Overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  {result.status === 'PENDING' && (
                    <span className="text-xs text-white bg-gray-600 px-2 py-0.5 rounded">Queued</span>
                  )}
                  {result.status === 'PROCESSING' && (
                    <svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  )}
                  {result.status === 'SUCCESS' && (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6 text-green-400">
                      <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
                    </svg>
                  )}
                  {result.status === 'ERROR' && (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6 text-red-400">
                      <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.28 7.22a.75.75 0 0 0-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L10 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L11.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L10 8.94 8.28 7.22Z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
                {/* Frame Name Badge */}
                {result.status === 'SUCCESS' && result.data && (
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                    <span className="text-[10px] text-white font-medium truncate block">{result.data.frameName}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
