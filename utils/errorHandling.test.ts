import { afterEach, describe, expect, it, vi } from 'vitest';
import { getErrorMessage, logError } from './errorHandling';

describe('getErrorMessage', () => {
  it('returns the message from a standard Error', () => {
    expect(getErrorMessage(new Error('Request failed'))).toBe('Request failed');
  });

  it('includes HTTP status when present on an Error-like object', () => {
    const error = Object.assign(new Error('Bad Request'), { status: 400 });
    expect(getErrorMessage(error)).toBe('Bad Request (HTTP 400)');
  });

  it('reads message and status from plain objects', () => {
    expect(getErrorMessage({ message: 'Upload rejected', status: 413 })).toBe('Upload rejected (HTTP 413)');
  });

  it('falls back to a provided default for unhelpful values', () => {
    expect(getErrorMessage({} as Record<string, never>, 'Fallback message')).toBe('Fallback message');
  });
});

describe('logError', () => {
  afterEach(() => vi.restoreAllMocks());

  it('does not write a handled user-visible processing failure to the console', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    logError('PDF extraction failed', new Error('Bad response'), { handled: true });
    expect(spy).not.toHaveBeenCalled();
  });

  it('reports unexpected failures once for diagnosis', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    logError('Viewer crashed', new Error('Render failed'));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
