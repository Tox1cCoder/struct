import { describe, expect, it } from 'vitest';
import { createManualFrameData, normalizeFrameData } from './frameData';

describe('normalizeFrameData', () => {
  it('applies FW defaults and strips D prefixes', () => {
    expect(
      normalizeFrameData({
        frameType: 'FW',
        frameName: 'FW2',
        b: '300',
        h: '350',
      }),
    ).toMatchObject({
      frameType: 'FW',
      fwBaseRebarDiameter: '13',
      fwVerticalRebarDiameter: '13',
      fwHorizontalRebarCount: '0',
      fwHorizontalRebarDiameter: '10',
    });

    expect(
      normalizeFrameData({
        frameType: 'FW',
        frameName: 'FW1',
        b: '300',
        h: '350',
        fwVerticalRebarDiameter: 'D13',
        fwHorizontalRebarCount: '3',
        fwHorizontalRebarDiameter: 'D10',
      }),
    ).toMatchObject({
      fwVerticalRebarDiameter: '13',
      fwHorizontalRebarCount: '3',
      fwHorizontalRebarDiameter: '10',
    });
  });

  it('normalizes all requested FG values from source-like text', () => {
    expect(
      normalizeFrameData({
        frameType: 'FG',
        frameName: 'FG1B',
        b: '600',
        h: '600',
        fgTopRebarDiameter: '7-D25',
        fgBottomRebarDiameter: 'D25',
        fgStirrupDiameter: 'D13',
        fgStirrupMaxDistance: 'D13@150',
        fgBellyRebarDiameter: '2-D13',
        fgWidthStopRebarDiameter: 'D10',
        fgWidthStopRebarMaxDistance: 'D10@1,000以内',
      }),
    ).toMatchObject({
      fgTopRebarDiameter: '25',
      fgBottomRebarDiameter: '25',
      fgStirrupDiameter: '13',
      fgStirrupMaxDistance: '150',
      fgBellyRebarDiameter: '13',
      fgWidthStopRebarDiameter: '10',
      fgWidthStopRebarMaxDistance: '1,000',
    });
  });
});

it('creates a complete manual FW row with required defaults', () => {
  expect(createManualFrameData('FW')).toMatchObject({
    frameType: 'FW',
    fwBaseRebarDiameter: '13',
    fwVerticalRebarDiameter: '13',
    fwHorizontalRebarCount: '0',
    fwHorizontalRebarDiameter: '10',
  });
});
