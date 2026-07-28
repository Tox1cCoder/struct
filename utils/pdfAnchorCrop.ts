import { BoundingBox } from '../types';
import { PdfTextAnchor } from './pdfTextAnchors';
import { pdfjs } from './pdfjsRuntime';

const expandAndClampAxis = (
  start: number,
  end: number,
  limit: number,
): [number, number] => {
  const margin = limit * 0.1;
  const minimumSize = limit * 0.2;
  const desiredSize = Math.min(limit, Math.max(minimumSize, end - start + margin * 2));
  const center = (start + end) / 2;
  let expandedStart = center - desiredSize / 2;
  let expandedEnd = center + desiredSize / 2;

  if (expandedStart < 0) {
    expandedEnd -= expandedStart;
    expandedStart = 0;
  }
  if (expandedEnd > limit) {
    expandedStart -= expandedEnd - limit;
    expandedEnd = limit;
  }

  return [
    Math.round(Math.max(0, expandedStart)),
    Math.round(Math.min(limit, expandedEnd)),
  ];
};

export const calculateAnchorCropBox = (
  anchorBox: BoundingBox,
  pageWidth: number,
  pageHeight: number,
): BoundingBox => {
  const [xmin, xmax] = expandAndClampAxis(anchorBox.xmin, anchorBox.xmax, pageWidth);
  const [ymin, ymax] = expandAndClampAxis(anchorBox.ymin, anchorBox.ymax, pageHeight);
  return { ymin, xmin, ymax, xmax };
};

const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error(`Could not read ${file.name} as binary data.`));
    };
    reader.readAsArrayBuffer(file);
  });
};

export interface PdfAnchorCrop {
  data: string;
  mimeType: 'image/png';
}

export const renderPdfAnchorCrop = async (
  file: File,
  anchor: PdfTextAnchor,
): Promise<PdfAnchorCrop> => {
  let documentProxy: { getPage: (page: number) => Promise<any>; destroy: () => Promise<void> } | undefined;
  try {
    const data = new Uint8Array(await readFileAsArrayBuffer(file));
    documentProxy = await pdfjs.getDocument({ data }).promise;
    const page = await documentProxy.getPage(anchor.page);
    const viewport = page.getViewport({ scale: 2 });
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = Math.ceil(viewport.width);
    pageCanvas.height = Math.ceil(viewport.height);
    const pageContext = pageCanvas.getContext('2d');
    if (!pageContext) throw new Error('page canvas context unavailable');

    await page.render({ canvas: pageCanvas, canvasContext: pageContext, viewport }).promise;

    const normalizedCrop = calculateAnchorCropBox(anchor.bbox, 1000, 1000);
    const sourceX = Math.floor((normalizedCrop.xmin / 1000) * pageCanvas.width);
    const sourceY = Math.floor((normalizedCrop.ymin / 1000) * pageCanvas.height);
    const sourceWidth = Math.max(1, Math.ceil(((normalizedCrop.xmax - normalizedCrop.xmin) / 1000) * pageCanvas.width));
    const sourceHeight = Math.max(1, Math.ceil(((normalizedCrop.ymax - normalizedCrop.ymin) / 1000) * pageCanvas.height));
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = sourceWidth;
    cropCanvas.height = sourceHeight;
    const cropContext = cropCanvas.getContext('2d');
    if (!cropContext) throw new Error('crop canvas context unavailable');

    cropContext.drawImage(
      pageCanvas,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      sourceWidth,
      sourceHeight,
    );
    const dataUrl = cropCanvas.toDataURL('image/png');
    const base64 = dataUrl.split(',', 2)[1];
    if (!base64) throw new Error('PNG encoding failed');
    return { data: base64, mimeType: 'image/png' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not render PDF page ${anchor.page} crop: ${message}`);
  } finally {
    await documentProxy?.destroy().catch(() => undefined);
  }
};
