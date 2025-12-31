export interface ColumnReinforcementData {
  columnType: string;
  columnDimensions: string;
  mainReinforcement: string;
  hoopReinforcement: string;
  sourceFileName?: string;
}

// Expanded data type with split columns for Excel export
export interface ExpandedReinforcementData {
  sourceFileName: string;
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