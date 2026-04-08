// src/lib/reminders/scheduler.ts
// Планировщик напоминаний через Upstash QStash

import { Client as QStashClient } from '@upstash/qstash';
import type { CronPayload } from '@/types';
import logger from '@/utils/logger';

let qstashClient: QStashClient | null = null;

function getQStashClient(): QStashClient {
  if (!qstashClient) {
    const token = process.env.QSTASH_TOKEN;
    if (!token) {
      throw new Error('QSTASH_TOKEN is not set');
    }
    qstashClient = new QStashClient({ token });
  }
  return qstashClient;
}

// ==========================================
// Планирование разового напоминания
// ==========================================

export async function scheduleReminder(
  payload: CronPayload,
  delaySeconds: number
): Promise<string | null> {
  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    logger.warn('APP_URL not set, cannot schedule QStash reminder');
    return null;
  }

  try {
    const client = getQStashClient();
    const result = await client.publishJSON({
      url: `${appUrl}/api/cron`,
      body: payload,
      delay: delaySeconds,
      retries: 3,
    });

    logger.info({ messageId: result.messageId, delay: delaySeconds }, 'Reminder scheduled in QStash');
    return result.messageId;
  } catch (error) {
    logger.error({ error, payload }, 'Failed to schedule QStash reminder');
    return null;
  }
}

// ==========================================
// Расчёт задержки до следующего срабатывания
// ==========================================

export function calculateDelayToTime(targetTime: string): number {
  // targetTime: "HH:MM" в UTC
  const [hours, minutes] = targetTime.split(':').map(Number);

  const now = new Date();
  const target = new Date();
  target.setUTCHours(hours, minutes, 0, 0);

  // Если время уже прошло сегодня — на завтра
  if (target <= now) {
    target.setUTCDate(target.getUTCDate() + 1);
  }

  return Math.floor((target.getTime() - now.getTime()) / 1000);
}

// ==========================================
// Планирование ежедневного напоминания
// ==========================================

export async function scheduleDailyReminder(
  reminderId: number,
  userId: number,
  maxUserId: number,
  text: string,
  targetTime: string
): Promise<string | null> {
  const delaySeconds = calculateDelayToTime(targetTime);

  const payload: CronPayload = {
    reminder_id: reminderId,
    user_id: userId,
    type: 'reminder',
    text,
    chat_id: maxUserId,
  };

  return scheduleReminder(payload, delaySeconds);
}

// ==========================================
// Планирование привычки
// ==========================================

export async function scheduleHabitReminder(
  habitId: number,
  userId: number,
  maxUserId: number,
  habitName: string,
  targetTime: string
): Promise<string | null> {
  const delaySeconds = calculateDelayToTime(targetTime);

  const payload: CronPayload = {
    habit_id: habitId,
    user_id: userId,
    type: 'habit',
    text: habitName,
    chat_id: maxUserId,
  };

  return scheduleReminder(payload, delaySeconds);
}
