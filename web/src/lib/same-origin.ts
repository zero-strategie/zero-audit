const firstValue = (header: string): string => header.split(',')[0]?.trim() ?? '';

const originHost = (origin: string): string | null => {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
};

/**
 * CSRF guard for form posts: the Origin must name the host the visitor used.
 * Reads the raw headers because behind the reverse proxy Astro.url shows the internal address.
 */
export const isSameOrigin = (request: Request): boolean => {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const expected = firstValue(
    request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '',
  );
  return expected !== '' && originHost(origin) === expected;
};
