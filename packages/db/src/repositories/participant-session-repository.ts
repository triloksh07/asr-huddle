import { and, eq } from "drizzle-orm";
import type { ParticipantSessionRepository } from "@repo/application";
import type { ParticipantSessionState } from "@repo/domain";
import { participantSessions } from "../schema.js";
import type { Database } from "../client.js";
import { mapParticipantSession } from "../mappers.js";

export class PostgresParticipantSessionRepository implements ParticipantSessionRepository {
  constructor(private readonly database: Database["db"]) {}

  async findById(sessionId: string) {
    const row = await this.database.query.participantSessions.findFirst({
      where: eq(participantSessions.id, sessionId),
    });
    return row ? mapParticipantSession(row) : null;
  }

  async findActiveByParticipantId(participantId: string) {
    const row = await this.database.query.participantSessions.findFirst({
      where: and(
        eq(participantSessions.participantId, participantId),
        eq(participantSessions.status, "ACTIVE"),
      ),
    });
    return row ? mapParticipantSession(row) : null;
  }

  async findByParticipantId(participantId: string) {
    const rows = await this.database.query.participantSessions.findMany({
      where: eq(participantSessions.participantId, participantId),
    });
    return rows.map(mapParticipantSession);
  }

  async save(session: ParticipantSessionState): Promise<void> {
    const status =
      session.disconnectedAt === null
        ? "ACTIVE"
        : session.intentionalLeave
          ? "CLOSED"
          : "DISCONNECTED";

    await this.database
      .insert(participantSessions)
      .values({
        id: session.id,
        participantId: session.participantId,
        connectionId: session.connectionId,
        status,
        connectedAt: session.connectedAt,
        disconnectedAt: session.disconnectedAt,
        intentionalLeave: session.intentionalLeave ? 1 : 0,
        recoverableUntil: session.recoverableUntil,
        closedAt: session.intentionalLeave ? session.disconnectedAt : null,
      })
      .onConflictDoUpdate({
        target: participantSessions.id,
        set: {
          connectionId: session.connectionId,
          status,
          connectedAt: session.connectedAt,
          disconnectedAt: session.disconnectedAt,
          intentionalLeave: session.intentionalLeave ? 1 : 0,
          recoverableUntil: session.recoverableUntil,
          closedAt: session.intentionalLeave ? session.disconnectedAt : null,
        },
      });
  }
}
