import {
  PartMediaResolutionLevel,
  ThinkingLevel,
  type GenerateContentConfig,
  type PartUnion,
} from '@google/genai';

export const FOUNDATION_PRIORITY_API_VERSION = 'v1alpha';
export const FOUNDATION_PRIORITY_MODEL = 'gemini-3.1-pro-preview';
export const FOUNDATION_PRIORITY_PRIMARY_THINKING_LEVEL = ThinkingLevel.HIGH;
export const FOUNDATION_PRIORITY_FALLBACK_THINKING_LEVEL = ThinkingLevel.HIGH;
export const FOUNDATION_PRIORITY_PRIMARY_MEDIA_RESOLUTION =
  PartMediaResolutionLevel.MEDIA_RESOLUTION_MEDIUM;
export const FOUNDATION_PRIORITY_FALLBACK_MEDIA_RESOLUTION =
  PartMediaResolutionLevel.MEDIA_RESOLUTION_HIGH;
export const FOUNDATION_PRIORITY_CANDIDATE_COUNT = 1;
export const FOUNDATION_PRIORITY_POLL_INTERVAL_MS = 400;

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
