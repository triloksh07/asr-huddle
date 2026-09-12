import { eq } from "drizzle-orm";
import type { CredentialUserRecord, CredentialUserRepository } from "@repo/application";
import { users } from "../schema.js";
import type { Database } from "../client.js";
import { mapCredentialUser, mapUser } from "../mappers.js";

export class PostgresUserRepository implements CredentialUserRepository {
  constructor(private readonly database: Database["db"]) {}

  async findById(userId: string) {
    const row = await this.database.query.users.findFirst({
      where: eq(users.id, userId),
    });

    return row ? mapUser(row) : null;
  }

  async findByEmail(email: string) {
    const row = await this.database.query.users.findFirst({ where: eq(users.email, email) });
    return row ? mapCredentialUser(row) : null;
  }

  async create(user: CredentialUserRecord): Promise<void> {
    await this.database.insert(users).values({
      id: user.id, name: user.name, email: user.email, passwordHash: user.passwordHash,
      avatarUrl: user.avatarUrl, bio: user.bio,
    });
  }
}
