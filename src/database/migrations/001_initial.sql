-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name          VARCHAR(255) NOT NULL,
  role          VARCHAR(50) NOT NULL DEFAULT 'operator'
                  CHECK (role IN ('admin', 'operator', 'viewer')),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Refresh Tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);

-- Facilities
CREATE TABLE IF NOT EXISTS facilities (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(255) NOT NULL,
  location   VARCHAR(255) NOT NULL,
  type       VARCHAR(100) NOT NULL
               CHECK (type IN ('warehouse', 'manufacturing', 'distribution', 'port')),
  metadata   JSONB NOT NULL DEFAULT '{}',
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_facilities_type ON facilities(type);
CREATE INDEX IF NOT EXISTS idx_facilities_is_active ON facilities(is_active);

-- Assets
CREATE TABLE IF NOT EXISTS assets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id   UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  type          VARCHAR(100) NOT NULL,
  serial_number VARCHAR(100),
  status        VARCHAR(50) NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'inactive', 'maintenance', 'decommissioned')),
  metadata      JSONB NOT NULL DEFAULT '{}',
  last_seen_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assets_facility_id ON assets(facility_id);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(type);

-- Supply Chain Events
CREATE TABLE IF NOT EXISTS events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id     UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  facility_id  UUID NOT NULL REFERENCES facilities(id),
  type         VARCHAR(100) NOT NULL,
  severity     VARCHAR(50) NOT NULL DEFAULT 'info'
                 CHECK (severity IN ('info', 'warning', 'critical')),
  data         JSONB NOT NULL DEFAULT '{}',
  source       VARCHAR(255) NOT NULL,
  processed    BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_asset_id ON events(asset_id);
CREATE INDEX IF NOT EXISTS idx_events_facility_id ON events(facility_id);
CREATE INDEX IF NOT EXISTS idx_events_severity ON events(severity);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_processed ON events(processed) WHERE processed = FALSE;

-- Analytics Metrics
CREATE TABLE IF NOT EXISTS analytics (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id  UUID REFERENCES facilities(id) ON DELETE SET NULL,
  asset_id     UUID REFERENCES assets(id) ON DELETE SET NULL,
  metric_name  VARCHAR(255) NOT NULL,
  metric_value DECIMAL(20, 6) NOT NULL,
  tags         JSONB NOT NULL DEFAULT '{}',
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_facility_id ON analytics(facility_id);
CREATE INDEX IF NOT EXISTS idx_analytics_asset_id ON analytics(asset_id);
CREATE INDEX IF NOT EXISTS idx_analytics_metric_name ON analytics(metric_name);
CREATE INDEX IF NOT EXISTS idx_analytics_recorded_at ON analytics(recorded_at DESC);
-- Composite index for time-series queries
CREATE INDEX IF NOT EXISTS idx_analytics_asset_metric_time
  ON analytics(asset_id, metric_name, recorded_at DESC);

-- Alerts
CREATE TABLE IF NOT EXISTS alerts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID REFERENCES facilities(id) ON DELETE SET NULL,
  asset_id    UUID REFERENCES assets(id) ON DELETE SET NULL,
  event_id    UUID REFERENCES events(id) ON DELETE SET NULL,
  title       VARCHAR(255) NOT NULL,
  description TEXT,
  severity    VARCHAR(50) NOT NULL DEFAULT 'medium'
                CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status      VARCHAR(50) NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'acknowledged', 'resolved', 'closed')),
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_facility_id ON alerts(facility_id);
CREATE INDEX IF NOT EXISTS idx_alerts_asset_id ON alerts(asset_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_assigned_to ON alerts(assigned_to);

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['users', 'facilities', 'assets', 'alerts'] LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %s
       FOR EACH ROW EXECUTE FUNCTION update_updated_at()',
      t, t
    );
  END LOOP;
END;
$$;
