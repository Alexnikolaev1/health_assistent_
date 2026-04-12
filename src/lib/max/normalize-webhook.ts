/**
 * Приводит тело webhook от platform-api.max.ru к формату, который ожидают
 * extractUpdateData / processBotUpdate (совместимость с «телеграмным» видом).
 * @see https://dev.max.ru/docs-api/objects/Update
 */

import type { MAXCallbackQuery, MAXMessage, MAXUpdate, MAXUser, MAXChat } from '@/types';
import logger from '@/utils/logger';

type UnknownRec = Record<string, unknown>;

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown): string {
  return v == null ? '' : String(v);
}

/** Платформенный webhook → внутренний MAXUpdate */
export function normalizeIncomingUpdate(body: unknown): MAXUpdate | null {
  if (!body || typeof body !== 'object') return null;

  const u = body as UnknownRec;

  // Уже в «старом» виде (если прокси отдаёт Telegram-форму)
  if (u.message || u.callback_query) {
    return body as MAXUpdate;
  }

  const updateType = str(u.update_type);
  const ts = num(u.timestamp, Date.now());

  if (updateType === 'message_created' && u.message && typeof u.message === 'object') {
    const msg = u.message as UnknownRec;
    const sender = (msg.sender as UnknownRec) || {};
    const recipient = (msg.recipient as UnknownRec) || {};
    const messageBody = (msg.body as UnknownRec) || {};

    const userId = num(sender.user_id ?? sender.id, 0);
    const chatId = num(
      recipient.chat_id ?? recipient.id ?? recipient.user_id ?? userId,
      userId
    );
    const text = str(messageBody.text ?? messageBody.message ?? '');
    const messageId = num(msg.id ?? msg.mid ?? ts % 1_000_000_000, 1);

    const from: MAXUser = {
      id: userId,
      first_name: str(sender.name ?? sender.first_name ?? 'Пользователь'),
      username: sender.username ? str(sender.username) : undefined,
    };

    const chat: MAXChat = {
      id: chatId,
      type: 'private',
    };

    const message: MAXMessage = {
      message_id: messageId,
      from,
      chat,
      date: Math.floor(ts / 1000) || Math.floor(Date.now() / 1000),
      text,
    };

    return {
      update_id: ts,
      message,
    };
  }

  if (updateType === 'message_callback' && u.callback && typeof u.callback === 'object') {
    const cb = u.callback as UnknownRec;
    const callbackId = str(cb.callback_id ?? cb.id ?? '');
    const payload = str(cb.payload ?? cb.data ?? '');
    const user = (cb.user as UnknownRec) || (cb.sender as UnknownRec) || {};
    const userId = num(user.user_id ?? user.id, 0);
    const messageObj = (cb.message as UnknownRec) || {};

    const sender = (messageObj.sender as UnknownRec) || {};
    const recipient = (messageObj.recipient as UnknownRec) || {};
    const chatId = num(recipient.chat_id ?? recipient.id ?? userId, userId);
    const messageId = num(messageObj.id ?? messageObj.mid ?? 1, 1);

    const from: MAXUser = {
      id: userId,
      first_name: str(user.name ?? sender.name ?? 'Пользователь'),
    };

    const callback_query: MAXCallbackQuery = {
      id: callbackId,
      from,
      data: payload,
      message: {
        message_id: messageId,
        chat: { id: chatId, type: 'private' },
        date: Math.floor(Date.now() / 1000),
      },
    };

    return {
      update_id: ts,
      callback_query,
    };
  }

  logger.warn({ update_type: updateType }, 'Unsupported or empty webhook update shape');
  return null;
}
