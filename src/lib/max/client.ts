// src/lib/max/client.ts
// Клиент MAX HTTP API: https://dev.max.ru/docs-api (platform-api.max.ru + Authorization)

import type { InlineKeyboardMarkup, InlineKeyboardButton, MAXUpdate } from '@/types';
import { requireMaxBotToken } from '@/lib/env';
import logger from '@/utils/logger';

/** База REST API (не botapi Telegram-стиля /botTOKEN/method) */
function getPlatformBaseUrl(): string {
  let u = process.env.MAX_API_URL?.trim() || 'https://platform-api.max.ru';
  if (u.includes('botapi.max.ru')) {
    u = 'https://platform-api.max.ru';
  }
  return u.replace(/\/$/, '');
}

type QueryRecord = Record<string, string | number | boolean | undefined | null>;

async function platformRequest<T = unknown>(
  path: string,
  opts: {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    query?: QueryRecord;
    body?: Record<string, unknown> | null;
  }
): Promise<T> {
  const token = requireMaxBotToken();
  const base = getPlatformBaseUrl();
  const url = new URL(path.replace(/^\//, ''), `${base}/`);

  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }

  /** Любой переданный объект (включая пустой `{}`) сериализуется в JSON. MAX API для POST /answers требует непустое тело — минимум `{}`. */
  const hasJsonBody =
    opts.body != null && typeof opts.body === 'object' && !Array.isArray(opts.body);

  const init: RequestInit = {
    method: opts.method,
    headers: {
      Authorization: token,
      ...(hasJsonBody ? { 'Content-Type': 'application/json' } : {}),
    },
  };

  if (hasJsonBody) {
    init.body = JSON.stringify(opts.body);
  }

  const res = await fetch(url.toString(), init);
  const raw = await res.text();

  if (!res.ok) {
    logger.error({ path, status: res.status, raw }, 'MAX platform API error');
    throw new Error(`MAX API error ${res.status}: ${raw}`);
  }

  if (!raw) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return {} as T;
  }
}

/** Telegram-совместимая inline_keyboard → вложения MAX */
function mapInlineKeyboardToAttachments(markup?: InlineKeyboardMarkup): Array<Record<string, unknown>> | undefined {
  if (!markup?.inline_keyboard?.length) return undefined;

  const buttons = markup.inline_keyboard.map((row: InlineKeyboardButton[]) =>
    row.map((btn) => {
      if (btn.url) {
        return { type: 'link', text: btn.text, url: btn.url };
      }
      return { type: 'callback', text: btn.text, payload: btn.callback_data ?? '' };
    })
  );

  return [{ type: 'inline_keyboard', payload: { buttons } }];
}

// ==========================================
// Отправка сообщения — POST /messages
// Документация: для сообщения пользователю — query user_id (id пользователя в MAX).
// chat_id — только для отправки в чат (группа и т.д.), не путать с recipient.chat_id из вебхука.
// ==========================================

export async function sendMessage(
  recipientId: number,
  text: string,
  options: {
    reply_markup?: InlineKeyboardMarkup;
    parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
    disable_web_page_preview?: boolean;
    /** true — recipientId это chat_id (групповой чат). Иначе — user_id личного пользователя. */
    recipientChatId?: boolean;
  } = {}
): Promise<void> {
  const body: Record<string, unknown> = { text };

  if (options.parse_mode === 'HTML') {
    body.format = 'html';
  } else if (options.parse_mode === 'Markdown' || options.parse_mode === 'MarkdownV2') {
    body.format = 'markdown';
  }

  const attachments = mapInlineKeyboardToAttachments(options.reply_markup);
  if (attachments) {
    body.attachments = attachments;
  }

  const query: QueryRecord = options.recipientChatId
    ? { chat_id: recipientId }
    : { user_id: recipientId };
  if (options.disable_web_page_preview !== undefined) {
    query.disable_link_preview = options.disable_web_page_preview;
  }

  await platformRequest('messages', { method: 'POST', query, body });
}

// ==========================================
// Отправка сообщения с кнопками (хелпер)
// ==========================================

export async function sendMessageWithKeyboard(
  recipientId: number,
  text: string,
  keyboard: InlineKeyboardMarkup,
  opts?: { recipientChatId?: boolean }
): Promise<void> {
  await sendMessage(recipientId, text, {
    reply_markup: keyboard,
    parse_mode: 'Markdown',
    recipientChatId: opts?.recipientChatId,
  });
}

// ==========================================
// Ответ на callback — POST /answers
// ==========================================

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
  _showAlert: boolean = false
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (text) {
    body.notification = text;
  }
  await platformRequest('answers', {
    method: 'POST',
    query: { callback_id: callbackQueryId },
    body,
  });
}

// ==========================================
// Редактирование сообщения — PUT /messages
// ==========================================

export async function editMessageText(
  _chatId: number,
  messageId: number,
  text: string,
  options: {
    reply_markup?: InlineKeyboardMarkup;
    parse_mode?: 'HTML' | 'Markdown';
  } = {}
): Promise<void> {
  const body: Record<string, unknown> = { text };
  if (options.parse_mode === 'HTML') {
    body.format = 'html';
  } else if (options.parse_mode === 'Markdown') {
    body.format = 'markdown';
  }
  const attachments = mapInlineKeyboardToAttachments(options.reply_markup);
  if (attachments) {
    body.attachments = attachments;
  }

  await platformRequest('messages', {
    method: 'PUT',
    query: {
      message_id: String(messageId),
    },
    body,
  });
}

// ==========================================
// Вебхук — в MAX используется POST /subscriptions (см. scripts/set-max-webhook.mjs)
// ==========================================

export async function setWebhook(_webhookUrl: string): Promise<void> {
  throw new Error(
    'Для MAX используйте platform-api: npm run webhook:set -- <url> (скрипт scripts/set-max-webhook.mjs), не Telegram setWebhook.'
  );
}

export async function deleteWebhook(): Promise<void> {
  throw new Error('Удаление подписки — через кабинет MAX / API subscriptions, не через deleteWebhook.');
}

// ==========================================
// Профиль бота — GET /me
// ==========================================

export async function getMe(): Promise<{ id: number; username: string; first_name: string }> {
  const data = await platformRequest<{ user_id?: number; name?: string; username?: string | null }>('me', {
    method: 'GET',
  });
  return {
    id: data.user_id ?? 0,
    username: data.username ?? '',
    first_name: data.name ?? '',
  };
}

// ==========================================
// Хелперы для формирования клавиатур
// ==========================================

export function buildKeyboard(rows: Array<Array<{ text: string; callback_data: string }>>): InlineKeyboardMarkup {
  return {
    inline_keyboard: rows,
  };
}

export function buildUrlKeyboard(rows: Array<Array<{ text: string; url: string }>>): InlineKeyboardMarkup {
  return {
    inline_keyboard: rows,
  };
}

// ==========================================
// Стандартные клавиатуры
// ==========================================

export const MAIN_MENU_KEYBOARD: InlineKeyboardMarkup = {
  inline_keyboard: [
    [
      { text: '🤒 Симптомы', callback_data: 'cmd:symptom' },
      { text: '📊 Метрики', callback_data: 'cmd:metrics' },
    ],
    [
      { text: '⏰ Напоминания', callback_data: 'cmd:reminders' },
      { text: '💪 Привычки', callback_data: 'cmd:habits' },
    ],
    [
      { text: '👨‍⚕️ Визит к врачу', callback_data: 'cmd:appointment' },
      { text: '📋 Больничный', callback_data: 'cmd:sickleave' },
    ],
    [
      { text: '❓ Помощь', callback_data: 'cmd:help' },
    ],
  ],
};

export const AFTER_SYMPTOM_KEYBOARD: InlineKeyboardMarkup = {
  inline_keyboard: [
    [
      { text: '👨‍⚕️ Визит к врачу', callback_data: 'action:appointment_start' },
      { text: '💊 Добавить напоминание', callback_data: 'action:reminder_start' },
    ],
    [
      { text: '📝 Сохранить в дневник', callback_data: 'action:save_to_diary' },
    ],
    [
      { text: '🏠 Главное меню', callback_data: 'cmd:main_menu' },
    ],
  ],
};

export const METRICS_KEYBOARD: InlineKeyboardMarkup = {
  inline_keyboard: [
    [
      { text: '🩺 Давление', callback_data: 'metric:blood_pressure' },
      { text: '❤️ Пульс', callback_data: 'metric:pulse' },
    ],
    [
      { text: '🩸 Сахар', callback_data: 'metric:blood_sugar' },
      { text: '⚖️ Вес', callback_data: 'metric:weight' },
    ],
    [
      { text: '😴 Сон', callback_data: 'metric:sleep_quality' },
      { text: '😊 Настроение', callback_data: 'metric:mood' },
    ],
    [
      { text: '🌡️ Температура', callback_data: 'metric:temperature' },
    ],
    [
      { text: '📈 Посмотреть все', callback_data: 'metric:view_all' },
    ],
  ],
};

// Хелпер для отправки сообщений об ошибках пользователю
export async function sendError(
  recipientId: number,
  details?: string,
  opts?: { recipientChatId?: boolean }
): Promise<void> {
  const text = details
    ? `❌ Произошла ошибка: ${details}\n\nПопробуйте ещё раз или напишите /help`
    : '❌ Что-то пошло не так. Попробуйте ещё раз или напишите /help';

  await sendMessage(recipientId, text, { recipientChatId: opts?.recipientChatId });
}

// Разбор объекта MAXUpdate для извлечения основных данных
export function extractUpdateData(update: MAXUpdate): {
  chatId: number;
  userId: number;
  text: string;
  callbackData?: string;
  callbackQueryId?: string;
  messageId?: number;
  username?: string;
  firstName?: string;
} | null {
  if (update.message) {
    const { message } = update;
    return {
      chatId: message.chat.id,
      userId: message.from?.id ?? message.chat.id,
      text: message.text ?? '',
      messageId: message.message_id,
      username: message.from?.username,
      firstName: message.from?.first_name,
    };
  }

  if (update.callback_query) {
    const { callback_query } = update;
    const rawId = callback_query.id as string | number | undefined;
    const callbackQueryId =
      rawId !== undefined && rawId !== null && String(rawId).trim() !== '' ? String(rawId) : undefined;
    return {
      chatId: callback_query.message?.chat.id ?? callback_query.from.id,
      userId: callback_query.from.id,
      text: callback_query.data ?? '',
      callbackData: callback_query.data,
      callbackQueryId,
      messageId: callback_query.message?.message_id,
      username: callback_query.from.username,
      firstName: callback_query.from.first_name,
    };
  }

  return null;
}
