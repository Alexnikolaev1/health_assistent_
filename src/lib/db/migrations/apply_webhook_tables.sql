-- Выполнить в Neon / psql, если таблицы ещё не созданы (ошибка: relation "processed_updates" does not exist)
-- Идемпотентно.

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
