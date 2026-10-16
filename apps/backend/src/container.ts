import type { PrismaClient } from '@prisma/client';
import type { Config } from './config';
import { AnthropicProvider } from './modules/ai/anthropic';
import { NoAiProvider, type AiProvider } from './modules/ai/provider';
import { EntityService } from './modules/entities/service';
import { SyncService } from './modules/sync/service';
import { PlannerService } from './modules/planner/service';
import { FinanceService } from './modules/finance/service';
import { WeatherService } from './modules/weather/service';
import { KnowledgeService } from './modules/knowledge/service';
import { MemoryService } from './modules/memory/service';
import { NotificationService } from './modules/notifications/service';
import { BriefingService } from './modules/briefing/service';
import { PreferencesService } from './modules/preferences/service';
import { DocumentService } from './modules/documents/service';
import { ToolExecutor } from './modules/agent/tools';
import { AgentService } from './modules/agent/service';
import { PendingActionService } from './modules/actions/service';
import { AutomationService } from './modules/automations/service';
import { WebService } from './modules/web/service';

export interface ContainerOverrides {
  ai?: AiProvider;
  fetch?: typeof fetch;
  now?: () => Date;
}

export function createAiProvider(config: Config): AiProvider {
  if (config.AI_PROVIDER === 'anthropic' && config.ANTHROPIC_API_KEY) return new AnthropicProvider(config);
  return new NoAiProvider();
}

/** Wires every service together. Tests pass overrides (fake AI, fake fetch). */
export function createContainer(config: Config, prisma: PrismaClient, overrides: ContainerOverrides = {}) {
  const ai = overrides.ai ?? createAiProvider(config);
  const fetchFn = overrides.fetch ?? fetch;
  const entities = new EntityService(prisma);
  const preferences = new PreferencesService(prisma);
  const planner = new PlannerService(entities);
  const finance = new FinanceService(entities);
  const weather = new WeatherService(config.WEATHER_ENABLED, fetchFn);
  const knowledge = new KnowledgeService(prisma);
  const memory = new MemoryService(prisma);
  const notifications = new NotificationService(
    prisma,
    { pushEnabled: Boolean(config.EXPO_PUSH_ENABLED), accessToken: config.EXPO_ACCESS_TOKEN },
    fetchFn,
  );
  const briefing = new BriefingService(prisma, entities, planner, weather, ai);
  const documents = new DocumentService(prisma, ai);
  const executor = new ToolExecutor({ prisma, entities, planner, finance, weather, knowledge, memory, notifications, briefing });
  const agent = new AgentService({ prisma, ai, executor, memory, preferences, documents, config, now: overrides.now });
  const actions = new PendingActionService(prisma, executor, agent, preferences);
  const automations = new AutomationService(prisma, executor, preferences, entities);
  const web = new WebService(ai);
  const sync = new SyncService(prisma);

  return {
    config,
    prisma,
    ai,
    entities,
    preferences,
    planner,
    finance,
    weather,
    knowledge,
    memory,
    notifications,
    briefing,
    documents,
    executor,
    agent,
    actions,
    automations,
    web,
    sync,
  };
}

export type Container = ReturnType<typeof createContainer>;
