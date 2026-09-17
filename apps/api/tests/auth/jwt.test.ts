import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { JwtService } from '../../src/auth/jwt.js';

const SECRET = '01234567890123456789012345678901';
const ISSUER = 'asr-huddle-test';

function enc(v: object) {
  return Buffer.from(JSON.stringify(v)).toString('base64url');
}
function makeToken(
  claims: Record<string, unknown>,
  header = { alg: 'HS256', typ: 'JWT' },
  secret = SECRET
) {
  const h = enc(header);
  const p = enc(claims);
  const s = createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${s}`;
}

describe('JwtService', () => {
  it('issues and verifies access tokens', () => {
    const jwt = new JwtService(SECRET, ISSUER, 3600);
    expect(jwt.verify(jwt.issue('user-1'))).toBe('user-1');
  });

  it.each([
    [
      'modified payload',
      () => {
        const jwt = new JwtService(SECRET, ISSUER, 3600);
        const [h, p, s] = jwt.issue('user-1').split('.');
        const c = JSON.parse(Buffer.from(p, 'base64url').toString());
        c.sub = 'user-2';
        return `${h}.${enc(c)}.${s}`;
      },
    ],
    [
      'wrong secret',
      () => new JwtService('12345678901234567890123456789012', ISSUER, 3600).issue('user-1'),
    ],
    [
      'wrong algorithm',
      () => {
        const now = Math.floor(Date.now() / 1000);
        return makeToken(
          { sub: 'user-1', iss: ISSUER, iat: now, exp: now + 3600 },
          { alg: 'none', typ: 'JWT' }
        );
      },
    ],
    [
      'wrong type',
      () => {
        const now = Math.floor(Date.now() / 1000);
        return makeToken(
          { sub: 'user-1', iss: ISSUER, iat: now, exp: now + 3600 },
          { alg: 'HS256', typ: 'JWS' }
        );
      },
    ],
    [
      'expired',
      () => {
        const now = Math.floor(Date.now() / 1000);
        return makeToken({ sub: 'user-1', iss: ISSUER, iat: now - 120, exp: now - 1 });
      },
    ],
  ])('rejects %s tokens', (_name, token) => {
    expect(() => new JwtService(SECRET, ISSUER, 3600).verify(token())).toThrow(
      'Invalid access token.'
    );
  });

  it('rejects malformed signatures', () => {
    const now = Math.floor(Date.now() / 1000);
    const t = makeToken({ sub: 'user-1', iss: ISSUER, iat: now, exp: now + 3600 });
    const [h, p] = t.split('.');
    expect(() => new JwtService(SECRET, ISSUER, 3600).verify(`${h}.${p}.x`)).toThrow(
      'Invalid access token.'
    );
  });
});
