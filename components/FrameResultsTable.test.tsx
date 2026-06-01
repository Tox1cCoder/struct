import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FrameResultsTable } from './FrameResultsTable';
import type { EditableFrameData, FrameData } from '../types';

describe('FrameResultsTable editing', () => {
  it('edits, adds, and deletes frame working rows', async () => {
    const user = userEvent.setup();
    const onRowChange = vi.fn();
    const onAddRow = vi.fn();
    const onDeleteRow = vi.fn();
    const initialRow: EditableFrameData = {
      rowId: 'frame-1', sourceKey: 'frame-1', sourceFileIds: ['image-1'], provenance: 'extracted', edited: false,
      frameName: 'FG1', b: '500', h: '600', topRebarD: 'D16', topRebarValue: '4',
      bottomRebarD: 'D16', bottomRebarValue: '4', stirrupD: 'D10', stirrupValue: '200',
    };

    const Harness = () => {
      const [row, setRow] = useState<EditableFrameData>(initialRow);
      return (
        <FrameResultsTable
          data={[row]}
          onRowChange={(id: string, patch: Partial<FrameData>) => {
            onRowChange(id, patch);
            setRow((r) => ({ ...r, ...patch, edited: true }));
          }}
          onAddRow={onAddRow}
          onDeleteRow={onDeleteRow}
        />
      );
    };

    render(<Harness />);

    await user.clear(screen.getByLabelText('FG1 B'));
    await user.type(screen.getByLabelText('FG1 B'), '550');
    await user.click(screen.getByRole('button', { name: 'Add frame row' }));
    await user.click(screen.getByRole('button', { name: 'Delete FG1' }));

    expect(onRowChange).toHaveBeenCalledWith('frame-1', expect.objectContaining({ b: '550' }));
    expect(onAddRow).toHaveBeenCalledTimes(1);
    expect(onDeleteRow).toHaveBeenCalledWith('frame-1');
  });
});
