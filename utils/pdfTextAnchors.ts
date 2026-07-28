import { BoundingBox } from '../types';
import { pdfjs } from './pdfjsRuntime';

export type PdfAnchorKind =
  | 'foundation'
  | 'plan-column'
  | 'certified-column'
  | 'x-axis'
  | 'y-axis';

export interface PdfTextAnchor {
  kind: PdfAnchorKind;
  label: string;
  sourceText: string;
  page: number;
  bbox: BoundingBox;
}

export interface PdfAnchorInventory {
  mode: 'native' | 'unavailable';
  anchors: PdfTextAnchor[];
  foundationLabels: string[];
  counts: Record<PdfAnchorKind, number>;
}

export interface PdfTextPageItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfTextPage {
  page: number;
  width: number;
  height: number;
  items: PdfTextPageItem[];
}

const emptyCounts = (): Record<PdfAnchorKind, number> => ({
  foundation: 0,
  'plan-column': 0,
  'certified-column': 0,
  'x-axis': 0,
  'y-axis': 0,
});

export const unavailablePdfAnchorInventory = (): PdfAnchorInventory => ({
  mode: 'unavailable',
  anchors: [],
  foundationLabels: [],
  counts: emptyCounts(),
});

const canonicalizeCode = (value: string) => value.replace(/['’]/g, '').toUpperCase();

export const classifyPriorityAnchor = (
  sourceText: string,
): { kind: PdfAnchorKind; label: string } | null => {
  const text = sourceText.trim().toUpperCase();
  if (!text) return null;

  const planColumn = text.match(/^(FC[A-Z0-9]+)/);
  if (planColumn) return { kind: 'plan-column', label: planColumn[1] };

  const foundation = text.match(/^(F(?:K?\d+[A-Z]?))(?=$|[（(])/);
  if (foundation) return { kind: 'foundation', label: foundation[1] };

  const xAxis = text.match(/^(X\d+[A-Z]?)$/);
  if (xAxis) return { kind: 'x-axis', label: xAxis[1] };

  const yAxis = text.match(/^(Y\d+[A-Z]?)$/);
  if (yAxis) return { kind: 'y-axis', label: yAxis[1] };

  const certified = text.match(/^((?:\d+['’]?)?[CP][A-Z0-9]+):?$/);
  if (certified) {
    return { kind: 'certified-column', label: canonicalizeCode(certified[1]) };
  }

  return null;
};

const clamp = (value: number) => Math.max(0, Math.min(1000, Math.round(value)));

const normalizeBoundingBox = (
  item: PdfTextPageItem,
  pageWidth: number,
  pageHeight: number,
): BoundingBox => ({
  ymin: clamp((item.y / pageHeight) * 1000),
  xmin: clamp((item.x / pageWidth) * 1000),
  ymax: clamp(((item.y + item.height) / pageHeight) * 1000),
  xmax: clamp(((item.x + item.width) / pageWidth) * 1000),
});

export const buildPdfAnchorInventory = (pages: PdfTextPage[]): PdfAnchorInventory => {
  const counts = emptyCounts();
  const seen = new Set<string>();
  const anchors: PdfTextAnchor[] = [];

  for (const page of pages) {
    for (const item of page.items) {
      const classified = classifyPriorityAnchor(item.text);
      if (!classified) continue;
      const bbox = normalizeBoundingBox(item, page.width, page.height);
      const key = [page.page, classified.kind, classified.label, bbox.ymin, bbox.xmin, bbox.ymax, bbox.xmax].join(':');
      if (seen.has(key)) continue;
      seen.add(key);
      counts[classified.kind] += 1;
      anchors.push({
        ...classified,
        sourceText: item.text,
        page: page.page,
        bbox,
      });
    }
  }

  const foundationLabels = [...new Set(
    anchors.filter((anchor) => anchor.kind === 'foundation').map((anchor) => anchor.label),
  )].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

  return { mode: 'native', anchors, foundationLabels, counts };
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

type PdfJsTextItem = {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
};

const toPageItem = (
  item: PdfJsTextItem,
  viewport: { transform: number[]; scale: number },
): PdfTextPageItem | null => {
  if (!item.str || !item.transform || item.transform.length < 6) return null;
  const transform = pdfjs.Util.transform(viewport.transform, item.transform);
  const directionLength = Math.hypot(transform[0], transform[1]) || 1;
  const directionX = transform[0] / directionLength;
  const directionY = transform[1] / directionLength;
  const normalX = transform[2];
  const normalY = transform[3];
  const width = Math.max(1, Math.abs(item.width ?? 0) * viewport.scale);
  const height = Math.max(1, Math.hypot(normalX, normalY), Math.abs(item.height ?? 0) * viewport.scale);
  const baseX = transform[4];
  const baseY = transform[5];
  const points = [
    [baseX, baseY],
    [baseX + directionX * width, baseY + directionY * width],
    [baseX - (normalX / height) * height, baseY - (normalY / height) * height],
    [baseX + directionX * width - (normalX / height) * height, baseY + directionY * width - (normalY / height) * height],
  ];
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return {
    text: item.str,
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(1, Math.max(...xs) - Math.min(...xs)),
    height: Math.max(1, Math.max(...ys) - Math.min(...ys)),
  };
};

export const extractPriorityPdfAnchors = async (file: File): Promise<PdfAnchorInventory> => {
  let documentProxy: { numPages: number; getPage: (page: number) => Promise<any>; destroy: () => Promise<void> } | undefined;
  try {
    const data = new Uint8Array(await readFileAsArrayBuffer(file));
    documentProxy = await pdfjs.getDocument({ data }).promise;
    const pages: PdfTextPage[] = [];

    for (let pageNumber = 1; pageNumber <= documentProxy.numPages; pageNumber += 1) {
      const page = await documentProxy.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();
      const items = (textContent.items as PdfJsTextItem[])
        .map((item) => toPageItem(item, viewport))
        .filter((item): item is PdfTextPageItem => item !== null);
      pages.push({ page: pageNumber, width: viewport.width, height: viewport.height, items });
    }

    return buildPdfAnchorInventory(pages);
  } catch {
    return unavailablePdfAnchorInventory();
  } finally {
    await documentProxy?.destroy().catch(() => undefined);
  }
};

export const serializePriorityAnchorManifest = (inventory: PdfAnchorInventory): string => {
  if (inventory.mode === 'unavailable') {
    return 'NATIVE PDF ANCHORS: unavailable; use native PDF vision.';
  }
  const lines = inventory.anchors.map((anchor) =>
    `p${anchor.page} ${anchor.kind} ${anchor.label} bbox=${anchor.bbox.ymin},${anchor.bbox.xmin},${anchor.bbox.ymax},${anchor.bbox.xmax}`,
  );
  return ['NATIVE PDF ANCHORS (deterministic text evidence):', ...lines].join('\n');
};
