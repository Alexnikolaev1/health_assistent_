// src/app/api/cron/route.ts
// Эндпоинт для проверки и отправки напоминаний
// POST — Upstash QStash (напоминания). GET — опционально: внешний cron или Vercel Pro (не Hobby: там cron ≤1/день).

import { NextRequest, NextResponse } from 'next/server';
import { Receiver } from '@upstash/qstash';
import {
  ensureDatabaseSchema,
  getDueReminders,
  getReminderById,
  getUserById,
  markReminderSent,
  getDueDailyHabits,
  markDailyPromptSent,
  getActiveIntervalHabitsWithUsers,
  markIntervalNudgeSent,
} from '@/lib/db';
import { sendMessageWithKeyboard, buildKeyboard } from '@/lib/max/client';
import { shouldSendIntervalCronNudge } from '@/lib/habits/engine';
import { scheduleDailyReminder } from '@/lib/reminders/scheduler';
import type { CronPayload } from '@/types';
import logger from '@/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ==========================================
// POST — вызов от Upstash QStash (разовое напоминание)
// ==========================================

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Верификация подписи QStash (если токены настроены)
  const signingKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;

  if (signingKey && nextSigningKey) {
    const receiver = new Receiver({ currentSigningKey: signingKey, nextSigningKey });
    let rawBody: string;
    try {
      rawBody = await req.text();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ errorMessage }, 'QStash: failed to read body');
      return NextResponse.json({ error: 'Bad request' }, { status: 400 });
    }

    const signature = req.headers.get('upstash-signature') ?? '';
    const upstashRegion = req.headers.get('upstash-region');

    try {
      const isValid = await receiver.verify({
        signature,
        body: rawBody,
        clockTolerance: 120,
        upstashRegion: upstashRegion ?? undefined,
      });
      if (!isValid) {
        logger.warn('Invalid QStash signature');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ errorMessage }, 'QStash signature verify threw');
      return NextResponse.json({ error: 'Verification failed' }, { status: 401 });
    }

    let payload: CronPayload;
    try {
      payload = JSON.parse(rawBody) as CronPayload;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ errorMessage }, 'QStash: invalid JSON body');
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    try {
      await processQStashPayload(payload);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error('[cron] processQStashPayload failed', errorMessage, errorStack);
      logger.error({ errorMessage, errorStack, payload }, 'QStash handler failed');
      return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  // Если QStash не настроен — обрабатываем напрямую
  try {
    const payload = await req.json() as CronPayload;
    await processQStashPayload(payload);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Failed to process cron POST');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ==========================================
// GET — резерв: getDueReminders + привычки по локальному времени. На Vercel Hobby в vercel.json cron не задаём
// (лимит «не чаще раза в день»). Для минутного опроса: внешний сервис (cron-job.org и т.п.) → GET с Bearer CRON_SECRET.
// Точное время напоминаний: QStash → POST /api/cron (scheduleDailyReminder).
// ==========================================

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Проверяем секрет Vercel Cron
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    logger.warn('Unauthorized cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  logger.info('Running cron check for due reminders');

  try {
    await ensureDatabaseSchema();
    // Получаем напоминания, которые нужно отправить сейчас
    const dueReminders = await getDueReminders();

    logger.info({ count: dueReminders.length }, 'Found due reminders');

    const results = await Promise.allSettled(
      dueReminders.map(async (reminder) => {
        try {
          await sendMessageWithKeyboard(
            reminder.max_user_id,
            `⏰ *Напоминание:* ${reminder.text}`,
            buildKeyboard([[
              { text: '✅ Принято', callback_data: `reminder:ack:${reminder.id}` },
              { text: '⏭ Пропустить', callback_data: `reminder:skip:${reminder.id}` },
            ]])
          );

          await markReminderSent(reminder.id);
          logger.info({ reminder_id: reminder.id, user_id: reminder.max_user_id }, 'Reminder sent');
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error({ errorMessage, reminder_id: reminder.id }, 'Failed to send reminder');
          throw error;
        }
      })
    );

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    const habitStats = await processHabitCronNotifications();

    return NextResponse.json({
      ok: true,
      reminders_sent: sent,
      reminders_failed: failed,
      habits_daily_sent: habitStats.dailySent,
      habits_interval_sent: habitStats.intervalSent,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Cron job failed');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ==========================================
// Обработка payload от QStash
// ==========================================

async function processQStashPayload(payload: CronPayload): Promise<void> {
  console.info('[cron] QStash payload', payload.type, {
    user_id: payload.user_id,
    reminder_id: payload.reminder_id,
    habit_id: payload.habit_id,
  });
  logger.info({ payload }, 'Processing QStash payload');

  await ensureDatabaseSchema();
  const dbUser = await getUserById(payload.user_id);
  if (!dbUser) {
    logger.warn({ user_id: payload.user_id }, 'QStash: user not in DB');
    return;
  }
  const maxUserId = dbUser.max_user_id;

  if (payload.type === 'reminder') {
    await sendMessageWithKeyboard(
      maxUserId,
      `⏰ *Напоминание:* ${payload.text}`,
      buildKeyboard([[
        { text: '✅ Принято', callback_data: payload.reminder_id ? `reminder:ack:${payload.reminder_id}` : 'reminder:ack' },
        { text: '⏭ Пропустить', callback_data: 'reminder:skip' },
      ]])
    );

    if (payload.reminder_id) {
      await markReminderSent(payload.reminder_id);
      const row = await getReminderById(payload.reminder_id);
      if (row?.active) {
        const next = await scheduleDailyReminder(row.id, row.user_id, 0, row.text, row.reminder_time);
        if (!next) {
          logger.warn({ reminder_id: row.id }, 'Could not reschedule next QStash reminder');
        }
      }
    }
  } else if (payload.type === 'habit') {
    await sendMessageWithKeyboard(
      maxUserId,
      `💪 *Время для привычки:* ${payload.text}`,
      buildKeyboard([[
        { text: '✅ Выполнил', callback_data: payload.habit_id ? `habit:complete:${payload.habit_id}` : 'habit:complete' },
        { text: '⏭ Пропустить', callback_data: 'habit:skip' },
      ]])
    );
  }
}

// ==========================================
// Напоминания по привычкам (daily по локальному времени, interval по периоду)
// ==========================================

async function processHabitCronNotifications(): Promise<{ dailySent: number; intervalSent: number }> {
  let dailySent = 0;
  let intervalSent = 0;

  const dailyHabits = await getDueDailyHabits();
  for (const h of dailyHabits) {
    try {
      await sendMessageWithKeyboard(
        h.max_user_id,
        `💪 *Время для привычки:* ${h.name}`,
        buildKeyboard([[
          { text: '✅ Выполнил', callback_data: `habit:complete:${h.id}` },
          { text: '⏭ Пропустить', callback_data: 'habit:skip' },
        ]])
      );
      await markDailyPromptSent(h.id);
      dailySent++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ errorMessage, habit_id: h.id }, 'Failed to send daily habit prompt');
    }
  }

  const intervalHabits = await getActiveIntervalHabitsWithUsers();
  for (const h of intervalHabits) {
    if (!shouldSendIntervalCronNudge(h)) continue;
    try {
      await sendMessageWithKeyboard(
        h.max_user_id,
        `💪 *Пора напомнить:* ${h.name}\n_Интервал: каждые ${h.frequency_hours} ч._`,
        buildKeyboard([[
          { text: '✅ Выполнил', callback_data: `habit:complete:${h.id}` },
          { text: '⏭ Позже', callback_data: 'habit:skip' },
        ]])
      );
      await markIntervalNudgeSent(h.id);
      intervalSent++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ errorMessage, habit_id: h.id }, 'Failed to send interval habit prompt');
    }
  }

  return { dailySent, intervalSent };
}
