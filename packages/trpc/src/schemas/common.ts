import { z } from 'zod';

/**
 * Shared transport primitives. These validate HTTP/tRPC input only; they do
 * not replace application or domain validation.
 */
export const userNameSchema = z.string().trim().min(1).max(120);

export const emailSchema = z.string().email();

export const passwordSchema = z.string().min(12).max(128);

export const roomIdSchema = z.string().min(1);

export const roomVisibilitySchema = z.enum(['PUBLIC', 'LINK_ONLY']);

export const roomDurationMinutesSchema = z.union([
  z.literal(60),
  z.literal(120),
  z.literal(300),
]);
