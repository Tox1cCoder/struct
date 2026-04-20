import React, { useState, useCallback, useMemo } from 'react';
import { FileUpload } from './components/FileUpload';
import { FoundationTextInput } from './components/FoundationTextInput';
import { ResultsTable } from './components/ResultsTable';
import { FrameImageInput } from './components/FrameImageInput';
import { FrameResultsTable } from './components/FrameResultsTable';
import { FoundationPriorityTextResult } from './components/FoundationPriorityTextResult';
import { extractCertifiedCoordinateData, extractDataFromPdf, extractFoundationPlanCoordinateData, extractFrameData } from './services/geminiService';
import { CertifiedCoordinateFileResult, FoundationColumnData, FileResult, FoundationPlanCoordinateFileResult, FrameFileResult, FrameData } from './types';
import { getErrorMessage, logError } from './utils/errorHandling';
import { mergeReinforcementWithFoundation } from './utils/mergeData';
import { buildFoundationPriorityText } from './utils/mergeFoundationPriority';

type TabType = 'column' | 'frame' | 'priority';

const App: React.FC = () => {
  // Active tab state
  const [activeTab, setActiveTab] = useState<TabType>('column');

  // Reinforcement extraction state
  const [reinfResults, setReinfResults] = useState<FileResult[]>([]);
  const [isReinfProcessing, setIsReinfProcessing] = useState(false);

  // Foundation-Column text input state
  const [foundationData, setFoundationData] = useState<FoundationColumnData[]>([]);

  // Frame extraction state
  const [frameResults, setFrameResults] = useState<FrameFileResult[]>([]);
  const [isFrameProcessing, setIsFrameProcessing] = useState(false);

  // Foundation priority extraction state
  const [certifiedResults, setCertifiedResults] = useState<CertifiedCoordinateFileResult[]>([]);
  const [isCertifiedProcessing, setIsCertifiedProcessing] = useState(false);
  const [foundationPlanResults, setFoundationPlanResults] = useState<FoundationPlanCoordinateFileResult[]>([]);
  const [isFoundationPlanProcessing, setIsFoundationPlanProcessing] = useState(false);

  // Computed consolidated data
  const consolidatedReinfData = useMemo(() => 
    reinfResults
      .filter(r => r.status === 'SUCCESS')
      .flatMap(r => r.data.map(item => ({ ...item, sourceFileName: r.fileName }))),
    [reinfResults]
  );

  // Merge both data sources
  const mergedData = useMemo(() => 
    mergeReinforcementWithFoundation(consolidatedReinfData, foundationData),
    [consolidatedReinfData, foundationData]
  );

  // Consolidated frame data
  const consolidatedFrameData = useMemo(() =>
    frameResults
      .filter(r => r.status === 'SUCCESS' && r.data)
      .map(r => r.data as FrameData),
    [frameResults]
  );

  const consolidatedCertifiedData = useMemo(() =>
    certifiedResults
      .filter(r => r.status === 'SUCCESS')
      .flatMap(r => r.data.map(item => ({ ...item, sourceFileName: r.fileName }))),
    [certifiedResults]
  );

  const consolidatedFoundationPlanData = useMemo(() =>
    foundationPlanResults
      .filter(r => r.status === 'SUCCESS')
      .flatMap(r => r.data.map(item => ({ ...item, sourceFileName: r.fileName }))),
    [foundationPlanResults]
  );

  const foundationPriorityText = useMemo(() =>
    buildFoundationPriorityText(consolidatedCertifiedData, consolidatedFoundationPlanData),
    [consolidatedCertifiedData, consolidatedFoundationPlanData]
  );

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          const base64String = reader.result.split(',')[1];
          resolve(base64String);
        } else {
          reject(new Error('Failed to convert file to base64'));
        }
      };
      reader.onerror = error => reject(error);
    });
  };

  // Process reinforcement file
  const processReinfFile = async (file: File, id: string) => {
    setReinfResults(prev => prev.map(r => r.id === id ? { ...r, status: 'PROCESSING' } : r));

    try {
      const base64Data = await fileToBase64(file);
      const data = await extractDataFromPdf(base64Data, file.type);
      
      setReinfResults(prev => prev.map(r => 
        r.id === id ? { ...r, status: 'SUCCESS', data } : r
      ));
    } catch (err) {
      logError(`Reinforcement extraction failed for ${file.name}`, err);
      const errorMessage = getErrorMessage(err);
      setReinfResults(prev => prev.map(r => 
        r.id === id ? { ...r, status: 'ERROR', error: errorMessage } : r
      ));
    }
  };

  const handleReinfFilesSelect = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    setIsReinfProcessing(true);
    
    const newEntries: FileResult[] = files.map(file => ({
      id: Math.random().toString(36).substring(7),
      fileName: file.name,
      status: 'PENDING',
      data: []
    }));

    setReinfResults(prev => [...prev, ...newEntries]);

    const processingPromises = newEntries.map((entry, index) => 
      processReinfFile(files[index], entry.id)
    );

    await Promise.allSettled(processingPromises);
    setIsReinfProcessing(false);
  }, []);

  const handleFoundationDataChange = useCallback((data: FoundationColumnData[]) => {
    setFoundationData(data);
  }, []);

  // Process frame image
  const processFrameImage = async (id: string, base64: string, mimeType: string) => {
    setFrameResults(prev => prev.map(r => r.id === id ? { ...r, status: 'PROCESSING' } : r));

    try {
      const data = await extractFrameData(base64, mimeType);
      
      if (data.length > 0) {
        // Handle both single and multiple frames in one state update
        setFrameResults(prev => {
          // Get the image preview from the original entry
          const originalEntry = prev.find(r => r.id === id);
          const imagePreview = originalEntry?.imagePreview || '';
          
          // Update the original entry with the first frame
          const updatedEntries = prev.map(r => 
            r.id === id ? { ...r, status: 'SUCCESS' as const, data: data[0] } : r
          );
          
          // Add additional entries for extra frames (if any)
          if (data.length > 1) {
            const additionalEntries: FrameFileResult[] = data.slice(1).map((frame, idx) => ({
              id: `${id}-extra-${idx}`,
              imagePreview: imagePreview,
              status: 'SUCCESS' as const,
              data: frame,
              error: undefined
            }));
            return [...updatedEntries, ...additionalEntries];
          }
          
          return updatedEntries;
        });
      } else {
        setFrameResults(prev => prev.map(r => 
          r.id === id ? { ...r, status: 'ERROR', error: 'No frame data found in image' } : r
        ));
      }
    } catch (err) {
      logError(`Frame extraction failed for ${id}`, err);
      const errorMessage = getErrorMessage(err);
      setFrameResults(prev => prev.map(r => 
        r.id === id ? { ...r, status: 'ERROR', error: errorMessage } : r
      ));
    }
  };

  const handleFrameImagePaste = useCallback(async (imageData: { base64: string; mimeType: string; preview: string }) => {
    const id = Math.random().toString(36).substring(7);
    
    const newEntry: FrameFileResult = {
      id,
      imagePreview: imageData.preview,
      status: 'PENDING',
      data: null
    };

    setFrameResults(prev => [...prev, newEntry]);
    setIsFrameProcessing(true);

    await processFrameImage(id, imageData.base64, imageData.mimeType);
    
    setIsFrameProcessing(false);
  }, []);

  const handleFrameClear = useCallback(() => {
    setFrameResults([]);
  }, []);

  const processCertifiedFile = async (file: File, id: string) => {
    setCertifiedResults(prev => prev.map(r => r.id === id ? { ...r, status: 'PROCESSING' } : r));

    try {
      const data = await extractCertifiedCoordinateData(file);

      setCertifiedResults(prev => prev.map(r =>
        r.id === id ? { ...r, status: 'SUCCESS', data } : r
      ));
    } catch (err) {
      logError(`Certified coordinate extraction failed for ${file.name}`, err);
      const errorMessage = getErrorMessage(err);
      setCertifiedResults(prev => prev.map(r =>
        r.id === id ? { ...r, status: 'ERROR', error: errorMessage } : r
      ));
    }
  };

  const handleCertifiedFilesSelect = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    setIsCertifiedProcessing(true);

    const newEntries: CertifiedCoordinateFileResult[] = files.map(file => ({
      id: Math.random().toString(36).substring(7),
      fileName: file.name,
      status: 'PENDING',
      data: []
    }));

    setCertifiedResults(prev => [...prev, ...newEntries]);

    const processingPromises = newEntries.map((entry, index) =>
      processCertifiedFile(files[index], entry.id)
    );

    await Promise.allSettled(processingPromises);
    setIsCertifiedProcessing(false);
  }, []);

  const processFoundationPlanFile = async (file: File, id: string) => {
    setFoundationPlanResults(prev => prev.map(r => r.id === id ? { ...r, status: 'PROCESSING' } : r));

    try {
      const data = await extractFoundationPlanCoordinateData(file);

      setFoundationPlanResults(prev => prev.map(r =>
        r.id === id ? { ...r, status: 'SUCCESS', data } : r
      ));
    } catch (err) {
      logError(`Foundation plan extraction failed for ${file.name}`, err);
      const errorMessage = getErrorMessage(err);
      setFoundationPlanResults(prev => prev.map(r =>
        r.id === id ? { ...r, status: 'ERROR', error: errorMessage } : r
      ));
    }
  };

  const handleFoundationPlanFilesSelect = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    setIsFoundationPlanProcessing(true);

    const newEntries: FoundationPlanCoordinateFileResult[] = files.map(file => ({
      id: Math.random().toString(36).substring(7),
      fileName: file.name,
      status: 'PENDING',
      data: []
    }));

    setFoundationPlanResults(prev => [...prev, ...newEntries]);

    const processingPromises = newEntries.map((entry, index) =>
      processFoundationPlanFile(files[index], entry.id)
    );

    await Promise.allSettled(processingPromises);
    setIsFoundationPlanProcessing(false);
  }, []);

  const handleClearAll = () => {
    setReinfResults([]);
    setFoundationData([]);
    setIsReinfProcessing(false);
  };

  const handlePriorityClearAll = () => {
    setCertifiedResults([]);
    setFoundationPlanResults([]);
    setIsCertifiedProcessing(false);
    setIsFoundationPlanProcessing(false);
  };

  const hasAnyResults = reinfResults.length > 0;
  const hasFrameResults = frameResults.length > 0;
  const hasPrioritySourceResults = certifiedResults.length > 0 || foundationPlanResults.length > 0;
  const isPriorityProcessing = isCertifiedProcessing || isFoundationPlanProcessing;

  const renderFileList = <T extends { id: string; fileName: string; status: FileResult['status']; data: unknown[]; error?: string }>(
    results: T[],
    title: string,
  ) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">{title}</h4>
      </div>
      <ul className="divide-y divide-gray-100 max-h-40 overflow-y-auto">
        {results.map((result) => (
          <li key={result.id} className="px-4 py-2 flex items-start justify-between gap-3">
            <div className="flex items-start gap-2 min-w-0">
              {result.status === 'PENDING' && <div className="w-2 h-2 rounded-full bg-gray-300" />}
              {result.status === 'PROCESSING' && (
                <svg className="animate-spin h-4 w-4 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              )}
              {result.status === 'SUCCESS' && (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-green-500">
                  <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
                </svg>
              )}
              {result.status === 'ERROR' && (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-red-500">
                  <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.28 7.22a.75.75 0 0 0-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L10 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L11.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L10 8.94 8.28 7.22Z" clipRule="evenodd" />
                </svg>
              )}
              <div className="min-w-0">
                <span
                  className={`text-xs ${result.status === 'ERROR' ? 'text-red-600' : 'text-gray-700'} block truncate max-w-[180px]`}
                  title={result.fileName}
                >
                  {result.fileName}
                </span>
                {result.status === 'ERROR' && result.error && (
                  <p className="mt-0.5 text-[11px] leading-4 text-red-500 break-words max-w-[220px]" title={result.error}>
                    {result.error}
                  </p>
                )}
              </div>
            </div>
            <div className="text-xs flex-shrink-0">
              {result.status === 'PROCESSING' && <span className="text-indigo-600 font-medium">Processing...</span>}
              {result.status === 'SUCCESS' && <span className="text-green-600 font-medium">{result.data.length} items</span>}
              {result.status === 'ERROR' && <span className="text-red-600">Error</span>}
              {result.status === 'PENDING' && <span className="text-gray-400">Queued</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );

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
          {/* Tab-specific clear buttons */}
          {activeTab === 'column' && (hasAnyResults || foundationData.length > 0) && (
            <button 
              onClick={handleClearAll} 
              disabled={isReinfProcessing} 
              className="text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
            >
              Clear All
            </button>
          )}
          {activeTab === 'priority' && hasPrioritySourceResults && (
            <button
              onClick={handlePriorityClearAll}
              disabled={isPriorityProcessing}
              className="text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
            >
              Clear All
            </button>
          )}
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('column')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors
                ${activeTab === 'column' 
                  ? 'border-indigo-500 text-indigo-600' 
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            >
              <span className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5" />
                </svg>
                Column Reinforcement
              </span>
            </button>
            <button
              onClick={() => setActiveTab('frame')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors
                ${activeTab === 'frame' 
                  ? 'border-amber-500 text-amber-600' 
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            >
              <span className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                </svg>
                Frame (FW/FG)
              </span>
            </button>
            <button
              onClick={() => setActiveTab('priority')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors
                ${activeTab === 'priority'
                  ? 'border-cyan-500 text-cyan-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            >
              <span className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m5.25 2.25a8.25 8.25 0 1 1-16.5 0 8.25 8.25 0 0 1 16.5 0Z" />
                </svg>
                Foundation Priority
              </span>
            </button>
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-grow w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Column Tab Content */}
        {activeTab === 'column' && (
          <>
            {/* Intro Section */}
            {!hasAnyResults && foundationData.length === 0 && (
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
                  Structural Column Extractor
                </h2>
                <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
                  Extract reinforcement details and link with foundation-column relationships.
                </p>
              </div>
            )}

            <div className="space-y-6">
              {/* Dual Input Zones */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Column Reinforcement Zone */}
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                    Column Reinforcement (主筋・帯筋)
                  </h3>
                  <FileUpload 
                    onFilesSelect={handleReinfFilesSelect} 
                    disabled={isReinfProcessing}
                    title="Upload Reinforcement Docs"
                    description="Click to browse or drag & drop files here"
                    iconColor="indigo"
                    zoneId="reinforcement"
                    isActiveTab={activeTab === 'column'}
                  />
                  {reinfResults.length > 0 && (
                    <div className="mt-4">
                      {renderFileList(reinfResults, 'Reinforcement Files')}
                    </div>
                  )}
                </div>

                {/* Foundation-Column Linking Text Input */}
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    Foundation-Column Linking (基礎-柱)
                  </h3>
                  <FoundationTextInput 
                    onDataChange={handleFoundationDataChange}
                    disabled={isReinfProcessing}
                  />
                </div>
              </div>

              {/* Results Section */}
              {mergedData.length > 0 && (
                <div className="space-y-6 animate-fade-in-up">
                  <ResultsTable data={mergedData} hasFoundationData={foundationData.length > 0} />
                  
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex gap-3 text-sm text-blue-700">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 flex-shrink-0 mt-0.5">
                      <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z" clipRule="evenodd" />
                    </svg>
                    <p>
                      <strong>Note:</strong> Data extracted based on "Zone II" (Ⅱゾーン) priority. 
                      {foundationData.length > 0 && ' Foundation-Column relationships have been linked.'}
                      {' '}Always verify AI-extracted engineering data against original documents.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Frame Tab Content */}
        {activeTab === 'frame' && (
          <>
            {/* Intro Section */}
            {!hasFrameResults && (
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
                  Frame Data Extractor
                </h2>
                <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
                  Extract FW (Foundation Wall) and FG (Foundation Girder) data from images.
                </p>
              </div>
            )}

            <div className="space-y-6">
              {/* Frame Input Zone */}
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  Frame Images (FW・FG)
                </h3>
                <FrameImageInput
                  results={frameResults}
                  onImagePaste={handleFrameImagePaste}
                  onClear={handleFrameClear}
                  disabled={isFrameProcessing}
                  isActiveTab={activeTab === 'frame'}
                />
              </div>

              {/* Frame Results */}
              {consolidatedFrameData.length > 0 && (
                <div className="space-y-6 animate-fade-in-up">
                  <FrameResultsTable data={consolidatedFrameData} />
                  
                  <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 flex gap-3 text-sm text-amber-700">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 flex-shrink-0 mt-0.5">
                      <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z" clipRule="evenodd" />
                    </svg>
                    <p>
                      <strong>Note:</strong> Frame data extracted from images. 
                      FW = Foundation Wall (布基礎), FG = Foundation Girder (地中梁/フーチング).
                      {' '}Always verify AI-extracted engineering data against original documents.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Foundation Priority Tab Content */}
        {activeTab === 'priority' && (
          <>
            {!hasPrioritySourceResults && (
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
                  Foundation Priority Extractor
                </h2>
                <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
                  Join 認定柱脚資料 and 基礎伏図 by canonical grid placement tokens, then output plain-text foundation mappings.
                </p>
              </div>
            )}

            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                    認定柱脚資料
                  </h3>
                  <FileUpload
                    onFilesSelect={handleCertifiedFilesSelect}
                    disabled={isCertifiedProcessing}
                    title="Upload Certified Column Base PDFs"
                    description="Click to browse or drag & drop PDF files here"
                    iconColor="indigo"
                    zoneId="certified-foundation"
                    isActiveTab={activeTab === 'priority'}
                    accept=".pdf,application/pdf"
                    allowPaste={false}
                    fileTypesLabel="PDF only"
                  />
                  {certifiedResults.length > 0 && (
                    <div className="mt-4">
                      {renderFileList(certifiedResults, 'Certified Files')}
                    </div>
                  )}
                </div>

                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    基礎伏図
                  </h3>
                  <FileUpload
                    onFilesSelect={handleFoundationPlanFilesSelect}
                    disabled={isFoundationPlanProcessing}
                    title="Upload Foundation Plan PDFs"
                    description="Click to browse or drag & drop PDF files here"
                    iconColor="emerald"
                    zoneId="foundation-plan-priority"
                    isActiveTab={activeTab === 'priority'}
                    accept=".pdf,application/pdf"
                    allowPaste={false}
                    fileTypesLabel="PDF only"
                  />
                  {foundationPlanResults.length > 0 && (
                    <div className="mt-4">
                      {renderFileList(foundationPlanResults, 'Foundation Plan Files')}
                    </div>
                  )}
                </div>
              </div>

              {foundationPriorityText.lines.length > 0 && (
                <div className="space-y-6 animate-fade-in-up">
                  <FoundationPriorityTextResult
                    text={foundationPriorityText.text}
                    count={foundationPriorityText.lines.length}
                  />

                  <div className="bg-cyan-50 border border-cyan-100 rounded-lg p-4 flex gap-3 text-sm text-cyan-700">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 flex-shrink-0 mt-0.5">
                      <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z" clipRule="evenodd" />
                    </svg>
                    <p>
                      <strong>Rule:</strong> The app matches both PDFs by canonical X/Y placement tokens for each support location, such as `X1` or `X1-X2`.
                      {' '}If 基礎伏図 shows an FC code at that placement, it wins. Otherwise the app uses the certified C or P code from 認定柱脚資料 at the same placement.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
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
