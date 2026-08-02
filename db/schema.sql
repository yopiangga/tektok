-- ============================================================================
-- Tactical Operations Command System (TOCS) — PostgreSQL Schema v1.0
-- ============================================================================

BEGIN;

DROP TABLE IF EXISTS system_logs        CASCADE;
DROP TABLE IF EXISTS activity_logs      CASCADE;
DROP TABLE IF EXISTS messages           CASCADE;
DROP TABLE IF EXISTS notifications      CASCADE;
DROP TABLE IF EXISTS streams            CASCADE;
DROP TABLE IF EXISTS incidents          CASCADE;
DROP TABLE IF EXISTS mission_assignments CASCADE;
DROP TABLE IF EXISTS missions           CASCADE;
DROP TABLE IF EXISTS report_media       CASCADE;
DROP TABLE IF EXISTS reports            CASCADE;
DROP TABLE IF EXISTS personnel_locations CASCADE;
DROP TABLE IF EXISTS operations         CASCADE;
DROP TABLE IF EXISTS users              CASCADE;
DROP TABLE IF EXISTS units              CASCADE;
DROP TABLE IF EXISTS roles              CASCADE;

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
CREATE TABLE roles (
  id          SERIAL PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,           -- commander | operator | personnel
  name        TEXT NOT NULL,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Units
-- ---------------------------------------------------------------------------
CREATE TABLE units (
  id         SERIAL PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#2563EB',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id             SERIAL PRIMARY KEY,
  username       TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  full_name      TEXT NOT NULL,
  phone          TEXT,
  photo_url      TEXT,
  badge_number   TEXT,
  role_id        INTEGER NOT NULL REFERENCES roles(id),
  unit_id        INTEGER REFERENCES units(id) ON DELETE SET NULL,
  -- live field state (denormalised for fast dashboard reads)
  status         TEXT NOT NULL DEFAULT 'offline',   -- online | idle | offline
  battery        INTEGER,                           -- 0..100
  signal         INTEGER,                           -- 0..100
  last_lat       DOUBLE PRECISION,
  last_lng       DOUBLE PRECISION,
  last_seen_at   TIMESTAMPTZ,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_role   ON users(role_id);
CREATE INDEX idx_users_unit   ON users(unit_id);
CREATE INDEX idx_users_status ON users(status);

-- ---------------------------------------------------------------------------
-- Operations
-- ---------------------------------------------------------------------------
CREATE TABLE operations (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  code        TEXT NOT NULL UNIQUE,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'active',   -- active | closed
  center_lat  DOUBLE PRECISION NOT NULL DEFAULT -6.2088,
  center_lng  DOUBLE PRECISION NOT NULL DEFAULT 106.8456,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at    TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Personnel locations (GPS history, appended every ~10s)
-- ---------------------------------------------------------------------------
CREATE TABLE personnel_locations (
  id         BIGSERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lat        DOUBLE PRECISION NOT NULL,
  lng        DOUBLE PRECISION NOT NULL,
  accuracy   DOUBLE PRECISION,
  speed      DOUBLE PRECISION,
  heading    DOUBLE PRECISION,
  battery    INTEGER,
  signal     INTEGER,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_locations_user_time ON personnel_locations(user_id, recorded_at DESC);

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
CREATE TABLE reports (
  id           SERIAL PRIMARY KEY,
  operation_id INTEGER REFERENCES operations(id) ON DELETE SET NULL,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         TEXT NOT NULL DEFAULT 'information', -- information | incident | request_help
  title        TEXT,
  description  TEXT NOT NULL,
  lat          DOUBLE PRECISION,
  lng          DOUBLE PRECISION,
  status       TEXT NOT NULL DEFAULT 'pending',     -- pending | verified | rejected
  verified_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  verified_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reports_created ON reports(created_at DESC);
CREATE INDEX idx_reports_user    ON reports(user_id);
CREATE INDEX idx_reports_status  ON reports(status);

-- ---------------------------------------------------------------------------
-- Report media
-- ---------------------------------------------------------------------------
CREATE TABLE report_media (
  id         SERIAL PRIMARY KEY,
  report_id  INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL DEFAULT 'photo',   -- photo | video
  url        TEXT NOT NULL,
  object_key TEXT,
  mime_type  TEXT,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_media_report ON report_media(report_id);

-- ---------------------------------------------------------------------------
-- Missions
-- ---------------------------------------------------------------------------
CREATE TABLE missions (
  id           SERIAL PRIMARY KEY,
  operation_id INTEGER REFERENCES operations(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  description  TEXT,
  priority     TEXT NOT NULL DEFAULT 'medium',   -- low | medium | high | critical
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending | running | completed | cancelled
  lat          DOUBLE PRECISION,
  lng          DOUBLE PRECISION,
  deadline     TIMESTAMPTZ,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_missions_status ON missions(status);

-- ---------------------------------------------------------------------------
-- Mission assignments
-- ---------------------------------------------------------------------------
CREATE TABLE mission_assignments (
  id           SERIAL PRIMARY KEY,
  mission_id   INTEGER NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'assigned', -- assigned | accepted | completed
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at  TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE (mission_id, user_id)
);

CREATE INDEX idx_assignments_user ON mission_assignments(user_id);

-- ---------------------------------------------------------------------------
-- Incidents
-- ---------------------------------------------------------------------------
CREATE TABLE incidents (
  id           SERIAL PRIMARY KEY,
  operation_id INTEGER REFERENCES operations(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  description  TEXT,
  priority     TEXT NOT NULL DEFAULT 'medium',  -- low | medium | high | critical
  status       TEXT NOT NULL DEFAULT 'open',    -- open | investigating | closed
  location     TEXT,
  lat          DOUBLE PRECISION,
  lng          DOUBLE PRECISION,
  reporter_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  report_id    INTEGER REFERENCES reports(id) ON DELETE SET NULL,
  assignee_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  closed_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_incidents_status ON incidents(status);

-- ---------------------------------------------------------------------------
-- Streams
-- ---------------------------------------------------------------------------
CREATE TABLE streams (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_name    TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'live',    -- live | ended
  quality      TEXT NOT NULL DEFAULT 'good',    -- good | fair | poor
  recording_url TEXT,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at     TIMESTAMPTZ
);

CREATE INDEX idx_streams_status ON streams(status);

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
CREATE TABLE notifications (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE, -- NULL = broadcast to command
  audience   TEXT NOT NULL DEFAULT 'command',  -- command | user
  type       TEXT NOT NULL,                    -- battery_low | personnel_offline | ...
  title      TEXT NOT NULL,
  body       TEXT,
  severity   TEXT NOT NULL DEFAULT 'info',     -- info | success | warning | danger
  ref_type   TEXT,
  ref_id     INTEGER,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_feed ON notifications(audience, created_at DESC);
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Messages (1:1 personnel <-> operator/commander)
-- ---------------------------------------------------------------------------
CREATE TABLE messages (
  id          SERIAL PRIMARY KEY,
  sender_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_pair ON messages(sender_id, receiver_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Activity logs (timeline feed)
-- ---------------------------------------------------------------------------
CREATE TABLE activity_logs (
  id         BIGSERIAL PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  type       TEXT NOT NULL,     -- report_created | mission_assigned | stream_started | ...
  message    TEXT NOT NULL,
  ref_type   TEXT,
  ref_id     INTEGER,
  meta       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activity_created ON activity_logs(created_at DESC);

-- ---------------------------------------------------------------------------
-- System logs (audit trail)
-- ---------------------------------------------------------------------------
CREATE TABLE system_logs (
  id         BIGSERIAL PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  INTEGER,
  ip         TEXT,
  user_agent TEXT,
  meta       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_system_logs_created ON system_logs(created_at DESC);

COMMIT;
