import React, { useRef, useState, useEffect } from 'react';

interface FileUploadProps {
  onFilesSelect: (files: File[]) => void;
  disabled?: boolean;
  title?: string;
  description?: string;
  iconColor?: 'indigo' | 'emerald';
  zoneId: string; // Unique ID for this upload zone
}

export const FileUpload: React.FC<FileUploadProps> = ({ 
  onFilesSelect, 
  disabled,
  title = 'Upload Documents',
  description = 'Click to browse or drag & drop files here',
  iconColor = 'indigo',
  zoneId,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (disabled || !isFocused) return;

      const items = event.clipboardData?.items;
      if (!items) return;

      const pastedFiles: File[] = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            pastedFiles.push(file);
          }
        }
      }

      if (pastedFiles.length > 0) {
        onFilesSelect(pastedFiles);
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, [onFilesSelect, disabled, isFocused]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      onFilesSelect(Array.from(event.target.files));
    }
    // Reset input so the same files can be selected again if needed
    if (event.target) {
      event.target.value = '';
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (disabled) return;
    
    // Accept both PDF and image files
    const droppedFiles = Array.from(event.dataTransfer.files).filter(
      (file: File) => file.type === 'application/pdf' || file.type.startsWith('image/')
    );
    
    if (droppedFiles.length > 0) {
      onFilesSelect(droppedFiles);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const colorClasses = {
    indigo: {
      border: 'border-indigo-300 hover:border-indigo-500 hover:bg-indigo-50',
      bg: 'bg-indigo-100',
      text: 'text-indigo-600',
      focus: 'ring-indigo-500',
    },
    emerald: {
      border: 'border-emerald-300 hover:border-emerald-500 hover:bg-emerald-50',
      bg: 'bg-emerald-100',
      text: 'text-emerald-600',
      focus: 'ring-emerald-500',
    },
  };

  const colors = colorClasses[iconColor];

  return (
    <div 
      ref={zoneRef}
      tabIndex={0}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      className={`w-full border-2 border-dashed rounded-xl p-8 text-center transition-colors duration-200 outline-none
        ${disabled ? 'opacity-50 cursor-not-allowed border-gray-300' : `${colors.border} cursor-pointer`}
        ${isFocused && !disabled ? `ring-2 ${colors.focus} ring-offset-2` : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onClick={() => !disabled && fileInputRef.current?.click()}
      data-zone-id={zoneId}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".pdf,image/*"
        multiple
        className="hidden"
        disabled={disabled}
      />
      
      <div className="flex flex-col items-center justify-center space-y-3">
        <div className={`p-3 ${colors.bg} rounded-full ${colors.text}`}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
        </div>
        <div className="flex flex-col items-center">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500 mt-1">{description}</p>
          <div className="mt-2 flex items-center gap-2">
             <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10">Multiple files</span>
             <span className="text-xs text-gray-400">PDF & Images</span>
          </div>
          {isFocused && <span className="mt-2 text-xs text-gray-400">Ctrl+V to paste image</span>}
        </div>
      </div>
    </div>
  );
};
