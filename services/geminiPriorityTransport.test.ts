import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Guards how Foundation Priority attaches its PDF.
 *
 * The Files API resumable-upload endpoint is unreachable from a browser behind
 * TLS-inspecting proxies/antivirus — a 12-byte upload took 15 s and a 116 KB one
 * died with `TypeError: Failed to fetch`, while plain generateContent to the same
 * host answered in 5 s. So normal-sized PDFs must go inline and must never touch
 * files.upload; only oversized ones may fall back to it.
 */

const generateContent = vi.fn();
const filesUpload = vi.fn();
const filesGet = vi.fn();
const filesDelete = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent };
    files = { upload: filesUpload, get: filesGet, delete: filesDelete };
  },
  createPartFromUri: (fileUri: string, mimeType: string, mediaResolution?: string) => ({
    fileData: { fileUri, mimeType },
    ...(mediaResolution ? { mediaResolution: { level: mediaResolution } } : {}),
  }),
  FileState: { PROCESSING: 'PROCESSING', ACTIVE: 'ACTIVE' },
  Type: { OBJECT: 'OBJECT', NUMBER: 'NUMBER', STRING: 'STRING', ARRAY: 'ARRAY', BOOLEAN: 'BOOLEAN' },
  PartMediaResolutionLevel: {
    MEDIA_RESOLUTION_MEDIUM: 'MEDIA_RESOLUTION_MEDIUM',
    MEDIA_RESOLUTION_HIGH: 'MEDIA_RESOLUTION_HIGH',
  },
  ThinkingLevel: { HIGH: 'HIGH', MEDIUM: 'MEDIUM' },
}));

const CERTIFIED_ROWS = [{ xAxis: 'X1', yAxis: 'Y1', columnType: 'C3009' }];

/** A File that reports an arbitrary size without allocating the bytes. */
const fileOfSize = (bytes: number, name = 'doc.pdf') => {
  const file = new File([new Uint8Array(16)], name, { type: 'application/pdf' });
  Object.defineProperty(file, 'size', { value: bytes });
  return file;
};

let extractCertifiedCoordinateData: typeof import('./geminiService')['extractCertifiedCoordinateData'];

beforeEach(async () => {
  vi.stubEnv('VITE_GEMINI_API_KEY', 'test-key');
  generateContent.mockReset();
  filesUpload.mockReset();
  filesGet.mockReset();
  filesDelete.mockReset();
  generateContent.mockResolvedValue({ text: JSON.stringify(CERTIFIED_ROWS) });
  // Re-import per test so the module's cached client picks up the fresh mocks.
  vi.resetModules();
  ({ extractCertifiedCoordinateData } = await import('./geminiService'));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Foundation Priority PDF transport', () => {
  it('sends a normal PDF inline and never calls the Files API', async () => {
    const { data } = await extractCertifiedCoordinateData(fileOfSize(116_249));

    expect(data).toHaveLength(1);
    expect(filesUpload).not.toHaveBeenCalled();
    expect(filesDelete).not.toHaveBeenCalled();

    const part = generateContent.mock.calls[0][0].contents[0];
    expect(part.inlineData.mimeType).toBe('application/pdf');
    expect(typeof part.inlineData.data).toBe('string');
    expect(part.fileData).toBeUndefined();
  });

  it('keeps the pass media resolution on the inline part', async () => {
    await extractCertifiedCoordinateData(fileOfSize(1024));
    const part = generateContent.mock.calls[0][0].contents[0];
    expect(part.mediaResolution).toEqual({ level: 'MEDIA_RESOLUTION_MEDIUM' });
  });

  it('still sends a 2.8 MB drawing inline — the size that used to fail', async () => {
    await extractCertifiedCoordinateData(fileOfSize(2_858_044));
    expect(filesUpload).not.toHaveBeenCalled();
    expect(generateContent.mock.calls[0][0].contents[0].inlineData).toBeDefined();
  });

  it('falls back to the Files API only when the PDF is too large to inline', async () => {
    filesUpload.mockResolvedValue({ name: 'files/abc', state: 'ACTIVE', uri: 'u', mimeType: 'application/pdf' });
    filesDelete.mockResolvedValue({});

    await extractCertifiedCoordinateData(fileOfSize(40 * 1024 * 1024));

    expect(filesUpload).toHaveBeenCalledTimes(1);
    const part = generateContent.mock.calls[0][0].contents[0];
    expect(part.fileData).toEqual({ fileUri: 'u', mimeType: 'application/pdf' });
    // The uploaded file is released afterwards.
    expect(filesDelete).toHaveBeenCalledWith({ name: 'files/abc' });
  });

  it('explains what to do when an oversized upload fails', async () => {
    filesUpload.mockRejectedValue(new Error('exception TypeError: Failed to fetch sending request'));

    await expect(extractCertifiedCoordinateData(fileOfSize(40 * 1024 * 1024, 'huge.pdf'))).rejects.toThrow(
      /huge\.pdf is 40\.0 MB.*too large to send inline.*Split the PDF/s,
    );
  });

  it('records the prepare time without an upload round trip', async () => {
    const { diagnostics } = await extractCertifiedCoordinateData(fileOfSize(116_249));
    expect(diagnostics.stages.uploadMs).toBeTypeOf('number');
    expect(diagnostics.stages.totalMs).toBeTypeOf('number');
    expect(diagnostics.passUsed).toBe('primary');
  });
});
