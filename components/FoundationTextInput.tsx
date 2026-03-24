import React, { useState, useCallback } from 'react';
import { FoundationColumnData } from '../types';
import { parseFoundationColumnText } from '../utils/parseFoundationText';

interface FoundationTextInputProps {
  onDataChange: (data: FoundationColumnData[]) => void;
  disabled?: boolean;
}

export const FoundationTextInput: React.FC<FoundationTextInputProps> = ({ onDataChange, disabled }) => {
  const [text, setText] = useState('');
  const [parsedCount, setParsedCount] = useState(0);

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setText(value);
    
    // Parse and notify parent
    const parsed = parseFoundationColumnText(value);
    setParsedCount(parsed.length);
    onDataChange(parsed);
  }, [onDataChange]);

  const handleClear = () => {
    setText('');
    setParsedCount(0);
    onDataChange([]);
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-gray-700">
          Paste Foundation-Column mappings
        </label>
        {parsedCount > 0 && (
          <span className="text-xs font-medium px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
            {parsedCount} unique mappings
          </span>
        )}
      </div>
      <textarea
        value={text}
        onChange={handleTextChange}
        disabled={disabled}
        placeholder={`Paste mappings in "F : C : FC : BxH" format, one per line...

Example:
F110A : C1 : - : 400x400
F112 : CP1 : - : 200x200
F1A : C3 : - : 600x600

(BxH column is optional)
F1A : C3 : -
F12 : - : FC2

Old format still supported:
F11 : C1`}
        className={`w-full h-40 p-3 text-sm font-mono border rounded-lg resize-none
          ${disabled 
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
            : 'bg-white text-gray-800 border-gray-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
          }`}
      />
      <div className="flex items-center justify-between mt-2">
        <p className="text-xs text-gray-500">
          Only Fxxx patterns kept. Duplicates and (SGL-...) notes removed automatically.
        </p>
        {text && (
          <button
            onClick={handleClear}
            disabled={disabled}
            className="text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
};
