import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { JwtService } from '../../src/auth/jwt.js';

const SECRET = '01234567890123456789012345678901';
const ISSUER = 'asr-huddle-test';

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function sign(header: string, payload: string): string {
  return createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url');
}

function token(
  claims: Record<string, unknown>,
  header: Record<string, unknown> = { alg: 'HS256', typ: 'JWT' }
): string {
  const encodedHeader = base64url(header);
  const encodedPayload = base64url(claims);
  return `${encodedHeader}.${encodedPayload}.${sign(encodedHeader, encodedPayload)}`;
}

describe('JwtService', () => {
  it('issues and verifies its own tokens', () => {
    const jwt = new JwtService(SECRET, ISSUER, 3600);
    const accessToken = jwt.issue('user-1');

    expect(jwt.verify(accessToken)).toBe('user-1');
  });

  it('rejects a token with a modified payload', () => {
    const jwt = new JwtService(SECRET, ISSUER, 3600);
    const issued = jwt.issue('user-1');
    const [header, payload, signature] = issued.split('.');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    claims.sub = 'user-2';

    const modifiedPayload = base64url(claims);
    expect(() => jwt.verify(`${header}.${modifiedPayload}.${signature}`)).toThrow(
      'Invalid access token.'
    );
  });

  it('rejects a token signed with a different secret', () => {
    const jwt = new JwtService(SECRET, ISSUER, 3600);
    const other = new JwtService('12345678901234567890123456789012', ISSUER, 3600);
    const accessToken = other.issue('user-1');

    expect(() => jwt.verify(accessToken)).toThrow('Invalid access token.');
  });

  it('rejects algorithms other than HS256', () => {
    const jwt = new JwtService(SECRET, ISSUER, 3600);
    const accessToken = token(
      {
        sub: 'user-1',
        iss: ISSUER,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      { alg: 'none', typ: 'JWT' }
    );

    expect(() => jwt.verify(accessToken)).toThrow('Invalid access token.');
  });

  it('rejects tokens with the wrong type', () => {
    const jwt = new JwtService(SECRET, ISSUER, 3600);
    const accessToken = token(
      {
        sub: 'user-1',
        iss: ISSUER,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      { alg: 'HS256', typ: 'JWS' }
    );

    expect(() => jwt.verify(accessToken)).toThrow('Invalid access token.');
  });

  it('rejects expired tokens', () => {
    const jwt = new JwtService(SECRET, ISSUER, 3600);
    const now = Math.floor(Date.now() / 1000);
    const accessToken = token({ sub: 'user-1', iss: ISSUER, iat: now - 120, exp: now - 1 });

    expect(() => jwt.verify(accessToken)).toThrow('Invalid access token.');
  });

  it('rejects tokens with invalid claim types', () => {
    const jwt = new JwtService(SECRET, ISSUER, 3600);
    const now = Math.floor(Date.now() / 1000);
    const accessToken = token({ sub: 123, iss: ISSUER, iat: now, exp: now + 3600 });

    expect(() => jwt.verify(accessToken)).toThrow('Invalid access token.');
  });

  it('rejects tokens issued too far in the future', () => {
    const jwt = new JwtService(SECRET, ISSUER, 3600);
    const now = Math.floor(Date.now() / 1000);
    const accessToken = token({ sub: 'user-1', iss: ISSUER, iat: now + 61, exp: now + 3600 });

    expect(() => jwt.verify(accessToken)).toThrow('Invalid access token.');
  });

  it('rejects malformed signatures without throwing from timingSafeEqual', () => {
    const jwt = new JwtService(SECRET, ISSUER, 3600);
    const now = Math.floor(Date.now() / 1000);
    const accessToken = token({ sub: 'user-1', iss: ISSUER, iat: now, exp: now + 3600 });
    const [header, payload] = accessToken.split('.');

    expect(() => jwt.verify(`${header}.${payload}.x`)).toThrow('Invalid access token.');
  });
});
