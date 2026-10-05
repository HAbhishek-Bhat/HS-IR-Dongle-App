export const DB_NAME = 'hs_ir_capture.db';
export const DB_VERSION = 1;

export const SCHEMA_STATEMENTS = [
  'PRAGMA journal_mode = WAL;',

  `CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);`,

  `CREATE TABLE IF NOT EXISTS recordings (
  id TEXT PRIMARY KEY NOT NULL,
  mode TEXT NOT NULL,
  signature_json TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_ms INTEGER NOT NULL,
  raw_frames_json TEXT NOT NULL,
  decoded_json TEXT NOT NULL,
  is_partial INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  sync_status TEXT NOT NULL,
  sync_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`,

  'CREATE INDEX IF NOT EXISTS idx_recordings_started ON recordings(started_at DESC);',
  'CREATE INDEX IF NOT EXISTS idx_recordings_sync ON recordings(sync_status);',

  `CREATE TABLE IF NOT EXISTS aed_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  signature_json TEXT NOT NULL,
  manufacturer TEXT,
  model TEXT,
  parser_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  events_json TEXT NOT NULL,
  is_partial INTEGER NOT NULL DEFAULT 0,
  sync_status TEXT NOT NULL,
  sync_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`,

  'CREATE INDEX IF NOT EXISTS idx_aed_started ON aed_sessions(started_at DESC);',
  'CREATE INDEX IF NOT EXISTS idx_aed_sync ON aed_sessions(sync_status);',

  `CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_retry_at TEXT NOT NULL,
  last_error TEXT,
  created_at TEXT NOT NULL
);`,

  'CREATE INDEX IF NOT EXISTS idx_sync_retry ON sync_queue(next_retry_at);',
];
