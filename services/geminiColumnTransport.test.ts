import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const generateContent = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
  createPartFromUri: vi.fn(),
  FileState: { PROCESSING: 'PROCESSING', ACTIVE: 'ACTIVE' },
  Type: { OBJECT: 'OBJECT', NUMBER: 'NUMBER', STRING: 'STRING', ARRAY: 'ARRAY', BOOLEAN: 'BOOLEAN' },
  PartMediaResolutionLevel: {
    MEDIA_RESOLUTION_MEDIUM: 'MEDIA_RESOLUTION_MEDIUM',
    MEDIA_RESOLUTION_HIGH: 'MEDIA_RESOLUTION_HIGH',
  },
  ThinkingLevel: { HIGH: 'HIGH', MEDIUM: 'MEDIUM' },
}));

let extractDataFromPdf: typeof import('./geminiService')['extractDataFromPdf'];

beforeEach(async () => {
  vi.stubEnv('VITE_GEMINI_API_KEY', 'test-key');
  generateContent.mockReset();
  generateContent.mockResolvedValue({
    text: JSON.stringify([{
      columnType: 'C1',
      columnDimensions: '770x770',
      mainReinforcement: '24-D25',
      hoopReinforcement: 'D13@100',
    }]),
  });
  vi.resetModules();
  ({ extractDataFromPdf } = await import('./geminiService'));
});

afterEach(() => vi.unstubAllEnvs());

describe('Column extraction request routing', () => {
  it('uses Pro medium thinking and medium media for a PDF', async () => {
    await extractDataFromPdf('base64', 'application/pdf');
    const request = generateContent.mock.calls[0][0];

    expect(request.model).toBe('gemini-3.1-pro-preview');
    expect(request.contents.parts[0].mediaResolution).toEqual({ level: 'MEDIA_RESOLUTION_MEDIUM' });
    expect(request.config.thinkingConfig).toEqual({ thinkingLevel: 'MEDIUM' });
  });

  it('keeps images on Flash without PDF-only request settings', async () => {
    await extractDataFromPdf('base64', 'image/png');
    const request = generateContent.mock.calls[0][0];

    expect(request.model).toBe('gemini-3-flash-preview');
    expect(request.contents.parts[0]).not.toHaveProperty('mediaResolution');
    expect(request.config).not.toHaveProperty('thinkingConfig');
  });
});
