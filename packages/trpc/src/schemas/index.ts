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
  authLogoutResultSchema,
  authenticatedUserSchema,
  loginInputSchema,
  registerInputSchema,
} from './auth.js';

export {
  createRoomInputSchema,
  createRoomOutputSchema,
  roomEndOutputSchema,
  roomIdInputSchema,
  roomListOutputSchema,
  roomStateOutputSchema,
} from './room.js';

export type { AuthResult, LoginInput, RegisterInput } from './auth.js';
export type {
  CreateRoomInput,
  RoomIdInput,
  RoomState,
  CreateRoomOutput,
  RoomListOutput,
  RoomEndOutput,
} from './room.js';
