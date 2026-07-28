export interface BoundingBox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

export interface SourceLocation {
  page?: number;
  bbox?: BoundingBox;
}

export interface ColumnReinforcementData {
  columnType: string;
  columnDimensions: string;
  mainReinforcement: string;
  hoopReinforcement: string;
  sourceFileName?: string;
  sourceFileId?: string;
  page?: number;
  bbox?: BoundingBox;
}

export interface FoundationColumnData {
  foundation: string;
  columnType: string;
  bColumn?: string;
  hColumn?: string;
  sourceFileName?: string;
}

export interface ExpandedReinforcementData {
  foundation?: string;
  columnType: string;
  bColumn?: string;
  hColumn?: string;
  dimensionWidth: string;
  dimensionHeight: string;
  mainReinforcementCount: string;
  mainReinforcementSize: string;
  hoopReinforcementSize: string;
  hoopReinforcementSpacing: string;
  sourceFileId?: string;
  page?: number;
  bbox?: BoundingBox;
}

export type ProcessingStatus = 'IDLE' | 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'ERROR';

export interface FileResult {
  id: string;
  fileName: string;
  status: ProcessingStatus;
  data: ColumnReinforcementData[];
  error?: string;
  sourceUrl?: string;
  sourceMimeType?: string;
  pageCount?: number;
}

export interface FoundationFileResult {
  id: string;
  fileName: string;
  status: ProcessingStatus;
  data: FoundationColumnData[];
  error?: string;
}

export interface CertifiedCoordinateData {
  xAxis: string;
  yAxis: string;
  columnType: string;
  sourceFileName?: string;
  sourceFileId?: string;
  page?: number;
  bbox?: BoundingBox;
}

export interface CertifiedCoordinateFileResult {
  id: string;
  fileName: string;
  status: ProcessingStatus;
  data: CertifiedCoordinateData[];
  error?: string;
  sourceUrl?: string;
  sourceMimeType?: string;
  pageCount?: number;
  diagnostics?: PriorityPipelineDiagnostics;
}

export interface FoundationPlanCoordinateData {
  foundation: string;
  xAxis: string;
  yAxis: string;
  planColumnType: string;
  isHighlighted?: boolean;
  highlightColor?: string;
  sourceFileName?: string;
  sourceFileId?: string;
  page?: number;
  bbox?: BoundingBox;
}

export interface FoundationPlanCoordinateFileResult {
  id: string;
  fileName: string;
  status: ProcessingStatus;
  data: FoundationPlanCoordinateData[];
  error?: string;
  sourceUrl?: string;
  sourceMimeType?: string;
  pageCount?: number;
  diagnostics?: PriorityPipelineDiagnostics;
}

interface FrameBaseData {
  frameName: string;
  frameType: 'FW' | 'FG';
  b: string;
  h: string;
  bbox?: BoundingBox;
  sourceFileId?: string;
}

export interface FWFrameData extends FrameBaseData {
  frameType: 'FW';
  fwBaseRebarDiameter: string;
  fwVerticalRebarDiameter: string;
  fwHorizontalRebarCount: string;
  fwHorizontalRebarDiameter: string;
}

export interface FGFrameData extends FrameBaseData {
  frameType: 'FG';
  fgTopRebarDiameter: string;
  fgBottomRebarDiameter: string;
  fgStirrupDiameter: string;
  fgStirrupMaxDistance: string;
  fgBellyRebarDiameter: string;
  fgWidthStopRebarDiameter: string;
  fgWidthStopRebarMaxDistance: string;
}

export type FrameData = FWFrameData | FGFrameData;

export interface FrameFileResult {
  id: string;
  imagePreview: string;
  status: ProcessingStatus;
  data: FrameData[];
  error?: string;
  sourceMimeType?: string;
}

// ---- Report Template ----

/** Reinforcement fields the Build-mode report template can place in a row. */
export type SourceField =
  | 'columnType'
  | 'dimensionWidth'
  | 'dimensionHeight'
  | 'mainReinforcementCount'
  | 'mainReinforcementSize'
  | 'hoopReinforcementSize'
  | 'hoopReinforcementSpacing'
  | 'bColumn'
  | 'hColumn';

export type MultiValueStrategy = 'first' | 'most-common' | 'largest' | 'all';

// ---- Type-table sheets (FoundationType / FoundationInstance / FramingType) ----

/**
 * One column of a type sheet.
 *
 * `key` identifies the column so a re-export updates it instead of appending a
 * duplicate. `values` is field name → cell value; a string[] means several
 * source rows disagreed and the configured MultiValueStrategy picks the winner.
 */
export interface TypeSheetEntity {
  key: string;
  values: Record<string, string | string[]>;
}

export interface TypeSheetRowMapping {
  rowIndex: number;      // 1-indexed row in the Excel sheet
  label: string;         // text found in the label column for this row
  sourceField: string | null;
}

export interface TypeSheetConfig {
  sheetIndex: number;
  identityRow: number;      // 1-indexed row whose values identify each column
  labelColumn: string;      // column letter (e.g. "C") containing parameter names
  firstDataColumn: string;  // column letter (e.g. "D") of the first per-entity column
  rowMappings: TypeSheetRowMapping[];
  /**
   * Optional caption row written without a label guard, for rows that carry no
   * parameter name of their own (FoundationType's title row shows which column
   * types feed each foundation).
   */
  summary?: { rowIndex: number; sourceField: string };
}

export type GroupColor = 'blue' | 'green' | 'yellow' | 'orange' | 'purple' | 'pink' | 'teal' | 'indigo';

export interface TemplateParam {
  id: string;
  label: string;
  sourceField: SourceField;
}

export interface TemplateGroup {
  id: string;
  name: string;
  color: GroupColor;
  params: TemplateParam[];
}

export interface ReportTemplate {
  name: string;
  groups: TemplateGroup[];
  multiValueStrategy: MultiValueStrategy;
}

// ---- Editable working rows ----

export interface EditableRowMeta {
  rowId: string;
  sourceKey: string;
  sourceFileIds: string[];
  provenance: 'extracted' | 'manual';
  edited: boolean;
}

export interface EditableRowsState<T extends EditableRowMeta> {
  rows: T[];
  deletedSourceKeys: string[];
}

export type EditableExpandedReinforcementData = ExpandedReinforcementData & EditableRowMeta;
export type EditableFrameData = FrameData & EditableRowMeta;

// ---- Foundation Priority evidence ----

export type PrioritySourceRole = 'plan' | 'certified';

export interface SourceEvidence extends SourceLocation {
  fileId: string;
  role: PrioritySourceRole;
  xAxis: string;
  yAxis: string;
}

export interface FoundationPriorityEvidenceLocation {
  evidenceId: string;
  plan: SourceEvidence;
  certified?: SourceEvidence;
}

export interface FoundationPriorityResolution {
  columnType: string;
  method: 'plan-fc' | 'certified-fallback' | 'plan-alias-fallback';
  locations: FoundationPriorityEvidenceLocation[];
}

export interface FoundationPriorityWorkingRow extends EditableRowMeta {
  foundation: string;
  codes: string[];
  resolutions: FoundationPriorityResolution[];
}

export interface PriorityPipelineDiagnostics {
  fileName: string;
  role: 'certified' | 'plan';
  stages: {
    uploadMs?: number;
    primaryGenerationMs?: number;
    primaryValidationMs?: number;
    fallbackGenerationMs?: number;
    fallbackValidationMs?: number;
    totalMs?: number;
  };
  passUsed: 'primary' | 'escalated';
  escalationReason?: string;
}
