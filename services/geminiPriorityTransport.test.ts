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
const { extractPriorityPdfAnchors, renderPdfAnchorCrop } = vi.hoisted(() => ({
  extractPriorityPdfAnchors: vi.fn(),
  renderPdfAnchorCrop: vi.fn(),
}));

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
  ThinkingLevel: { HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW' },
}));

vi.mock('../utils/pdfTextAnchors', async (importOriginal) => ({
  ...await importOriginal<typeof import('../utils/pdfTextAnchors')>(),
  extractPriorityPdfAnchors,
}));

vi.mock('../utils/pdfAnchorCrop', () => ({ renderPdfAnchorCrop }));

const CERTIFIED_ROWS = [{ xAxis: 'X1', yAxis: 'Y1', columnType: 'C3009' }];

/** A File that reports an arbitrary size without allocating the bytes. */
const fileOfSize = (bytes: number, name = 'doc.pdf') => {
  const file = new File([new Uint8Array(16)], name, { type: 'application/pdf' });
  Object.defineProperty(file, 'size', { value: bytes });
  return file;
};

let extractCertifiedCoordinateData: typeof import('./geminiService')['extractCertifiedCoordinateData'];
let extractFoundationPlanCoordinateData: typeof import('./geminiService')['extractFoundationPlanCoordinateData'];
let readCertifiedMarkerCodes: typeof import('./geminiService')['readCertifiedMarkerCodes'];

const planRow = (foundation: string, xAxis: string, yAxis: string, planColumnType: string) => ({
  foundation,
  xAxis,
  yAxis,
  planColumnType,
  isHighlighted: false,
  highlightColor: '',
});

const anchoredInventory = () => ({
  mode: 'native' as const,
  anchors: ['F1', 'F1A', 'F2'].map((label, index) => ({
    kind: 'foundation' as const,
    label,
    sourceText: label,
    page: 1,
    bbox: { ymin: index * 20, xmin: 10, ymax: index * 20 + 10, xmax: 20 },
  })),
  foundationLabels: ['F1', 'F1A', 'F2'],
  counts: { foundation: 3, 'plan-column': 0, 'certified-column': 0, 'x-axis': 0, 'y-axis': 0 },
});

const unavailableAnchorInventory = () => ({
  mode: 'unavailable' as const,
  anchors: [],
  foundationLabels: [],
  counts: { foundation: 0, 'plan-column': 0, 'certified-column': 0, 'x-axis': 0, 'y-axis': 0 },
});

beforeEach(async () => {
  vi.stubEnv('VITE_GEMINI_API_KEY', 'test-key');
  generateContent.mockReset();
  filesUpload.mockReset();
  filesGet.mockReset();
  filesDelete.mockReset();
  extractPriorityPdfAnchors.mockReset();
  renderPdfAnchorCrop.mockReset();
  generateContent.mockResolvedValue({ text: JSON.stringify(CERTIFIED_ROWS) });
  extractPriorityPdfAnchors.mockResolvedValue(anchoredInventory());
  renderPdfAnchorCrop.mockResolvedValue({ data: 'crop-base64', mimeType: 'image/png' });
  // Re-import per test so the module's cached client picks up the fresh mocks.
  vi.resetModules();
  ({
    extractCertifiedCoordinateData,
    extractFoundationPlanCoordinateData,
    readCertifiedMarkerCodes,
  } = await import('./geminiService'));
});

describe('Foundation Priority coverage orchestration', () => {
  it('sends the PDF once with a compact anchor manifest', async () => {
    generateContent.mockResolvedValueOnce({ text: JSON.stringify([
      planRow('F1', 'X1', 'Y1', ''),
      planRow('F1A', 'X2', 'Y2', 'FC1'),
      planRow('F2', 'X3', 'Y3', ''),
    ]) });

    await extractFoundationPlanCoordinateData(fileOfSize(116_249, 'plan.pdf'));

    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(generateContent.mock.calls[0][0].contents[1]).toContain('NATIVE PDF ANCHORS');
    expect(generateContent.mock.calls[0][0].config.thinkingConfig.thinkingLevel).toBe('MEDIUM');
  });

  it('targets missing foundations even when primary returned FC1', async () => {
    generateContent
      .mockResolvedValueOnce({ text: JSON.stringify([planRow('F1A', 'X6', 'Y8', 'FC1')]) })
      .mockResolvedValueOnce({ text: JSON.stringify([
        planRow('F1', 'X4', 'Y2', ''),
        planRow('F2', 'X2', 'Y5', ''),
      ]) });

    const result = await extractFoundationPlanCoordinateData(fileOfSize(116_249, 'plan.pdf'));

    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(generateContent.mock.calls[1][0].contents.at(-1)).toContain('F1, F2');
    expect(generateContent.mock.calls[1][0].contents[2]).toMatchObject({
      inlineData: { mimeType: 'image/png', data: 'crop-base64' },
      mediaResolution: { level: 'MEDIA_RESOLUTION_HIGH' },
    });
    expect(result.data.map((row) => row.foundation)).toEqual(['F1A', 'F1', 'F2']);
    expect(result.diagnostics.passUsed).toBe('escalated');
    expect(result.diagnostics.cropCount).toBe(2);
  });

  it('returns valid primary rows with an explicit warning when targeting fails', async () => {
    generateContent
      .mockResolvedValueOnce({ text: JSON.stringify([planRow('F1A', 'X6', 'Y8', 'FC1')]) })
      .mockRejectedValueOnce(new Error('targeted request failed'));

    const result = await extractFoundationPlanCoordinateData(fileOfSize(116_249, 'plan.pdf'));

    expect(result.data).toHaveLength(1);
    expect(result.diagnostics.warning).toMatch(/incomplete/i);
    expect(result.diagnostics.coverage?.missingLabels.length).toBeGreaterThan(0);
  });

  it('continues vision-only when native anchor extraction is unavailable', async () => {
    extractPriorityPdfAnchors.mockResolvedValue(unavailableAnchorInventory());
    generateContent.mockResolvedValueOnce({ text: JSON.stringify([planRow('F1', 'X1', 'Y1', '')]) });

    const result = await extractFoundationPlanCoordinateData(fileOfSize(116_249, 'plan.pdf'));

    expect(result.diagnostics.anchorMode).toBe('unavailable');
    expect(result.data.length).toBeGreaterThan(0);
  });

  it('surfaces a primary model failure instead of calling it escalation', async () => {
    generateContent.mockRejectedValueOnce(new Error('primary request failed'));

    await expect(extractFoundationPlanCoordinateData(fileOfSize(116_249, 'plan.pdf')))
      .rejects.toThrow('primary request failed');
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('retains only safe token counts from Gemini usage metadata', async () => {
    generateContent.mockResolvedValueOnce({
      text: JSON.stringify([
        planRow('F1', 'X1', 'Y1', ''),
        planRow('F1A', 'X2', 'Y2', 'FC1'),
        planRow('F2', 'X3', 'Y3', ''),
      ]),
      usageMetadata: {
        promptTokenCount: 100,
        thoughtsTokenCount: 20,
        totalTokenCount: 140,
        privateField: 'do-not-copy',
      },
    });

    const { diagnostics } = await extractFoundationPlanCoordinateData(fileOfSize(116_249, 'plan.pdf'));

    expect(diagnostics.usage?.primary).toEqual({
      promptTokenCount: 100,
      thoughtsTokenCount: 20,
      totalTokenCount: 140,
    });
  });
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

describe('Certified marker label reads', () => {
  const crop = (id: string) => ({ id, data: `png-${id}`, mimeType: 'image/png' as const });
  const reply = (rows: Array<{ id: string; code: string }>) => ({ text: JSON.stringify(rows) });

  it('sends no request when every marker already has a code', async () => {
    await expect(readCertifiedMarkerCodes([])).resolves.toEqual(new Map());
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('sends one labelled high-resolution image per marker and canonicalizes codes', async () => {
    generateContent.mockResolvedValueOnce(reply([
      { id: 'm4', code: "1'C2" },
      { id: 'm9', code: 'p1' },
    ]));

    const codes = await readCertifiedMarkerCodes([crop('m4'), crop('m9')]);

    expect(codes).toEqual(new Map([['m4', '1C2'], ['m9', 'P1']]));
    expect(generateContent).toHaveBeenCalledTimes(1);
    const { contents, model, config } = generateContent.mock.calls[0][0];
    expect(model).toBe('gemini-3.1-pro-preview');
    expect(config.thinkingConfig).toEqual({ thinkingLevel: 'LOW' });
    expect(contents.filter((part: unknown) => typeof part === 'string' && part.startsWith('Marker ')))
      .toEqual(['Marker m4:', 'Marker m9:']);
    expect(contents.filter((part: { inlineData?: unknown }) => part.inlineData)).toEqual([
      { inlineData: { mimeType: 'image/png', data: 'png-m4' }, mediaResolution: { level: 'MEDIA_RESOLUTION_HIGH' } },
      { inlineData: { mimeType: 'image/png', data: 'png-m9' }, mediaResolution: { level: 'MEDIA_RESOLUTION_HIGH' } },
    ]);
  });

  it('retries once, for only the markers that came back missing or unreadable', async () => {
    generateContent
      .mockResolvedValueOnce(reply([
        { id: 'm1', code: 'C1' },
        { id: 'm2', code: 'column' },
        { id: 'm7', code: 'C9' },
      ]))
      .mockResolvedValueOnce(reply([{ id: 'm2', code: 'C2' }]));

    const codes = await readCertifiedMarkerCodes([crop('m1'), crop('m2'), crop('m3')]);

    expect(codes).toEqual(new Map([['m1', 'C1'], ['m2', 'C2']]));
    expect(generateContent).toHaveBeenCalledTimes(2);
    const retryImages = generateContent.mock.calls[1][0].contents
      .filter((part: { inlineData?: { data: string } }) => part.inlineData)
      .map((part: { inlineData: { data: string } }) => part.inlineData.data);
    expect(retryImages).toEqual(['png-m2', 'png-m3']);
  });
});
