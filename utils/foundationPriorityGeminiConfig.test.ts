import { describe, expect, it } from 'vitest';
import { ThinkingLevel } from '@google/genai';
import {
  FOUNDATION_PRIORITY_FALLBACK_THINKING_LEVEL,
  FOUNDATION_PRIORITY_PRIMARY_THINKING_LEVEL,
  createFoundationPriorityContents,
  createFoundationPriorityGenerationConfig,
} from './foundationPriorityGeminiConfig';

describe('Foundation Priority Gemini request config', () => {
  it('uses high thinking for both primary and fallback extraction passes', () => {
    expect(FOUNDATION_PRIORITY_PRIMARY_THINKING_LEVEL).toBe(ThinkingLevel.HIGH);
    expect(FOUNDATION_PRIORITY_FALLBACK_THINKING_LEVEL).toBe(ThinkingLevel.HIGH);
  });

  it('leaves Gemini 3 sampling parameters at API defaults', () => {
    const config = createFoundationPriorityGenerationConfig({ type: 'array' }, ThinkingLevel.HIGH);

    expect(config).toMatchObject({
      responseMimeType: 'application/json',
      responseJsonSchema: { type: 'array' },
      candidateCount: 1,
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.HIGH,
      },
    });
    expect(config).not.toHaveProperty('temperature');
    expect(config).not.toHaveProperty('topP');
    expect(config).not.toHaveProperty('topK');
    expect(config).not.toHaveProperty('seed');
  });

  it('places the PDF part before the task prompt for document extraction', () => {
    const pdfPart = { fileData: { fileUri: 'files/example', mimeType: 'application/pdf' } };

    expect(createFoundationPriorityContents(pdfPart, 'Extract the rows')).toEqual([
      pdfPart,
      'Extract the rows',
    ]);
  });
});
