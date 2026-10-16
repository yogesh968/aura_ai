import type { PrismaClient } from '@prisma/client';
import { defaultPreferences, isValidTimeZone, preferencesSchema, type Preferences } from '@aura/shared';
import { badRequest, notFound } from '../../lib/errors';

/** Merge stored (possibly partial or outdated) preferences over the defaults. */
export function resolvePreferences(stored: unknown): Preferences {
  const s = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>;
  const merged = {
    ...defaultPreferences,
    ...s,
    voice: { ...defaultPreferences.voice, ...((s.voice as object) ?? {}) },
    briefings: { ...defaultPreferences.briefings, ...((s.briefings as object) ?? {}) },
    wellnessTargets: { ...defaultPreferences.wellnessTargets, ...((s.wellnessTargets as object) ?? {}) },
  };
  const parsed = preferencesSchema.safeParse(merged);
  return parsed.success ? parsed.data : defaultPreferences;
}

export class PreferencesService {
  constructor(private readonly prisma: PrismaClient) {}

  async get(userId: string): Promise<Preferences> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } });
    if (!user) throw notFound('User');
    return resolvePreferences(user.preferences);
  }

  async update(userId: string, patch: Partial<Preferences>): Promise<Preferences> {
    const current = await this.get(userId);
    const next = {
      ...current,
      ...patch,
      voice: { ...current.voice, ...(patch.voice ?? {}) },
      briefings: { ...current.briefings, ...(patch.briefings ?? {}) },
      wellnessTargets: { ...current.wellnessTargets, ...(patch.wellnessTargets ?? {}) },
    };
    const parsed = preferencesSchema.safeParse(next);
    if (!parsed.success) throw badRequest('Invalid preferences', parsed.error.issues);
    if (!isValidTimeZone(parsed.data.timezone)) throw badRequest(`Unknown timezone "${parsed.data.timezone}"`);
    await this.prisma.user.update({ where: { id: userId }, data: { preferences: parsed.data } });
    return parsed.data;
  }
}
