import { describe, expect, it } from 'vitest';
import { createApiRuntime } from '../../src/runtime/app.js';

describe('API runtime entrypoint', () => {
  it('exports the canonical async composition-root factory', () => {
    expect(createApiRuntime).toBeTypeOf('function');
    expect(createApiRuntime.constructor.name).toBe('AsyncFunction');
  });
});
