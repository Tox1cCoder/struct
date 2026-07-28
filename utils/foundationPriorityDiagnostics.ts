import { PriorityPipelineDiagnostics, PriorityUsageSummary } from '../types';
import type { GeminiRequestPolicy } from '../services/geminiRequestPolicy';
import type { PriorityCoverageResult } from './foundationPriorityCoverage';
import { FOUNDATION_PRIORITY_MODEL } from './foundationPriorityGeminiConfig';
import type { PdfAnchorInventory } from './pdfTextAnchors';

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

export const recordPriorityRequest = (
  diag: PriorityPipelineDiagnostics,
  pass: 'primary' | 'escalated',
  policy: GeminiRequestPolicy,
): PriorityPipelineDiagnostics => ({
  ...diag,
  model: policy.model,
  passUsed: pass,
});

export const recordPriorityAnchors = (
  diag: PriorityPipelineDiagnostics,
  inventory: PdfAnchorInventory,
): PriorityPipelineDiagnostics => ({
  ...diag,
  anchorMode: inventory.mode,
  anchorCounts: { ...inventory.counts },
});

export const recordPriorityCoverage = (
  diag: PriorityPipelineDiagnostics,
  coverage: PriorityCoverageResult,
): PriorityPipelineDiagnostics => {
  const { complete: _complete, reasons: _reasons, ...coverageDiagnostics } = coverage;
  return { ...diag, coverage: coverageDiagnostics };
};

export const recordPriorityUsage = (
  diag: PriorityPipelineDiagnostics,
  pass: 'primary' | 'escalated',
  usageMetadata: unknown,
): PriorityPipelineDiagnostics => {
  if (!usageMetadata || typeof usageMetadata !== 'object') return diag;
  const source = usageMetadata as Record<string, unknown>;
  const usage: PriorityUsageSummary = {};
  for (const key of ['promptTokenCount', 'candidatesTokenCount', 'thoughtsTokenCount', 'totalTokenCount'] as const) {
    if (typeof source[key] === 'number') usage[key] = source[key];
  }
  if (Object.keys(usage).length === 0) return diag;
  return { ...diag, usage: { ...diag.usage, [pass]: usage } };
};

export const addPriorityWarning = (
  diag: PriorityPipelineDiagnostics,
  warning: string,
): PriorityPipelineDiagnostics => ({ ...diag, warning });

export const incrementPriorityCropCount = (
  diag: PriorityPipelineDiagnostics,
  count: number,
): PriorityPipelineDiagnostics => ({ ...diag, cropCount: diag.cropCount + count });
