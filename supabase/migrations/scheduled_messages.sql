CREATE TABLE IF NOT EXISTS scheduled_messages (
  id TEXT PRIMARY KEY,
  recipient_id TEXT NOT NULL,
  message_text TEXT NOT NULL,
  send_at TIMESTAMPTZ NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  trigger_postback_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  failure_reason TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scheduled_messages_pending_idx
  ON scheduled_messages (status, send_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS scheduled_messages_recipient_idx
  ON scheduled_messages (recipient_id, source_id);
