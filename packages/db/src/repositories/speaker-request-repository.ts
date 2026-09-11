import { and, eq } from "drizzle-orm";
import type { SpeakerRequestRepository } from "@repo/application";
import type { SpeakerRequestState } from "@repo/domain";
import { speakerRequests } from "../schema.js";
import type { Database } from "../client.js";
const map = (r: any): SpeakerRequestState => ({
  id: r.id as SpeakerRequestState["id"],
  roomSessionId: r.roomSessionId as SpeakerRequestState["roomSessionId"],
  participantId: r.participantId as SpeakerRequestState["participantId"],
  status: r.status,
  createdAt: r.createdAt,
  resolvedAt: r.resolvedAt,
  resolvedByParticipantId:
    r.resolvedByParticipantId as SpeakerRequestState["resolvedByParticipantId"],
});
export class PostgresSpeakerRequestRepository implements SpeakerRequestRepository {
  constructor(private database: Database["db"]) {}
  async findById(id: string) {
    const r = await this.database.query.speakerRequests.findFirst({
      where: eq(speakerRequests.id, id),
    });
    return r ? map(r) : null;
  }
  async findPendingByParticipantId(id: string) {
    const r = await this.database.query.speakerRequests.findFirst({
      where: and(
        eq(speakerRequests.participantId, id),
        eq(speakerRequests.status, "PENDING"),
      ),
    });
    return r ? map(r) : null;
  }
  async save(x: SpeakerRequestState) {
    await this.database
      .insert(speakerRequests)
      .values({
        id: x.id,
        roomSessionId: x.roomSessionId,
        participantId: x.participantId,
        status: x.status,
        createdAt: x.createdAt,
        resolvedAt: x.resolvedAt,
        resolvedByParticipantId: x.resolvedByParticipantId,
      })
      .onConflictDoUpdate({
        target: speakerRequests.id,
        set: {
          status: x.status,
          resolvedAt: x.resolvedAt,
          resolvedByParticipantId: x.resolvedByParticipantId,
        },
      });
  }
}
