import { describe, expect, it } from 'vitest';
import { PartMediaResolutionLevel, ThinkingLevel } from '@google/genai';
import {
  createFoundationPriorityContents,
  createFoundationPriorityGenerationConfig,
  needsPriorityEscalation,
  selectPriorityPass,
} from './foundationPriorityGeminiConfig';

describe('Foundation Priority Gemini request config', () => {
  it('uses HIGH thinking for both passes and bumps media resolution to HIGH on escalation', () => {
    expect(selectPriorityPass('primary')).toMatchObject({
      mediaResolution: PartMediaResolutionLevel.MEDIA_RESOLUTION_MEDIUM,
      thinkingLevel: ThinkingLevel.HIGH,
    });
    expect(selectPriorityPass('escalated')).toMatchObject({
      mediaResolution: PartMediaResolutionLevel.MEDIA_RESOLUTION_HIGH,
      thinkingLevel: ThinkingLevel.HIGH,
    });
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

  it('escalates when normalized output is empty regardless of role', () => {
    expect(needsPriorityEscalation('certified', 0, 0)).toBe(true);
    expect(needsPriorityEscalation('plan', 0, 0)).toBe(true);
  });

  it('escalates plan extraction when no resolvable rows even with normalized output', () => {
    expect(needsPriorityEscalation('plan', 5, 0)).toBe(true);
  });

  it('does not escalate certified extraction merely because there is no resolvable code', () => {
    expect(needsPriorityEscalation('certified', 5, 0)).toBe(false);
  });
});
