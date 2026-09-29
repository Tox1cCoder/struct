import type { PageRect } from '../types';

export type Rgb = [number, number, number];

export interface PageSegment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  lineWidth: number;
}

export interface PageShapeRect {
  rect: PageRect;
  lineWidth: number;
  stroked: boolean;
  filled: boolean;
  fill?: Rgb;
}

export interface PageText {
  text: string;
  rect: PageRect;
}

export interface PdfPageGeometry {
  width: number;
  height: number;
  texts: PageText[];
  segments: PageSegment[];
  rects: PageShapeRect[];
}

/** The subset of a pdfjs `PDFPageProxy` this module needs, so tests can pass a fake. */
export interface PdfPageLike {
  getViewport(params: { scale: number }): { width: number; height: number; transform: number[] };
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[] }>;
  getTextContent(): Promise<{ items: unknown[] }>;
  getAnnotations?(): Promise<unknown[]>;
}

/** pdfjs `OPS` table (name → operator id), passed in so this module never imports pdfjs. */
export type PdfOps = Record<string, number>;

type Matrix = [number, number, number, number, number, number];
type Point = [number, number];

interface Subpath {
  points: Point[];
  straight: boolean[];
  closed: boolean;
}

interface GraphicsState {
  ctm: Matrix;
  lineWidth: number;
  fill: Rgb;
}

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const AXIS_TOLERANCE = 0.05;

const multiply = (m1: Matrix, m2: Matrix): Matrix => [
  m1[0] * m2[0] + m1[2] * m2[1],
  m1[1] * m2[0] + m1[3] * m2[1],
  m1[0] * m2[2] + m1[2] * m2[3],
  m1[1] * m2[2] + m1[3] * m2[3],
  m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
  m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
];

const apply = (m: Matrix, x: number, y: number): Point => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

const toMatrix = (value: unknown): Matrix | null => {
  if (!value || typeof value !== 'object' || !('length' in value)) return null;
  const numbers = Array.from(value as ArrayLike<number>);
  return numbers.length === 6 ? (numbers as Matrix) : null;
};

const bounds = (points: Point[]): PageRect => {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
};

const samePoint = (a: Point, b: Point) =>
  Math.abs(a[0] - b[0]) < AXIS_TOLERANCE && Math.abs(a[1] - b[1]) < AXIS_TOLERANCE;

const isAxisAligned = (a: Point, b: Point) =>
  Math.abs(a[0] - b[0]) < AXIS_TOLERANCE || Math.abs(a[1] - b[1]) < AXIS_TOLERANCE;

const isClosedLoop = (subpath: Subpath, treatAsClosed: boolean) =>
  treatAsClosed ||
  subpath.closed ||
  samePoint(subpath.points[0], subpath.points[subpath.points.length - 1]);

/** Distinct corners of a closed subpath, without a repeated closing point. */
const cornersOf = (points: Point[]) => {
  const corners = points.filter((point, index) =>
    index === 0 || !samePoint(point, points[index - 1]));
  const repeatsStart = corners.length > 1 && samePoint(corners[0], corners[corners.length - 1]);
  return repeatsStart ? corners.slice(0, -1) : corners;
};

const hasAxisAlignedEdges = (corners: Point[]) =>
  corners.every((corner, index) => isAxisAligned(corner, corners[(index + 1) % corners.length]));

/** Corners of an axis-aligned rectangle subpath, or null when the subpath is anything else. */
const rectangleOf = (subpath: Subpath, treatAsClosed: boolean): PageRect | null => {
  if (!isClosedLoop(subpath, treatAsClosed) || subpath.straight.some((straight) => !straight)) {
    return null;
  }
  const corners = cornersOf(subpath.points);
  if (corners.length !== 4 || !hasAxisAlignedEdges(corners)) return null;
  const rect = bounds(corners);
  const degenerate = rect.x1 - rect.x0 < AXIS_TOLERANCE || rect.y1 - rect.y0 < AXIS_TOLERANCE;
  return degenerate ? null : rect;
};

const segmentsOf = (subpath: Subpath, lineWidth: number): PageSegment[] => {
  const segments: PageSegment[] = [];
  const { points, straight } = subpath;
  for (let index = 1; index < points.length; index += 1) {
    if (!straight[index]) continue;
    const [x0, y0] = points[index - 1];
    const [x1, y1] = points[index];
    segments.push({ x0, y0, x1, y1, lineWidth });
  }
  const first = points[0];
  const last = points[points.length - 1];
  if (subpath.closed && points.length > 1 && !samePoint(first, last)) {
    segments.push({ x0: last[0], y0: last[1], x1: first[0], y1: first[1], lineWidth });
  }
  return segments;
};

interface PaintOp {
  stroke: boolean;
  fill: boolean;
  close: boolean;
}

const PAINT_OPS: Record<string, PaintOp> = {
  stroke: { stroke: true, fill: false, close: false },
  closeStroke: { stroke: true, fill: false, close: true },
  fill: { stroke: false, fill: true, close: false },
  eoFill: { stroke: false, fill: true, close: false },
  fillStroke: { stroke: true, fill: true, close: false },
  eoFillStroke: { stroke: true, fill: true, close: false },
  closeFillStroke: { stroke: true, fill: true, close: true },
  closeEOFillStroke: { stroke: true, fill: true, close: true },
  endPath: { stroke: false, fill: false, close: false },
};

/** Coordinates consumed by each path operator, and where its end point starts. */
const PATH_OPS: Record<string, { size: number; end: number }> = {
  moveTo: { size: 2, end: 0 },
  lineTo: { size: 2, end: 0 },
  curveTo: { size: 6, end: 4 },
  curveTo2: { size: 4, end: 2 },
  curveTo3: { size: 4, end: 2 },
  rectangle: { size: 4, end: 0 },
  closePath: { size: 0, end: 0 },
};

class GeometryWalker {
  private readonly stack: GraphicsState[] = [];
  private state: GraphicsState = { ctm: IDENTITY, lineWidth: 1, fill: [0, 0, 0] };
  private subpaths: Subpath[] = [];
  private readonly names: Map<number, string>;
  readonly segments: PageSegment[] = [];
  readonly rects: PageShapeRect[] = [];

  private readonly handlers: Record<string, (args: ArrayLike<unknown> | null) => void> = {
    save: () => this.push(),
    restore: () => this.pop(),
    transform: (args) => this.transform(toMatrix(args)),
    paintFormXObjectBegin: (args) => {
      this.push();
      this.transform(toMatrix(args?.[0]));
    },
    paintFormXObjectEnd: () => this.pop(),
    beginAnnotation: (args) => this.beginAnnotation(args),
    endAnnotation: () => this.pop(),
    setLineWidth: (args) => {
      this.state.lineWidth = Number(args?.[0] ?? 1);
    },
    setGState: (args) => {
      const entries = (args?.[0] ?? []) as Array<[string, unknown]>;
      const lineWidth = entries.find(([key]) => key === 'LW')?.[1];
      if (typeof lineWidth === 'number') this.state.lineWidth = lineWidth;
    },
    setFillRGBColor: (args) => {
      this.state.fill = Array.from((args ?? [0, 0, 0]) as ArrayLike<number>).slice(0, 3) as Rgb;
    },
    constructPath: (args) => this.appendPath(args?.[0] as number[], args?.[1] as number[]),
  };

  constructor(private readonly viewport: Matrix, ops: PdfOps) {
    this.names = new Map(Object.entries(ops).map(([name, id]) => [id, name]));
  }

  run(fnArray: number[], argsArray: unknown[]) {
    fnArray.forEach((fn, index) => {
      const name = this.names.get(fn) ?? '';
      const args = argsArray[index] as ArrayLike<unknown> | null;
      const handler = this.handlers[name];
      if (handler) handler(args);
      else if (PAINT_OPS[name]) this.paint(PAINT_OPS[name]);
    });
  }

  private push() {
    this.stack.push({ ...this.state });
  }

  private pop() {
    this.state = this.stack.pop() ?? this.state;
  }

  /** Like pdfjs: an annotation appearance starts from the base transform, not page state. */
  private beginAnnotation(args: ArrayLike<unknown> | null) {
    this.push();
    this.state = { ctm: IDENTITY, lineWidth: 1, fill: [0, 0, 0] };
    this.transform(toMatrix(args?.[2]));
    this.transform(toMatrix(args?.[3]));
  }

  private transform(matrix: Matrix | null) {
    if (matrix) this.state.ctm = multiply(this.state.ctm, matrix);
  }

  private displayMatrix(): Matrix {
    return multiply(this.viewport, this.state.ctm);
  }

  private appendPath(pathOps: number[], coords: number[]) {
    const matrix = this.displayMatrix();
    let cursor = 0;
    for (const op of pathOps) {
      const name = this.names.get(op) ?? '';
      const shape = PATH_OPS[name];
      if (!shape) continue;
      const start = cursor;
      const at = (offset: number) =>
        apply(matrix, coords[start + offset], coords[start + offset + 1]);
      this.appendPathOp(name, at, coords.slice(start, start + shape.size));
      cursor += shape.size;
    }
  }

  private appendPathOp(name: string, at: (offset: number) => Point, values: number[]) {
    const current = this.subpaths[this.subpaths.length - 1];
    if (name === 'moveTo') {
      this.subpaths.push({ points: [at(0)], straight: [true], closed: false });
    } else if (name === 'rectangle') {
      const [x, y, w, h] = values;
      const matrix = this.displayMatrix();
      const points: Point[] = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
        .map(([px, py]) => apply(matrix, px, py));
      this.subpaths.push({ points, straight: [true, true, true, true], closed: true });
    } else if (name === 'closePath') {
      if (current) current.closed = true;
    } else if (current) {
      current.points.push(at(PATH_OPS[name].end));
      current.straight.push(name === 'lineTo');
    }
  }

  private paint(op: PaintOp) {
    if (op.close) this.subpaths.forEach((subpath) => { subpath.closed = true; });
    if (op.stroke || op.fill) this.emit(op.stroke, op.fill);
    this.subpaths = [];
  }

  private emit(stroked: boolean, filled: boolean) {
    const matrix = this.displayMatrix();
    const scale = Math.sqrt(Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2]));
    const lineWidth = this.state.lineWidth * scale;
    for (const subpath of this.subpaths) {
      if (stroked) this.segments.push(...segmentsOf(subpath, lineWidth));
      const rect = rectangleOf(subpath, filled);
      if (!rect) continue;
      this.rects.push({
        rect,
        lineWidth,
        stroked,
        filled,
        ...(filled ? { fill: [...this.state.fill] as Rgb } : {}),
      });
    }
  }
}

interface PdfJsTextItem {
  str?: string;
  transform?: number[];
  width?: number;
}

const toPageText = (item: PdfJsTextItem, viewport: Matrix): PageText | null => {
  const text = item.str?.trim();
  const itemMatrix = toMatrix(item.transform);
  if (!text || !itemMatrix) return null;
  const matrix = multiply(viewport, itemMatrix);
  const directionLength = Math.hypot(matrix[0], matrix[1]) || 1;
  const width = Math.abs(item.width ?? 0);
  const base: Point = [matrix[4], matrix[5]];
  const along: Point = [
    (matrix[0] / directionLength) * width,
    (matrix[1] / directionLength) * width,
  ];
  const up: Point = [matrix[2], matrix[3]];
  return {
    text,
    rect: bounds([
      base,
      [base[0] + along[0], base[1] + along[1]],
      [base[0] + up[0], base[1] + up[1]],
      [base[0] + along[0] + up[0], base[1] + along[1] + up[1]],
    ]),
  };
};

interface PdfJsAnnotation {
  subtype?: string;
  titleObj?: { str?: string };
  contentsObj?: { str?: string };
  rect?: number[];
}

/**
 * AutoCAD draws SHX-font text as strokes and exports the characters as invisible
 * Square annotations titled "AutoCAD SHX Text" over the glyphs.
 */
const SHX_TEXT_TITLE = 'AutoCAD SHX Text';

const toAnnotationText = (annotation: PdfJsAnnotation, viewport: Matrix): PageText | null => {
  const text = annotation.contentsObj?.str?.trim();
  const rect = annotation.rect;
  const isShxText = annotation.titleObj?.str === SHX_TEXT_TITLE;
  if (!isShxText || !text || rect?.length !== 4) return null;
  const [x0, y0, x1, y1] = rect;
  return { text, rect: bounds([apply(viewport, x0, y0), apply(viewport, x1, y1)]) };
};

/**
 * Reduce one PDF page to display-space text boxes (native text and AutoCAD SHX text
 * annotations), stroked straight segments, and axis-aligned rectangles (stroked or
 * filled, with fill colour).
 */
export const extractPdfPageGeometry = async (
  page: PdfPageLike,
  ops: PdfOps,
): Promise<PdfPageGeometry> => {
  const viewport = page.getViewport({ scale: 1 });
  const viewportMatrix = toMatrix(viewport.transform) ?? IDENTITY;
  const [operatorList, textContent, annotations] = await Promise.all([
    page.getOperatorList(),
    page.getTextContent(),
    page.getAnnotations?.() ?? Promise.resolve([]),
  ]);
  const walker = new GeometryWalker(viewportMatrix, ops);
  walker.run(operatorList.fnArray, operatorList.argsArray);
  const texts = [
    ...(textContent.items as PdfJsTextItem[]).map((item) => toPageText(item, viewportMatrix)),
    ...(annotations as PdfJsAnnotation[]).map((item) => toAnnotationText(item, viewportMatrix)),
  ].filter((text): text is PageText => text !== null);
  return {
    width: viewport.width,
    height: viewport.height,
    texts,
    segments: walker.segments,
    rects: walker.rects,
  };
};
