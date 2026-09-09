import { eq } from "drizzle-orm";
import type { UserRepository } from "@repo/application";
import { users } from "../schema.js";
import type { Database } from "../client.js";
import { mapUser } from "../mappers.js";

export class PostgresUserRepository implements UserRepository {
  constructor(private readonly database: Database["db"]) {}

  async findById(userId: string) {
    const row = await this.database.query.users.findFirst({
      where: eq(users.id, userId),
    });

    return row ? mapUser(row) : null;
  }
}
