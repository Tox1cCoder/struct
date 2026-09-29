import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import {
  extractCertifiedCoordinateData,
  extractDataFromPdf,
  extractFoundationPlanCoordinateData,
  extractFrameData,
} from '../services/geminiService';
import {
  extractCertifiedPlacementMap,
  extractFoundationPlanGeometry,
} from '../services/foundationPriorityGeometry';
import type { PriorityPipelineDiagnostics } from '../types';

vi.mock('../services/geminiService', () => ({
  extractCertifiedCoordinateData: vi.fn(),
  extractDataFromPdf: vi.fn(),
  extractFoundationPlanCoordinateData: vi.fn(),
  extractFrameData: vi.fn(),
}));

vi.mock('../services/foundationPriorityGeometry', () => ({
  extractCertifiedPlacementMap: vi.fn(),
  extractFoundationPlanGeometry: vi.fn(),
  PriorityGeometryUnavailableError: class extends Error {},
}));

const geometryDiagnostics = (role: 'certified' | 'plan'): PriorityPipelineDiagnostics => ({
  fileName: `${role}.pdf`,
  role,
  model: 'vector-geometry',
  anchorMode: 'native',
  anchorCounts: {
    foundation: 0, 'plan-column': 0, 'certified-column': 0, 'x-axis': 0, 'y-axis': 0,
  },
  cropCount: 0,
  stages: { totalMs: 50 },
  passUsed: 'primary',
});

describe('App foundation priority tab', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  beforeEach(() => {
    vi.mocked(extractDataFromPdf).mockResolvedValue([]);
    vi.mocked(extractFrameData).mockResolvedValue([]);
    vi.mocked(extractCertifiedCoordinateData).mockResolvedValue({
      data: [],
      diagnostics: {
        fileName: 'trai.pdf',
        role: 'certified',
        model: 'gemini-3.1-pro-preview',
        anchorMode: 'unavailable',
        anchorCounts: { foundation: 0, 'plan-column': 0, 'certified-column': 0, 'x-axis': 0, 'y-axis': 0 },
        cropCount: 0,
        stages: { totalMs: 1000 },
        passUsed: 'primary',
      },
    });
    vi.mocked(extractFoundationPlanCoordinateData).mockResolvedValue({
      data: [],
      diagnostics: {
        fileName: 'phai.pdf',
        role: 'plan',
        model: 'gemini-3.1-pro-preview',
        anchorMode: 'unavailable',
        anchorCounts: { foundation: 0, 'plan-column': 0, 'certified-column': 0, 'x-axis': 0, 'y-axis': 0 },
        cropCount: 0,
        stages: { totalMs: 1000 },
        passUsed: 'primary',
      },
    });
    vi.mocked(extractCertifiedPlacementMap).mockRejectedValue(new Error('no placement page'));
    vi.mocked(extractFoundationPlanGeometry).mockRejectedValue(new Error('no plan page'));
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:test'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
  });

  it('joins plan geometry with a certified placement map uploaded after the plan', async () => {
    vi.mocked(extractFoundationPlanGeometry).mockResolvedValue({
      geometry: {
        page: 1,
        pageWidth: 842,
        pageHeight: 595,
        gridX: [{ name: 'X1', position: 100 }, { name: 'X2', position: 200 }],
        gridY: [{ name: 'Y2', position: 100 }, { name: 'Y1', position: 200 }],
        footings: [{ id: 'f0', label: 'F1', rect: { x0: 90, y0: 90, x1: 110, y1: 110 } }],
        unassignedLabels: [],
        unlabelledFootings: [],
      },
      diagnostics: geometryDiagnostics('plan'),
    });
    vi.mocked(extractCertifiedPlacementMap).mockResolvedValue({
      placementMap: {
        page: 1,
        pageWidth: 1191,
        pageHeight: 842,
        gridCandidates: { x: [210, 410], y: [110, 310] },
        gridLabels: { x: [], y: [] },
        markers: [
          { id: 'm0', code: 'C3', fill: [0, 255, 0], rect: { x0: 201, y0: 103, x1: 221, y1: 119 } },
        ],
      },
      diagnostics: geometryDiagnostics('certified'),
    });

    render(<App />);
    fireEvent.click(screen.getAllByRole('button', { name: /Foundation Priority/i })[0]);
    fireEvent.change(screen.getByLabelText('Upload Foundation Plan PDFs'), {
      target: { files: [new File(['plan'], 'phai.pdf', { type: 'application/pdf' })] },
    });
    expect(await screen.findByText('1 ok')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Upload Certified Column Base PDFs'), {
      target: { files: [new File(['certified'], 'trai.pdf', { type: 'application/pdf' })] },
    });

    expect(await screen.findByLabelText('F1 codes')).toHaveValue('C3');
    expect(extractCertifiedCoordinateData).not.toHaveBeenCalled();
    expect(extractFoundationPlanCoordinateData).not.toHaveBeenCalled();
  });

  it('shows an explicit empty result after both priority sources finish without resolved mappings', async () => {
    render(<App />);

    fireEvent.click(screen.getAllByRole('button', { name: /Foundation Priority/i })[0]);
    fireEvent.change(screen.getByLabelText('Upload Certified Column Base PDFs'), {
      target: { files: [new File(['certified'], 'trai.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.change(screen.getByLabelText('Upload Foundation Plan PDFs'), {
      target: { files: [new File(['plan'], 'phai.pdf', { type: 'application/pdf' })] },
    });

    await waitFor(() => {
      expect(extractCertifiedCoordinateData).toHaveBeenCalledTimes(1);
      expect(extractFoundationPlanCoordinateData).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText('No resolved foundation mappings yet.')).toBeInTheDocument();
  });

  it('does not render blank foundation rows when plan labels have no resolved codes', async () => {
    vi.mocked(extractFoundationPlanCoordinateData).mockResolvedValue({
      data: [{ foundation: 'F1', xAxis: 'X1', yAxis: 'Y1', planColumnType: '' }],
      diagnostics: {
        fileName: 'phai.pdf',
        role: 'plan',
        model: 'gemini-3.1-pro-preview',
        anchorMode: 'unavailable',
        anchorCounts: { foundation: 0, 'plan-column': 0, 'certified-column': 0, 'x-axis': 0, 'y-axis': 0 },
        cropCount: 0,
        stages: { totalMs: 1000 },
        passUsed: 'primary',
      },
    });

    render(<App />);

    fireEvent.click(screen.getAllByRole('button', { name: /Foundation Priority/i })[0]);
    fireEvent.change(screen.getByLabelText('Upload Certified Column Base PDFs'), {
      target: { files: [new File(['certified'], 'trai.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.change(screen.getByLabelText('Upload Foundation Plan PDFs'), {
      target: { files: [new File(['plan'], 'phai.pdf', { type: 'application/pdf' })] },
    });

    expect(await screen.findByText('No resolved foundation mappings yet.')).toBeInTheDocument();
    expect(screen.queryByLabelText('F1 codes')).not.toBeInTheDocument();
  });

  it('shows incomplete plan coverage as a warning while keeping the file successful', async () => {
    vi.mocked(extractFoundationPlanCoordinateData).mockResolvedValue({
      data: [{ foundation: 'F1', xAxis: 'X1', yAxis: 'Y1', planColumnType: 'FC1' }],
      diagnostics: {
        fileName: 'phai.pdf',
        role: 'plan',
        model: 'gemini-3.1-pro-preview',
        anchorMode: 'native',
        anchorCounts: { foundation: 3, 'plan-column': 1, 'certified-column': 0, 'x-axis': 1, 'y-axis': 1 },
        cropCount: 2,
        coverage: {
          mode: 'anchored', expectedCount: 3, returnedCount: 1,
          coordinateCount: 1, codeCount: 1, missingLabels: ['F2', 'F3'], unresolvedLabels: [],
        },
        warning: 'Foundation coverage is incomplete',
        stages: { totalMs: 1000 },
        passUsed: 'escalated',
      },
    });

    render(<App />);
    fireEvent.click(screen.getAllByRole('button', { name: /Foundation Priority/i })[0]);
    fireEvent.change(screen.getByLabelText('Upload Foundation Plan PDFs'), {
      target: { files: [new File(['plan'], 'phai.pdf', { type: 'application/pdf' })] },
    });

    expect(await screen.findByText(/Foundation coverage is incomplete/)).toBeInTheDocument();
    expect(screen.getByText(/F2, F3/)).toBeInTheDocument();
    expect(screen.getByText('1 ok')).toBeInTheDocument();
  });

  it('renders separate FW and FG schedules when both types are uploaded', async () => {
    vi.mocked(extractFrameData).mockResolvedValue([
      {
        frameType: 'FW', frameName: 'FW1', b: '300', h: '350',
        fwBaseRebarDiameter: '13', fwVerticalRebarDiameter: '13',
        fwHorizontalRebarCount: '3', fwHorizontalRebarDiameter: '10',
      },
      {
        frameType: 'FG', frameName: 'FG1', b: '600', h: '600',
        fgTopRebarDiameter: '25', fgBottomRebarDiameter: '25',
        fgStirrupDiameter: '13', fgStirrupMaxDistance: '150',
        fgBellyRebarDiameter: '13', fgWidthStopRebarDiameter: '10',
        fgWidthStopRebarMaxDistance: '1000',
      },
    ]);

    render(<App />);
    fireEvent.click(screen.getAllByRole('button', { name: /Frame \(FW\/FG\)/i })[0]);
    fireEvent.drop(screen.getByTestId('frame-dropzone'), {
      dataTransfer: { files: [new File(['image'], 'frames.png', { type: 'image/png' })] },
    });

    expect(await screen.findByLabelText('FW1 FW_ヨコ筋_本数')).toBeInTheDocument();
    expect(await screen.findByLabelText('FG1 FG_巾止筋_距離_最大')).toBeInTheDocument();
    expect(screen.queryByLabelText('FW1 FG_上端筋_直径')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('FG1 FW_ヨコ筋_本数')).not.toBeInTheDocument();
  });
});
