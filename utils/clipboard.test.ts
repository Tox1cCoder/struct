import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyTextToClipboard } from './clipboard';

/** Replace navigator.clipboard, which jsdom does not define by default. */
function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', {
    value,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  setClipboard(undefined);
  vi.restoreAllMocks();
  // execCommand is not implemented in jsdom; drop any stub we installed.
  delete (document as unknown as Record<string, unknown>).execCommand;
});

describe('copyTextToClipboard', () => {
  it('uses the async Clipboard API when it is available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });

    await expect(copyTextToClipboard('F1: FC1')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('F1: FC1');
  });

  it('falls back to execCommand when navigator.clipboard is missing', async () => {
    // What actually happens on http://<lan-ip>:5173 — the API simply is not there.
    setClipboard(undefined);
    const execCommand = vi.fn().mockReturnValue(true);
    (document as unknown as Record<string, unknown>).execCommand = execCommand;

    await expect(copyTextToClipboard('F1: FC1')).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('falls back to execCommand when writeText rejects', async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('NotAllowedError')) });
    const execCommand = vi.fn().mockReturnValue(true);
    (document as unknown as Record<string, unknown>).execCommand = execCommand;

    await expect(copyTextToClipboard('F1: FC1')).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('reports failure when both paths are unavailable', async () => {
    setClipboard(undefined);
    await expect(copyTextToClipboard('F1: FC1')).resolves.toBe(false);
  });

  it('reports failure when execCommand refuses the copy', async () => {
    setClipboard(undefined);
    (document as unknown as Record<string, unknown>).execCommand = vi.fn().mockReturnValue(false);
    await expect(copyTextToClipboard('F1: FC1')).resolves.toBe(false);
  });

  it('leaves no scratch textarea behind', async () => {
    setClipboard(undefined);
    (document as unknown as Record<string, unknown>).execCommand = vi.fn().mockReturnValue(true);

    await copyTextToClipboard('F1: FC1');
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });

  it('copies the exact multi-line text it was given', async () => {
    setClipboard(undefined);
    let captured = '';
    (document as unknown as Record<string, unknown>).execCommand = vi.fn(() => {
      captured = (document.querySelector('textarea') as HTMLTextAreaElement).value;
      return true;
    });

    await copyTextToClipboard('F1: FC1\nF2: FC2');
    expect(captured).toBe('F1: FC1\nF2: FC2');
  });
});
