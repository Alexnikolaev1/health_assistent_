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
import { SICK_LEAVE_INFO_TEXT } from '@/lib/physician-reminder';
import logger from '@/utils/logger';

export async function handleStart(maxUserId: number, firstName?: string): Promise<void> {
  const suffix = firstName ? `, ${firstName}` : '';
  await sendMessageWithKeyboard(maxUserId, buildWelcomeBody(suffix), MAIN_MENU_KEYBOARD);
}

export async function handleHelp(maxUserId: number): Promise<void> {
  await sendMessageWithKeyboard(maxUserId, HELP_TEXT, MAIN_MENU_KEYBOARD);
}

export async function handleSymptomCommand(maxUserId: number, dbUserId: number, text: string): Promise<void> {
  const symptomText = text.replace('/symptom', '').trim();
  if (!symptomText) {
    await setConversationContext(dbUserId, 'dialog', { state: 'waiting_symptom' }, 10);
    await sendMessage(
      maxUserId,
      `🤒 Опишите ваши симптомы подробно:\n\n_Например: болит голова и температура 37.5_`,
      { parse_mode: 'Markdown' }
    );
    return;
  }
  await handleSymptomAnalysis(maxUserId, dbUserId, symptomText);
}

export async function handleSymptomAnalysis(maxUserId: number, dbUserId: number, symptomText: string): Promise<void> {
  await sendMessage(maxUserId, `⏳ Анализирую симптомы...`);

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

    await sendMessageWithKeyboard(maxUserId, message, AFTER_SYMPTOM_KEYBOARD);
  } catch (error) {
    logger.error({ error, dbUserId }, 'Symptom analysis failed');
    await sendError(maxUserId, 'Не удалось проанализировать симптомы. Проверьте настройки YandexGPT.');
  }
}

export async function handleMetricsCommand(maxUserId: number, dbUserId: number): Promise<void> {
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

  await sendMessageWithKeyboard(maxUserId, message, METRICS_KEYBOARD);
}

export async function handleReminderCommand(
  maxUserId: number,
  dbUserId: number,
  text: string
): Promise<void> {
  const parts = text.replace('/reminder', '').trim();

  if (parts.startsWith('add ') || parts.startsWith('add"')) {
    const parsed = parseReminderCommand(parts.replace(/^add\s*/, ''));
    if (parsed) {
      const reminder = await createReminder(dbUserId, parsed.text, parsed.time);
      await scheduleDailyReminder(reminder.id, dbUserId, maxUserId, parsed.text, parsed.time);
      await sendMessage(maxUserId, `✅ Напоминание добавлено: *${parsed.text}* в *${parsed.time}*`, {
        parse_mode: 'Markdown',
      });
      return;
    }
  }

  if (!parts || parts === 'list') {
    const reminders = await getUserReminders(dbUserId);
    if (reminders.length === 0) {
      await sendMessageWithKeyboard(
        maxUserId,
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

    await sendMessageWithKeyboard(maxUserId, message, { inline_keyboard: keyboard });
    return;
  }

  await setConversationContext(dbUserId, 'dialog', { state: 'waiting_reminder_name' }, 10);
  await sendMessage(maxUserId, `💊 Введите название лекарства или напоминания:`);
}

export async function handleHabitsCommand(
  maxUserId: number,
  dbUserId: number,
  text: string
): Promise<void> {
  const parts = text.replace(/^\/habits?\s*/, '').trim();

  if (parts === 'stats') {
    const habits = await getUserHabits(dbUserId);
    if (habits.length === 0) {
      await sendMessage(maxUserId, `📊 Нет привычек для статистики.`);
      return;
    }
    let statsMessage = `📊 *Статистика привычек (7 дней):*\n\n`;
    for (const habit of habits) {
      const stats = await getHabitStats(dbUserId, habit.id, 7);
      statsMessage += formatHabitStats(habit, stats) + '\n\n';
    }
    await sendMessage(maxUserId, statsMessage, { parse_mode: 'Markdown' });
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

    await sendMessageWithKeyboard(maxUserId, message, { inline_keyboard: keyboard });
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
      await sendMessage(maxUserId, `✅ Привычка *${parsed.name}* добавлена!`, { parse_mode: 'Markdown' });
    } else {
      await sendMessage(
        maxUserId,
        `⚠️ Формат: /habit add "название" every 2h\nили: /habit add "название" daily at 09:00`
      );
    }
    return;
  }

  await sendMessageWithKeyboard(
    maxUserId,
    `Не распознал команду. Используйте:\n` +
      `• /habits — список привычек\n` +
      `• /habits stats — статистика\n` +
      `• /habit add "название" every 2h или daily at 09:00`,
    MAIN_MENU_KEYBOARD
  );
}

export async function handleAppointmentCommand(
  maxUserId: number,
  _dbUserId: number
): Promise<void> {
  await sendMessageWithKeyboard(
    maxUserId,
    `👨‍⚕️ *Визит к врачу*\n\nВыберите специальности — бот подскажет, что сказать на приёме (запись в поликлинику вы оформляете сами).`,
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

export async function handleSickLeaveCommand(maxUserId: number, _dbUserId: number): Promise<void> {
  await sendMessage(maxUserId, SICK_LEAVE_INFO_TEXT, {
    parse_mode: 'Markdown',
    reply_markup: MAIN_MENU_KEYBOARD,
  });
}

/**
 * Поток без активного многошагового диалога: команды и свободный текст.
 */
export async function dispatchPlainMessage(
  maxUserId: number,
  dbUserId: number,
  text: string,
  firstName?: string
): Promise<void> {
  if (text.startsWith('/start')) {
    await handleStart(maxUserId, firstName);
    return;
  }
  if (text.startsWith('/help')) {
    await handleHelp(maxUserId);
    return;
  }
  if (text.startsWith('/symptom')) {
    await handleSymptomCommand(maxUserId, dbUserId, text);
    return;
  }
  if (text.startsWith('/metrics')) {
    await handleMetricsCommand(maxUserId, dbUserId);
    return;
  }
  if (text.startsWith('/reminder')) {
    await handleReminderCommand(maxUserId, dbUserId, text);
    return;
  }
  if (text.startsWith('/habits') || text.startsWith('/habit')) {
    await handleHabitsCommand(maxUserId, dbUserId, text);
    return;
  }
  if (text.startsWith('/appointment')) {
    await handleAppointmentCommand(maxUserId, dbUserId);
    return;
  }
  if (text.startsWith('/sickleave')) {
    await handleSickLeaveCommand(maxUserId, dbUserId);
    return;
  }

  const metric = parseMetricFromText(text);
  if (metric) {
    await saveMetric(dbUserId, metric.type, metric.value);
    await sendMessage(
      maxUserId,
      `✅ Сохранено: ${getMetricDisplayName(metric.type)} — *${metric.normalized}*`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  if (isSymptomText(text) && text.length > 15) {
    await handleSymptomAnalysis(maxUserId, dbUserId, text);
    return;
  }

  await sendMessage(
    maxUserId,
    `Привет! Не совсем понял. Воспользуйтесь меню или опишите симптомы.`,
    { reply_markup: MAIN_MENU_KEYBOARD }
  );
}
