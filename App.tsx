import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileUpload } from './components/FileUpload';
import { FoundationTextInput } from './components/FoundationTextInput';
import { ResultsTable } from './components/ResultsTable';
import { FrameImageInput } from './components/FrameImageInput';
import { FrameResultsTable } from './components/FrameResultsTable';
import { FoundationPriorityTextResult } from './components/FoundationPriorityTextResult';
import { ViewerSidebar } from './components/viewer/ViewerSidebar';
import { ViewerAccent, ViewerFile, ViewerSelection } from './components/viewer/types';
import {
  extractCertifiedCoordinateData,
  extractDataFromPdf,
  extractFoundationPlanCoordinateData,
  extractFrameData,
} from './services/geminiService';
import {
  BoundingBox,
  CertifiedCoordinateFileResult,
  FoundationColumnData,
  FileResult,
  FoundationPlanCoordinateFileResult,
  FrameFileResult,
  FrameData,
} from './types';
import { getErrorMessage, logError } from './utils/errorHandling';
import { mergeReinforcementWithFoundation } from './utils/mergeData';
import { buildFoundationPriorityText } from './utils/mergeFoundationPriority';

type TabType = 'column' | 'frame' | 'priority';

interface RowSourceClick {
  fileId: string;
  page?: number;
  bbox?: BoundingBox;
}

const SIDEBAR_WIDTH_KEY = 'structextract.sidebar.width';
const SIDEBAR_COLLAPSED_KEY = 'structextract.sidebar.collapsed';
const DEFAULT_SIDEBAR_WIDTH = 460;

const TAB_ACCENT: Record<TabType, ViewerAccent> = {
  column: 'indigo',
  frame: 'amber',
  priority: 'cyan',
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('column');

  const [reinfResults, setReinfResults] = useState<FileResult[]>([]);
  const [isReinfProcessing, setIsReinfProcessing] = useState(false);

  const [foundationData, setFoundationData] = useState<FoundationColumnData[]>([]);

  const [frameResults, setFrameResults] = useState<FrameFileResult[]>([]);
  const [isFrameProcessing, setIsFrameProcessing] = useState(false);

  const [certifiedResults, setCertifiedResults] = useState<CertifiedCoordinateFileResult[]>([]);
  const [isCertifiedProcessing, setIsCertifiedProcessing] = useState(false);
  const [foundationPlanResults, setFoundationPlanResults] = useState<FoundationPlanCoordinateFileResult[]>([]);
  const [isFoundationPlanProcessing, setIsFoundationPlanProcessing] = useState(false);

  const [viewerSelection, setViewerSelection] = useState<ViewerSelection | null>(null);
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  });
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_SIDEBAR_WIDTH;
    const stored = Number(window.localStorage.getItem(SIDEBAR_WIDTH_KEY));
    return Number.isFinite(stored) && stored >= 320 ? stored : DEFAULT_SIDEBAR_WIDTH;
  });

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? '1' : '0');
  }, [sidebarCollapsed]);
  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  const sourceUrlsRef = useRef<Set<string>>(new Set());

  const registerSourceUrl = useCallback((file: File): string => {
    const url = URL.createObjectURL(file);
    sourceUrlsRef.current.add(url);
    return url;
  }, []);

  const revokeSourceUrls = useCallback((urls: Array<string | undefined>) => {
    for (const url of urls) {
      if (url && sourceUrlsRef.current.has(url)) {
        URL.revokeObjectURL(url);
        sourceUrlsRef.current.delete(url);
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      for (const url of sourceUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
      sourceUrlsRef.current.clear();
    };
  }, []);

  const consolidatedReinfData = useMemo(
    () =>
      reinfResults
        .filter((r) => r.status === 'SUCCESS')
        .flatMap((r) =>
          r.data.map((item) => ({
            ...item,
            sourceFileName: r.fileName,
            sourceFileId: r.id,
          })),
        ),
    [reinfResults],
  );

  const mergedData = useMemo(
    () => mergeReinforcementWithFoundation(consolidatedReinfData, foundationData),
    [consolidatedReinfData, foundationData],
  );

  const consolidatedFrameData = useMemo<FrameData[]>(
    () =>
      frameResults
        .filter((r) => r.status === 'SUCCESS' && r.data)
        .map((r) => ({
          ...(r.data as FrameData),
          sourceFileId: r.id,
        })),
    [frameResults],
  );

  const consolidatedCertifiedData = useMemo(
    () =>
      certifiedResults
        .filter((r) => r.status === 'SUCCESS')
        .flatMap((r) =>
          r.data.map((item) => ({
            ...item,
            sourceFileName: r.fileName,
            sourceFileId: r.id,
          })),
        ),
    [certifiedResults],
  );

  const consolidatedFoundationPlanData = useMemo(
    () =>
      foundationPlanResults
        .filter((r) => r.status === 'SUCCESS')
        .flatMap((r) =>
          r.data.map((item) => ({
            ...item,
            sourceFileName: r.fileName,
            sourceFileId: r.id,
          })),
        ),
    [foundationPlanResults],
  );

  const foundationPriorityResult = useMemo(
    () => buildFoundationPriorityText(consolidatedCertifiedData, consolidatedFoundationPlanData),
    [consolidatedCertifiedData, consolidatedFoundationPlanData],
  );

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result.split(',')[1]);
        } else {
          reject(new Error('Failed to convert file to base64'));
        }
      };
      reader.onerror = (error) => reject(error);
    });

  const processReinfFile = async (file: File, id: string) => {
    setReinfResults((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'PROCESSING' } : r)));
    try {
      const base64Data = await fileToBase64(file);
      const data = await extractDataFromPdf(base64Data, file.type);
      setReinfResults((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: 'SUCCESS', data } : r)),
      );
    } catch (err) {
      logError(`Reinforcement extraction failed for ${file.name}`, err);
      setReinfResults((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: 'ERROR', error: getErrorMessage(err) } : r)),
      );
    }
  };

  const handleReinfFilesSelect = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setIsReinfProcessing(true);
      const newEntries: FileResult[] = files.map((file) => ({
        id: Math.random().toString(36).substring(7),
        fileName: file.name,
        status: 'PENDING',
        data: [],
        sourceUrl: registerSourceUrl(file),
        sourceMimeType: file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : ''),
      }));
      setReinfResults((prev) => [...prev, ...newEntries]);
      await Promise.allSettled(
        newEntries.map((entry, index) => processReinfFile(files[index], entry.id)),
      );
      setIsReinfProcessing(false);
    },
    [registerSourceUrl],
  );

  const handleFoundationDataChange = useCallback((data: FoundationColumnData[]) => {
    setFoundationData(data);
  }, []);

  const processFrameImage = async (id: string, base64: string, mimeType: string) => {
    setFrameResults((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'PROCESSING' } : r)));
    try {
      const data = await extractFrameData(base64, mimeType);
      if (data.length > 0) {
        setFrameResults((prev) => {
          const originalEntry = prev.find((r) => r.id === id);
          const imagePreview = originalEntry?.imagePreview || '';
          const updated = prev.map((r) =>
            r.id === id ? { ...r, status: 'SUCCESS' as const, data: data[0] } : r,
          );
          if (data.length > 1) {
            const additional: FrameFileResult[] = data.slice(1).map((frame, idx) => ({
              id: `${id}-extra-${idx}`,
              imagePreview,
              status: 'SUCCESS' as const,
              data: frame,
              sourceMimeType: mimeType,
            }));
            return [...updated, ...additional];
          }
          return updated;
        });
      } else {
        setFrameResults((prev) =>
          prev.map((r) =>
            r.id === id ? { ...r, status: 'ERROR', error: 'No frame data found in image' } : r,
          ),
        );
      }
    } catch (err) {
      logError(`Frame extraction failed for ${id}`, err);
      setFrameResults((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: 'ERROR', error: getErrorMessage(err) } : r)),
      );
    }
  };

  const handleFrameImagePaste = useCallback(
    async (imageData: { base64: string; mimeType: string; preview: string }) => {
      const id = Math.random().toString(36).substring(7);
      const newEntry: FrameFileResult = {
        id,
        imagePreview: imageData.preview,
        status: 'PENDING',
        data: null,
        sourceMimeType: imageData.mimeType,
      };
      setFrameResults((prev) => [...prev, newEntry]);
      setIsFrameProcessing(true);
      await processFrameImage(id, imageData.base64, imageData.mimeType);
      setIsFrameProcessing(false);
    },
    [],
  );

  const handleFrameClear = useCallback(() => {
    setFrameResults([]);
    setViewerSelection(null);
    setSelectedRowKey(null);
  }, []);

  const processCertifiedFile = async (file: File, id: string) => {
    setCertifiedResults((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'PROCESSING' } : r)),
    );
    try {
      const data = await extractCertifiedCoordinateData(file);
      setCertifiedResults((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: 'SUCCESS', data } : r)),
      );
    } catch (err) {
      logError(`Certified coordinate extraction failed for ${file.name}`, err);
      setCertifiedResults((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: 'ERROR', error: getErrorMessage(err) } : r)),
      );
    }
  };

  const handleCertifiedFilesSelect = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setIsCertifiedProcessing(true);
      const newEntries: CertifiedCoordinateFileResult[] = files.map((file) => ({
        id: Math.random().toString(36).substring(7),
        fileName: file.name,
        status: 'PENDING',
        data: [],
        sourceUrl: registerSourceUrl(file),
        sourceMimeType: file.type || 'application/pdf',
      }));
      setCertifiedResults((prev) => [...prev, ...newEntries]);
      await Promise.allSettled(
        newEntries.map((entry, index) => processCertifiedFile(files[index], entry.id)),
      );
      setIsCertifiedProcessing(false);
    },
    [registerSourceUrl],
  );

  const processFoundationPlanFile = async (file: File, id: string) => {
    setFoundationPlanResults((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'PROCESSING' } : r)),
    );
    try {
      const data = await extractFoundationPlanCoordinateData(file);
      setFoundationPlanResults((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: 'SUCCESS', data } : r)),
      );
    } catch (err) {
      logError(`Foundation plan extraction failed for ${file.name}`, err);
      setFoundationPlanResults((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: 'ERROR', error: getErrorMessage(err) } : r)),
      );
    }
  };

  const handleFoundationPlanFilesSelect = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setIsFoundationPlanProcessing(true);
      const newEntries: FoundationPlanCoordinateFileResult[] = files.map((file) => ({
        id: Math.random().toString(36).substring(7),
        fileName: file.name,
        status: 'PENDING',
        data: [],
        sourceUrl: registerSourceUrl(file),
        sourceMimeType: file.type || 'application/pdf',
      }));
      setFoundationPlanResults((prev) => [...prev, ...newEntries]);
      await Promise.allSettled(
        newEntries.map((entry, index) => processFoundationPlanFile(files[index], entry.id)),
      );
      setIsFoundationPlanProcessing(false);
    },
    [registerSourceUrl],
  );

  const handleClearColumn = () => {
    revokeSourceUrls(reinfResults.map((r) => r.sourceUrl));
    setReinfResults([]);
    setFoundationData([]);
    setIsReinfProcessing(false);
    setViewerSelection(null);
    setSelectedRowKey(null);
  };

  const handleClearPriority = () => {
    revokeSourceUrls([
      ...certifiedResults.map((r) => r.sourceUrl),
      ...foundationPlanResults.map((r) => r.sourceUrl),
    ]);
    setCertifiedResults([]);
    setFoundationPlanResults([]);
    setIsCertifiedProcessing(false);
    setIsFoundationPlanProcessing(false);
    setViewerSelection(null);
    setSelectedRowKey(null);
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setViewerSelection(null);
    setSelectedRowKey(null);
  };

  const handleRowSelect = useCallback(
    (rowKey: string, source: RowSourceClick | null) => {
      if (!source) {
        setSelectedRowKey(rowKey);
        setViewerSelection(null);
        return;
      }
      setSelectedRowKey(rowKey);
      setViewerSelection({
        fileId: source.fileId,
        page: source.page,
        bbox: source.bbox,
        rowKey,
      });
      setSidebarCollapsed(false);
    },
    [],
  );

  const handlePageCountResolved = useCallback((fileId: string, pageCount: number) => {
    setReinfResults((prev) =>
      prev.map((r) => (r.id === fileId ? { ...r, pageCount } : r)),
    );
    setCertifiedResults((prev) =>
      prev.map((r) => (r.id === fileId ? { ...r, pageCount } : r)),
    );
    setFoundationPlanResults((prev) =>
      prev.map((r) => (r.id === fileId ? { ...r, pageCount } : r)),
    );
  }, []);

  const viewerFiles: ViewerFile[] = useMemo(() => {
    if (activeTab === 'column') {
      return reinfResults.map((r) => ({
        id: r.id,
        fileName: r.fileName,
        status: r.status,
        sourceUrl: r.sourceUrl,
        sourceMimeType: r.sourceMimeType,
        pageCount: r.pageCount,
        itemCount: r.data.length,
        error: r.error,
      }));
    }
    if (activeTab === 'frame') {
      const seen = new Set<string>();
      return frameResults
        .filter((r) => {
          const baseId = r.id.split('-extra-')[0];
          if (seen.has(baseId)) return false;
          seen.add(baseId);
          return true;
        })
        .map((r) => ({
          id: r.id,
          fileName: r.data?.frameName ?? `Pasted image ${r.id.slice(-4)}`,
          status: r.status,
          sourceUrl: r.imagePreview,
          sourceMimeType: r.sourceMimeType ?? 'image/png',
          itemCount: r.status === 'SUCCESS' && r.data ? 1 : 0,
          error: r.error,
        }));
    }
    return [
      ...certifiedResults.map<ViewerFile>((r) => ({
        id: r.id,
        fileName: r.fileName,
        status: r.status,
        sourceUrl: r.sourceUrl,
        sourceMimeType: r.sourceMimeType,
        pageCount: r.pageCount,
        itemCount: r.data.length,
        error: r.error,
        group: '認定柱脚資料',
      })),
      ...foundationPlanResults.map<ViewerFile>((r) => ({
        id: r.id,
        fileName: r.fileName,
        status: r.status,
        sourceUrl: r.sourceUrl,
        sourceMimeType: r.sourceMimeType,
        pageCount: r.pageCount,
        itemCount: r.data.length,
        error: r.error,
        group: '基礎伏図',
      })),
    ];
  }, [activeTab, reinfResults, frameResults, certifiedResults, foundationPlanResults]);

  const accent = TAB_ACCENT[activeTab];

  const hasAnyResults = reinfResults.length > 0;
  const hasFrameResults = frameResults.length > 0;
  const hasPrioritySourceResults = certifiedResults.length > 0 || foundationPlanResults.length > 0;
  const isPriorityProcessing = isCertifiedProcessing || isFoundationPlanProcessing;

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 rounded p-1.5 w-8 h-8 flex items-center justify-center shadow-sm">
              <span className="text-white font-bold text-lg leading-none">S</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">StructExtract</h1>
          </div>
          <div className="flex items-center gap-3">
            {activeTab === 'column' && (hasAnyResults || foundationData.length > 0) && (
              <button
                onClick={handleClearColumn}
                disabled={isReinfProcessing}
                className="text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
              >
                Clear All
              </button>
            )}
            {activeTab === 'frame' && hasFrameResults && (
              <button
                onClick={handleFrameClear}
                disabled={isFrameProcessing}
                className="text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
              >
                Clear All
              </button>
            )}
            {activeTab === 'priority' && hasPrioritySourceResults && (
              <button
                onClick={handleClearPriority}
                disabled={isPriorityProcessing}
                className="text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
              >
                Clear All
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="bg-white border-b border-gray-200">
        <div className="px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8" aria-label="Tabs">
            <TabButton active={activeTab === 'column'} accent="indigo" onClick={() => handleTabChange('column')}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5" />
              </svg>
              Column Reinforcement
            </TabButton>
            <TabButton active={activeTab === 'frame'} accent="amber" onClick={() => handleTabChange('frame')}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
              </svg>
              Frame (FW/FG)
            </TabButton>
            <TabButton active={activeTab === 'priority'} accent="cyan" onClick={() => handleTabChange('priority')}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m5.25 2.25a8.25 8.25 0 1 1-16.5 0 8.25 8.25 0 0 1 16.5 0Z" />
              </svg>
              Foundation Priority
            </TabButton>
          </nav>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6">
          {activeTab === 'column' && (
            <>
              {!hasAnyResults && foundationData.length === 0 && (
                <div className="text-center mb-8">
                  <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">Structural Column Extractor</h2>
                  <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
                    Extract reinforcement details and link with foundation-column relationships.
                  </p>
                </div>
              )}

              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                    <StatusStrip results={reinfResults} accent="indigo" />
                  </div>

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

                {mergedData.length > 0 && (
                  <div className="space-y-6 animate-fade-in-up">
                    <ResultsTable
                      data={mergedData}
                      hasFoundationData={foundationData.length > 0}
                      selectedRowKey={selectedRowKey}
                      onRowSelect={handleRowSelect}
                    />
                    <InfoBanner accent="indigo">
                      <strong>Note:</strong> Data extracted based on "Zone II" (Ⅱゾーン) priority.
                      {foundationData.length > 0 && ' Foundation-Column relationships have been linked.'}{' '}
                      Always verify AI-extracted engineering data against original documents.
                    </InfoBanner>
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'frame' && (
            <>
              {!hasFrameResults && (
                <div className="text-center mb-8">
                  <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">Frame Data Extractor</h2>
                  <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
                    Extract FW (Foundation Wall) and FG (Foundation Girder) data from images.
                  </p>
                </div>
              )}

              <div className="space-y-6">
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

                {consolidatedFrameData.length > 0 && (
                  <div className="space-y-6 animate-fade-in-up">
                    <FrameResultsTable
                      data={consolidatedFrameData}
                      selectedRowKey={selectedRowKey}
                      onRowSelect={handleRowSelect}
                    />
                    <InfoBanner accent="amber">
                      <strong>Note:</strong> Frame data extracted from images. FW = Foundation Wall (布基礎), FG =
                      Foundation Girder (地中梁/フーチング). Always verify AI-extracted engineering data against
                      original documents.
                    </InfoBanner>
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'priority' && (
            <>
              {!hasPrioritySourceResults && (
                <div className="text-center mb-8">
                  <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">Foundation Priority Extractor</h2>
                  <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
                    Join 認定柱脚資料 and 基礎伏図 by canonical grid placement tokens, then output plain-text
                    foundation mappings.
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
                    <StatusStrip results={certifiedResults} accent="indigo" />
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
                    <StatusStrip results={foundationPlanResults} accent="emerald" />
                  </div>
                </div>

                {foundationPriorityResult.entries.length > 0 && (
                  <div className="space-y-6 animate-fade-in-up">
                    <FoundationPriorityTextResult
                      text={foundationPriorityResult.text}
                      entries={foundationPriorityResult.entries}
                      selectedRowKey={selectedRowKey}
                      onRowSelect={handleRowSelect}
                    />
                    <InfoBanner accent="cyan">
                      <strong>Rule:</strong> The app matches both PDFs by canonical X/Y placement tokens for each
                      support location, such as <code>X1</code> or <code>X1-X2</code>. If 基礎伏図 shows an FC code at
                      that placement, it wins. Otherwise the app uses the certified C or P code from 認定柱脚資料 at
                      the same placement.
                    </InfoBanner>
                  </div>
                )}
              </div>
            </>
          )}
        </main>

        <ViewerSidebar
          files={viewerFiles}
          selection={viewerSelection}
          onSelectionChange={(sel) => {
            setViewerSelection(sel);
            if (!sel || !sel.rowKey) setSelectedRowKey(sel?.rowKey ?? null);
          }}
          accent={accent}
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
          width={sidebarWidth}
          onWidthChange={setSidebarWidth}
          onPageCountResolved={handlePageCountResolved}
        />
      </div>
    </div>
  );
};

interface TabButtonProps {
  active: boolean;
  accent: 'indigo' | 'amber' | 'cyan';
  onClick: () => void;
  children: React.ReactNode;
}

const TabButton: React.FC<TabButtonProps> = ({ active, accent, onClick, children }) => {
  const colorClasses: Record<typeof accent, string> = {
    indigo: 'border-indigo-500 text-indigo-600',
    amber: 'border-amber-500 text-amber-600',
    cyan: 'border-cyan-500 text-cyan-600',
  };
  return (
    <button
      onClick={onClick}
      className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
        active ? colorClasses[accent] : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
      }`}
    >
      <span className="flex items-center gap-2">{children}</span>
    </button>
  );
};

interface StatusStripProps {
  results: { status: string; error?: string }[];
  accent: 'indigo' | 'amber' | 'cyan' | 'emerald';
}

const StatusStrip: React.FC<StatusStripProps> = ({ results, accent }) => {
  if (results.length === 0) return null;
  const success = results.filter((r) => r.status === 'SUCCESS').length;
  const processing = results.filter((r) => r.status === 'PROCESSING' || r.status === 'PENDING').length;
  const errors = results.filter((r) => r.status === 'ERROR');
  const errorCount = errors.length;
  const accentText: Record<typeof accent, string> = {
    indigo: 'text-indigo-700',
    amber: 'text-amber-700',
    cyan: 'text-cyan-700',
    emerald: 'text-emerald-700',
  };
  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className={`font-medium ${accentText[accent]}`}>{results.length} files</span>
        <span className="flex items-center gap-1 text-green-600">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          {success} ok
        </span>
        {processing > 0 && (
          <span className="flex items-center gap-1 text-amber-600">
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
            {processing} processing
          </span>
        )}
        {errorCount > 0 && (
          <span className="flex items-center gap-1 text-red-600">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            {errorCount} failed
          </span>
        )}
      </div>
      {errorCount > 0 && (
        <ul className="mt-2 space-y-0.5 text-[11px] text-red-600">
          {errors.slice(0, 3).map((r, i) => (
            <li key={i} className="truncate">{r.error ?? 'Unknown error'}</li>
          ))}
          {errorCount > 3 && <li>+ {errorCount - 3} more…</li>}
        </ul>
      )}
    </div>
  );
};

interface InfoBannerProps {
  accent: 'indigo' | 'amber' | 'cyan';
  children: React.ReactNode;
}

const InfoBanner: React.FC<InfoBannerProps> = ({ accent, children }) => {
  const cls: Record<typeof accent, string> = {
    indigo: 'bg-blue-50 border-blue-100 text-blue-700',
    amber: 'bg-amber-50 border-amber-100 text-amber-700',
    cyan: 'bg-cyan-50 border-cyan-100 text-cyan-700',
  };
  return (
    <div className={`border ${cls[accent]} rounded-lg p-4 flex gap-3 text-sm`}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 flex-shrink-0 mt-0.5">
        <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z" clipRule="evenodd" />
      </svg>
      <p>{children}</p>
    </div>
  );
};

export default App;
