import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import type {
  ExpandedReinforcementData,
  FoundationPriorityWorkingRow,
  FrameData,
  GroupColor,
  MultiValueStrategy,
  ReportTemplate,
  TypeSheetConfig,
  TypeSheetEntity,
} from '../../types';
import {
  autoDetectTypeSheetConfig,
  fillTypeSheet,
  findSpecSheetIndex,
  resolveMultiValue,
  type TypeSheetSpec,
} from '../../utils/typeSheetFiller';
import {
  FOUNDATION_INSTANCE_SHEET,
  FOUNDATION_TYPE_SHEET,
  FRAMING_TYPE_SHEET,
  buildFoundationInstanceEntities,
  buildFoundationTypeEntities,
  buildFramingTypeEntities,
} from '../../utils/templateSheets';
import { generateReport, type ReportData, type ReportRow } from '../../utils/reportGenerator';
import { loadTemplate, saveTemplate } from '../../utils/templateStorage';
import { buildDefaultTemplate } from './defaultTemplate';
import { TemplateEditor } from './TemplateEditor';

type ReportMode = 'upload' | 'build';

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

/** One template sheet the upload flow can fill, plus its detected layout. */
interface SheetPlan {
  spec: TypeSheetSpec;
  sheetName: string;
  config: TypeSheetConfig;
  entities: TypeSheetEntity[];
  enabled: boolean;
}

interface Props {
  data: ExpandedReinforcementData[];
  frameData?: FrameData[];
  priorityData?: FoundationPriorityWorkingRow[];
}

export const ReportTab: React.FC<Props> = ({ data, frameData = [], priorityData = [] }) => {
  const [mode, setMode] = useState<ReportMode>('upload');

  // Upload mode state
  const [wb, setWb] = useState<XLSX.WorkBook | null>(null);
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
  const [fileName, setFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<MultiValueStrategy>('first');
  const [disabledSheets, setDisabledSheets] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Build mode state
  const [template, setTemplate] = useState<ReportTemplate>(() => loadTemplate() ?? buildDefaultTemplate());
  const [showEditor, setShowEditor] = useState(false);
  const [buildExporting, setBuildExporting] = useState(false);

  // Each tab's results become the entities for one template sheet.
  const entitiesBySpec = useMemo(
    () =>
      new Map<TypeSheetSpec, TypeSheetEntity[]>([
        [FOUNDATION_TYPE_SHEET, buildFoundationTypeEntities(data)],
        [FOUNDATION_INSTANCE_SHEET, buildFoundationInstanceEntities(priorityData)],
        [FRAMING_TYPE_SHEET, buildFramingTypeEntities(frameData)],
      ]),
    [data, priorityData, frameData],
  );

  /**
   * Detect the layout of every sheet the workbook actually contains.
   * A sheet with no entities still appears, so the user can see it was found
   * but has no data to contribute yet.
   */
  const sheetPlans = useMemo<SheetPlan[]>(() => {
    if (!wb) return [];
    const plans: SheetPlan[] = [];
    for (const [spec, entities] of entitiesBySpec) {
      const sheetIndex = findSpecSheetIndex(wb, spec);
      if (sheetIndex < 0) continue;
      const config = autoDetectTypeSheetConfig(wb, sheetIndex, spec);
      if (!config) continue;
      plans.push({
        spec,
        sheetName: wb.SheetNames[sheetIndex],
        config,
        entities,
        enabled: !disabledSheets[spec.title],
      });
    }
    return plans;
  }, [wb, entitiesBySpec, disabledSheets]);

  const fillablePlans = useMemo(
    () => sheetPlans.filter((p) => p.enabled && p.entities.length > 0),
    [sheetPlans],
  );

  const totalDataRows = data.length + frameData.length + priorityData.length;

  // ---- Upload mode handlers ----

  const ACCEPTED_EXTS = /\.(xlsx|xlsm|xlsb|xls|ods)$/i;

  const loadFile = (file: File) => {
    if (!ACCEPTED_EXTS.test(file.name)) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const bytes = new Uint8Array(e.target!.result as ArrayBuffer);
        setWb(XLSX.read(bytes, { type: 'array', cellStyles: true, bookVBA: true }));
        setFileBytes(bytes);
        setFileName(file.name);
        setExportError(null);
      } catch {
        setExportError('Could not read that workbook. Only .xlsx/.xlsm templates are supported.');
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

  /**
   * Patch every sheet that has data into a single workbook, one after another,
   * so the download is one file carrying all of the extracted results.
   */
  const handleExportFilled = () => {
    if (!fileBytes || fillablePlans.length === 0) return;
    setExporting(true);
    setExportError(null);
    try {
      let resultBytes = fileBytes;
      for (const plan of fillablePlans) {
        resultBytes = fillTypeSheet(resultBytes, plan.entities, plan.config, strategy);
      }
      const ext = fileName.split('.').pop() ?? 'xlsx';
      const baseName = fileName.replace(/\.[^.]+$/, '');
      const blob = new Blob([resultBytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}_filled.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Template export failed:', err);
      setExportError(
        err instanceof Error
          ? `Export failed: ${err.message}`
          : 'Export failed. The template may be an unsupported format (only .xlsx/.xlsm are supported).',
      );
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
    setExportError(null);
    try {
      exportBuildReport(buildReportData, template.name);
    } catch (err) {
      console.error('Build export failed:', err);
      setExportError(err instanceof Error ? `Export failed: ${err.message}` : 'Export failed.');
    } finally {
      setBuildExporting(false);
    }
  };

  // ---- Empty state ----
  if (totalDataRows === 0) {
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
          Extract results in the <strong>Column Reinforcement</strong>,{' '}
          <strong>Frame (FW/FG)</strong> or <strong>Foundation Priority</strong> tab first.
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
                    Foundation Type, Foundation Instance and Framing Type are detected and filled
                    into one file
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
                aria-label="Upload template file"
                accept=".xlsx,.xlsm,.xlsb,.xls,.ods"
                onChange={handleFileInput}
                className="hidden"
              />
            </div>
          ) : (
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
                      {fillablePlans.length} of {sheetPlans.length} detected sheet
                      {sheetPlans.length !== 1 ? 's' : ''} will be filled
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-gray-600">
                    Conflicts
                    <select
                      value={strategy}
                      onChange={(e) => setStrategy(e.target.value as MultiValueStrategy)}
                      aria-label="Multi-value strategy"
                      className="text-xs border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-violet-400"
                    >
                      <option value="first">First</option>
                      <option value="most-common">Most common</option>
                      <option value="largest">Largest</option>
                      <option value="all">Show all</option>
                    </select>
                  </label>
                  <button
                    onClick={() => { setWb(null); setFileBytes(null); setFileName(''); }}
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
                    aria-label="Replace template file"
                    accept=".xlsx,.xlsm,.xlsb,.xls,.ods"
                    onChange={handleFileInput}
                    className="hidden"
                  />
                </div>
              </div>

              {sheetPlans.length === 0 ? (
                <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3 text-sm text-amber-700">
                  No Foundation Type / Foundation Instance / Framing Type sheet was recognised in
                  this workbook. Check that it is the Tnf design template.
                </div>
              ) : (
                <>
                  {/* Export */}
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-700">
                      Preview — values to be filled
                    </h3>
                    <button
                      onClick={handleExportFilled}
                      disabled={exporting || fillablePlans.length === 0}
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

                  {exportError && (
                    <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                      {exportError}
                    </p>
                  )}

                  {sheetPlans.map((plan) => (
                    <SheetPlanCard
                      key={plan.spec.title}
                      plan={plan}
                      strategy={strategy}
                      onToggleEnabled={(enabled) =>
                        setDisabledSheets((prev) => ({ ...prev, [plan.spec.title]: !enabled }))
                      }
                    />
                  ))}
                </>
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
            {exportError && mode === 'build' && (
              <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {exportError}
              </p>
            )}
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

// ---- One card per detected template sheet ----

interface SheetPlanCardProps {
  plan: SheetPlan;
  strategy: MultiValueStrategy;
  onToggleEnabled: (enabled: boolean) => void;
}

const SheetPlanCard: React.FC<SheetPlanCardProps> = ({ plan, strategy, onToggleEnabled }) => {
  const { spec, sheetName, config, entities, enabled } = plan;
  const mapped = config.rowMappings.filter((r) => r.sourceField);
  const unmapped = config.rowMappings.filter((r) => !r.sourceField);
  const hasData = entities.length > 0;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-3 flex-wrap">
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            disabled={!hasData}
            onChange={(e) => onToggleEnabled(e.target.checked)}
            aria-label={`Fill ${spec.title}`}
            className="rounded border-gray-300 text-violet-600 focus:ring-violet-400 disabled:opacity-40"
          />
          {spec.title}
          <span className="font-mono text-xs font-normal text-gray-500">({sheetName})</span>
        </label>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            hasData ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {hasData ? `${entities.length} column${entities.length !== 1 ? 's' : ''}` : 'no data yet'}
        </span>
      </div>

      {!hasData ? (
        <p className="px-5 py-4 text-sm text-gray-500">
          Sheet found, but nothing has been extracted for it yet — it will be left untouched.
        </p>
      ) : !enabled ? (
        <p className="px-5 py-4 text-sm text-gray-500">
          Skipped — this sheet will be left exactly as it is in the template.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-gray-100 text-gray-600 uppercase tracking-wider">
                  <th className="px-3 py-2.5 font-semibold border-b border-r border-gray-200 whitespace-nowrap">
                    Parameter
                  </th>
                  {entities.map((entity) => (
                    <th
                      key={entity.key}
                      className="px-3 py-2.5 font-semibold border-b border-gray-200 text-center whitespace-nowrap"
                    >
                      {entity.key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {config.rowMappings.map((row) => (
                  <tr key={row.rowIndex} className="hover:bg-gray-50 transition-colors">
                    <td
                      className={`px-3 py-2.5 font-medium border-r border-gray-100 whitespace-nowrap ${
                        row.sourceField ? 'text-gray-700' : 'text-gray-400 italic'
                      }`}
                    >
                      {row.label}
                    </td>
                    {entities.map((entity) => {
                      const raw = row.sourceField ? entity.values[row.sourceField] : '';
                      const value = Array.isArray(raw) ? resolveMultiValue(raw, strategy) : (raw ?? '');
                      const conflict =
                        Array.isArray(raw) && new Set(raw.filter(Boolean)).size > 1;
                      return (
                        <td
                          key={entity.key}
                          className={`px-3 py-2.5 font-mono text-center ${
                            conflict ? 'bg-amber-50 text-amber-700' : 'text-gray-800'
                          }`}
                          title={conflict ? `Multiple values: ${[...new Set(raw as string[])].join(', ')}` : undefined}
                        >
                          {value || '-'}
                          {conflict && <span className="ml-1 text-amber-400 text-[10px]">⚠</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-gray-100 bg-gray-50 px-4 py-2 text-[11px] text-gray-500">
            {mapped.length} of {config.rowMappings.length} parameters mapped · identity row{' '}
            {config.identityRow} · labels in column {config.labelColumn} · data from column{' '}
            {config.firstDataColumn}
            {unmapped.length > 0 && ` · left blank: ${unmapped.map((r) => r.label).join(', ')}`}
          </div>
        </>
      )}
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
