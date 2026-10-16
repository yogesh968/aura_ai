import type { FastifyBaseLogger } from 'fastify';
import type { PrismaClient } from '@prisma/client';

type FetchFn = typeof fetch;

/**
 * Notifications produced on the server (automations, briefings). They are
 * always stored in the user's in-app inbox; if Expo push is enabled and the
 * device registered a token, they are also pushed.
 */
export class NotificationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly opts: { pushEnabled: boolean; accessToken?: string; log?: FastifyBaseLogger },
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  async notify(userId: string, input: { title: string; body: string; kind?: string; data?: Record<string, unknown> }) {
    const record = await this.prisma.inboxNotification.create({
      data: { userId, title: input.title, body: input.body, kind: input.kind ?? 'info', data: (input.data ?? {}) as object },
    });
    let pushed = false;
    if (this.opts.pushEnabled) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { pushToken: true } });
      if (user?.pushToken) pushed = await this.push(user.pushToken, input.title, input.body, { notificationId: record.id, ...input.data });
    }
    return { id: record.id, pushed };
  }

  private async push(token: string, title: string, body: string, data: Record<string, unknown>): Promise<boolean> {
    try {
      const res = await this.fetchFn('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(this.opts.accessToken ? { Authorization: `Bearer ${this.opts.accessToken}` } : {}),
        },
        body: JSON.stringify({ to: token, title, body, data, sound: 'default', channelId: 'default' }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) this.opts.log?.warn({ status: res.status }, 'Expo push failed');
      return res.ok;
    } catch (err) {
      this.opts.log?.warn({ err }, 'Expo push unreachable');
      return false;
    }
  }

  async list(userId: string, limit = 50) {
    const rows = await this.prisma.inboxNotification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      kind: n.kind,
      data: n.data,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    }));
  }

  async markRead(userId: string, ids: string[] | 'all') {
    const where = ids === 'all' ? { userId, readAt: null } : { userId, id: { in: ids } };
    const { count } = await this.prisma.inboxNotification.updateMany({ where, data: { readAt: new Date() } });
    return count;
  }
}
