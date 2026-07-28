/**
 * Copy text to the clipboard, tolerating the environments the async
 * Clipboard API is unavailable in.
 *
 * `navigator.clipboard` only exists in a secure context, so it is simply
 * undefined when the app is opened over plain http on a LAN address such as
 * http://192.168.2.199:5173 — exactly how a dev server is usually shared. It
 * can also reject when the document is not focused or permission is denied.
 * In those cases fall back to a hidden textarea plus the legacy
 * `document.execCommand('copy')`, which has no secure-context requirement.
 *
 * Returns true only when the text actually reached the clipboard, so callers
 * can surface a real failure instead of silently doing nothing.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the legacy path below.
    }
  }
  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  if (typeof document.execCommand !== 'function') return false;

  const textarea = document.createElement('textarea');
  textarea.value = text;
  // Keep it off-screen but still selectable: display:none would break selection.
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);

  const previousSelection = document.activeElement as HTMLElement | null;
  try {
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
    previousSelection?.focus?.();
  }
}
