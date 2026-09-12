import { createHmac, timingSafeEqual } from 'node:crypto';

type JwtPayload = { sub: string; iss: string; iat: number; exp: number };
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const decode = (value: string) => JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));

export class JwtService {
  constructor(
    private readonly secret: string,
    private readonly issuer: string,
    private readonly ttlSeconds: number
  ) {}
  issue(userId: string): string {
    const now = Math.floor(Date.now() / 1000);
    const header = encode({ alg: 'HS256', typ: 'JWT' });
    const payload = encode({ sub: userId, iss: this.issuer, iat: now, exp: now + this.ttlSeconds });
    return `${header}.${payload}.${this.sign(`${header}.${payload}`)}`;
  }
  verify(token: string): string {
    const [header, payload, signature, ...extra] = token.split('.');
    if (!header || !payload || !signature || extra.length) throw new Error('Invalid access token.');
    const expected = this.sign(`${header}.${payload}`);
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected)))
      throw new Error('Invalid access token.');
    const claims = decode(payload) as JwtPayload;
    if (claims.iss !== this.issuer || !claims.sub || claims.exp <= Math.floor(Date.now() / 1000))
      throw new Error('Access token has expired or is invalid.');
    return claims.sub;
  }
  private sign(value: string) {
    return createHmac('sha256', this.secret).update(value).digest('base64url');
  }
}
