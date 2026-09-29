import type { PageRect } from '../types';
import { pdfjs } from './pdfjsRuntime';
import { extractPdfPageGeometry, type PdfPageGeometry, type PdfPageLike } from './pdfPageGeometry';

const PDFJS_ASSETS = `${import.meta.env.BASE_URL}pdfjs/`;

type PdfDocument = Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>;

/** Open a PDF with the CJK CMaps drawings need, run `work`, and always release it. */
const withPdfDocument = async <T>(file: File, work: (document: PdfDocument) => Promise<T>) => {
  const document = await pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: `${PDFJS_ASSETS}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${PDFJS_ASSETS}standard_fonts/`,
  }).promise;
  try {
    return await work(document);
  } finally {
    // Releasing the worker-side document can fail after the page data is already read;
    // that must not replace the result or the original error.
    await document.destroy().catch(() => undefined);
  }
};

export const loadPdfPageGeometries = (file: File): Promise<PdfPageGeometry[]> =>
  withPdfDocument(file, async (document) => {
    const pages: PdfPageGeometry[] = [];
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number);
      pages.push(await extractPdfPageGeometry(page as unknown as PdfPageLike, pdfjs.OPS));
    }
    return pages;
  });

export interface PageRegionImage {
  data: string;
  mimeType: 'image/png';
}

/**
 * Render each display-space rectangle of one page to its own PNG, drawing only
 * that region, so small labels come out sharp without rasterizing the whole sheet.
 */
export const renderPdfPageRegions = (
  file: File,
  pageNumber: number,
  rects: PageRect[],
  scale = 8,
): Promise<PageRegionImage[]> =>
  withPdfDocument(file, async (document) => {
    const page = await document.getPage(pageNumber);
    const images: PageRegionImage[] = [];
    for (const rect of rects) {
      const canvas = window.document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil((rect.x1 - rect.x0) * scale));
      canvas.height = Math.max(1, Math.ceil((rect.y1 - rect.y0) * scale));
      const canvasContext = canvas.getContext('2d');
      if (!canvasContext) throw new Error('Canvas 2D context is unavailable for marker crops.');
      const offsets = { offsetX: -rect.x0 * scale, offsetY: -rect.y0 * scale };
      const viewport = page.getViewport({ scale, ...offsets });
      await page.render({ canvasContext, viewport }).promise;
      const data = canvas.toDataURL('image/png').split(',', 2)[1];
      if (!data) throw new Error('PNG encoding failed for a marker crop.');
      images.push({ data, mimeType: 'image/png' });
    }
    return images;
  });
