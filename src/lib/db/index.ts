// src/lib/db/index.ts
// Универсальный клиент БД — поддерживает Vercel Postgres и Supabase

import { sql } from '@vercel/postgres';
import type { DBUser, DBMetric, DBReminder, DBHabit, DBHabitCompletion, MetricType } from '@/types';
import logger from '@/utils/logger';

// ==========================================
// Утилиты
// ==========================================

// Верхнеуровневая обёртка с логированием ошибок
async function query<T>(operation: () => Promise<T>, context: string): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    logger.error({ context, error }, 'Database query failed');
    throw error;
  }
}

// ==========================================
// Пользователи
// ==========================================

export async function upsertUser(
  maxUserId: number,
  username?: string,
  firstName?: string
): Promise<DBUser> {
  return query(async () => {
    const result = await sql<DBUser>`
      INSERT INTO users (max_user_id, username, first_name, last_active)
      VALUES (${maxUserId}, ${username ?? null}, ${firstName ?? null}, NOW())
      ON CONFLICT (max_user_id)
      DO UPDATE SET
        username = COALESCE(EXCLUDED.username, users.username),
        first_name = COALESCE(EXCLUDED.first_name, users.first_name),
        last_active = NOW()
      RETURNING *
    `;
    return result.rows[0];
  }, 'upsertUser');
}

export async function getUserByMaxId(maxUserId: number): Promise<DBUser | null> {
  return query(async () => {
    const result = await sql<DBUser>`
      SELECT * FROM users WHERE max_user_id = ${maxUserId}
    `;
    return result.rows[0] ?? null;
  }, 'getUserByMaxId');
}

// ==========================================
// Метрики здоровья
// ==========================================

export async function saveMetric(
  userId: number,
  type: MetricType,
  value: string,
  notes?: string
): Promise<DBMetric> {
  return query(async () => {
    const result = await sql<DBMetric>`
      INSERT INTO health_metrics (user_id, metric_type, value, notes)
      VALUES (${userId}, ${type}, ${value}, ${notes ?? null})
      RETURNING *
    `;
    return result.rows[0];
  }, 'saveMetric');
}

export async function getLatestMetrics(userId: number): Promise<DBMetric[]> {
  return query(async () => {
    // Последнее значение по каждому типу метрики
    const result = await sql<DBMetric>`
      SELECT DISTINCT ON (metric_type)
        id, user_id, metric_type, value, notes, recorded_at
      FROM health_metrics
      WHERE user_id = ${userId}
      ORDER BY metric_type, recorded_at DESC
    `;
    return result.rows;
  }, 'getLatestMetrics');
}

export async function getMetricHistory(
  userId: number,
  type: MetricType,
  limit: number = 7
): Promise<DBMetric[]> {
  return query(async () => {
    const result = await sql<DBMetric>`
      SELECT * FROM health_metrics
      WHERE user_id = ${userId} AND metric_type = ${type}
      ORDER BY recorded_at DESC
      LIMIT ${limit}
    `;
    return result.rows;
  }, 'getMetricHistory');
}

// ==========================================
// Напоминания
// ==========================================

export async function createReminder(
  userId: number,
  text: string,
  reminderTime: string,
  daysOfWeek?: number[]
): Promise<DBReminder> {
  return query(async () => {
    const daysArray = daysOfWeek ? `{${daysOfWeek.join(',')}}` : null;
    const result = await sql<DBReminder>`
      INSERT INTO reminders (user_id, text, reminder_time, days_of_week)
      VALUES (${userId}, ${text}, ${reminderTime}, ${daysArray}::integer[])
      RETURNING *
    `;
    return result.rows[0];
  }, 'createReminder');
}

export async function getUserReminders(userId: number, activeOnly: boolean = true): Promise<DBReminder[]> {
  return query(async () => {
    if (activeOnly) {
      const result = await sql<DBReminder>`
        SELECT * FROM reminders WHERE user_id = ${userId} AND active = TRUE ORDER BY reminder_time
      `;
      return result.rows;
    }
    const result = await sql<DBReminder>`
      SELECT * FROM reminders WHERE user_id = ${userId} ORDER BY reminder_time
    `;
    return result.rows;
  }, 'getUserReminders');
}

// Находим напоминания, которые нужно отправить прямо сейчас (время в часовом поясе пользователя)
export async function getDueReminders(): Promise<Array<DBReminder & { max_user_id: number }>> {
  return query(async () => {
    const result = await sql<DBReminder & { max_user_id: number }>`
      SELECT r.*, u.max_user_id
      FROM reminders r
      JOIN users u ON u.id = r.user_id
      WHERE r.active = TRUE
        AND to_char(timezone(COALESCE(u.timezone, 'Europe/Moscow'), now()), 'HH24:MI') = r.reminder_time
        AND (
          r.days_of_week IS NULL
          OR EXTRACT(DOW FROM timezone(COALESCE(u.timezone, 'Europe/Moscow'), now()))::integer = ANY(r.days_of_week)
        )
        AND (
          r.last_sent_at IS NULL
          OR r.last_sent_at < NOW() - INTERVAL '23 hours'
        )
    `;
    return result.rows;
  }, 'getDueReminders');
}

export async function markReminderSent(reminderId: number): Promise<void> {
  return query(async () => {
    await sql`UPDATE reminders SET last_sent_at = NOW() WHERE id = ${reminderId}`;
  }, 'markReminderSent');
}

export async function deactivateReminder(reminderId: number, userId: number): Promise<void> {
  return query(async () => {
    await sql`UPDATE reminders SET active = FALSE WHERE id = ${reminderId} AND user_id = ${userId}`;
  }, 'deactivateReminder');
}

// ==========================================
// Привычки
// ==========================================

export async function createHabit(
  userId: number,
  name: string,
  frequencyType: 'interval' | 'daily' | 'challenge',
  options: {
    description?: string;
    frequencyHours?: number;
    scheduledTime?: string;
    challengeId?: string;
  } = {}
): Promise<DBHabit> {
  return query(async () => {
    const result = await sql<DBHabit>`
      INSERT INTO habits (
        user_id, name, description, frequency_type,
        frequency_hours, scheduled_time, challenge_id
      )
      VALUES (
        ${userId}, ${name}, ${options.description ?? null},
        ${frequencyType}, ${options.frequencyHours ?? null},
        ${options.scheduledTime ?? null}, ${options.challengeId ?? null}
      )
      RETURNING *
    `;
    return result.rows[0];
  }, 'createHabit');
}

export async function getUserHabits(userId: number, activeOnly: boolean = true): Promise<DBHabit[]> {
  return query(async () => {
    if (activeOnly) {
      const result = await sql<DBHabit>`
        SELECT * FROM habits WHERE user_id = ${userId} AND active = TRUE ORDER BY created_at DESC
      `;
      return result.rows;
    }
    const result = await sql<DBHabit>`
      SELECT * FROM habits WHERE user_id = ${userId} ORDER BY created_at DESC
    `;
    return result.rows;
  }, 'getUserHabits');
}

export async function completeHabit(habitId: number, userId: number): Promise<void> {
  return query(async () => {
    await sql`
      INSERT INTO habit_completions (habit_id, user_id) VALUES (${habitId}, ${userId})
    `;

    await sql`
      UPDATE habits
      SET
        total_completions = total_completions + 1,
        last_completed_at = NOW(),
        last_interval_nudge_at = CASE WHEN frequency_type = 'interval' THEN NULL ELSE last_interval_nudge_at END,
        streak = CASE
          WHEN last_completed_at >= NOW() - INTERVAL '25 hours' THEN streak + 1
          ELSE 1
        END
      WHERE id = ${habitId} AND user_id = ${userId}
    `;
  }, 'completeHabit');
}

export async function getHabitStats(
  userId: number,
  habitId: number,
  days: number = 7
): Promise<{ total: number; completed: number; percentage: number }> {
  return query(async () => {
    const result = await sql<{ completed: string }>`
      SELECT COUNT(*) as completed
      FROM habit_completions
      WHERE habit_id = ${habitId}
        AND user_id = ${userId}
        AND completed_at >= NOW() - (${days} || ' days')::INTERVAL
    `;
    const completed = parseInt(result.rows[0]?.completed ?? '0');
    const percentage = Math.round((completed / days) * 100);
    return { total: days, completed, percentage };
  }, 'getHabitStats');
}

// ==========================================
// Контекст диалога
// ==========================================

export async function setConversationContext(
  userId: number,
  contextType: string,
  data: Record<string, unknown>,
  ttlMinutes: number = 30
): Promise<void> {
  return query(async () => {
    await sql`
      INSERT INTO conversation_contexts (user_id, context_type, data, expires_at)
      VALUES (${userId}, ${contextType}, ${JSON.stringify(data)}, NOW() + (${ttlMinutes} || ' minutes')::INTERVAL)
      ON CONFLICT (user_id, context_type)
      DO UPDATE SET data = EXCLUDED.data, expires_at = EXCLUDED.expires_at
    `;
  }, 'setConversationContext');
}

export async function getConversationContext(
  userId: number,
  contextType: string
): Promise<Record<string, unknown> | null> {
  return query(async () => {
    const result = await sql<{ data: Record<string, unknown> }>`
      SELECT data FROM conversation_contexts
      WHERE user_id = ${userId}
        AND context_type = ${contextType}
        AND expires_at > NOW()
    `;
    return result.rows[0]?.data ?? null;
  }, 'getConversationContext');
}

export async function clearConversationContext(userId: number, contextType?: string): Promise<void> {
  return query(async () => {
    if (contextType) {
      await sql`DELETE FROM conversation_contexts WHERE user_id = ${userId} AND context_type = ${contextType}`;
    } else {
      await sql`DELETE FROM conversation_contexts WHERE user_id = ${userId}`;
    }
  }, 'clearConversationContext');
}

// ==========================================
// История симптомов
// ==========================================

export async function saveSymptomHistory(
  userId: number,
  symptomText: string,
  aiResponse: string,
  diagnosis: string,
  doctorRecommended: string,
  urgency: string
): Promise<void> {
  return query(async () => {
    await sql`
      INSERT INTO symptom_history (user_id, symptom_text, ai_response, diagnosis, doctor_recommended, urgency)
      VALUES (${userId}, ${symptomText}, ${aiResponse}, ${diagnosis}, ${doctorRecommended}, ${urgency})
    `;
  }, 'saveSymptomHistory');
}

export async function getSymptomHistory(userId: number, limit: number = 5): Promise<Array<{
  id: number;
  symptom_text: string;
  diagnosis: string;
  created_at: Date;
}>> {
  return query(async () => {
    const result = await sql`
      SELECT id, symptom_text, diagnosis, created_at
      FROM symptom_history
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return result.rows as Array<{ id: number; symptom_text: string; diagnosis: string; created_at: Date }>;
  }, 'getSymptomHistory');
}

// ==========================================
// Идемпотентность и rate limit вебхука
// ==========================================

let databaseSchemaEnsured = false;

/**
 * Создаёт недостающие таблицы (как `schema.sql`), если Neon подняли без полного импорта схемы.
 * Идемпотентно, один раз за жизнь процесса после успеха.
 */
export async function ensureDatabaseSchema(): Promise<void> {
  if (databaseSchemaEnsured) return;
  await query(async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        max_user_id BIGINT UNIQUE NOT NULL,
        username VARCHAR(255),
        first_name VARCHAR(255),
        timezone VARCHAR(50) DEFAULT 'Europe/Moscow',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_users_max_user_id ON users(max_user_id)`;

    await sql`
      CREATE TABLE IF NOT EXISTS health_metrics (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        metric_type VARCHAR(50) NOT NULL CHECK (
          metric_type IN ('blood_pressure', 'pulse', 'blood_sugar', 'weight', 'sleep_quality', 'mood', 'temperature')
        ),
        value VARCHAR(100) NOT NULL,
        notes TEXT,
        recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_health_metrics_user_id ON health_metrics(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_health_metrics_type ON health_metrics(user_id, metric_type)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_health_metrics_recorded ON health_metrics(recorded_at DESC)`;

    await sql`
      CREATE TABLE IF NOT EXISTS reminders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        text VARCHAR(500) NOT NULL,
        reminder_time VARCHAR(5) NOT NULL,
        days_of_week INTEGER[],
        active BOOLEAN DEFAULT TRUE,
        last_sent_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON reminders(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_reminders_active ON reminders(active, reminder_time)`;

    await sql`
      CREATE TABLE IF NOT EXISTS habits (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        frequency_type VARCHAR(20) NOT NULL CHECK (frequency_type IN ('interval', 'daily', 'challenge')),
        frequency_hours INTEGER,
        scheduled_time VARCHAR(5),
        challenge_id VARCHAR(50),
        active BOOLEAN DEFAULT TRUE,
        streak INTEGER DEFAULT 0,
        total_completions INTEGER DEFAULT 0,
        last_completed_at TIMESTAMP WITH TIME ZONE,
        last_interval_nudge_at TIMESTAMP WITH TIME ZONE,
        last_daily_prompt_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_habits_user_id ON habits(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_habits_active ON habits(active)`;

    await sql`
      CREATE TABLE IF NOT EXISTS habit_completions (
        id SERIAL PRIMARY KEY,
        habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_habit_completions_habit ON habit_completions(habit_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_habit_completions_user ON habit_completions(user_id, completed_at DESC)`;

    await sql`
      CREATE TABLE IF NOT EXISTS conversation_contexts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        context_type VARCHAR(50) NOT NULL,
        data JSONB NOT NULL DEFAULT '{}',
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(user_id, context_type)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_contexts_user ON conversation_contexts(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_contexts_expires ON conversation_contexts(expires_at)`;

    await sql`
      CREATE TABLE IF NOT EXISTS symptom_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        symptom_text TEXT NOT NULL,
        ai_response TEXT,
        diagnosis VARCHAR(500),
        doctor_recommended VARCHAR(255),
        urgency VARCHAR(20) DEFAULT 'low',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_symptoms_user ON symptom_history(user_id, created_at DESC)`;

    await sql`
      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        specialty VARCHAR(255) NOT NULL,
        doctor_name VARCHAR(255),
        clinic VARCHAR(500),
        appointment_date DATE,
        appointment_time VARCHAR(5),
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
        gosuslugi_id VARCHAR(100),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_appointments_user ON appointments(user_id, appointment_date)`;

    await sql`
      CREATE TABLE IF NOT EXISTS processed_updates (
        update_id BIGINT PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_processed_updates_created ON processed_updates(created_at DESC)
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS webhook_rate_events (
        id BIGSERIAL PRIMARY KEY,
        max_user_id BIGINT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_webhook_rate_user_time ON webhook_rate_events(max_user_id, created_at DESC)
    `;

    await sql`
      CREATE OR REPLACE FUNCTION cleanup_expired_contexts()
      RETURNS TRIGGER AS $$
      BEGIN
        DELETE FROM conversation_contexts WHERE expires_at < NOW();
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql
    `;

    await sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_trigger WHERE tgname = 'trg_cleanup_contexts'
        ) THEN
          CREATE TRIGGER trg_cleanup_contexts
          AFTER INSERT OR UPDATE ON conversation_contexts
          FOR EACH STATEMENT EXECUTE FUNCTION cleanup_expired_contexts();
        END IF;
      END
      $$
    `;

    databaseSchemaEnsured = true;
  }, 'ensureDatabaseSchema');
}

/** @deprecated используйте ensureDatabaseSchema */
export async function ensureWebhookSchema(): Promise<void> {
  return ensureDatabaseSchema();
}

/** true — апдейт новый и зарезервирован; false — дубликат, обработку пропускаем */
export async function claimProcessedUpdate(updateId: number): Promise<boolean> {
  return query(async () => {
    const result = await sql<{ update_id: string }>`
      INSERT INTO processed_updates (update_id) VALUES (${updateId})
      ON CONFLICT (update_id) DO NOTHING
      RETURNING update_id
    `;
    return result.rows.length > 0;
  }, 'claimProcessedUpdate');
}

/** Откат резерва update_id (если дальше отказали по rate limit) */
export async function releaseProcessedUpdate(updateId: number): Promise<void> {
  return query(async () => {
    await sql`DELETE FROM processed_updates WHERE update_id = ${updateId}`;
  }, 'releaseProcessedUpdate');
}

const WEBHOOK_RATE_MAX = 45;

/** false — слишком много запросов за минуту, обработку не выполняем */
export async function checkWebhookRateLimit(maxUserId: number): Promise<boolean> {
  return query(async () => {
    await sql`
      DELETE FROM webhook_rate_events WHERE created_at < NOW() - INTERVAL '2 hours'
    `;
    const cnt = await sql<{ c: string }>`
      SELECT COUNT(*)::text AS c FROM webhook_rate_events
      WHERE max_user_id = ${maxUserId}
        AND created_at > NOW() - INTERVAL '1 minute'
    `;
    const n = parseInt(cnt.rows[0]?.c ?? '0', 10);
    if (n >= WEBHOOK_RATE_MAX) {
      return false;
    }
    await sql`INSERT INTO webhook_rate_events (max_user_id) VALUES (${maxUserId})`;
    return true;
  }, 'checkWebhookRateLimit');
}

// ==========================================
// Cron: ежедневные привычки и interval (список кандидатов)
// ==========================================

export type HabitWithMaxUser = DBHabit & { max_user_id: number };

export async function getDueDailyHabits(): Promise<HabitWithMaxUser[]> {
  return query(async () => {
    const result = await sql<HabitWithMaxUser>`
      SELECT h.*, u.max_user_id
      FROM habits h
      JOIN users u ON u.id = h.user_id
      WHERE h.active = TRUE
        AND h.frequency_type = 'daily'
        AND h.scheduled_time IS NOT NULL
        AND to_char(timezone(COALESCE(u.timezone, 'Europe/Moscow'), now()), 'HH24:MI') = h.scheduled_time
        AND (
          h.last_daily_prompt_at IS NULL
          OR h.last_daily_prompt_at < NOW() - INTERVAL '20 hours'
        )
    `;
    return result.rows;
  }, 'getDueDailyHabits');
}

export async function markDailyPromptSent(habitId: number): Promise<void> {
  return query(async () => {
    await sql`UPDATE habits SET last_daily_prompt_at = NOW() WHERE id = ${habitId}`;
  }, 'markDailyPromptSent');
}

export async function getActiveIntervalHabitsWithUsers(): Promise<HabitWithMaxUser[]> {
  return query(async () => {
    const result = await sql<HabitWithMaxUser>`
      SELECT h.*, u.max_user_id
      FROM habits h
      JOIN users u ON u.id = h.user_id
      WHERE h.active = TRUE
        AND h.frequency_type = 'interval'
        AND h.frequency_hours IS NOT NULL
    `;
    return result.rows;
  }, 'getActiveIntervalHabitsWithUsers');
}

export async function markIntervalNudgeSent(habitId: number): Promise<void> {
  return query(async () => {
    await sql`UPDATE habits SET last_interval_nudge_at = NOW() WHERE id = ${habitId}`;
  }, 'markIntervalNudgeSent');
}
