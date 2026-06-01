import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ViewerSidebar } from './ViewerSidebar';

vi.mock('./DocumentViewer', () => ({ DocumentViewer: () => <div>document</div> }));

describe('ViewerSidebar evidence source switch', () => {
  it('defaults to plan evidence and switches to matching certified evidence', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    render(
      <ViewerSidebar
        files={[
          { id: 'right', fileName: 'Right.pdf', status: 'SUCCESS', sourceMimeType: 'application/pdf' },
          { id: 'left', fileName: 'Left.pdf', status: 'SUCCESS', sourceMimeType: 'application/pdf' },
        ]}
        selection={{
          fileId: 'right', page: 1, sourceRole: 'plan',
          alternates: [
            { fileId: 'right', page: 1, sourceRole: 'plan', label: '基礎伏図' },
            { fileId: 'left', page: 2, sourceRole: 'certified', label: '認定柱脚資料' },
          ],
        }}
        onSelectionChange={onSelectionChange}
        accent="cyan"
        collapsed={false}
        onCollapsedChange={vi.fn()}
        width={460}
        onWidthChange={vi.fn()}
        onPageCountResolved={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '基礎伏図' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: '認定柱脚資料' }));
    expect(onSelectionChange).toHaveBeenCalledWith(expect.objectContaining({ fileId: 'left', sourceRole: 'certified' }));
  });
});
