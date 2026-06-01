import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FoundationPriorityTextResult } from './FoundationPriorityTextResult';
import type { FoundationPriorityWorkingRow } from '../types';

describe('FoundationPriorityTextResult', () => {
  it('edits final rows while exposing source evidence', async () => {
    const user = userEvent.setup();
    const onRowChange = vi.fn();
    const onAddRow = vi.fn();
    const onDeleteRow = vi.fn();
    const onEvidenceSelect = vi.fn();
    const initialRow: FoundationPriorityWorkingRow = {
      rowId: 'priority:F1', sourceKey: 'priority:F1', sourceFileIds: ['right', 'left'],
      provenance: 'extracted', edited: false, foundation: 'F1', codes: ['FC1', 'C3009'],
      resolutions: [{
        columnType: 'C3009', method: 'certified-fallback',
        locations: [{
          evidenceId: 'F1:X1:Y1',
          plan: { fileId: 'right', role: 'plan', xAxis: 'X1', yAxis: 'Y1', page: 1 },
          certified: { fileId: 'left', role: 'certified', xAxis: 'X1', yAxis: 'Y1', page: 2 },
        }],
      }],
    };

    const Harness = () => {
      const [row, setRow] = useState<FoundationPriorityWorkingRow>(initialRow);
      return (
        <FoundationPriorityTextResult
          rows={[row]}
          text={`${row.foundation}: ${row.codes.join(', ')}`}
          onRowChange={(rowId, patch) => {
            onRowChange(rowId, patch);
            setRow((r) => ({ ...r, ...patch, edited: true }));
          }}
          onAddRow={onAddRow}
          onDeleteRow={onDeleteRow}
          onEvidenceSelect={onEvidenceSelect}
        />
      );
    };

    render(<Harness />);

    expect(screen.getByDisplayValue('F1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('FC1, C3009')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show evidence for F1' }));
    await user.click(screen.getByRole('button', { name: 'View C3009 location 1 in foundation plan' }));
    expect(onEvidenceSelect).toHaveBeenCalledWith(
      expect.objectContaining({ plan: expect.objectContaining({ role: 'plan' }) }),
    );
    await user.clear(screen.getByLabelText('F1 codes'));
    await user.type(screen.getByLabelText('F1 codes'), 'FC1, C3010');
    expect(onRowChange).toHaveBeenLastCalledWith(
      'priority:F1',
      expect.objectContaining({ codes: ['FC1', 'C3010'] }),
    );
    await user.click(screen.getByRole('button', { name: 'Add foundation' }));
    await user.click(screen.getByRole('button', { name: 'Delete F1' }));
    expect(onAddRow).toHaveBeenCalledTimes(1);
    expect(onDeleteRow).toHaveBeenCalledWith('priority:F1');
  });
});
