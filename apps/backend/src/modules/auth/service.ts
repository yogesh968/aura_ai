import type { PrismaClient, User as UserRow } from '@prisma/client';
import { defaultPreferences, type AuthResponse, type User } from '@aura/shared';
import { AppError, conflict, unauthorized } from '../../lib/errors';
import { hashPassword, newRefreshToken, sha256, verifyPassword } from '../../lib/crypto';

export function userDto(u: UserRow): User {
  return { id: u.id, email: u.email, name: u.name, isGuest: u.isGuest, createdAt: u.createdAt.toISOString() };
}

// A real hash, verified when the email does not exist, so response timing doesn't reveal accounts.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hashPassword('aura-timing-equalizer'));

export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly signAccessToken: (payload: { sub: string; guest: boolean }) => string,
    private readonly opts: { accessTtlMinutes: number; refreshTtlDays: number },
  ) {}

  private async issue(user: UserRow, userAgent?: string): Promise<AuthResponse> {
    const { token, hash } = newRefreshToken();
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + this.opts.refreshTtlDays * 86_400_000),
        userAgent: userAgent?.slice(0, 200) ?? null,
      },
    });
    return {
      user: userDto(user),
      accessToken: this.signAccessToken({ sub: user.id, guest: user.isGuest }),
      refreshToken: token,
      accessTokenExpiresAt: new Date(Date.now() + this.opts.accessTtlMinutes * 60_000).toISOString(),
    };
  }

  async register(input: { email: string; password: string; name: string }, userAgent?: string) {
    const exists = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (exists) throw conflict('An account with this email already exists');
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash: await hashPassword(input.password),
        name: input.name,
        preferences: defaultPreferences,
      },
    });
    return this.issue(user, userAgent);
  }

  async login(input: { email: string; password: string }, userAgent?: string) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    const valid = await verifyPassword(user?.passwordHash ?? (await getDummyHash()), input.password);
    if (!user || !user.passwordHash || !valid) throw new AppError(401, 'invalid_credentials', 'Invalid email or password');
    await this.prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
    return this.issue(user, userAgent);
  }

  async guest(userAgent?: string) {
    const user = await this.prisma.user.create({
      data: { name: 'Guest', isGuest: true, preferences: defaultPreferences },
    });
    return this.issue(user, userAgent);
  }

  /** Upgrade a guest account to a full account, keeping all its data. */
  async claimGuest(userId: string, input: { email: string; password: string; name: string }, userAgent?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw unauthorized();
    if (!user.isGuest) throw conflict('This account is already registered');
    if (await this.prisma.user.findUnique({ where: { email: input.email } })) {
      throw conflict('An account with this email already exists');
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { email: input.email, passwordHash: await hashPassword(input.password), name: input.name, isGuest: false },
    });
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    return this.issue(updated, userAgent);
  }

  /**
   * Rotate a refresh token. Presenting an already-rotated token indicates
   * theft, so every session of that user is revoked.
   */
  async refresh(refreshToken: string, userAgent?: string) {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { user: true },
    });
    if (!record) throw unauthorized('Session expired, please sign in again');
    if (record.revokedAt) {
      await this.prisma.refreshToken.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      throw unauthorized('Session expired, please sign in again');
    }
    if (record.expiresAt < new Date()) throw unauthorized('Session expired, please sign in again');

    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: record.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count === 0) throw unauthorized('Session expired, please sign in again');
    const result = await this.issue(record.user, userAgent);
    const replacement = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(result.refreshToken) } });
    await this.prisma.refreshToken.update({ where: { id: record.id }, data: { replacedById: replacement?.id ?? null } });
    await this.prisma.user.update({ where: { id: record.userId }, data: { lastSeenAt: new Date() } });
    return result;
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async logoutAll(userId: string) {
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw unauthorized();
    return userDto(user);
  }

  async updateProfile(userId: string, input: { name?: string }) {
    const user = await this.prisma.user.update({ where: { id: userId }, data: { ...(input.name ? { name: input.name } : {}) } });
    return userDto(user);
  }

  /** Permanently delete the account and all data (cascades across every table). */
  async deleteAccount(userId: string) {
    await this.prisma.user.delete({ where: { id: userId } });
  }
}
