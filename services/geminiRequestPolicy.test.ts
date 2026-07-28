import { PartMediaResolutionLevel, ThinkingLevel } from '@google/genai';
import { describe, expect, it } from 'vitest';
import {
  FRAME_IMAGE_MODEL,
  selectColumnRequestPolicy,
  selectPriorityRequestPolicy,
} from './geminiRequestPolicy';

describe('Gemini request policies', () => {
  it('routes PDFs to balanced Gemini 3.1 Pro', () => {
    expect(selectColumnRequestPolicy('application/pdf')).toEqual({
      model: 'gemini-3.1-pro-preview',
      thinkingLevel: ThinkingLevel.MEDIUM,
      mediaResolution: PartMediaResolutionLevel.MEDIA_RESOLUTION_MEDIUM,
    });
  });

  it('keeps Column images and Frame images on Flash', () => {
    expect(selectColumnRequestPolicy('image/png')).toEqual({ model: 'gemini-3-flash-preview' });
    expect(FRAME_IMAGE_MODEL).toBe('gemini-3.6-flash');
  });

  it('uses high thinking but medium PDF media on targeted escalation', () => {
    expect(selectPriorityRequestPolicy('escalated')).toMatchObject({
      model: 'gemini-3.1-pro-preview',
      thinkingLevel: ThinkingLevel.HIGH,
      mediaResolution: PartMediaResolutionLevel.MEDIA_RESOLUTION_MEDIUM,
    });
  });
});
