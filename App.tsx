import React, { useState, useCallback } from 'react';
import { FileUpload } from './components/FileUpload';
import { ResultsTable } from './components/ResultsTable';
import { extractDataFromPdf } from './services/geminiService';
import { ColumnReinforcementData, FileResult } from './types';

const App: React.FC = () => {
  const [fileResults, setFileResults] = useState<FileResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Computed consolidated data from all successful files with source filename injected
  const consolidatedData = fileResults
    .filter(r => r.status === 'SUCCESS')
    .flatMap(r => r.data.map(item => ({ ...item, sourceFileName: r.fileName })));

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          // Remove the data URL prefix
          const base64String = reader.result.split(',')[1];
          resolve(base64String);
        } else {
          reject(new Error('Failed to convert file to base64'));
        }
      };
      reader.onerror = error => reject(error);
    });
  };

  const processFile = async (file: File, id: string) => {
    // Update status to PROCESSING
    setFileResults(prev => prev.map(r => r.id === id ? { ...r, status: 'PROCESSING' } : r));

    try {
      const base64Data = await fileToBase64(file);
      const data = await extractDataFromPdf(base64Data, file.type);
      
      setFileResults(prev => prev.map(r => 
        r.id === id ? { ...r, status: 'SUCCESS', data } : r
      ));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Processing failed';
      setFileResults(prev => prev.map(r => 
        r.id === id ? { ...r, status: 'ERROR', error: errorMessage } : r
      ));
    }
  };

  const handleFilesSelect = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    setIsProcessing(true);
    
    // Create initial result entries
    const newEntries: FileResult[] = files.map(file => ({
      id: Math.random().toString(36).substring(7),
      fileName: file.name,
      status: 'PENDING',
      data: []
    }));

    // Append new entries to state
    setFileResults(prev => [...prev, ...newEntries]);

    // Process files concurrently
    const processingPromises = newEntries.map((entry, index) => 
      processFile(files[index], entry.id)
    );

    await Promise.allSettled(processingPromises);
    setIsProcessing(false);
  }, []);

  const handleClearAll = () => {
    setFileResults([]);
    setIsProcessing(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 rounded p-1.5 w-8 h-8 flex items-center justify-center shadow-sm">
              <span className="text-white font-bold text-lg leading-none">S</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">StructExtract</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        
        {/* Intro Section */}
        {fileResults.length === 0 && (
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
              Structural Column Extractor
            </h2>
            <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
              Upload your document to get the result of Main (主筋) and Hoop (帯筋) reinforcement details.
            </p>
          </div>
        )}

        <div className="space-y-8">
          {/* Upload Section */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
             <FileUpload 
               onFilesSelect={handleFilesSelect} 
               disabled={isProcessing}
             />
          </div>

          {/* Processing Status List */}
          {fileResults.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
               <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Processed Files</h3>
                  <button onClick={handleClearAll} disabled={isProcessing} className="text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-50">
                    Clear All
                  </button>
               </div>
               <ul className="divide-y divide-gray-100">
                 {fileResults.map((result) => (
                   <li key={result.id} className="px-6 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                         {/* Icon based on status */}
                         {result.status === 'PENDING' && <div className="w-2 h-2 rounded-full bg-gray-300" />}
                         {result.status === 'PROCESSING' && (
                           <svg className="animate-spin h-4 w-4 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                             <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                             <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                           </svg>
                         )}
                         {result.status === 'SUCCESS' && (
                           <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-green-500">
                             <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
                           </svg>
                         )}
                         {result.status === 'ERROR' && (
                           <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-red-500">
                             <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.28 7.22a.75.75 0 0 0-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L10 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L11.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L10 8.94 8.28 7.22Z" clipRule="evenodd" />
                           </svg>
                         )}
                         
                         <span className={`text-sm ${result.status === 'ERROR' ? 'text-red-600' : 'text-gray-700'}`}>
                           {result.fileName}
                         </span>
                      </div>
                      <div className="text-xs">
                        {result.status === 'PROCESSING' && <span className="text-indigo-600 font-medium">Processing...</span>}
                        {result.status === 'SUCCESS' && <span className="text-green-600 font-medium">{result.data.length} items found</span>}
                        {result.status === 'ERROR' && <span className="text-red-600">{result.error}</span>}
                        {result.status === 'PENDING' && <span className="text-gray-400">Queued</span>}
                      </div>
                   </li>
                 ))}
               </ul>
            </div>
          )}

          {/* Results Section */}
          {consolidatedData.length > 0 && (
            <div className="space-y-6 animate-fade-in-up">
              <ResultsTable data={consolidatedData} />
              
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex gap-3 text-sm text-blue-700">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 flex-shrink-0 mt-0.5">
                  <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z" clipRule="evenodd" />
                </svg>
                <p>
                  <strong>Note:</strong> Data extracted based on "Zone II" (Ⅱゾーン) priority. 
                  Always verify AI-extracted engineering data against original documents before construction use.
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
      
      {/* Footer */}
      <footer className="bg-white mt-auto">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        </div>
      </footer>
    </div>
  );
};

export default App;