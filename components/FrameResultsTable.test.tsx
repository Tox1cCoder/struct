import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FrameResultsTable } from './FrameResultsTable';
import type { EditableFrameData, FrameData } from '../types';

describe('FrameResultsTable editing', () => {
  it('edits FW fields and supports adding and deleting rows', async () => {
    const user = userEvent.setup();
    const onRowChange = vi.fn();
    const onAddRow = vi.fn();
    const onDeleteRow = vi.fn();
    const initialRow: EditableFrameData = {
      rowId: 'frame-1',
      sourceKey: 'frame-1',
      sourceFileIds: ['image-1'],
      provenance: 'extracted',
      edited: false,
      frameType: 'FW',
      frameName: 'FW1',
      b: '300',
      h: '350',
      fwBaseRebarDiameter: '13',
      fwVerticalRebarDiameter: '13',
      fwHorizontalRebarCount: '3',
      fwHorizontalRebarDiameter: '10',
    };

    const Harness = () => {
      const [row, setRow] = useState<EditableFrameData>(initialRow);
      return (
        <FrameResultsTable
          data={[row]}
          onRowChange={(id: string, patch: Partial<FrameData>) => {
            onRowChange(id, patch);
            setRow((current) => ({ ...current, ...patch, edited: true } as EditableFrameData));
          }}
          onAddRow={onAddRow}
          onDeleteRow={onDeleteRow}
        />
      );
    };

    render(<Harness />);

    const countInput = screen.getByLabelText('FW1 FW_ヨコ筋_本数');
    await user.clear(countInput);
    await user.type(countInput, '4');
    await user.click(screen.getByRole('button', { name: 'Add frame row' }));
    await user.click(screen.getByRole('button', { name: 'Delete FW1' }));

    expect(screen.queryByLabelText('FW1 FG_上端筋_直径')).not.toBeInTheDocument();
    expect(onRowChange).toHaveBeenCalledWith('frame-1', expect.objectContaining({ fwHorizontalRebarCount: '4' }));
    expect(onAddRow).toHaveBeenCalledTimes(1);
    expect(onDeleteRow).toHaveBeenCalledWith('frame-1');
  });

  it('edits FG fields without rendering FW columns', async () => {
    const user = userEvent.setup();
    const onRowChange = vi.fn();
    const row: EditableFrameData = {
      rowId: 'frame-2',
      sourceKey: 'frame-2',
      sourceFileIds: ['image-1'],
      provenance: 'extracted',
      edited: false,
      frameType: 'FG',
      frameName: 'FG1',
      b: '600',
      h: '600',
      fgTopRebarDiameter: '25',
      fgBottomRebarDiameter: '25',
      fgStirrupDiameter: '13',
      fgStirrupMaxDistance: '150',
      fgBellyRebarDiameter: '13',
      fgWidthStopRebarDiameter: '10',
      fgWidthStopRebarMaxDistance: '1000',
    };

    const Harness = () => {
      const [currentRow, setCurrentRow] = useState<EditableFrameData>(row);
      return (
        <FrameResultsTable
          data={[currentRow]}
          onRowChange={(id: string, patch: Partial<FrameData>) => {
            onRowChange(id, patch);
            setCurrentRow((current) => ({ ...current, ...patch, edited: true } as EditableFrameData));
          }}
        />
      );
    };

    render(<Harness />);

    const input = screen.getByLabelText('FG1 FG_巾止筋_距離_最大');
    await user.clear(input);
    await user.type(input, '1200');

    expect(screen.queryByLabelText('FG1 FW_ヨコ筋_本数')).not.toBeInTheDocument();
    expect(onRowChange).toHaveBeenCalledWith('frame-2', expect.objectContaining({ fgWidthStopRebarMaxDistance: '1200' }));
  });
});
