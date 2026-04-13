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

/** Текст из body: объект NewMessageBody (`text`), строка или редкие варианты */
function extractMessageBodyText(body: unknown): string {
  if (body == null) return '';
  if (typeof body === 'string') return body;
  if (typeof body === 'object') {
    const b = body as UnknownRec;
    return str(b.text ?? b.message ?? b.caption ?? '');
  }
  return '';
}

/** Платформенный webhook → внутренний MAXUpdate */
export function normalizeIncomingUpdate(body: unknown): MAXUpdate | null {
  if (!body || typeof body !== 'object') return null;

  const u = body as UnknownRec;

  const updateType = str(u.update_type);

  // Платформа MAX всегда шлёт update_type; без него — «телеграмный» вид от прокси
  if (!updateType && (u.message || u.callback_query)) {
    return body as MAXUpdate;
  }

  if (!updateType) {
    return null;
  }
  const ts = num(u.timestamp, Date.now());

  if (updateType === 'message_created' && u.message && typeof u.message === 'object') {
    const msg = u.message as UnknownRec;
    const sender = (msg.sender as UnknownRec) || {};
    const recipient = (msg.recipient as UnknownRec) || {};
    const rawBody = msg.body;

    const userId = num(
      sender.user_id ?? (sender as UnknownRec).userId ?? sender.id,
      0
    );
    const chatId = num(
      recipient.chat_id ??
        (recipient as UnknownRec).chatId ??
        recipient.id ??
        recipient.user_id ??
        userId,
      userId
    );

    const messageBody = typeof rawBody === 'object' && rawBody ? (rawBody as UnknownRec) : {};
    const text =
      extractMessageBodyText(rawBody) ||
      str(messageBody.text ?? messageBody.message ?? messageBody.caption ?? '');
    const midForId = messageBody.mid ?? msg.mid ?? msg.id;
    const messageId = num(
      msg.id ?? msg.mid ?? (/^\d+$/.test(String(midForId)) ? midForId : ts % 1_000_000_000),
      1
    );

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

  /** Старт диалога с ботом (кнопка «Начать») — приходит как отдельное событие, не как текст /start */
  if (updateType === 'bot_started') {
    const userRec = (u.user as UnknownRec) || {};
    const userId = num(userRec.user_id ?? userRec.userId ?? userRec.id, 0);
    const chatId = num(u.chat_id ?? userId, userId);
    const ts = num(u.timestamp, Date.now());
    const payload = u.payload != null && str(u.payload).length > 0 ? str(u.payload) : '';
    const startText = payload ? `/start ${payload}` : '/start';

    const from: MAXUser = {
      id: userId,
      first_name: str(userRec.name ?? userRec.first_name ?? 'Пользователь'),
      username: userRec.username ? str(userRec.username) : undefined,
    };

    const chat: MAXChat = { id: chatId, type: 'private' };

    const message: MAXMessage = {
      message_id: num(ts % 1_000_000_000, 1),
      from,
      chat,
      date: Math.floor(ts / 1000) || Math.floor(Date.now() / 1000),
      text: startText,
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
    const userId = num(user.user_id ?? user.userId ?? user.id, 0);
    /** Полное сообщение часто в корне update, а не только в callback.message */
    const messageObj = (
      u.message && typeof u.message === 'object' ? u.message : cb.message
    ) as UnknownRec;

    const sender = (messageObj.sender as UnknownRec) || {};
    const recipient = (messageObj.recipient as UnknownRec) || {};
    const chatId = num(
      recipient.chat_id ?? (recipient as UnknownRec).chatId ?? recipient.id ?? userId,
      userId
    );
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
