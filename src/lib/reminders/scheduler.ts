// src/lib/reminders/scheduler.ts
// Планировщик напоминаний через Upstash QStash

import { DateTime } from 'luxon';
import { Client as QStashClient } from '@upstash/qstash';
import type { CronPayload } from '@/types';
import { getUserById } from '@/lib/db';
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

  const baseUrl = appUrl.trim().replace(/\/+$/, '');
  const cronUrl = `${baseUrl}/api/cron`;

  try {
    const client = getQStashClient();
    const result = await client.publishJSON({
      url: cronUrl,
      body: payload,
      delay: Math.max(30, delaySeconds),
      retries: 3,
    });

    logger.info(
      { messageId: result.messageId, delay: delaySeconds, cronUrl },
      'Reminder scheduled in QStash'
    );
    return result.messageId;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage, payload }, 'Failed to schedule QStash reminder');
    return null;
  }
}

// ==========================================
// Расчёт задержки до следующего локального HH:MM (IANA), не UTC
// ==========================================

export function secondsUntilNextLocalHM(hhmm: string, ianaTimeZone: string): number {
  const parts = hhmm.trim().split(':');
  const h = parseInt(parts[0] ?? '0', 10);
  const m = parseInt(parts[1] ?? '0', 10);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    logger.warn({ hhmm, ianaTimeZone }, 'Invalid HH:MM for reminder delay; using 60s');
    return 60;
  }

  let tz = ianaTimeZone?.trim() || 'Europe/Moscow';
  let now = DateTime.now().setZone(tz);
  if (!now.isValid) {
    logger.warn({ ianaTimeZone }, 'Invalid IANA timezone for reminder; using Europe/Moscow');
    tz = 'Europe/Moscow';
    now = DateTime.now().setZone(tz);
  }
  let target = now.set({ hour: h, minute: m, second: 0, millisecond: 0 });
  if (target <= now) {
    target = target.plus({ days: 1 });
  }

  const sec = Math.floor(target.diff(DateTime.now(), 'seconds').seconds);
  return Math.max(30, sec);
}

/** @deprecated используйте secondsUntilNextLocalHM — раньше время ошибочно считалось в UTC */
export function calculateDelayToTime(targetTime: string): number {
  return secondsUntilNextLocalHM(targetTime, 'UTC');
}

// ==========================================
// Планирование ежедневного напоминания
// ==========================================

export async function scheduleDailyReminder(
  reminderId: number,
  dbUserId: number,
  _maxUserId: number,
  text: string,
  targetTime: string
): Promise<string | null> {
  const user = await getUserById(dbUserId);
  const tz = user?.timezone?.trim() || 'Europe/Moscow';
  const delaySeconds = secondsUntilNextLocalHM(targetTime, tz);

  const payload: CronPayload = {
    reminder_id: reminderId,
    user_id: dbUserId,
    type: 'reminder',
    text,
  };

  return scheduleReminder(payload, delaySeconds);
}

// ==========================================
// Планирование привычки
// ==========================================

export async function scheduleHabitReminder(
  habitId: number,
  dbUserId: number,
  _maxUserId: number,
  habitName: string,
  targetTime: string
): Promise<string | null> {
  const user = await getUserById(dbUserId);
  const tz = user?.timezone?.trim() || 'Europe/Moscow';
  const delaySeconds = secondsUntilNextLocalHM(targetTime, tz);

  const payload: CronPayload = {
    habit_id: habitId,
    user_id: dbUserId,
    type: 'habit',
    text: habitName,
  };

  return scheduleReminder(payload, delaySeconds);
}
