/**
 * Development seed: a demo account with realistic sample data.
 *   email: demo@aura.app   password: aura-demo-1234
 * Refuses to run when NODE_ENV=production. Re-running replaces the demo
 * account's data only (no other users are touched).
 */
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  addDaysToKey,
  buildEntity,
  dateKeyInTz,
  defaultPreferences,
  type EntityInput,
  type EntityType,
  zonedTimeToUtc,
} from '@aura/shared';
import { hashPassword } from '../src/lib/crypto';
import { delegateFor, toRowData } from '../src/modules/entities/registry';

const prisma = new PrismaClient();
const TZ = 'Asia/Kolkata';
const EMAIL = 'demo@aura.app';

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed a production database');

  const existing = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (existing) await prisma.user.delete({ where: { id: existing.id } }); // cascades to the demo user's rows only

  const user = await prisma.user.create({
    data: {
      email: EMAIL,
      name: 'Asha Verma',
      passwordHash: await hashPassword('aura-demo-1234'),
      preferences: {
        ...defaultPreferences,
        timezone: TZ,
        location: { name: 'Pune, Maharashtra, India', latitude: 18.52, longitude: 73.86 },
      },
    },
  });

  const now = new Date();
  const today = dateKeyInTz(now, TZ);
  const at = (dayOffset: number, hour: number, minute = 0) => {
    const [year, month, day] = addDaysToKey(today, dayOffset).split('-').map(Number) as [number, number, number];
    return zonedTimeToUtc({ year, month, day, hour, minute }, TZ).toISOString();
  };
  const add = async <T extends EntityType>(type: T, input: Partial<EntityInput<T>>) => {
    const e = buildEntity(type, randomUUID(), input, now);
    await delegateFor(prisma, type).create({ data: { ...toRowData(type, e as Record<string, unknown>), userId: user.id } });
    return e;
  };

  const project = await add('project', { name: 'Website relaunch', description: 'New portfolio site', deadline: at(14, 18), color: '#7C5CFF' });
  await add('task', { title: 'Review project brief', priority: 'high', dueAt: at(0, 11), estimateMinutes: 45, projectId: project.id });
  await add('task', { title: 'Draft homepage copy', priority: 'medium', dueAt: at(1, 17), estimateMinutes: 90, projectId: project.id });
  await add('task', { title: 'Pay electricity bill', priority: 'urgent', dueAt: at(0, 20), tags: ['bills'] });
  await add('task', { title: 'Book dentist appointment', priority: 'low', dueAt: at(-1, 18) });
  await add('task', { title: 'Buy groceries', priority: 'medium', dueAt: at(0, 19), tags: ['home'] });
  await add('task', { title: 'Weekly review', priority: 'medium', dueAt: at(2, 18), recurrence: 'weekly' });

  await add('event', { title: 'Team standup', startAt: at(-3, 10), endAt: at(-3, 10, 15), recurrence: 'weekdays', kind: 'event' });
  await add('event', { title: 'Lunch with Rohan', startAt: at(0, 13), endAt: at(0, 14), location: 'Café Peter', kind: 'appointment' });
  await add('event', { title: "Mom's birthday", startAt: at(5, 0), allDay: true, kind: 'birthday', recurrence: 'yearly', reminderMinutesBefore: 0 });

  await add('reminder', { title: 'Take vitamins', remindAt: at(-5, 9), recurrence: 'daily' });
  await add('reminder', { title: 'Call the bank about card', remindAt: at(1, 11) });

  await add('note', { title: 'Book ideas', content: 'Atomic Habits\nThe Psychology of Money\nDeep Work', tags: ['reading'], pinned: true });
  await add('note', { title: 'Trip to Goa', content: 'Dates: Dec 20-24\nBook train early\nStay near Anjuna', tags: ['travel'] });
  await add('note', { title: '', content: 'Felt productive today. Finished the brief draft and went for a run.', kind: 'journal', mood: 4 });

  const meditation = await add('habit', { name: 'Meditation', icon: 'leaf', target: 10, unit: 'min', color: '#3DDC97' });
  const reading = await add('habit', { name: 'Read', icon: 'book', target: 20, unit: 'pages', color: '#FFB547' });
  for (let d = -6; d <= 0; d++) {
    if (d % 2 === 0) await add('habitLog', { habitId: meditation.id, date: addDaysToKey(today, d), value: 10 });
    await add('habitLog', { habitId: reading.id, date: addDaysToKey(today, d), value: 10 + ((d + 7) % 3) * 8 });
    await add('wellness', { metric: 'sleep', value: 6.5 + ((d + 7) % 3) * 0.5, unit: 'h', date: addDaysToKey(today, d) });
  }
  await add('wellness', { metric: 'water', value: 1250, unit: 'ml', date: today });

  const tx: [EntityInput<'transaction'>['kind'], number, string, number][] = [
    ['income', 85_000_00, 'Salary', -10],
    ['expense', 18_000_00, 'Rent', -9],
    ['expense', 2_340_50, 'Groceries', -4],
    ['expense', 640_00, 'Food & Dining', -2],
    ['expense', 1_250_00, 'Transport', -1],
    ['expense', 499_00, 'Subscriptions', 0],
  ];
  for (const [kind, amountMinor, category, dayOffset] of tx) {
    await add('transaction', { kind, amountMinor, currency: 'INR', category, occurredAt: at(dayOffset, 12) });
  }
  await add('budget', { category: 'Groceries', limitMinor: 8_000_00, currency: 'INR' });
  await add('budget', { category: 'Food & Dining', limitMinor: 4_000_00, currency: 'INR' });
  await add('recurringPayment', { name: 'Netflix', kind: 'subscription', amountMinor: 499_00, currency: 'INR', category: 'Subscriptions', frequency: 'monthly', nextDueAt: at(12, 9) });
  await add('recurringPayment', { name: 'Electricity', kind: 'bill', amountMinor: 1_850_00, currency: 'INR', category: 'Bills & Utilities', frequency: 'monthly', nextDueAt: at(2, 9) });
  await add('goal', { title: 'Emergency fund', kind: 'financial', targetValue: 300000, currentValue: 120000, unit: 'INR', deadline: at(120, 12) });
  await add('goal', { title: 'Run a 10K', kind: 'fitness', targetValue: 10, currentValue: 6, unit: 'km' });
  await add('routine', { name: 'Morning', timeOfDay: 'morning', time: '06:45', steps: ['Glass of water', '10 min meditation', 'Plan top 3 tasks'] });

  await prisma.memory.createMany({
    data: [
      { userId: user.id, content: 'Prefers vegetarian food', category: 'preference', source: 'user' },
      { userId: user.id, content: 'Works as a freelance designer', category: 'fact', source: 'user' },
    ],
  });

  console.warn(`Seeded demo account: ${EMAIL} / aura-demo-1234 (user ${user.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
