-- Применить к существующей БД после первого деплоя (дополнение к schema.sql)
-- Идемпотентность вебхука, анти-спам, напоминания по часовому поясу и interval-привычки

CREATE TABLE IF NOT EXISTS processed_updates (
  update_id BIGINT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_processed_updates_created ON processed_updates(created_at DESC);

CREATE TABLE IF NOT EXISTS webhook_rate_events (
  id BIGSERIAL PRIMARY KEY,
  max_user_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_rate_user_time ON webhook_rate_events(max_user_id, created_at DESC);

ALTER TABLE habits ADD COLUMN IF NOT EXISTS last_interval_nudge_at TIMESTAMPTZ;
ALTER TABLE habits ADD COLUMN IF NOT EXISTS last_daily_prompt_at TIMESTAMPTZ;

-- Периодическая очистка старых событий rate limit (опционально вызывать из cron)
-- DELETE FROM webhook_rate_events WHERE created_at < NOW() - INTERVAL '2 hours';
