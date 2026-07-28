import {
  PartMediaResolutionLevel,
  ThinkingLevel,
  type GenerateContentConfig,
  type PartUnion,
} from '@google/genai';
import {
  PDF_DOCUMENT_MODEL,
  selectPriorityRequestPolicy,
} from '../services/geminiRequestPolicy';

export const FOUNDATION_PRIORITY_API_VERSION = 'v1alpha';
export const FOUNDATION_PRIORITY_MODEL = PDF_DOCUMENT_MODEL;
export const FOUNDATION_PRIORITY_CANDIDATE_COUNT = 1;
export const FOUNDATION_PRIORITY_POLL_INTERVAL_MS = 400;

export interface PriorityPassConfig {
  model: string;
  mediaResolution: PartMediaResolutionLevel;
  thinkingLevel: ThinkingLevel;
}

export const selectPriorityPass = (pass: 'primary' | 'escalated'): PriorityPassConfig => {
  const policy = selectPriorityRequestPolicy(pass);
  return {
    model: policy.model,
    mediaResolution: policy.mediaResolution ?? PartMediaResolutionLevel.MEDIA_RESOLUTION_MEDIUM,
    thinkingLevel: policy.thinkingLevel ?? ThinkingLevel.MEDIUM,
  };
};

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

export const createFoundationPriorityContents = (
  filePart: PartUnion,
  prompt: string,
  additionalParts: PartUnion[] = [],
): PartUnion[] => [
  filePart,
  prompt,
  ...additionalParts,
];
