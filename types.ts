export interface ColumnReinforcementData {
  columnType: string;
  columnDimensions: string;
  mainReinforcement: string;
  hoopReinforcement: string;
  sourceFileName?: string;
}

// Foundation-Column mapping data
export interface FoundationColumnData {
  foundation: string;
  columnType: string;
  sourceFileName?: string;
}

// Expanded data type with split columns for Excel export (includes optional foundation)
export interface ExpandedReinforcementData {
  foundation?: string;
  columnType: string;
  dimensionWidth: string;
  dimensionHeight: string;
  mainReinforcementCount: string;
  mainReinforcementSize: string;
  hoopReinforcementSize: string;
  hoopReinforcementSpacing: string;
}

export type ProcessingStatus = 'IDLE' | 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'ERROR';

export interface FileResult {
  id: string;
  fileName: string;
  status: ProcessingStatus;
  data: ColumnReinforcementData[];
  error?: string;
}

export interface FoundationFileResult {
  id: string;
  fileName: string;
  status: ProcessingStatus;
  data: FoundationColumnData[];
  error?: string;
}

// Frame data (FW and FG types)
export interface FrameData {
  frameName: string;        // e.g., "FW1", "FG1", "FG1A"
  b: string;                // Width (e.g., "300", "500")
  h: string;                // Height (e.g., "350", "500")
  topRebarD: string;        // 上端筋 rebar size (e.g., "D13", "D25")
  topRebarValue: string;    // 上端筋 value - spacing for FW, count for FG
  bottomRebarD: string;     // 下端筋 rebar size (e.g., "D13", "D25")
  bottomRebarValue: string; // 下端筋 value - spacing for FW, count for FG
  stirrupD: string;         // St. rebar size (e.g., "D13") - FG only, blank for FW
  stirrupValue: string;     // St. value/spacing (e.g., "100") - FG only, blank for FW
}

export interface FrameFileResult {
  id: string;
  imagePreview: string;     // Base64 preview for thumbnail
  status: ProcessingStatus;
  data: FrameData | null;
  error?: string;
}