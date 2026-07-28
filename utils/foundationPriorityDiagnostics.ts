import { PriorityPipelineDiagnostics } from '../types';
import { FOUNDATION_PRIORITY_MODEL } from './foundationPriorityGeminiConfig';

type StageKey = 'preprocess' | 'upload' | 'primaryGeneration' | 'primaryValidation' | 'fallbackGeneration' | 'fallbackValidation' | 'total';

const stageMap: Record<StageKey, keyof PriorityPipelineDiagnostics['stages']> = {
  preprocess: 'preprocessMs',
  upload: 'uploadMs',
  primaryGeneration: 'primaryGenerationMs',
  primaryValidation: 'primaryValidationMs',
  fallbackGeneration: 'fallbackGenerationMs',
  fallbackValidation: 'fallbackValidationMs',
  total: 'totalMs',
};

export const createPriorityDiagnostics = (
  fileName: string,
  role: 'certified' | 'plan',
): PriorityPipelineDiagnostics => ({
  fileName,
  role,
  model: FOUNDATION_PRIORITY_MODEL,
  anchorMode: 'unavailable',
  anchorCounts: {
    foundation: 0,
    'plan-column': 0,
    'certified-column': 0,
    'x-axis': 0,
    'y-axis': 0,
  },
  cropCount: 0,
  stages: {},
  passUsed: 'primary',
});

export const finishStage = (
  diag: PriorityPipelineDiagnostics,
  stage: StageKey,
  durationMs: number,
): PriorityPipelineDiagnostics => ({
  ...diag,
  stages: { ...diag.stages, [stageMap[stage]]: durationMs },
});

export const markEscalated = (
  diag: PriorityPipelineDiagnostics,
  reason: string,
): PriorityPipelineDiagnostics => ({
  ...diag,
  passUsed: 'escalated',
  escalationReason: reason,
});
