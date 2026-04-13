/**
 * Многошаговые сценарии (состояния хранятся в conversation_contexts).
 */

import {
  sendMessage,
  sendMessageWithKeyboard,
  buildKeyboard,
  MAIN_MENU_KEYBOARD,
} from '@/lib/max/client';
import {
  saveMetric,
  createReminder,
  clearConversationContext,
  setConversationContext,
} from '@/lib/db';
import { scheduleDailyReminder } from '@/lib/reminders/scheduler';
import {
  parseMetricFromText,
  getMetricDisplayName,
  formatMetricValue,
} from '@/utils/parsers';
import { sendPhysicianReminderToChat } from '@/lib/physician-reminder';
import { handleSymptomAnalysis, dispatchPlainMessage } from './dispatch';
import type { MetricType } from '@/types';

export async function handleDialogContext(
  maxUserId: number,
  dbUserId: number,
  text: string,
  context: Record<string, unknown>,
  firstName?: string
): Promise<void> {
  const state = context.state as string;

  switch (state) {
    case 'waiting_symptom': {
      const t = text.trim();
      await clearConversationContext(dbUserId, 'dialog');
      if (t.length < 10) {
        await sendMessage(
          maxUserId,
          `Опишите симптомы чуть подробнее (не меньше ~10 символов) или используйте /help.`
        );
        return;
      }
      await handleSymptomAnalysis(maxUserId, dbUserId, t);
      return;
    }

    case 'waiting_metric_value': {
      const metricType = context.metric_type as MetricType;
      const metric = parseMetricFromText(`${metricType} ${text}`) ?? parseMetricFromText(text);
      if (!metric) {
        await sendMessage(
          maxUserId,
          `⚠️ Не удалось распознать значение. Введите, например: *120/80* или *75*`,
          { parse_mode: 'Markdown' }
        );
        return;
      }
      await saveMetric(dbUserId, metricType, text.trim());
      await clearConversationContext(dbUserId, 'dialog');
      await sendMessage(
        maxUserId,
        `✅ ${getMetricDisplayName(metricType)}: *${formatMetricValue(metricType, text.trim())}* сохранено!`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    case 'waiting_reminder_name': {
      await setConversationContext(dbUserId, 'dialog', { state: 'waiting_reminder_time', name: text.trim() }, 10);
      await sendMessage(
        maxUserId,
        `⏰ В какое время напомнить? Введите время в формате *ЧЧ:ММ* (например, 20:00):`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    case 'waiting_reminder_time': {
      const timeMatch = text.match(/^(\d{1,2}):(\d{2})$/);
      if (!timeMatch) {
        await sendMessage(
          maxUserId,
          `⚠️ Неверный формат. Введите время как *ЧЧ:ММ*, например: 20:00`,
          { parse_mode: 'Markdown' }
        );
        return;
      }
      const hours = timeMatch[1].padStart(2, '0');
      const minutes = timeMatch[2];
      const time = `${hours}:${minutes}`;
      const reminderName = context.name as string;

      const reminder = await createReminder(dbUserId, reminderName, time);
      await clearConversationContext(dbUserId, 'dialog');

      const qstashId = await scheduleDailyReminder(reminder.id, dbUserId, maxUserId, reminderName, time);
      const qstashHint = qstashId
        ? ''
        : '\n\n_Если уведомление в это время не придёт: на проде должны быть заданы APP_URL и QSTASH_TOKEN._';

      await sendMessage(
        maxUserId,
        `✅ Напоминание добавлено!\n\n💊 *${reminderName}*\n⏰ Каждый день в *${time}* (ваш часовой пояс)${qstashHint}`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    case 'waiting_habit_name': {
      await setConversationContext(dbUserId, 'dialog', { state: 'waiting_habit_frequency', name: text.trim() }, 10);
      await sendMessageWithKeyboard(
        maxUserId,
        `💪 Привычка: *${text.trim()}*\n\nКак часто вы хотите это делать?`,
        buildKeyboard([
          [
            { text: 'Каждые 2 часа', callback_data: 'habit_freq:interval:2' },
            { text: 'Каждые 4 часа', callback_data: 'habit_freq:interval:4' },
          ],
          [
            { text: 'Ежедневно утром (09:00)', callback_data: 'habit_freq:daily:09:00' },
            { text: 'Ежедневно вечером (21:00)', callback_data: 'habit_freq:daily:21:00' },
          ],
          [{ text: '❌ Отмена', callback_data: 'cancel' }],
        ])
      );
      return;
    }

    case 'waiting_physician_specialty_other': {
      const specialty = text.trim();
      if (!specialty) {
        await sendMessage(maxUserId, `Введите название специальности одним сообщением.`);
        return;
      }
      await clearConversationContext(dbUserId, 'dialog');
      await sendPhysicianReminderToChat(maxUserId, dbUserId, specialty);
      return;
    }

    default:
      await clearConversationContext(dbUserId, 'dialog');
      await dispatchPlainMessage(maxUserId, dbUserId, text, firstName);
  }
}
