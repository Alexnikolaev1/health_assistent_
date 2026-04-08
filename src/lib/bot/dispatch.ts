/**
 * Маршрутизация входящего текста без активного диалогового контекста:
 * команды, быстрые метрики, эвристика симптомов, fallback.
 */

import {
  sendMessage,
  sendMessageWithKeyboard,
  MAIN_MENU_KEYBOARD,
  AFTER_SYMPTOM_KEYBOARD,
  METRICS_KEYBOARD,
  buildKeyboard,
  sendError,
} from '@/lib/max/client';
import {
  saveMetric,
  getLatestMetrics,
  createReminder,
  getUserReminders,
  createHabit,
  getUserHabits,
  getHabitStats,
  setConversationContext,
  saveSymptomHistory,
} from '@/lib/db';
import { analyzeSymptoms, formatSymptomAnalysisMessage } from '@/lib/ai/yandexGPT';
import {
  parseMetricFromText,
  parseReminderCommand,
  parseHabitCommand,
  isSymptomText,
  getMetricDisplayName,
  formatMetricValue,
  formatDate,
} from '@/utils/parsers';
import { formatHabitsList, formatHabitStats } from '@/lib/habits/engine';
import { scheduleDailyReminder } from '@/lib/reminders/scheduler';
import { buildWelcomeBody, HELP_TEXT } from '@/lib/bot/copy';
import logger from '@/utils/logger';

export async function handleStart(chatId: number, firstName?: string): Promise<void> {
  const suffix = firstName ? `, ${firstName}` : '';
  await sendMessageWithKeyboard(chatId, buildWelcomeBody(suffix), MAIN_MENU_KEYBOARD);
}

export async function handleHelp(chatId: number): Promise<void> {
  await sendMessageWithKeyboard(chatId, HELP_TEXT, MAIN_MENU_KEYBOARD);
}

export async function handleSymptomCommand(chatId: number, dbUserId: number, text: string): Promise<void> {
  const symptomText = text.replace('/symptom', '').trim();
  if (!symptomText) {
    await setConversationContext(dbUserId, 'dialog', { state: 'waiting_symptom' }, 10);
    await sendMessage(
      chatId,
      `🤒 Опишите ваши симптомы подробно:\n\n_Например: болит голова и температура 37.5_`,
      { parse_mode: 'Markdown' }
    );
    return;
  }
  await handleSymptomAnalysis(chatId, dbUserId, symptomText);
}

export async function handleSymptomAnalysis(chatId: number, dbUserId: number, symptomText: string): Promise<void> {
  await sendMessage(chatId, `⏳ Анализирую симптомы...`);

  try {
    const result = await analyzeSymptoms(symptomText);
    const message = formatSymptomAnalysisMessage(result);

    await saveSymptomHistory(
      dbUserId,
      symptomText,
      result.raw_response,
      result.diagnosis,
      result.doctor_type,
      result.urgency
    );

    await setConversationContext(
      dbUserId,
      'last_symptom',
      {
        diagnosis: result.diagnosis,
        doctor_type: result.doctor_type,
      },
      60
    );

    await sendMessageWithKeyboard(chatId, message, AFTER_SYMPTOM_KEYBOARD);
  } catch (error) {
    logger.error({ error, dbUserId }, 'Symptom analysis failed');
    await sendError(chatId, 'Не удалось проанализировать симптомы. Проверьте настройки YandexGPT.');
  }
}

export async function handleMetricsCommand(chatId: number, dbUserId: number): Promise<void> {
  const metrics = await getLatestMetrics(dbUserId);

  let message = `📊 *Ваш дневник здоровья*\n\n`;

  if (metrics.length === 0) {
    message += `Пока нет записей. Начните вести дневник!\n`;
  } else {
    metrics.forEach((m) => {
      const date = formatDate(new Date(m.recorded_at));
      message += `${getMetricDisplayName(m.metric_type)}: *${formatMetricValue(m.metric_type, m.value)}* _(${date})_\n`;
    });
  }

  message += `\nЧто добавить?`;

  await sendMessageWithKeyboard(chatId, message, METRICS_KEYBOARD);
}

export async function handleReminderCommand(
  chatId: number,
  dbUserId: number,
  maxUserId: number,
  text: string
): Promise<void> {
  const parts = text.replace('/reminder', '').trim();

  if (parts.startsWith('add ') || parts.startsWith('add"')) {
    const parsed = parseReminderCommand(parts.replace(/^add\s*/, ''));
    if (parsed) {
      const reminder = await createReminder(dbUserId, parsed.text, parsed.time);
      await scheduleDailyReminder(reminder.id, dbUserId, maxUserId, parsed.text, parsed.time);
      await sendMessage(chatId, `✅ Напоминание добавлено: *${parsed.text}* в *${parsed.time}*`, {
        parse_mode: 'Markdown',
      });
      return;
    }
  }

  if (!parts || parts === 'list') {
    const reminders = await getUserReminders(dbUserId);
    if (reminders.length === 0) {
      await sendMessageWithKeyboard(
        chatId,
        `⏰ У вас нет активных напоминаний.\n\nДобавьте первое:`,
        {
          inline_keyboard: [[{ text: '➕ Добавить напоминание', callback_data: 'action:reminder_start' }]],
        }
      );
      return;
    }

    let message = `⏰ *Ваши напоминания:*\n\n`;
    const keyboard: Array<Array<{ text: string; callback_data: string }>> = [];

    reminders.forEach((r, i) => {
      message += `${i + 1}. 💊 *${r.text}* — ${r.reminder_time}\n`;
      keyboard.push([{ text: `❌ Удалить: ${r.text}`, callback_data: `reminder:delete:${r.id}` }]);
    });

    keyboard.push([{ text: '➕ Добавить', callback_data: 'action:reminder_start' }]);

    await sendMessageWithKeyboard(chatId, message, { inline_keyboard: keyboard });
    return;
  }

  await setConversationContext(dbUserId, 'dialog', { state: 'waiting_reminder_name' }, 10);
  await sendMessage(chatId, `💊 Введите название лекарства или напоминания:`);
}

export async function handleHabitsCommand(
  chatId: number,
  dbUserId: number,
  maxUserId: number,
  text: string
): Promise<void> {
  const parts = text.replace(/^\/habits?\s*/, '').trim();

  if (parts === 'stats') {
    const habits = await getUserHabits(dbUserId);
    if (habits.length === 0) {
      await sendMessage(chatId, `📊 Нет привычек для статистики.`);
      return;
    }
    let statsMessage = `📊 *Статистика привычек (7 дней):*\n\n`;
    for (const habit of habits) {
      const stats = await getHabitStats(dbUserId, habit.id, 7);
      statsMessage += formatHabitStats(habit, stats) + '\n\n';
    }
    await sendMessage(chatId, statsMessage, { parse_mode: 'Markdown' });
    return;
  }

  if (!parts || parts === 'list') {
    const habits = await getUserHabits(dbUserId);
    const message = formatHabitsList(habits);

    const keyboard: Array<Array<{ text: string; callback_data: string }>> = [];
    habits.forEach((h) => {
      keyboard.push([{ text: `✅ ${h.name}`, callback_data: `habit:complete:${h.id}` }]);
    });
    keyboard.push([{ text: '➕ Добавить привычку', callback_data: 'action:habit_start' }]);
    keyboard.push([{ text: '🏆 Челленджи', callback_data: 'habit:challenges' }]);
    keyboard.push([{ text: '📊 Статистика', callback_data: 'habit:stats' }]);

    await sendMessageWithKeyboard(chatId, message, { inline_keyboard: keyboard });
    return;
  }

  if (parts.startsWith('add')) {
    const habitText = parts.replace(/^add\s*/, '');
    const parsed = parseHabitCommand(habitText);
    if (parsed) {
      await createHabit(dbUserId, parsed.name, parsed.type, {
        frequencyHours: parsed.intervalHours,
        scheduledTime: parsed.scheduledTime,
      });
      await sendMessage(chatId, `✅ Привычка *${parsed.name}* добавлена!`, { parse_mode: 'Markdown' });
    } else {
      await sendMessage(
        chatId,
        `⚠️ Формат: /habit add "название" every 2h\nили: /habit add "название" daily at 09:00`
      );
    }
    return;
  }

  await sendMessageWithKeyboard(
    chatId,
    `Не распознал команду. Используйте:\n` +
      `• /habits — список привычек\n` +
      `• /habits stats — статистика\n` +
      `• /habit add "название" every 2h или daily at 09:00`,
    MAIN_MENU_KEYBOARD
  );
}

export async function handleAppointmentCommand(
  chatId: number,
  _dbUserId: number,
  _maxUserId: number
): Promise<void> {
  await sendMessageWithKeyboard(
    chatId,
    `📅 *Запись к врачу*\n\nВыберите специальность:`,
    buildKeyboard([
      [
        { text: '🩺 Терапевт', callback_data: 'appt_spec:Терапевт' },
        { text: '❤️ Кардиолог', callback_data: 'appt_spec:Кардиолог' },
      ],
      [
        { text: '🧠 Невролог', callback_data: 'appt_spec:Невролог' },
        { text: '🔪 Хирург', callback_data: 'appt_spec:Хирург' },
      ],
      [
        { text: '👁 Офтальмолог', callback_data: 'appt_spec:Офтальмолог' },
        { text: '✍️ Другой', callback_data: 'appt_spec:other' },
      ],
    ])
  );
}

export async function handleSickLeaveCommand(chatId: number, dbUserId: number): Promise<void> {
  await setConversationContext(dbUserId, 'dialog', { state: 'waiting_sickleave_period' }, 15);
  await sendMessage(
    chatId,
    `📋 *Оформление больничного листа*\n\n` +
      `⚠️ _Это демо-режим. Реальный больничный оформляется через поликлинику._\n\n` +
      `Введите период нетрудоспособности в формате:\n*01.01.2024 - 07.01.2024*`,
    { parse_mode: 'Markdown' }
  );
}

/**
 * Поток без активного многошагового диалога: команды и свободный текст.
 */
export async function dispatchPlainMessage(
  chatId: number,
  dbUserId: number,
  maxUserId: number,
  text: string,
  firstName?: string
): Promise<void> {
  if (text.startsWith('/start')) {
    await handleStart(chatId, firstName);
    return;
  }
  if (text.startsWith('/help')) {
    await handleHelp(chatId);
    return;
  }
  if (text.startsWith('/symptom')) {
    await handleSymptomCommand(chatId, dbUserId, text);
    return;
  }
  if (text.startsWith('/metrics')) {
    await handleMetricsCommand(chatId, dbUserId);
    return;
  }
  if (text.startsWith('/reminder')) {
    await handleReminderCommand(chatId, dbUserId, maxUserId, text);
    return;
  }
  if (text.startsWith('/habits') || text.startsWith('/habit')) {
    await handleHabitsCommand(chatId, dbUserId, maxUserId, text);
    return;
  }
  if (text.startsWith('/appointment')) {
    await handleAppointmentCommand(chatId, dbUserId, maxUserId);
    return;
  }
  if (text.startsWith('/sickleave')) {
    await handleSickLeaveCommand(chatId, dbUserId);
    return;
  }

  const metric = parseMetricFromText(text);
  if (metric) {
    await saveMetric(dbUserId, metric.type, metric.value);
    await sendMessage(
      chatId,
      `✅ Сохранено: ${getMetricDisplayName(metric.type)} — *${metric.normalized}*`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  if (isSymptomText(text) && text.length > 15) {
    await handleSymptomAnalysis(chatId, dbUserId, text);
    return;
  }

  await sendMessage(
    chatId,
    `Привет! Не совсем понял. Воспользуйтесь меню или опишите симптомы.`,
    { reply_markup: MAIN_MENU_KEYBOARD }
  );
}
