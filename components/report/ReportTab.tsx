import React, { useCallback, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import type {
  ExpandedReinforcementData,
  GroupColor,
  ReportTemplate,
  RowMapping,
  SourceField,
  TemplateMappingConfig,
} from '../../types';
import { autoDetectConfig, fillTemplate, parseSheetPreview } from '../../utils/templateFiller';
import { generateReport, type ReportData, type ReportRow } from '../../utils/reportGenerator';
import { loadMappingConfig, loadTemplate, saveMappingConfig, saveTemplate } from '../../utils/templateStorage';
import { buildDefaultTemplate } from './defaultTemplate';
import { TemplateEditor } from './TemplateEditor';

type ReportMode = 'upload' | 'build';

const SOURCE_FIELD_LABELS: Record<SourceField, string> = {
  columnType: 'Column Type (柱符号)',
  dimensionWidth: '柱型_Lx',
  dimensionHeight: '柱型_Ly',
  mainReinforcementCount: '柱型_主筋_本数',
  mainReinforcementSize: '柱型_主筋_直径',
  hoopReinforcementSize: '柱型_Hoop_直径',
  hoopReinforcementSpacing: '柱型_Hoop_距離_最大',
  bColumn: '柱_Lx',
  hColumn: '柱_Ly',
};

const SOURCE_FIELD_OPTIONS = (Object.entries(SOURCE_FIELD_LABELS) as [SourceField, string][]).map(
  ([value, label]) => ({ value, label }),
);

const GROUP_COLOR_CLASSES: Record<GroupColor, { header: string; dot: string }> = {
  blue: { header: 'bg-blue-50 text-blue-800', dot: 'bg-blue-400' },
  green: { header: 'bg-green-50 text-green-800', dot: 'bg-green-400' },
  yellow: { header: 'bg-yellow-50 text-yellow-800', dot: 'bg-yellow-400' },
  orange: { header: 'bg-orange-50 text-orange-800', dot: 'bg-orange-400' },
  purple: { header: 'bg-purple-50 text-purple-800', dot: 'bg-purple-400' },
  pink: { header: 'bg-pink-50 text-pink-800', dot: 'bg-pink-400' },
  teal: { header: 'bg-teal-50 text-teal-800', dot: 'bg-teal-400' },
  indigo: { header: 'bg-indigo-50 text-indigo-800', dot: 'bg-indigo-400' },
};

interface Props {
  data: ExpandedReinforcementData[];
}

export const ReportTab: React.FC<Props> = ({ data }) => {
  const [mode, setMode] = useState<ReportMode>('upload');

  // Upload mode state
  const [wb, setWb] = useState<XLSX.WorkBook | null>(null);
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
  const [fileName, setFileName] = useState('');
  const [config, setConfig] = useState<TemplateMappingConfig | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Build mode state
  const [template, setTemplate] = useState<ReportTemplate>(() => loadTemplate() ?? buildDefaultTemplate());
  const [showEditor, setShowEditor] = useState(false);
  const [buildExporting, setBuildExporting] = useState(false);

  const foundations = useMemo(
    () => [...new Set(data.filter((r) => r.foundation).map((r) => r.foundation!))],
    [data],
  );

  // ---- Upload mode handlers ----

  const ACCEPTED_EXTS = /\.(xlsx|xlsm|xlsb|xls|ods)$/i;

  const loadFile = (file: File) => {
    if (!ACCEPTED_EXTS.test(file.name)) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const bytes = new Uint8Array(e.target!.result as ArrayBuffer);
        const workbook = XLSX.read(bytes, { type: 'array', cellStyles: true, bookVBA: true });
        setWb(workbook);
        setFileBytes(bytes);
        setFileName(file.name);
        // Restore saved config for THIS specific file, or auto-detect from scratch.
        // Never reuse mappings from a different file — stale row indices corrupt the template.
        const savedForFile = loadMappingConfig(file.name);
        const nextConfig = savedForFile ?? autoDetectConfig(workbook, 0, foundations);
        setConfig(nextConfig);
        saveMappingConfig(nextConfig, file.name);
      } catch {
        // ignore parse errors
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
    e.target.value = '';
  };

  const handleConfigChange = useCallback((next: TemplateMappingConfig) => {
    setConfig(next);
    saveMappingConfig(next, fileName);
  }, [fileName]);

  const handleRedetect = () => {
    if (!wb) return;
    const detected = autoDetectConfig(wb, config?.sheetIndex ?? 0, foundations);
    handleConfigChange(detected);
  };

  const handleExportFilled = () => {
    if (!fileBytes || !config) return;
    setExporting(true);
    try {
      // Fill via ZIP + XML patching — styles.xml and all other files are passed through unchanged
      const resultBytes = fillTemplate(fileBytes, data, config);
      const ext = fileName.split('.').pop() ?? 'xlsx';
      const baseName = fileName.replace(/\.[^.]+$/, '');
      const blob = new Blob([resultBytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}_filled.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  // ---- Build mode ----
  const buildReportData = useMemo<ReportData | null>(() => {
    if (mode !== 'build' || data.length === 0 || !data.some((r) => r.foundation)) return null;
    return generateReport(data, template);
  }, [mode, data, template]);

  const handleBuildExport = () => {
    if (!buildReportData) return;
    setBuildExporting(true);
    try {
      exportBuildReport(buildReportData, template.name);
    } finally {
      setBuildExporting(false);
    }
  };

  // ---- Derived: upload mode preview ----
  const uploadPreviewData = useMemo<ReportData | null>(() => {
    if (!config || data.length === 0 || !data.some((r) => r.foundation)) return null;
    const mapped = config.rowMappings.filter((r) => r.sourceField);
    if (mapped.length === 0) return null;
    const previewTemplate: ReportTemplate = {
      name: 'preview',
      multiValueStrategy: config.multiValueStrategy,
      groups: [
        {
          id: 'mapped',
          name: 'Mapped Parameters',
          color: 'blue',
          params: mapped.map((r) => ({
            id: String(r.rowIndex),
            label: r.label,
            sourceField: r.sourceField!,
          })),
        },
      ],
    };
    return generateReport(data, previewTemplate);
  }, [config, data]);

  // ---- Empty state ----
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-violet-50 flex items-center justify-center mb-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-8 h-8 text-violet-400"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-800 mb-2">No Data Available</h3>
        <p className="text-sm text-gray-500 max-w-sm">
          Extract column reinforcement data and add foundation-column mappings in the{' '}
          <strong>Column Reinforcement</strong> tab first.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Mode toggle */}
      <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 gap-1">
        <ModeButton active={mode === 'upload'} onClick={() => setMode('upload')}>
          Upload Template
        </ModeButton>
        <ModeButton active={mode === 'build'} onClick={() => setMode('build')}>
          Build Template
        </ModeButton>
      </div>

      {/* ---- UPLOAD MODE ---- */}
      {mode === 'upload' && (
        <div className="space-y-5">
          {/* Upload zone */}
          {!wb ? (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
                isDragging
                  ? 'border-violet-400 bg-violet-50'
                  : 'border-gray-200 hover:border-violet-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-violet-50 flex items-center justify-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-6 h-6 text-violet-500"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    Drop your Excel report template here
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    The system will auto-detect foundation columns and fill in the extracted data
                  </p>
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 text-sm font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100 transition-colors"
                >
                  Browse file
                </button>
                <p className="text-xs text-gray-400">.xlsx · .xlsm · .xlsb · .xls · .ods</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xlsm,.xlsb,.xls,.ods"
                onChange={handleFileInput}
                className="hidden"
              />
            </div>
          ) : (
            /* File loaded — show config panel */
            <div className="space-y-5">
              {/* File info bar */}
              <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="w-4 h-4 text-green-600"
                    >
                      <path
                        fillRule="evenodd"
                        d="M3 3.5A1.5 1.5 0 0 1 4.5 2h6.879a1.5 1.5 0 0 1 1.06.44l4.122 4.12A1.5 1.5 0 0 1 17 7.622V16.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 16.5v-13Zm10.857 5.691-4.204 4.204a.75.75 0 0 1-1.06 0l-1.75-1.75a.75.75 0 1 1 1.06-1.06l1.22 1.22 3.673-3.674a.75.75 0 0 1 1.061 1.06Z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{fileName}</p>
                    <p className="text-xs text-gray-500">
                      {wb.SheetNames.length} sheet{wb.SheetNames.length !== 1 ? 's' : ''} •{' '}
                      {config?.rowMappings.filter((r) => r.sourceField).length ?? 0} parameters mapped
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setWb(null); setFileBytes(null); setFileName(''); setConfig(null); }}
                    className="text-xs text-gray-500 hover:text-red-600 transition-colors"
                  >
                    Remove
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-violet-600 hover:text-violet-800 transition-colors font-medium"
                  >
                    Replace
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xlsm,.xlsb,.xls,.ods"
                    onChange={handleFileInput}
                    className="hidden"
                  />
                </div>
              </div>

              {config && (
                <MappingConfigPanel
                  config={config}
                  workbook={wb}
                  foundations={foundations}
                  onChange={handleConfigChange}
                  onRedetect={handleRedetect}
                />
              )}

              {/* Preview */}
              {uploadPreviewData && uploadPreviewData.foundations.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-700">
                      Preview — values to be filled
                    </h3>
                    <button
                      onClick={handleExportFilled}
                      disabled={exporting}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-violet-600 text-white rounded-md hover:bg-violet-700 transition-all disabled:opacity-50"
                    >
                      {exporting ? (
                        <>
                          <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Generating...
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                            <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
                            <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
                          </svg>
                          Export Filled Template
                        </>
                      )}
                    </button>
                  </div>
                  <ReportGrid data={uploadPreviewData} />
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3 text-sm text-amber-700">
                  {data.some((r) => r.foundation)
                    ? 'No rows mapped yet — assign source fields in the mapping table below to see a preview.'
                    : 'Add foundation-column mappings in the Column Reinforcement tab to enable filling.'}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---- BUILD MODE ---- */}
      {mode === 'build' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-gray-800">Report Builder</h2>
              {buildReportData && (
                <span className="text-xs font-medium px-2.5 py-0.5 rounded bg-violet-100 text-violet-800">
                  {buildReportData.foundations.length} Foundations
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowEditor((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-all ${
                  showEditor
                    ? 'bg-violet-50 border-violet-300 text-violet-700'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M10 3.75a2 2 0 1 0-4 0 2 2 0 0 0 4 0ZM17.25 4.5a.75.75 0 0 0 0-1.5h-5.5a.75.75 0 0 0 0 1.5h5.5ZM5 3.75a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 5 3.75ZM4.25 17a.75.75 0 0 0 0-1.5h-1.5a.75.75 0 0 0 0 1.5h1.5ZM17.25 17a.75.75 0 0 0 0-1.5h-5.5a.75.75 0 0 0 0 1.5h5.5ZM9 10a.75.75 0 0 1-.75.75h-5.5a.75.75 0 0 1 0-1.5h5.5A.75.75 0 0 1 9 10ZM17.25 10.75a.75.75 0 0 0 0-1.5h-1.5a.75.75 0 0 0 0 1.5h1.5ZM14 10a2 2 0 1 0-4 0 2 2 0 0 0 4 0ZM10 16.25a2 2 0 1 0-4 0 2 2 0 0 0 4 0Z" />
                </svg>
                {showEditor ? 'Hide Editor' : 'Edit Template'}
              </button>
              {buildReportData && (
                <button
                  onClick={handleBuildExport}
                  disabled={buildExporting}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-all disabled:opacity-50"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-green-600">
                    <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
                    <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
                  </svg>
                  Export Excel
                </button>
              )}
            </div>
          </div>

          {showEditor && (
            <TemplateEditor
              template={template}
              onChange={(t) => { setTemplate(t); saveTemplate(t); }}
            />
          )}

          {buildReportData ? (
            <ReportGrid data={buildReportData} />
          ) : (
            <div className="text-center py-16 text-sm text-gray-500">
              Add foundation-column mappings in the <strong>Column Reinforcement</strong> tab to generate a report.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ---- Mapping Config Panel ----

interface MappingConfigPanelProps {
  config: TemplateMappingConfig;
  workbook: XLSX.WorkBook;
  foundations: string[];
  onChange: (config: TemplateMappingConfig) => void;
  onRedetect: () => void;
}

const MappingConfigPanel: React.FC<MappingConfigPanelProps> = ({
  config,
  workbook,
  foundations,
  onChange,
  onRedetect,
}) => {
  const sheetPreview = useMemo(
    () => parseSheetPreview(workbook, config.sheetIndex),
    [workbook, config.sheetIndex],
  );

  // Which foundations are matched in the template's header row
  const matchedFoundations = useMemo(() => {
    const headerRowData = sheetPreview[config.headerRow - 1] ?? [];
    return foundations.filter((f) => headerRowData.some((cell) => cell?.trim() === f));
  }, [sheetPreview, config.headerRow, foundations]);

  const unmatchedFoundations = foundations.filter((f) => !matchedFoundations.includes(f));

  const update = (patch: Partial<TemplateMappingConfig>) => onChange({ ...config, ...patch });

  const updateRowMapping = (rowIndex: number, sourceField: SourceField | null) => {
    update({
      rowMappings: config.rowMappings.map((r) =>
        r.rowIndex === rowIndex ? { ...r, sourceField } : r,
      ),
    });
  };

  const addRowMapping = () => {
    const newMapping: RowMapping = { rowIndex: 0, label: '', sourceField: null };
    update({ rowMappings: [...config.rowMappings, newMapping] });
  };

  const removeRowMapping = (rowIndex: number) => {
    update({ rowMappings: config.rowMappings.filter((r) => r.rowIndex !== rowIndex) });
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
      {/* Layout settings */}
      <div className="px-5 py-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">Mapping Configuration</h3>
          <button
            onClick={onRedetect}
            className="text-xs text-violet-600 hover:text-violet-800 font-medium transition-colors flex items-center gap-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.43l.31.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm1.23-3.723a.75.75 0 0 0 .219-.53V2.929a.75.75 0 0 0-1.5 0V5.36l-.31-.31A7 7 0 0 0 3.239 8.188a.75.75 0 1 0 1.448.389A5.5 5.5 0 0 1 13.89 6.11l.311.31h-2.432a.75.75 0 0 0 0 1.5h4.243a.75.75 0 0 0 .53-.219Z" clipRule="evenodd" />
            </svg>
            Re-detect
          </button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {workbook.SheetNames.length > 1 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Sheet</label>
              <select
                value={config.sheetIndex}
                onChange={(e) => update({ sheetIndex: Number(e.target.value) })}
                className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-400"
              >
                {workbook.SheetNames.map((name, i) => (
                  <option key={i} value={i}>{name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Foundation header row
            </label>
            <input
              type="number"
              min={1}
              value={config.headerRow}
              onChange={(e) => update({ headerRow: Math.max(1, Number(e.target.value)) })}
              className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Parameter label column
            </label>
            <input
              type="text"
              maxLength={3}
              value={config.labelColumn}
              onChange={(e) => update({ labelColumn: e.target.value.toUpperCase() })}
              placeholder="e.g. B"
              className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Multi-value strategy
            </label>
            <select
              value={config.multiValueStrategy}
              onChange={(e) =>
                update({ multiValueStrategy: e.target.value as TemplateMappingConfig['multiValueStrategy'] })
              }
              className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-400"
            >
              <option value="first">First occurrence</option>
              <option value="most-common">Most common</option>
              <option value="largest">Largest (numeric)</option>
              <option value="all">Show all (concatenate)</option>
            </select>
          </div>
        </div>

        {/* Foundation match status */}
        <div className="flex flex-wrap gap-2">
          {matchedFoundations.map((f) => (
            <span key={f} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-xs font-medium border border-green-100">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              {f}
            </span>
          ))}
          {unmatchedFoundations.map((f) => (
            <span key={f} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 text-xs border border-gray-200">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
              {f} (not in template)
            </span>
          ))}
        </div>
        {matchedFoundations.length === 0 && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded px-3 py-2">
            No foundation IDs found in row {config.headerRow}. Adjust the header row number or check that the template column headers match your foundation names (e.g. F1, F2A).
          </p>
        )}
      </div>

      {/* Row mappings table */}
      <div className="px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
            Row Mappings
          </h4>
          <button
            onClick={addRowMapping}
            className="text-xs text-violet-600 hover:text-violet-800 flex items-center gap-1 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
            </svg>
            Add row
          </button>
        </div>
        <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
          {config.rowMappings.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-4">
              No rows detected. Adjust the header row / label column settings above.
            </p>
          )}
          {config.rowMappings.map((rm) => (
            <div key={rm.rowIndex} className="flex items-center gap-2 py-1 group">
              <span className="w-10 text-center text-xs font-mono text-gray-400 flex-shrink-0">
                {rm.rowIndex > 0 ? rm.rowIndex : '—'}
              </span>
              <span className="flex-1 text-xs text-gray-700 truncate min-w-0">{rm.label || '(blank)'}</span>
              <select
                value={rm.sourceField ?? ''}
                onChange={(e) =>
                  updateRowMapping(rm.rowIndex, (e.target.value as SourceField) || null)
                }
                className={`w-52 text-xs border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-violet-400 ${
                  rm.sourceField ? 'border-green-200 bg-green-50 text-green-800' : 'border-gray-200'
                }`}
              >
                <option value="">— skip —</option>
                {SOURCE_FIELD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => removeRowMapping(rm.rowIndex)}
                className="p-0.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ---- Shared Report Grid ----

const ReportGrid: React.FC<{ data: ReportData }> = ({ data }) => {
  const { foundations, rows } = data;

  const groupSpans = useMemo(() => {
    const spans = new Map<string, number>();
    for (const row of rows) spans.set(row.groupId, (spans.get(row.groupId) ?? 0) + 1);
    return spans;
  }, [rows]);

  const seenGroups = new Set<string>();

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-gray-100 text-gray-600 uppercase tracking-wider">
              <th className="px-3 py-2.5 font-semibold border-b border-r border-gray-200 whitespace-nowrap">
                Param Group
              </th>
              <th className="px-3 py-2.5 font-semibold border-b border-r border-gray-200 whitespace-nowrap">
                Parameter
              </th>
              {foundations.map((f) => (
                <th key={f} className="px-3 py-2.5 font-semibold border-b border-gray-200 text-center whitespace-nowrap">
                  {f}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row: ReportRow) => {
              const isFirst = !seenGroups.has(row.groupId);
              if (isFirst) seenGroups.add(row.groupId);
              const span = groupSpans.get(row.groupId) ?? 1;
              const colors = GROUP_COLOR_CLASSES[row.groupColor as GroupColor] ?? GROUP_COLOR_CLASSES.blue;

              return (
                <tr key={row.paramId} className="hover:bg-gray-50 transition-colors">
                  {isFirst && (
                    <td
                      rowSpan={span}
                      className={`px-3 py-2.5 font-semibold text-xs border-r border-gray-200 align-middle ${colors.header}`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${colors.dot}`} />
                        {row.groupName}
                      </div>
                    </td>
                  )}
                  <td className="px-3 py-2.5 font-medium text-gray-700 border-r border-gray-100 whitespace-nowrap">
                    {row.paramLabel}
                  </td>
                  {row.cells.map((cell, ci) => (
                    <td
                      key={ci}
                      className={`px-3 py-2.5 font-mono text-center ${
                        cell.hasConflict ? 'bg-amber-50 text-amber-700' : 'text-gray-800'
                      }`}
                      title={cell.hasConflict ? `Multiple values: ${cell.allValues.join(', ')}` : undefined}
                    >
                      {cell.value || '-'}
                      {cell.hasConflict && <span className="ml-1 text-amber-400 text-[10px]">⚠</span>}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-gray-100 bg-gray-50 px-4 py-2 text-[11px] text-gray-500 flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-sm bg-amber-100 border border-amber-300" />
        Amber cells indicate multiple conflicting values — hover to see all.
      </div>
    </div>
  );
};

// ---- Mode toggle button ----

const ModeButton: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
      active ? 'bg-violet-50 text-violet-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
    }`}
  >
    {children}
  </button>
);

// ---- Build mode Excel export ----

function exportBuildReport(data: ReportData, templateName: string) {
  const { foundations, rows } = data;
  const header = ['Param Group', 'Parameter', ...foundations];
  const wsData: string[][] = [header];
  const merges: XLSX.Range[] = [];
  let groupStart = 1;
  let currentGroupId = '';

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    wsData.push([row.groupName, row.paramLabel, ...row.cells.map((c) => c.value)]);
    if (row.groupId !== currentGroupId) {
      if (currentGroupId !== '' && i - groupStart > 0) {
        merges.push({ s: { r: groupStart, c: 0 }, e: { r: i, c: 0 } });
      }
      currentGroupId = row.groupId;
      groupStart = i + 1;
    }
  }
  if (rows.length > 0 && rows.length - groupStart > 0) {
    merges.push({ s: { r: groupStart, c: 0 }, e: { r: rows.length, c: 0 } });
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  if (merges.length > 0) ws['!merges'] = merges;
  ws['!cols'] = [{ wch: 26 }, { wch: 22 }, ...foundations.map(() => ({ wch: 10 }))];
  XLSX.utils.book_append_sheet(wb, ws, 'Foundation Types');
  XLSX.writeFile(wb, `${templateName.replace(/[^\w\s-]/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
