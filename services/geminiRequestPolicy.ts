import { PartMediaResolutionLevel, ThinkingLevel } from '@google/genai';

export const PDF_DOCUMENT_MODEL = 'gemini-3.1-pro-preview';
export const COLUMN_IMAGE_MODEL = 'gemini-3-flash-preview';
export const FRAME_IMAGE_MODEL = 'gemini-3.6-flash';

export interface GeminiRequestPolicy {
  model: string;
  thinkingLevel?: ThinkingLevel;
  mediaResolution?: PartMediaResolutionLevel;
}

export const selectColumnRequestPolicy = (mimeType: string): GeminiRequestPolicy =>
  mimeType === 'application/pdf'
    ? {
        model: PDF_DOCUMENT_MODEL,
        thinkingLevel: ThinkingLevel.MEDIUM,
        mediaResolution: PartMediaResolutionLevel.MEDIA_RESOLUTION_MEDIUM,
      }
    : { model: COLUMN_IMAGE_MODEL };

export const selectPriorityRequestPolicy = (
  pass: 'primary' | 'escalated',
): GeminiRequestPolicy => ({
  model: PDF_DOCUMENT_MODEL,
  thinkingLevel: pass === 'primary' ? ThinkingLevel.MEDIUM : ThinkingLevel.HIGH,
  mediaResolution: PartMediaResolutionLevel.MEDIA_RESOLUTION_MEDIUM,
});

/**
 * Reading one short printed code per crisp vector crop needs sharp pixels, not
 * deliberation: high media resolution, low thinking.
 */
export const selectMarkerOcrRequestPolicy = (): GeminiRequestPolicy => ({
  model: PDF_DOCUMENT_MODEL,
  thinkingLevel: ThinkingLevel.LOW,
  mediaResolution: PartMediaResolutionLevel.MEDIA_RESOLUTION_HIGH,
});
