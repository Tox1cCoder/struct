const getStatusSuffix = (error: unknown) => {
  if (typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number') {
    return ` (HTTP ${error.status})`;
  }

  return '';
};

export const getErrorMessage = (error: unknown, fallback = 'Processing failed') => {
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }

  if (error instanceof Error && error.message.trim()) {
    return `${error.message.trim()}${getStatusSuffix(error)}`;
  }

  if (typeof error === 'object' && error !== null) {
    if ('message' in error && typeof error.message === 'string' && error.message.trim()) {
      return `${error.message.trim()}${getStatusSuffix(error)}`;
    }

    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== '{}') {
        return serialized;
      }
    } catch {
      return fallback;
    }
  }

  return fallback;
};

export const logError = (
  context: string,
  error: unknown,
  options: { handled?: boolean } = {},
) => {
  if (!options.handled) {
    console.error(context, error);
  }
};
