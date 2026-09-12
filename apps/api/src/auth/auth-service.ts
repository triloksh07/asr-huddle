import { randomUUID } from 'node:crypto';
import type { CredentialUserRepository } from '@repo/application';
import { hashPassword, verifyPassword } from './passwords.js';
import { JwtService } from './jwt.js';

export class AuthService {
  constructor(
    private readonly users: CredentialUserRepository,
    private readonly jwt: JwtService
  ) {}
  async register(name: string, email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    if (await this.users.findByEmail(normalizedEmail))
      throw new Error('An account already exists for this email.');
    const user = {
      id: randomUUID(),
      name: name.trim(),
      email: normalizedEmail,
      passwordHash: await hashPassword(password),
      avatarUrl: null,
      bio: null,
    };
    await this.users.create(user);
    return {
      accessToken: this.jwt.issue(user.id),
      user: { id: user.id, name: user.name, email: user.email },
    };
  }
  async login(email: string, password: string) {
    const user = await this.users.findByEmail(email.trim().toLowerCase());
    if (!user || !(await verifyPassword(password, user.passwordHash)))
      throw new Error('Invalid email or password.');
    return {
      accessToken: this.jwt.issue(user.id),
      user: { id: user.id, name: user.name, email: user.email },
    };
  }
  authenticate(token: string) {
    return this.jwt.verify(token);
  }
}
