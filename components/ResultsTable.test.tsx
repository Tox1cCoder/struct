import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ResultsTable } from './ResultsTable';

describe('ResultsTable editing', () => {
  it('sends corrected fields and delete actions by row ID', async () => {
    const user = userEvent.setup();
    const onRowChange = vi.fn();
    const onDeleteRow = vi.fn();
    render(<ResultsTable data={[{
      rowId: 'row-1', sourceKey: 'key-1', sourceFileIds: ['file-1'], provenance: 'extracted', edited: false,
      foundation: 'F1', columnType: 'FC1', dimensionWidth: '700', dimensionHeight: '700',
      mainReinforcementCount: '24', mainReinforcementSize: 'D25', hoopReinforcementSize: 'D13', hoopReinforcementSpacing: '100',
    }]} hasFoundationData onRowChange={onRowChange} onDeleteRow={onDeleteRow} onAddRow={vi.fn()} />);
    await user.clear(screen.getByLabelText('F1 column type'));
    await user.type(screen.getByLabelText('F1 column type'), 'FC2');
    await user.click(screen.getByRole('button', { name: 'Delete F1' }));
    expect(onRowChange).toHaveBeenCalled();
    expect(onDeleteRow).toHaveBeenCalledWith('row-1');
  });
});
