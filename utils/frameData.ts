import { FrameData } from '../types';

type RawFrameData = Record<string, unknown>;

const clean = (value: unknown) => String(value ?? '').replace(/\s*[（(].*?[）)]/g, '').trim();

const numberAfterD = (value: unknown, fallback = '') => {
  const text = clean(value);
  return text.match(/D\s*(\d+(?:\.\d+)?)/i)?.[1] ?? (/^\d+(?:\.\d+)?$/.test(text) ? text : fallback);
};

const maximumDistance = (value: unknown) => {
  const text = clean(value);
  return text.match(/@\s*([\d,]+)/)?.[1] ?? (/^[\d,]+$/.test(text) ? text : '');
};

export const normalizeFrameData = (raw: RawFrameData): FrameData | null => {
  const frameType = raw.frameType === 'FW' || raw.frameType === 'FG' ? raw.frameType : null;
  const frameName = clean(raw.frameName);
  const b = clean(raw.b);
  const h = clean(raw.h);

  if (!frameType || !frameName || !b || !h) return null;

  const common = { frameName, b, h, bbox: raw.bbox as FrameData['bbox'] };

  if (frameType === 'FW') {
    return {
      ...common,
      frameType,
      fwBaseRebarDiameter: '13',
      fwVerticalRebarDiameter: numberAfterD(raw.fwVerticalRebarDiameter, '13'),
      fwHorizontalRebarCount: clean(raw.fwHorizontalRebarCount) || '0',
      fwHorizontalRebarDiameter: numberAfterD(raw.fwHorizontalRebarDiameter, '10'),
    };
  }

  return {
    ...common,
    frameType,
    fgTopRebarDiameter: numberAfterD(raw.fgTopRebarDiameter),
    fgBottomRebarDiameter: numberAfterD(raw.fgBottomRebarDiameter),
    fgStirrupDiameter: numberAfterD(raw.fgStirrupDiameter),
    fgStirrupMaxDistance: maximumDistance(raw.fgStirrupMaxDistance),
    fgBellyRebarDiameter: numberAfterD(raw.fgBellyRebarDiameter),
    fgWidthStopRebarDiameter: numberAfterD(raw.fgWidthStopRebarDiameter),
    fgWidthStopRebarMaxDistance: maximumDistance(raw.fgWidthStopRebarMaxDistance),
  };
};

export const createManualFrameData = (frameType: FrameData['frameType']): FrameData => {
  if (frameType === 'FW') {
    return {
      frameType,
      frameName: '',
      b: '',
      h: '',
      fwBaseRebarDiameter: '13',
      fwVerticalRebarDiameter: '13',
      fwHorizontalRebarCount: '0',
      fwHorizontalRebarDiameter: '10',
    };
  }

  return {
    frameType,
    frameName: '',
    b: '',
    h: '',
    fgTopRebarDiameter: '',
    fgBottomRebarDiameter: '',
    fgStirrupDiameter: '',
    fgStirrupMaxDistance: '',
    fgBellyRebarDiameter: '',
    fgWidthStopRebarDiameter: '',
    fgWidthStopRebarMaxDistance: '',
  };
};
