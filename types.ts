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
  /** Internal hoop tie lines counted in the 断面 figure; absent means none. */
  hoopSupplementaryX?: string;
  hoopSupplementaryY?: string;
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
  /** Per-direction bar counts, reconstructed from the total by deriveMainBarSplit. */
  mainReinforcementCountX?: string;
  mainReinforcementCountY?: string;
  mainReinforcementSize: string;
  hoopReinforcementSize: string;
  hoopReinforcementSpacing: string;
  /** Internal hoop tie lines per direction, counted from a cross-section figure. */
  hoopSupplementaryX?: string;
  hoopSupplementaryY?: string;
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

/** Axis-aligned rectangle in PDF display points (y grows downward, page rotation applied). */
export interface PageRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface PlanGridLine {
  name: string;
  /** X position for X lines, Y position for Y lines, in display points. */
  position: number;
}

export interface PlanFooting {
  id: string;
  label: string;
  rect: PageRect;
  fcCode?: string;
}

/** Deterministic reading of a 基礎伏図 page: named grid lines and labelled footings. */
export interface FoundationPlanGeometry {
  page: number;
  pageWidth: number;
  pageHeight: number;
  gridX: PlanGridLine[];
  gridY: PlanGridLine[];
  footings: PlanFooting[];
  unassignedLabels: string[];
  /** Footing-style outlines no F label claimed, excluding squares nested in a labelled footing. */
  unlabelledFootings: PageRect[];
}

export interface CertifiedMarker {
  id: string;
  rect: PageRect;
  fill: [number, number, number];
  /** Canonical code read from the marker label, or '' when it could not be read. */
  code: string;
}

/** Deterministic reading of a 認定柱脚資料 placement page: colour markers and grid lines. */
export interface CertifiedPlacementMap {
  page: number;
  pageWidth: number;
  pageHeight: number;
  gridCandidates: { x: number[]; y: number[] };
  /** The certified sheet's own grid labels (native or SHX text); names may differ from the plan. */
  gridLabels: { x: PlanGridLine[]; y: PlanGridLine[] };
  markers: CertifiedMarker[];
}

export interface CertifiedCoordinateData {
  xAxis: string;
  yAxis: string;
  columnType: string;
  /** When set, the merge matches on this key instead of the X/Y tokens. */
  locationKey?: string;
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
  placementMap?: CertifiedPlacementMap;
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
  /** When set, the merge matches on this key instead of the X/Y tokens. */
  locationKey?: string;
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
  geometry?: FoundationPlanGeometry;
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
  | 'mainReinforcementCountX'
  | 'mainReinforcementCountY'
  | 'mainReinforcementSize'
  | 'hoopReinforcementSize'
  | 'hoopReinforcementSpacing'
  | 'hoopSupplementaryX'
  | 'hoopSupplementaryY'
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

export interface PriorityUsageSummary {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  totalTokenCount?: number;
}

export interface PriorityCoverageDiagnostics {
  mode: 'anchored' | 'structural';
  expectedCount: number;
  returnedCount: number;
  coordinateCount: number;
  codeCount: number;
  missingLabels: string[];
  unresolvedLabels: string[];
}

export interface PriorityAnchorCounts {
  foundation: number;
  'plan-column': number;
  'certified-column': number;
  'x-axis': number;
  'y-axis': number;
}

export interface PriorityPipelineDiagnostics {
  fileName: string;
  role: 'certified' | 'plan';
  model: string;
  anchorMode: 'native' | 'unavailable';
  anchorCounts: PriorityAnchorCounts;
  coverage?: PriorityCoverageDiagnostics;
  cropCount: number;
  warning?: string;
  usage?: {
    primary?: PriorityUsageSummary;
    escalated?: PriorityUsageSummary;
  };
  stages: {
    preprocessMs?: number;
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
