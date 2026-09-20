import { t } from '../router/core.js';
import { mapTRPCError } from '../errors/index.js';

export const errorMappingMiddleware = t.middleware(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    throw mapTRPCError(error);
  }
});
