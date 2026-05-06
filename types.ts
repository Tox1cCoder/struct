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
}

export interface FrameData {
  frameName: string;
  b: string;
  h: string;
  topRebarD: string;
  topRebarValue: string;
  bottomRebarD: string;
  bottomRebarValue: string;
  stirrupD: string;
  stirrupValue: string;
  bbox?: BoundingBox;
  sourceFileId?: string;
}

export interface FrameFileResult {
  id: string;
  imagePreview: string;
  status: ProcessingStatus;
  data: FrameData | null;
  error?: string;
  sourceMimeType?: string;
}
