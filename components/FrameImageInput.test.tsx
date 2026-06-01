import { fireEvent, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FrameImageInput } from './FrameImageInput';

describe('FrameImageInput', () => {
  it('accepts drops while another frame result is processing', async () => {
    const onImagePaste = vi.fn();
    const { getByTestId } = render(
      <FrameImageInput
        results={[{ id: 'a', imagePreview: 'data:image/png;base64,AA==', status: 'PROCESSING', data: [] }]}
        onImagePaste={onImagePaste}
        onClear={vi.fn()}
        isActiveTab
      />,
    );

    fireEvent.drop(getByTestId('frame-dropzone'), {
      dataTransfer: { files: [new File(['image'], 'second.png', { type: 'image/png' })] },
    });

    await waitFor(() => expect(onImagePaste).toHaveBeenCalledTimes(1));
  });
});
