import { z } from 'zod';
import { emailSchema, passwordSchema, userNameSchema } from './common.js';

export const registerInputSchema = z.object({
  name: userNameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const loginInputSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const authenticatedUserSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  email: z.string(),
});

export const authResultSchema = z.object({
  // accessToken: z.string().min(1),
  user: authenticatedUserSchema,
});

export const authLogoutResultSchema = z.object({
  success: z.literal(true),
});

export type RegisterInput = z.infer<typeof registerInputSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
export type AuthResult = z.infer<typeof authResultSchema>;
