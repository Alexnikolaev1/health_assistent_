/**
 * Inline-кнопки: cmd:*, metric:*, action:*, запись к врачу, привычки, напоминания.
 */

import {
  sendMessage,
  sendMessageWithKeyboard,
  answerCallbackQuery,
  MAIN_MENU_KEYBOARD,
} from '@/lib/max/client';
import {
  setConversationContext,
  getConversationContext,
  clearConversationContext,
  createHabit,
  getUserHabits,
  completeHabit,
  getHabitStats,
  createAppointment,
  deactivateReminder,
} from '@/lib/db';
import type { MetricType } from '@/types';
import { getMetricDisplayName } from '@/utils/parsers';
import { formatHabitStats, CHALLENGES } from '@/lib/habits/engine';
import {
  handleStart,
  handleHelp,
  handleMetricsCommand,
  handleReminderCommand,
  handleHabitsCommand,
  handleAppointmentCommand,
  handleSickLeaveCommand,
} from './dispatch';

export async function handleInlineCallback(
  chatId: number,
  dbUserId: number,
  maxUserId: number,
  data: string
): Promise<void> {
  if (data.startsWith('cmd:')) {
    const cmd = data.replace('cmd:', '');
    switch (cmd) {
      case 'main_menu':
        await sendMessageWithKeyboard(chatId, '🏠 Главное меню:', MAIN_MENU_KEYBOARD);
        return;
      case 'symptom':
        await setConversationContext(dbUserId, 'dialog', { state: 'waiting_symptom' }, 10);
        await sendMessage(chatId, `🤒 Опишите ваши симптомы:`);
        return;
      case 'metrics':
        await handleMetricsCommand(chatId, dbUserId);
        return;
      case 'reminders':
        await handleReminderCommand(chatId, dbUserId, maxUserId, '/reminder list');
        return;
      case 'habits':
        await handleHabitsCommand(chatId, dbUserId, maxUserId, '/habits');
        return;
      case 'appointment':
        await handleAppointmentCommand(chatId, dbUserId, maxUserId);
        return;
      case 'sickleave':
        await handleSickLeaveCommand(chatId, dbUserId);
        return;
      case 'help':
        await handleHelp(chatId);
        return;
    }
  }

  if (data.startsWith('metric:')) {
    const rawMetric = data.replace('metric:', '');
    if (rawMetric === 'view_all') {
      await handleMetricsCommand(chatId, dbUserId);
      return;
    }
    const metricType = rawMetric as MetricType;
    await setConversationContext(
      dbUserId,
      'dialog',
      { state: 'waiting_metric_value', metric_type: metricType },
      5
    );
    await sendMessage(chatId, `Введите значение для ${getMetricDisplayName(metricType)}:`);
    return;
  }

  if (data.startsWith('action:')) {
    const action = data.replace('action:', '');
    switch (action) {
      case 'appointment_start':
        await handleAppointmentCommand(chatId, dbUserId, maxUserId);
        return;
      case 'reminder_start':
        await setConversationContext(dbUserId, 'dialog', { state: 'waiting_reminder_name' }, 10);
        await sendMessage(chatId, `💊 Введите название лекарства или напоминания:`);
        return;
      case 'save_to_diary': {
        const ctx = await getConversationContext(dbUserId, 'last_symptom');
        if (ctx) {
          await sendMessage(chatId, `✅ Симптомы сохранены в историю!`);
        } else {
          await sendMessage(chatId, `⚠️ Нет данных для сохранения.`);
        }
        return;
      }
      case 'habit_start':
        await setConversationContext(dbUserId, 'dialog', { state: 'waiting_habit_name' }, 10);
        await sendMessage(chatId, `💪 Введите название привычки:`);
        return;
    }
  }

  if (data.startsWith('appt_spec:')) {
    const specialty = data.replace('appt_spec:', '');
    if (specialty === 'other') {
      await setConversationContext(dbUserId, 'dialog', { state: 'waiting_appointment_specialty' }, 10);
      await sendMessage(chatId, `Введите нужную специальность:`);
      return;
    }
    await setConversationContext(dbUserId, 'dialog', { state: 'waiting_appointment_city', specialty }, 10);
    await sendMessage(chatId, `📍 В каком городе ищем запись к *${specialty}*?`, { parse_mode: 'Markdown' });
    return;
  }

  if (data.startsWith('appt:')) {
    if (data === 'appt:cancel') {
      await sendMessageWithKeyboard(chatId, '❌ Запись отменена.', MAIN_MENU_KEYBOARD);
      return;
    }
    const parts = data.split(':');
    const date = parts[2];
    const time = parts[3];
    const doctorName = parts.slice(4).join(':');

    await createAppointment(dbUserId, 'Терапевт', doctorName, undefined, date, time);
    await sendMessage(
      chatId,
      `✅ *Запись подтверждена!*\n\n👨‍⚕️ Врач: ${doctorName}\n📅 Дата: ${date}\n⏰ Время: ${time}\n\n📲 Подтверждение придёт через Госуслуги.`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  if (data.startsWith('habit_freq:')) {
    const ctx = await getConversationContext(dbUserId, 'dialog');
    const habitName = (ctx?.name as string) ?? 'Новая привычка';

    const freqParts = data.replace('habit_freq:', '').split(':');
    const freqType = freqParts[0] as 'interval' | 'daily';

    if (freqType === 'interval') {
      const hours = parseInt(freqParts[1], 10);
      await createHabit(dbUserId, habitName, 'interval', { frequencyHours: hours });
      await clearConversationContext(dbUserId, 'dialog');
      await sendMessage(
        chatId,
        `✅ Привычка *${habitName}* добавлена! Буду напоминать каждые ${hours} ч.`,
        { parse_mode: 'Markdown' }
      );
    } else {
      const time = `${freqParts[1]}:${freqParts[2]}`;
      await createHabit(dbUserId, habitName, 'daily', { scheduledTime: time });
      await clearConversationContext(dbUserId, 'dialog');
      await sendMessage(
        chatId,
        `✅ Привычка *${habitName}* добавлена! Буду напоминать ежедневно в ${time}.`,
        { parse_mode: 'Markdown' }
      );
    }
    return;
  }

  if (data.startsWith('habit:')) {
    const parts = data.split(':');
    const action = parts[1];

    if (action === 'complete') {
      const habitId = parseInt(parts[2], 10);
      if (Number.isNaN(habitId)) {
        await sendMessage(chatId, `⚠️ Обновите список привычек и нажмите кнопку снова.`);
        return;
      }
      await completeHabit(habitId, dbUserId);
      await sendMessage(chatId, `🎉 Отлично! Привычка выполнена! 🔥`);
      return;
    }

    if (action === 'stats') {
      const habits = await getUserHabits(dbUserId);
      let statsMsg = `📊 *Статистика (7 дней):*\n\n`;
      for (const habit of habits) {
        const stats = await getHabitStats(dbUserId, habit.id, 7);
        statsMsg += formatHabitStats(habit, stats) + '\n\n';
      }
      await sendMessage(chatId, statsMsg, { parse_mode: 'Markdown' });
      return;
    }

    if (action === 'challenges') {
      let msg = `🏆 *Доступные челленджи:*\n\n`;
      const keyboard: Array<Array<{ text: string; callback_data: string }>> = [];

      CHALLENGES.forEach((c) => {
        msg += `${c.emoji} *${c.name}*\n${c.description}\n_Длительность: ${c.durationDays} дней_\n\n`;
        keyboard.push([{ text: `${c.emoji} Начать: ${c.name}`, callback_data: `habit:start_challenge:${c.id}` }]);
      });

      keyboard.push([{ text: '⬅️ Назад', callback_data: 'cmd:habits' }]);
      await sendMessageWithKeyboard(chatId, msg, { inline_keyboard: keyboard });
      return;
    }

    if (action === 'start_challenge') {
      const challengeId = parts[2];
      const challenge = CHALLENGES.find((c) => c.id === challengeId);
      if (!challenge) return;

      await createHabit(dbUserId, challenge.name, 'challenge', {
        description: challenge.description,
        challengeId: challenge.id,
        scheduledTime: '09:00',
      });

      await sendMessage(
        chatId,
        `🚀 Челлендж *${challenge.name}* начат!\n\n${challenge.description}\n\nБуду поддерживать вас ${challenge.durationDays} дней! 💪`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    if (action === 'skip') {
      await sendMessage(chatId, `⏭ Пропуск отмечен. При необходимости напомню позже через меню привычек.`);
      return;
    }
  }

  if (data.startsWith('reminder:delete:')) {
    const reminderId = parseInt(data.replace('reminder:delete:', ''), 10);
    await deactivateReminder(reminderId, dbUserId);
    await sendMessage(chatId, `✅ Напоминание удалено.`);
    return;
  }

  if (data.startsWith('reminder:ack')) {
    await sendMessage(chatId, `✅ Принято. Не забывайте о режиме приёма и рекомендациях врача.`);
    return;
  }

  if (data.startsWith('reminder:skip') || data === 'reminder:skip') {
    await sendMessage(
      chatId,
      `⏭ Пропуск отмечен. Если лекарство критично, уточните схему у врача.`
    );
    return;
  }

  if (data === 'cancel') {
    await clearConversationContext(dbUserId, 'dialog');
    await sendMessageWithKeyboard(chatId, `❌ Действие отменено.`, MAIN_MENU_KEYBOARD);
  }
}

export async function handleCallbackQuery(
  chatId: number,
  dbUserId: number,
  maxUserId: number,
  data: string,
  callbackQueryId: string
): Promise<void> {
  await answerCallbackQuery(callbackQueryId);
  await handleInlineCallback(chatId, dbUserId, maxUserId, data);
}
