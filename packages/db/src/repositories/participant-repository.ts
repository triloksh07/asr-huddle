import { eq, and } from "drizzle-orm";
import type { ParticipantRepository } from "@repo/application";
import type { ParticipantState } from "@repo/domain";
import { participants } from "../schema.js";
import type { Database } from "../client.js";
import { mapParticipant } from "../mappers.js";

export class PostgresParticipantRepository implements ParticipantRepository {
  constructor(private readonly database: Database["db"]) {}

  async findById(participantId: string) {
    const row = await this.database.query.participants.findFirst({
      where: eq(participants.id, participantId),
    });
    return row ? mapParticipant(row) : null;
  }

  async findByRoomSession(roomSessionId: string) {
    const rows = await this.database.query.participants.findMany({
      where: eq(participants.roomSessionId, roomSessionId),
    });
    return rows.map(mapParticipant);
  }

  async findByUserAndRoomSession(userId: string, roomSessionId: string) {
    const row = await this.database.query.participants.findFirst({
      where: and(
        eq(participants.userId, userId),
        eq(participants.roomSessionId, roomSessionId),
      ),
    });
    return row ? mapParticipant(row) : null;
  }
  async save(participant: ParticipantState): Promise<void> {
    await this.database
      .insert(participants)
      .values({
        id: participant.id,
        roomId: participant.roomId,
        roomSessionId: participant.roomSessionId,
        userId: participant.userId,
        managementRole: participant.managementRole,
        audioRole: participant.audioRole,
        status: participant.status,
        joinedAt: participant.joinedAt,
        disconnectedAt: participant.disconnectedAt,
        leftAt: participant.leftAt,
        removedAt: participant.removedAt,
        selfMuted: participant.selfMuted ? 1 : 0,
        moderatorMuted: participant.moderatorMuted ? 1 : 0,
      })
      .onConflictDoUpdate({
        target: participants.id,
        set: {
          managementRole: participant.managementRole,
          audioRole: participant.audioRole,
          status: participant.status,
          disconnectedAt: participant.disconnectedAt,
          leftAt: participant.leftAt,
          removedAt: participant.removedAt,
          selfMuted: participant.selfMuted ? 1 : 0,
          moderatorMuted: participant.moderatorMuted ? 1 : 0,
        },
      });
  }
}
