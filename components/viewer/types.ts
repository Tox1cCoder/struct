import { BoundingBox, ProcessingStatus } from '../../types';

export type ViewerAccent = 'indigo' | 'amber' | 'cyan' | 'emerald' | 'violet';

export interface ViewerFile {
  id: string;
  fileName: string;
  status: ProcessingStatus;
  sourceUrl?: string;
  sourceMimeType?: string;
  pageCount?: number;
  itemCount?: number;
  error?: string;
  group?: string;
}

export interface ViewerSelection {
  fileId: string;
  page?: number;
  bbox?: BoundingBox;
  rowKey?: string;
}

export const ACCENT_CLASSES: Record<ViewerAccent, {
  bg: string;
  bgSoft: string;
  border: string;
  text: string;
  ring: string;
  bboxStroke: string;
  bboxFill: string;
}> = {
  indigo: {
    bg: 'bg-indigo-500',
    bgSoft: 'bg-indigo-50',
    border: 'border-indigo-300',
    text: 'text-indigo-700',
    ring: 'ring-indigo-500',
    bboxStroke: 'rgb(99, 102, 241)',
    bboxFill: 'rgba(99, 102, 241, 0.18)',
  },
  amber: {
    bg: 'bg-amber-500',
    bgSoft: 'bg-amber-50',
    border: 'border-amber-300',
    text: 'text-amber-700',
    ring: 'ring-amber-500',
    bboxStroke: 'rgb(245, 158, 11)',
    bboxFill: 'rgba(245, 158, 11, 0.20)',
  },
  cyan: {
    bg: 'bg-cyan-500',
    bgSoft: 'bg-cyan-50',
    border: 'border-cyan-300',
    text: 'text-cyan-700',
    ring: 'ring-cyan-500',
    bboxStroke: 'rgb(6, 182, 212)',
    bboxFill: 'rgba(6, 182, 212, 0.18)',
  },
  emerald: {
    bg: 'bg-emerald-500',
    bgSoft: 'bg-emerald-50',
    border: 'border-emerald-300',
    text: 'text-emerald-700',
    ring: 'ring-emerald-500',
    bboxStroke: 'rgb(16, 185, 129)',
    bboxFill: 'rgba(16, 185, 129, 0.18)',
  },
  violet: {
    bg: 'bg-violet-500',
    bgSoft: 'bg-violet-50',
    border: 'border-violet-300',
    text: 'text-violet-700',
    ring: 'ring-violet-500',
    bboxStroke: 'rgb(139, 92, 246)',
    bboxFill: 'rgba(139, 92, 246, 0.18)',
  },
};
