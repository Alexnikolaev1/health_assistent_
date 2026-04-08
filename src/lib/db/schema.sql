-- src/lib/db/schema.sql
-- SQL-схема для «Твой здоровый MAX»
-- Совместима с Vercel Postgres (PostgreSQL 15+)

-- ==========================================
-- Пользователи
-- ==========================================
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  max_user_id BIGINT UNIQUE NOT NULL,
  username VARCHAR(255),
  first_name VARCHAR(255),
  timezone VARCHAR(50) DEFAULT 'Europe/Moscow',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_max_user_id ON users(max_user_id);

-- ==========================================
-- Метрики здоровья
-- ==========================================
CREATE TABLE IF NOT EXISTS health_metrics (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  metric_type VARCHAR(50) NOT NULL CHECK (
    metric_type IN ('blood_pressure', 'pulse', 'blood_sugar', 'weight', 'sleep_quality', 'mood', 'temperature')
  ),
  value VARCHAR(100) NOT NULL,
  notes TEXT,
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_metrics_user_id ON health_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_health_metrics_type ON health_metrics(user_id, metric_type);
CREATE INDEX IF NOT EXISTS idx_health_metrics_recorded ON health_metrics(recorded_at DESC);

-- ==========================================
-- Напоминания о лекарствах
-- ==========================================
CREATE TABLE IF NOT EXISTS reminders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text VARCHAR(500) NOT NULL,
  reminder_time VARCHAR(5) NOT NULL,  -- HH:MM
  days_of_week INTEGER[],             -- NULL = каждый день; массив [1,2,3,4,5] = будни
  active BOOLEAN DEFAULT TRUE,
  last_sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_active ON reminders(active, reminder_time);

-- ==========================================
-- Привычки
-- ==========================================
CREATE TABLE IF NOT EXISTS habits (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  frequency_type VARCHAR(20) NOT NULL CHECK (frequency_type IN ('interval', 'daily', 'challenge')),
  frequency_hours INTEGER,            -- для interval (например, каждые 2 часа)
  scheduled_time VARCHAR(5),         -- HH:MM для daily
  challenge_id VARCHAR(50),           -- ID предустановленного челленджа
  active BOOLEAN DEFAULT TRUE,
  streak INTEGER DEFAULT 0,
  total_completions INTEGER DEFAULT 0,
  last_completed_at TIMESTAMP WITH TIME ZONE,
  last_interval_nudge_at TIMESTAMP WITH TIME ZONE,
  last_daily_prompt_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_habits_user_id ON habits(user_id);
CREATE INDEX IF NOT EXISTS idx_habits_active ON habits(active);

-- ==========================================
-- Выполнение привычек
-- ==========================================
CREATE TABLE IF NOT EXISTS habit_completions (
  id SERIAL PRIMARY KEY,
  habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_habit_completions_habit ON habit_completions(habit_id);
CREATE INDEX IF NOT EXISTS idx_habit_completions_user ON habit_completions(user_id, completed_at DESC);

-- ==========================================
-- Контекст диалога (состояние разговора)
-- ==========================================
CREATE TABLE IF NOT EXISTS conversation_contexts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  context_type VARCHAR(50) NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, context_type)
);

CREATE INDEX IF NOT EXISTS idx_contexts_user ON conversation_contexts(user_id);
CREATE INDEX IF NOT EXISTS idx_contexts_expires ON conversation_contexts(expires_at);

-- ==========================================
-- История симптомов (для анализа трендов)
-- ==========================================
CREATE TABLE IF NOT EXISTS symptom_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symptom_text TEXT NOT NULL,
  ai_response TEXT,
  diagnosis VARCHAR(500),
  doctor_recommended VARCHAR(255),
  urgency VARCHAR(20) DEFAULT 'low',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_symptoms_user ON symptom_history(user_id, created_at DESC);

-- ==========================================
-- Записи к врачу
-- ==========================================
CREATE TABLE IF NOT EXISTS appointments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  specialty VARCHAR(255) NOT NULL,
  doctor_name VARCHAR(255),
  clinic VARCHAR(500),
  appointment_date DATE,
  appointment_time VARCHAR(5),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
  gosuslugi_id VARCHAR(100),          -- ID записи в Госуслугах
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointments_user ON appointments(user_id, appointment_date);

-- ==========================================
-- Идемпотентность вебхука MAX (дедупликация update_id)
-- ==========================================
CREATE TABLE IF NOT EXISTS processed_updates (
  update_id BIGINT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_processed_updates_created ON processed_updates(created_at DESC);

-- ==========================================
-- Rate limit входящих вебхуков (по max_user_id)
-- ==========================================
CREATE TABLE IF NOT EXISTS webhook_rate_events (
  id BIGSERIAL PRIMARY KEY,
  max_user_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_rate_user_time ON webhook_rate_events(max_user_id, created_at DESC);

-- ==========================================
-- Очистка устаревших контекстов (автоматически)
-- ==========================================
CREATE OR REPLACE FUNCTION cleanup_expired_contexts()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM conversation_contexts WHERE expires_at < NOW();
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Запускается при каждой вставке/обновлении контекста
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
$$;
