export interface ColumnReinforcementData {
  columnType: string;
  columnDimensions: string;
  mainReinforcement: string;
  hoopReinforcement: string;
  sourceFileName?: string;
}

export type ProcessingStatus = 'IDLE' | 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'ERROR';

export interface FileResult {
  id: string;
  fileName: string;
  status: ProcessingStatus;
  data: ColumnReinforcementData[];
  error?: string;
}