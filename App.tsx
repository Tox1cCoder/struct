import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileUpload } from './components/FileUpload';
import { FoundationTextInput } from './components/FoundationTextInput';
import { ResultsTable } from './components/ResultsTable';
import { FrameImageInput } from './components/FrameImageInput';
import { FrameResultsTable } from './components/FrameResultsTable';
import { FoundationPriorityTextResult } from './components/FoundationPriorityTextResult';

const ReportTab = React.lazy(() =>
  import('./components/report/ReportTab').then((module) => ({ default: module.ReportTab })),
);
const ViewerSidebar = React.lazy(() =>
  import('./components/viewer/ViewerSidebar').then((module) => ({ default: module.ViewerSidebar })),
);
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
  EditableExpandedReinforcementData,
  EditableFrameData,
  EditableRowsState,
  ExpandedReinforcementData,
  FoundationColumnData,
  FileResult,
  FoundationPlanCoordinateFileResult,
  FoundationPriorityEvidenceLocation,
  FoundationPriorityWorkingRow,
  FrameFileResult,
  FrameData,
} from './types';
import { getErrorMessage, logError } from './utils/errorHandling';
import { mergeReinforcementWithFoundation } from './utils/mergeData';
import { buildFoundationPriorityText } from './utils/mergeFoundationPriority';
import { hasActiveJobs } from './utils/fileJobs';
import { StatusStrip } from './components/StatusStrip';
import { buildColumnWorkingRows } from './utils/columnWorkingRows';
import { addManualRow, deleteWorkingRow, reconcileExtractedRows, updateWorkingRow } from './utils/editableRows';
import { createManualFrameData } from './utils/frameData';

type TabType = 'column' | 'frame' | 'priority' | 'report';

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
  report: 'violet',
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('column');

  const [reinfResults, setReinfResults] = useState<FileResult[]>([]);

  const [foundationData, setFoundationData] = useState<FoundationColumnData[]>([]);

  const [frameResults, setFrameResults] = useState<FrameFileResult[]>([]);

  const [certifiedResults, setCertifiedResults] = useState<CertifiedCoordinateFileResult[]>([]);
  const [foundationPlanResults, setFoundationPlanResults] = useState<FoundationPlanCoordinateFileResult[]>([]);

  const isReinfProcessing = hasActiveJobs(reinfResults);
  const isFrameProcessing = hasActiveJobs(frameResults);
  const isCertifiedProcessing = hasActiveJobs(certifiedResults);
  const isFoundationPlanProcessing = hasActiveJobs(foundationPlanResults);

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

  const [columnRows, setColumnRows] = useState<EditableRowsState<EditableExpandedReinforcementData>>({
    rows: [],
    deletedSourceKeys: [],
  });
  const columnProposals = useMemo(
    () => buildColumnWorkingRows(consolidatedReinfData, foundationData),
    [consolidatedReinfData, foundationData],
  );
  useEffect(() => {
    setColumnRows((state) => reconcileExtractedRows(state, columnProposals));
  }, [columnProposals]);

  const handleColumnRowChange = useCallback(
    (rowId: string, patch: Partial<ExpandedReinforcementData>) => {
      setColumnRows((state) => updateWorkingRow(state, rowId, patch));
    },
    [],
  );
  const handleColumnDeleteRow = useCallback((rowId: string) => {
    setColumnRows((state) => deleteWorkingRow(state, rowId));
  }, []);
  const handleColumnAddRow = useCallback(() => {
    setColumnRows((state) => {
      const id = `column:manual:${Math.random().toString(36).slice(2, 9)}`;
      return addManualRow(state, {
        rowId: id,
        sourceKey: id,
        sourceFileIds: [],
        provenance: 'manual',
        edited: true,
        foundation: '',
        columnType: '',
        dimensionWidth: '',
        dimensionHeight: '',
        mainReinforcementCount: '',
        mainReinforcementSize: '',
        hoopReinforcementSize: '',
        hoopReinforcementSpacing: '',
      });
    });
  }, []);

  const consolidatedFrameData = useMemo<FrameData[]>(
    () =>
      frameResults
        .filter((r) => r.status === 'SUCCESS')
        .flatMap((r) => r.data.map((frame) => ({ ...frame, sourceFileId: r.id }))),
    [frameResults],
  );

  const frameProposals = useMemo(() => {
    return consolidatedFrameData.map((frame, index) => {
      const sourceKey = `frame:${frame.sourceFileId ?? 'unknown'}:${index}:${frame.frameName}`;
      return {
        ...frame,
        rowId: sourceKey,
        sourceKey,
        sourceFileIds: frame.sourceFileId ? [frame.sourceFileId] : [],
        provenance: 'extracted' as const,
        edited: false,
      };
    });
  }, [consolidatedFrameData]);

  const [frameRows, setFrameRows] = useState<EditableRowsState<EditableFrameData>>({
    rows: [],
    deletedSourceKeys: [],
  });
  useEffect(() => {
    setFrameRows((state) => reconcileExtractedRows(state, frameProposals));
  }, [frameProposals]);
  const frameRowsByType = useMemo(
    () => ({
      FW: frameRows.rows.filter((row) => row.frameType === 'FW'),
      FG: frameRows.rows.filter((row) => row.frameType === 'FG'),
    }),
    [frameRows.rows],
  );

  const handleFrameRowChange = useCallback((rowId: string, patch: Partial<FrameData>) => {
    setFrameRows((state) => updateWorkingRow(state, rowId, patch));
  }, []);
  const handleFrameDeleteRow = useCallback((rowId: string) => {
    setFrameRows((state) => deleteWorkingRow(state, rowId));
  }, []);
  const handleFrameAddRow = useCallback((frameType: FrameData['frameType']) => {
    setFrameRows((state) => {
      const id = `frame:manual:${Math.random().toString(36).slice(2, 9)}`;
      return addManualRow(state, {
        rowId: id,
        sourceKey: id,
        sourceFileIds: [],
        provenance: 'manual',
        edited: true,
        ...createManualFrameData(frameType),
      });
    });
  }, []);

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

  const [priorityRows, setPriorityRows] = useState<EditableRowsState<FoundationPriorityWorkingRow>>({
    rows: [],
    deletedSourceKeys: [],
  });
  useEffect(() => {
    setPriorityRows((state) => reconcileExtractedRows(state, foundationPriorityResult.rows));
  }, [foundationPriorityResult]);
  const priorityText = useMemo(
    () =>
      priorityRows.rows
        .map((row) => (row.codes.length > 0 ? `${row.foundation}: ${row.codes.join(', ')}` : `${row.foundation}:`))
        .join('\n'),
    [priorityRows.rows],
  );

  const handlePriorityRowChange = useCallback(
    (rowId: string, patch: Pick<FoundationPriorityWorkingRow, 'foundation' | 'codes'>) => {
      setPriorityRows((state) => updateWorkingRow(state, rowId, patch));
    },
    [],
  );
  const handlePriorityDeleteRow = useCallback((rowId: string) => {
    setPriorityRows((state) => deleteWorkingRow(state, rowId));
  }, []);
  const handlePriorityAddRow = useCallback(() => {
    setPriorityRows((state) => {
      const id = `priority:manual:${Math.random().toString(36).slice(2, 9)}`;
      return addManualRow(state, {
        rowId: id,
        sourceKey: id,
        sourceFileIds: [],
        provenance: 'manual',
        edited: true,
        foundation: '',
        codes: [],
        resolutions: [],
      });
    });
  }, []);

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
      logError(`Reinforcement extraction failed for ${file.name}`, err, { handled: true });
      setReinfResults((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: 'ERROR', error: getErrorMessage(err) } : r)),
      );
    }
  };

  const handleReinfFilesSelect = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
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
        setFrameResults((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status: 'SUCCESS', data } : r)),
        );
      } else {
        setFrameResults((prev) =>
          prev.map((r) =>
            r.id === id ? { ...r, status: 'ERROR', error: 'No frame data found in image' } : r,
          ),
        );
      }
    } catch (err) {
      logError(`Frame extraction failed for ${id}`, err, { handled: true });
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
        data: [],
        sourceMimeType: imageData.mimeType,
      };
      setFrameResults((prev) => [...prev, newEntry]);
      await processFrameImage(id, imageData.base64, imageData.mimeType);
    },
    [],
  );

  const handleFrameClear = useCallback(() => {
    setFrameResults([]);
    setFrameRows({ rows: [], deletedSourceKeys: [] });
    setViewerSelection(null);
    setSelectedRowKey(null);
  }, []);

  const processCertifiedFile = async (file: File, id: string) => {
    setCertifiedResults((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'PROCESSING' } : r)),
    );
    try {
      const { data, diagnostics } = await extractCertifiedCoordinateData(file);
      setCertifiedResults((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: 'SUCCESS', data, diagnostics } : r)),
      );
    } catch (err) {
      logError(`Certified coordinate extraction failed for ${file.name}`, err, { handled: true });
      setCertifiedResults((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: 'ERROR', error: getErrorMessage(err) } : r)),
      );
    }
  };

  const handleCertifiedFilesSelect = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
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
    },
    [registerSourceUrl],
  );

  const processFoundationPlanFile = async (file: File, id: string) => {
    setFoundationPlanResults((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'PROCESSING' } : r)),
    );
    try {
      const { data, diagnostics } = await extractFoundationPlanCoordinateData(file);
      setFoundationPlanResults((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: 'SUCCESS', data, diagnostics } : r)),
      );
    } catch (err) {
      logError(`Foundation plan extraction failed for ${file.name}`, err, { handled: true });
      setFoundationPlanResults((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: 'ERROR', error: getErrorMessage(err) } : r)),
      );
    }
  };

  const handleFoundationPlanFilesSelect = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
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
    },
    [registerSourceUrl],
  );

  const handleClearColumn = () => {
    revokeSourceUrls(reinfResults.map((r) => r.sourceUrl));
    setReinfResults([]);
    setFoundationData([]);
    setColumnRows({ rows: [], deletedSourceKeys: [] });
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
    setPriorityRows({ rows: [], deletedSourceKeys: [] });
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

  const handlePriorityEvidenceSelect = useCallback(
    (evidence: FoundationPriorityEvidenceLocation) => {
      const plan = evidence.plan;
      if (!plan.fileId) return;
      const alternates = [
        { fileId: plan.fileId, page: plan.page, bbox: plan.bbox, sourceRole: 'plan' as const, label: '基礎伏図' },
        ...(evidence.certified
          ? [{
              fileId: evidence.certified.fileId,
              page: evidence.certified.page,
              bbox: evidence.certified.bbox,
              sourceRole: 'certified' as const,
              label: '認定柱脚資料',
            }]
          : []),
      ];
      setSelectedRowKey(evidence.evidenceId);
      setViewerSelection({
        fileId: plan.fileId,
        page: plan.page,
        bbox: plan.bbox,
        rowKey: evidence.evidenceId,
        evidenceId: evidence.evidenceId,
        sourceRole: 'plan',
        alternates,
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
      return frameResults.map((r) => ({
        id: r.id,
        fileName: r.data[0]?.frameName ?? `Pasted image ${r.id.slice(-4)}`,
        status: r.status,
        sourceUrl: r.imagePreview,
        sourceMimeType: r.sourceMimeType ?? 'image/png',
        itemCount: r.status === 'SUCCESS' ? r.data.length : 0,
        error: r.error,
      }));
    }
    if (activeTab === 'report') return [];
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
  const hasSuccessfulCertifiedResults = certifiedResults.some((r) => r.status === 'SUCCESS');
  const hasSuccessfulFoundationPlanResults = foundationPlanResults.some((r) => r.status === 'SUCCESS');
  const shouldShowPriorityResult =
    priorityRows.rows.length > 0 ||
    (!isPriorityProcessing && hasSuccessfulCertifiedResults && hasSuccessfulFoundationPlanResults);

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
            <TabButton active={activeTab === 'report'} accent="violet" onClick={() => handleTabChange('report')}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
              Report
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

                {columnRows.rows.length > 0 && (
                  <div className="space-y-6 animate-fade-in-up">
                    <ResultsTable
                      data={columnRows.rows}
                      hasFoundationData={foundationData.length > 0}
                      selectedRowKey={selectedRowKey}
                      onRowSelect={handleRowSelect}
                      onRowChange={handleColumnRowChange}
                      onAddRow={handleColumnAddRow}
                      onDeleteRow={handleColumnDeleteRow}
                    />
                    <InfoBanner accent="indigo">
                      <strong>Note:</strong> Data extracted based on "Zone I" (Ⅰゾーン) priority.
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
                    isActiveTab={activeTab === 'frame'}
                  />
                </div>

                {frameRows.rows.length > 0 && (
                  <div className="space-y-6 animate-fade-in-up">
                    {(['FW', 'FG'] as const).map((frameType) => {
                      const rows = frameRowsByType[frameType];
                      return rows.length > 0 ? (
                        <FrameResultsTable
                          key={frameType}
                          data={rows}
                          selectedRowKey={selectedRowKey}
                          onRowSelect={handleRowSelect}
                          onRowChange={handleFrameRowChange}
                          onAddRow={() => handleFrameAddRow(frameType)}
                          onDeleteRow={handleFrameDeleteRow}
                        />
                      ) : null;
                    })}
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
                      title="Upload Certified Column Base PDFs"
                      description="Click to browse or drag & drop PDF files here"
                      iconColor="indigo"
                      zoneId="certified-foundation"
                      isActiveTab={activeTab === 'priority'}
                      accept=".pdf,application/pdf"
                      allowPaste={false}
                      fileTypesLabel="PDF only"
                    />
                    <StatusStrip
                      results={certifiedResults.map((r) => ({
                        ...r,
                        durationMs: r.diagnostics?.stages.totalMs,
                        passUsed: r.diagnostics?.passUsed,
                      }))}
                      accent="indigo"
                    />
                  </div>

                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      基礎伏図
                    </h3>
                    <FileUpload
                      onFilesSelect={handleFoundationPlanFilesSelect}
                      title="Upload Foundation Plan PDFs"
                      description="Click to browse or drag & drop PDF files here"
                      iconColor="emerald"
                      zoneId="foundation-plan-priority"
                      isActiveTab={activeTab === 'priority'}
                      accept=".pdf,application/pdf"
                      allowPaste={false}
                      fileTypesLabel="PDF only"
                    />
                    <StatusStrip
                      results={foundationPlanResults.map((r) => ({
                        ...r,
                        durationMs: r.diagnostics?.stages.totalMs,
                        passUsed: r.diagnostics?.passUsed,
                      }))}
                      accent="emerald"
                    />
                  </div>
                </div>

                {shouldShowPriorityResult && (
                  <div className="space-y-6 animate-fade-in-up">
                    <FoundationPriorityTextResult
                      text={priorityText}
                      rows={priorityRows.rows}
                      selectedRowKey={selectedRowKey}
                      onRowChange={handlePriorityRowChange}
                      onAddRow={handlePriorityAddRow}
                      onDeleteRow={handlePriorityDeleteRow}
                      onEvidenceSelect={handlePriorityEvidenceSelect}
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

          {activeTab === 'report' && (
            <Suspense fallback={<div className="p-6 text-sm text-gray-500">Loading report…</div>}>
              <ReportTab
                data={columnRows.rows}
                frameData={frameRows.rows}
                priorityData={priorityRows.rows}
              />
            </Suspense>
          )}
        </main>

        <Suspense fallback={<aside className="w-12 border-l border-gray-200 bg-white" />}>
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
        </Suspense>
      </div>
    </div>
  );
};

interface TabButtonProps {
  active: boolean;
  accent: 'indigo' | 'amber' | 'cyan' | 'violet';
  onClick: () => void;
  children: React.ReactNode;
}

const TabButton: React.FC<TabButtonProps> = ({ active, accent, onClick, children }) => {
  const colorClasses: Record<typeof accent, string> = {
    indigo: 'border-indigo-500 text-indigo-600',
    amber: 'border-amber-500 text-amber-600',
    cyan: 'border-cyan-500 text-cyan-600',
    violet: 'border-violet-500 text-violet-600',
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
