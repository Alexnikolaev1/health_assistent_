/**
 * Слой приложения для мессенджера MAX: разбор апдейтов, маршрутизация, ответы.
 */

import type { MAXUpdate } from '@/types';
import {
  upsertUser,
  ensureWebhookSchema,
  claimProcessedUpdate,
  checkWebhookRateLimit,
  releaseProcessedUpdate,
} from '@/lib/db';
import { extractUpdateData, sendError } from '@/lib/max/client';
import { handleUserTextMessage } from './messages';
import { handleCallbackQuery } from './callbacks';
import logger from '@/utils/logger';

export { SERVICE_NAME, SERVICE_VERSION } from './constants';

export async function processBotUpdate(update: MAXUpdate): Promise<void> {
  const extracted = extractUpdateData(update);
  if (!extracted) return;

  const { chatId, userId, text, callbackData, callbackQueryId, username, firstName } = extracted;

  await ensureWebhookSchema();

  const claimed = await claimProcessedUpdate(update.update_id);
  if (!claimed) {
    logger.debug({ update_id: update.update_id }, 'Duplicate update_id, skip');
    return;
  }

  const allowed = await checkWebhookRateLimit(userId);
  if (!allowed) {
    logger.warn({ userId, update_id: update.update_id }, 'Webhook rate limit exceeded');
    await releaseProcessedUpdate(update.update_id);
    return;
  }

  try {
    const dbUser = await upsertUser(userId, username, firstName);

    if (callbackData && callbackQueryId) {
      await handleCallbackQuery(chatId, dbUser.id, userId, callbackData, callbackQueryId);
      return;
    }

    if (text) {
      await handleUserTextMessage(chatId, dbUser.id, userId, text, firstName);
    } else if (update.message) {
      console.warn('[bot] message update with empty text; check normalize-webhook / MAX payload');
      logger.warn({ update_id: update.update_id }, 'Empty text on message update');
    }
  } catch (error) {
    logger.error({ error, chatId, userId }, 'Error handling MAX update');
    await sendError(chatId, 'Внутренняя ошибка сервера');
  }
}
