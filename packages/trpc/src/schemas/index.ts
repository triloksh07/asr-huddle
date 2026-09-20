export {
  emailSchema,
  passwordSchema,
  roomDurationMinutesSchema,
  roomIdSchema,
  roomVisibilitySchema,
  userNameSchema,
} from './common.js';

export {
  authResultSchema,
  authenticatedUserSchema,
  loginInputSchema,
  registerInputSchema,
} from './auth.js';

export {
  createRoomInputSchema,
  createRoomOutputSchema,
  roomIdInputSchema,
  roomListOutputSchema,
  roomStateOutputSchema,
} from './room.js';

export type { AuthResult, LoginInput, RegisterInput } from './auth.js';
export type { CreateRoomInput, RoomIdInput } from './room.js';
