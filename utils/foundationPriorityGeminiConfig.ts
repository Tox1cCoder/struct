import {
  PartMediaResolutionLevel,
  ThinkingLevel,
  type GenerateContentConfig,
  type PartUnion,
} from '@google/genai';

export const FOUNDATION_PRIORITY_API_VERSION = 'v1alpha';
export const FOUNDATION_PRIORITY_MODEL = 'gemini-3.1-pro-preview';
export const FOUNDATION_PRIORITY_CANDIDATE_COUNT = 1;
export const FOUNDATION_PRIORITY_POLL_INTERVAL_MS = 400;

export interface PriorityPassConfig {
  model: string;
  mediaResolution: PartMediaResolutionLevel;
  thinkingLevel: ThinkingLevel;
}

// Both passes use HIGH thinking — the previous MEDIUM primary missed FC codes
// on the supplied PDFs, causing too many results to fall back to certified-only.
// Escalation also bumps media resolution to HIGH for tougher pages.
export const selectPriorityPass = (pass: 'primary' | 'escalated'): PriorityPassConfig => ({
  model: FOUNDATION_PRIORITY_MODEL,
  mediaResolution:
    pass === 'primary'
      ? PartMediaResolutionLevel.MEDIA_RESOLUTION_MEDIUM
      : PartMediaResolutionLevel.MEDIA_RESOLUTION_HIGH,
  thinkingLevel: ThinkingLevel.HIGH,
});

export const needsPriorityEscalation = (
  role: 'certified' | 'plan',
  normalizedCount: number,
  resolvableCount: number,
) =>
  normalizedCount === 0 ||
  (role === 'plan' && resolvableCount === 0);

export const createFoundationPriorityGenerationConfig = (
  responseJsonSchema: object,
  thinkingLevel: ThinkingLevel,
): GenerateContentConfig => ({
  responseMimeType: 'application/json',
  responseJsonSchema,
  candidateCount: FOUNDATION_PRIORITY_CANDIDATE_COUNT,
  thinkingConfig: {
    thinkingLevel,
  },
});

export const createFoundationPriorityContents = (filePart: PartUnion, prompt: string): PartUnion[] => [
  filePart,
  prompt,
];
