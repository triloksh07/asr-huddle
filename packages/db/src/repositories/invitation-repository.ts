import { and, eq } from "drizzle-orm";
import type { InvitationRepository } from "@repo/application";
import type { InvitationState } from "@repo/domain";
import { invitations } from "../schema.js";
import type { Database } from "../client.js";
const map = (r: any): InvitationState => ({
  id: r.id as InvitationState["id"],
  roomSessionId: r.roomSessionId as InvitationState["roomSessionId"],
  targetParticipantId:
    r.targetParticipantId as InvitationState["targetParticipantId"],
  status: r.status,
  createdAt: r.createdAt,
  resolvedAt: r.resolvedAt,
});
export class PostgresInvitationRepository implements InvitationRepository {
  constructor(private database: Database["db"]) {}
  async findById(id: string) {
    const r = await this.database.query.invitations.findFirst({
      where: eq(invitations.id, id),
    });
    return r ? map(r) : null;
  }
  async findPendingByParticipantId(id: string) {
    const r = await this.database.query.invitations.findFirst({
      where: and(
        eq(invitations.targetParticipantId, id),
        eq(invitations.status, "PENDING"),
      ),
    });
    return r ? map(r) : null;
  }
  async save(x: InvitationState) {
    await this.database
      .insert(invitations)
      .values({
        id: x.id,
        roomSessionId: x.roomSessionId,
        targetParticipantId: x.targetParticipantId,
        status: x.status,
        createdAt: x.createdAt,
        resolvedAt: x.resolvedAt,
      })
      .onConflictDoUpdate({
        target: invitations.id,
        set: { status: x.status, resolvedAt: x.resolvedAt },
      });
  }
}
