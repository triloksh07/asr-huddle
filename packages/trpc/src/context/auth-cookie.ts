import type { IncomingMessage } from 'node:http';

export const AUTH_COOKIE_NAME = 'asr_huddle_access_token';

export function readAuthCookie(request: IncomingMessage): string | null {
  const header = request.headers.cookie;
  if (!header) return null;

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;

    const name = part.slice(0, separator).trim();
    if (name !== AUTH_COOKIE_NAME) continue;

    const value = part.slice(separator + 1).trim();
    if (!value) return null;

    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }

  return null;
}
