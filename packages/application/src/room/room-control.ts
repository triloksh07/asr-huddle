import { ApplicationError } from '../errors.js';
import type { RoomRepository } from '../ports.js';
import { CreateRoom, type CreateRoomCommand } from './create-room.js';
import { EndRoom } from './end-room.js';

export class RoomControl {
  constructor(
    private readonly rooms: RoomRepository,
    private readonly createRoom: CreateRoom,
    private readonly endRoom: EndRoom
  ) {}
  create(command: CreateRoomCommand) {
    return this.createRoom.execute(command);
  }
  async get(roomId: string) {
    const room = await this.rooms.findById(roomId);
    if (!room) throw new ApplicationError('NOT_FOUND', 'Room was not found.');
    return room;
  }
  listPublic() {
    return this.rooms.findActivePublic();
  }
  async endAsHost(roomId: string, userId: string): Promise<void> {
    const room = await this.get(roomId);
    if (room.hostUserId !== userId)
      throw new ApplicationError('FORBIDDEN', 'Only the room host can end this room.');
    await this.endRoom.execute({ roomId, reason: 'HOST_ENDED' });
  }
}
