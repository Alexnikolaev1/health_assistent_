/**
 * Слой приложения для мессенджера MAX: разбор апдейтов, маршрутизация, ответы.
 */

import type { MAXUpdate } from '@/types';
import {
  upsertUser,
  ensureDatabaseSchema,
  claimProcessedUpdate,
  checkWebhookRateLimit,
  releaseProcessedUpdate,
} from '@/lib/db';
import { extractUpdateData, sendError } from '@/lib/max/client';
import { handleUserTextMessage } from './messages';
import { handleCallbackQuery } from './callbacks';
import logger from '@/utils/logger';

export { SERVICE_NAME, SERVICE_VERSION } from './constants';

function formatCaughtError(e: unknown): { message: string; stack?: string } {
  if (e instanceof Error) {
    return { message: e.message, stack: e.stack };
  }
  if (typeof e === 'string') {
    return { message: e };
  }
  try {
    return { message: JSON.stringify(e) };
  } catch {
    return { message: String(e) };
  }
}

export async function processBotUpdate(update: MAXUpdate): Promise<void> {
  const extracted = extractUpdateData(update);
  if (!extracted) return;

  const { chatId, userId, text, callbackData, callbackQueryId, username, firstName } = extracted;

  if (userId <= 0) {
    logger.warn({ update_id: update.update_id }, 'Update without user id, skip');
    return;
  }

  await ensureDatabaseSchema();

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

  const callbackIdStr =
    callbackQueryId !== undefined && callbackQueryId !== null ? String(callbackQueryId).trim() : '';

  try {
    const dbUser = await upsertUser(userId, username, firstName);

    // Пустой id ломал ветку callback (falsy); id должен быть непустой строкой для POST /answers
    if (callbackData && callbackIdStr.length > 0) {
      await handleCallbackQuery(userId, dbUser.id, callbackData, callbackIdStr);
      return;
    }

    if (text) {
      await handleUserTextMessage(userId, dbUser.id, text, firstName);
    } else if (update.message) {
      console.warn('[bot] message update with empty text; check normalize-webhook / MAX payload');
      logger.warn({ update_id: update.update_id }, 'Empty text on message update');
    }
  } catch (error) {
    const { message: botErrorMessage, stack: botErrorStack } = formatCaughtError(error);
    // console попадает в Vercel Runtime Logs даже когда pino сериализует объекты в {}
    console.error(
      '[bot] Error handling MAX update',
      botErrorMessage,
      botErrorStack ?? '',
      { update_id: update.update_id, chatId, userId, hasCallback: !!callbackData, callbackIdLen: callbackIdStr.length }
    );
    logger.error(
      {
        botErrorMessage,
        botErrorStack,
        chatId,
        userId,
        update_id: update.update_id,
        hasCallbackData: Boolean(callbackData),
        callbackIdLen: callbackIdStr.length,
      },
      'Error handling MAX update'
    );
    try {
      await sendError(userId, 'Внутренняя ошибка сервера');
    } catch (sendErr) {
      const sendMsg = sendErr instanceof Error ? sendErr.message : String(sendErr);
      console.error('[bot] sendError failed after handler error', sendMsg);
      logger.error({ sendErrorMessage: sendMsg, userId }, 'sendError after handler failure also failed');
    }
  }
}
