import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Document, Page } from 'react-pdf';
import './pdfjsWorker';
import { BboxOverlay } from './BboxOverlay';
import { ViewerAccent, ViewerFile, ViewerSelection } from './types';

const pdfOptions = {
  cMapUrl: `${import.meta.env.BASE_URL}pdfjs/cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${import.meta.env.BASE_URL}pdfjs/standard_fonts/`,
};

interface DocumentViewerProps {
  file: ViewerFile;
  selection: ViewerSelection | null;
  accent: ViewerAccent;
  zoom: number;
  onPageCountChange: (fileId: string, pageCount: number) => void;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({
  file,
  selection,
  accent,
  zoom,
  onPageCountChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [renderSize, setRenderSize] = useState({ width: 0, height: 0 });
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const isPdf = file.sourceMimeType === 'application/pdf';
  const isImage = file.sourceMimeType?.startsWith('image/') ?? false;
  const page = selection?.page ?? 1;
  const bbox = selection?.bbox;

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const update = () => setRenderSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [file.id, page, zoom, imageLoaded]);

  useEffect(() => {
    setPdfError(null);
    setImageError(false);
    setImageLoaded(false);
  }, [file.id]);

  useEffect(() => {
    if (!bbox || renderSize.width === 0 || renderSize.height === 0) return;
    const container = containerRef.current;
    if (!container) return;
    const targetX = (bbox.xmin / 1000) * renderSize.width - container.clientWidth / 2 + ((bbox.xmax - bbox.xmin) / 1000) * renderSize.width / 2;
    const targetY = (bbox.ymin / 1000) * renderSize.height - container.clientHeight / 2 + ((bbox.ymax - bbox.ymin) / 1000) * renderSize.height / 2;
    container.scrollTo({
      left: Math.max(0, targetX),
      top: Math.max(0, targetY),
      behavior: 'smooth',
    });
  }, [bbox, renderSize.width, renderSize.height, page]);

  if (!file.sourceUrl) {
    return (
      <EmptyState
        title="Source not available"
        message="The original file is no longer available for preview. Re-upload the document to view it again."
      />
    );
  }

  const renderWidth = Math.max(160, containerWidth * zoom);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-auto bg-gray-100">
      <div className="flex min-h-full justify-center p-4">
        <div ref={contentRef} className="relative inline-block bg-white shadow-md">
          {isPdf && (
            <Document
              file={file.sourceUrl}
              options={pdfOptions}
              loading={<PdfLoading />}
              error={<EmptyState title="Failed to load PDF" message={pdfError ?? 'The PDF could not be rendered.'} />}
              onLoadError={(error) => setPdfError(error.message)}
              onLoadSuccess={(pdf) => onPageCountChange(file.id, pdf.numPages)}
            >
              <Page
                pageNumber={page}
                width={renderWidth}
                loading={<PdfLoading />}
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />
            </Document>
          )}
          {isImage && !imageError && (
            <img
              src={file.sourceUrl}
              alt={file.fileName}
              style={{ width: renderWidth, height: 'auto', display: 'block' }}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
            />
          )}
          {isImage && imageError && (
            <EmptyState title="Failed to load image" message="The image source could not be displayed." />
          )}
          {!isPdf && !isImage && (
            <EmptyState title="Unsupported file type" message={file.sourceMimeType ?? 'Unknown'} />
          )}
          {bbox && renderSize.width > 0 && (
            <BboxOverlay
              bbox={bbox}
              containerWidth={renderSize.width}
              containerHeight={renderSize.height}
              accent={accent}
            />
          )}
        </div>
      </div>
    </div>
  );
};

const PdfLoading: React.FC = () => (
  <div className="flex h-64 w-full items-center justify-center bg-gray-50">
    <svg className="h-8 w-8 animate-spin text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  </div>
);

const EmptyState: React.FC<{ title: string; message: string }> = ({ title, message }) => (
  <div className="flex h-64 w-full items-center justify-center px-6 text-center">
    <div>
      <p className="text-sm font-semibold text-gray-700">{title}</p>
      <p className="mt-1 text-xs text-gray-500">{message}</p>
    </div>
  </div>
);
