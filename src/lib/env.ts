/**
 * Переменные окружения: схема (zod) и проверки для API-роутов.
 */

import { z } from 'zod';

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).optional(),
  MAX_BOT_TOKEN: z.string().min(1).optional(),
  MAX_API_URL: z.string().optional(),
  CRON_SECRET: z.string().min(1).optional(),
  POSTGRES_URL: z.string().min(1).optional(),
  YANDEX_CLOUD_FOLDER_ID: z.string().optional(),
  YANDEX_GPT_API_KEY: z.string().optional(),
  APP_URL: z.string().url().optional(),
  QSTASH_TOKEN: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.message}`);
  }
  cached = parsed.data;
  return parsed.data;
}

/** Сброс кэша (только для тестов) */
export function resetEnvCache(): void {
  cached = null;
}

export function requireMaxBotToken(): string {
  const t = getServerEnv().MAX_BOT_TOKEN ?? process.env.MAX_BOT_TOKEN;
  if (!t) {
    throw new Error('MAX_BOT_TOKEN is not set');
  }
  return t;
}

/**
 * Если задан WEBHOOK_SECRET — заголовок X-Webhook-Secret должен совпадать.
 * Если секрет не задан — пропускаем (удобно для локальной разработки).
 */
export function isWebhookRequestAuthorized(secretHeader: string | null): boolean {
  const secret = process.env.WEBHOOK_SECRET?.trim();
  if (!secret) return true;
  return secretHeader === secret;
}
