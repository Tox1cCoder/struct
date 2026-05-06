import React from 'react';
import { BoundingBox } from '../../types';
import { ACCENT_CLASSES, ViewerAccent } from './types';

interface BboxOverlayProps {
  bbox: BoundingBox;
  containerWidth: number;
  containerHeight: number;
  accent: ViewerAccent;
}

export const BboxOverlay: React.FC<BboxOverlayProps> = ({ bbox, containerWidth, containerHeight, accent }) => {
  if (containerWidth <= 0 || containerHeight <= 0) return null;

  const colors = ACCENT_CLASSES[accent];
  const x = (bbox.xmin / 1000) * containerWidth;
  const y = (bbox.ymin / 1000) * containerHeight;
  const w = ((bbox.xmax - bbox.xmin) / 1000) * containerWidth;
  const h = ((bbox.ymax - bbox.ymin) / 1000) * containerHeight;

  return (
    <svg
      className="pointer-events-none absolute inset-0"
      width={containerWidth}
      height={containerHeight}
      style={{ overflow: 'visible' }}
    >
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill={colors.bboxFill}
        stroke={colors.bboxStroke}
        strokeWidth={2}
        strokeDasharray="6 4"
        rx={2}
      >
        <animate attributeName="stroke-dashoffset" from="0" to="-20" dur="1.2s" repeatCount="indefinite" />
      </rect>
    </svg>
  );
};
