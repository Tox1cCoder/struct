import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FileUpload } from './FileUpload';

describe('FileUpload', () => {
  it('accepts another file selection while other jobs are described as processing', () => {
    const onFilesSelect = vi.fn();
    render(
      <FileUpload
        onFilesSelect={onFilesSelect}
        title="Upload PDFs"
        zoneId="test"
        isActiveTab
        allowPaste={false}
      />,
    );

    const input = screen.getByLabelText('Upload PDFs');
    fireEvent.change(input, { target: { files: [new File(['a'], 'a.pdf', { type: 'application/pdf' })] } });
    fireEvent.change(input, { target: { files: [new File(['b'], 'b.pdf', { type: 'application/pdf' })] } });

    expect(onFilesSelect).toHaveBeenCalledTimes(2);
  });
});
