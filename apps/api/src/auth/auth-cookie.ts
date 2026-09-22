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

export function serializeAuthCookie(token: string, maxAgeSeconds: number, secure: boolean): string {
  const encoded = encodeURIComponent(token);
  return [
    `${AUTH_COOKIE_NAME}=${encoded}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

export function clearAuthCookie(secure: boolean): string {
  return [
    `${AUTH_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}
