// src/lib/max/client.ts
// Клиент для MAX Bot API (совместим с Telegram Bot API)

import { InlineKeyboardMarkup, MAXUpdate } from '@/types';
import logger from '@/utils/logger';

const MAX_API_URL = process.env.MAX_API_URL || 'https://botapi.max.ru';
const BOT_TOKEN = process.env.MAX_BOT_TOKEN || '';

// Базовый fetch-обёртка для MAX API
async function maxApiCall<T = unknown>(
  method: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const url = `${MAX_API_URL}/bot${BOT_TOKEN}/${method}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ method, status: response.status, error: errorText }, 'MAX API error');
      throw new Error(`MAX API error ${response.status}: ${errorText}`);
    }

    const data = await response.json() as { ok: boolean; result: T; description?: string };

    if (!data.ok) {
      throw new Error(`MAX API returned ok=false: ${data.description}`);
    }

    return data.result;
  } catch (error) {
    logger.error({ method, params, error }, 'MAX API call failed');
    throw error;
  }
}

// ==========================================
// Отправка сообщения
// ==========================================

export async function sendMessage(
  chatId: number,
  text: string,
  options: {
    reply_markup?: InlineKeyboardMarkup;
    parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
    disable_web_page_preview?: boolean;
  } = {}
): Promise<void> {
  await maxApiCall('sendMessage', {
    chat_id: chatId,
    text,
    ...options,
  });
}

// ==========================================
// Отправка сообщения с кнопками (хелпер)
// ==========================================

export async function sendMessageWithKeyboard(
  chatId: number,
  text: string,
  keyboard: InlineKeyboardMarkup
): Promise<void> {
  await sendMessage(chatId, text, { reply_markup: keyboard });
}

// ==========================================
// Ответ на callback query (убирает "часики" на кнопке)
// ==========================================

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
  showAlert: boolean = false
): Promise<void> {
  await maxApiCall('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    ...(text && { text }),
    show_alert: showAlert,
  });
}

// ==========================================
// Редактирование сообщения
// ==========================================

export async function editMessageText(
  chatId: number,
  messageId: number,
  text: string,
  options: {
    reply_markup?: InlineKeyboardMarkup;
    parse_mode?: 'HTML' | 'Markdown';
  } = {}
): Promise<void> {
  await maxApiCall('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    ...options,
  });
}

// ==========================================
// Установка вебхука
// ==========================================

export async function setWebhook(webhookUrl: string): Promise<void> {
  await maxApiCall('setWebhook', {
    url: webhookUrl,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true,
  });
  logger.info({ webhookUrl }, 'Webhook set successfully');
}

// ==========================================
// Удаление вебхука
// ==========================================

export async function deleteWebhook(): Promise<void> {
  await maxApiCall('deleteWebhook', { drop_pending_updates: true });
}

// ==========================================
// Получение информации о боте
// ==========================================

export async function getMe(): Promise<{ id: number; username: string; first_name: string }> {
  return maxApiCall('getMe');
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
      { text: '📅 Запись к врачу', callback_data: 'cmd:appointment' },
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
      { text: '📅 Записаться к врачу', callback_data: 'action:appointment_start' },
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
export async function sendError(chatId: number, details?: string): Promise<void> {
  const text = details
    ? `❌ Произошла ошибка: ${details}\n\nПопробуйте ещё раз или напишите /help`
    : '❌ Что-то пошло не так. Попробуйте ещё раз или напишите /help';

  await sendMessage(chatId, text);
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
    return {
      chatId: callback_query.message?.chat.id ?? callback_query.from.id,
      userId: callback_query.from.id,
      text: callback_query.data ?? '',
      callbackData: callback_query.data,
      callbackQueryId: callback_query.id,
      messageId: callback_query.message?.message_id,
      username: callback_query.from.username,
      firstName: callback_query.from.first_name,
    };
  }

  return null;
}
