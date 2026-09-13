import { createHmac, timingSafeEqual } from 'node:crypto';

type JwtClaims = {
  readonly sub: string;
  readonly iss: string;
  readonly iat: number;
  readonly exp: number;
};

type JwtHeader = {
  readonly alg: string;
  readonly typ: string;
};

const CLOCK_SKEW_SECONDS = 60;

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeJson(segment: string): unknown {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as unknown;
}

function isBase64UrlSegment(value: string): boolean {
  return value.length > 0 && /^[A-Za-z0-9_-]+$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseHeader(segment: string): JwtHeader {
  const value = decodeJson(segment);

  if (!isRecord(value) || typeof value.alg !== 'string' || typeof value.typ !== 'string') {
    throw new Error('Invalid access token.');
  }

  return { alg: value.alg, typ: value.typ };
}

function parseClaims(segment: string): JwtClaims {
  const value = decodeJson(segment);

  if (
    !isRecord(value) ||
    typeof value.sub !== 'string' ||
    value.sub.length === 0 ||
    typeof value.iss !== 'string' ||
    typeof value.iat !== 'number' ||
    !Number.isSafeInteger(value.iat) ||
    typeof value.exp !== 'number' ||
    !Number.isSafeInteger(value.exp)
  ) {
    throw new Error('Invalid access token.');
  }

  return {
    sub: value.sub,
    iss: value.iss,
    iat: value.iat,
    exp: value.exp,
  };
}

export class JwtService {
  constructor(
    private readonly secret: string,
    private readonly issuer: string,
    private readonly ttlSeconds: number
  ) {}

  issue(userId: string): string {
    const now = Math.floor(Date.now() / 1000);
    const header = encode({ alg: 'HS256', typ: 'JWT' });
    const payload = encode({
      sub: userId,
      iss: this.issuer,
      iat: now,
      exp: now + this.ttlSeconds,
    });

    return `${header}.${payload}.${this.sign(`${header}.${payload}`).toString('base64url')}`;
  }

  verify(token: string): string {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) throw new Error('Invalid access token.');

      const [headerSegment, payloadSegment, signatureSegment] = parts;

      if (
        !isBase64UrlSegment(headerSegment) ||
        !isBase64UrlSegment(payloadSegment) ||
        !isBase64UrlSegment(signatureSegment)
      ) {
        throw new Error('Invalid access token.');
      }

      const header = parseHeader(headerSegment);
      if (header.alg !== 'HS256' || header.typ !== 'JWT') {
        throw new Error('Invalid access token.');
      }

      const expectedSignature = this.sign(`${headerSegment}.${payloadSegment}`);
      const suppliedSignature = Buffer.from(signatureSegment, 'base64url');

      if (
        suppliedSignature.length !== expectedSignature.length ||
        !timingSafeEqual(suppliedSignature, expectedSignature)
      ) {
        throw new Error('Invalid access token.');
      }

      const claims = parseClaims(payloadSegment);
      const now = Math.floor(Date.now() / 1000);

      if (
        claims.iss !== this.issuer ||
        claims.iat > now + CLOCK_SKEW_SECONDS ||
        claims.exp <= now ||
        claims.exp <= claims.iat
      ) {
        throw new Error('Access token has expired or is invalid.');
      }

      return claims.sub;
    } catch {
      throw new Error('Invalid access token.');
    }
  }

  private sign(value: string): Buffer {
    return createHmac('sha256', this.secret).update(value).digest();
  }
}
