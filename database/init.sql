CREATE TABLE IF NOT EXISTS application_metadata (
  id INTEGER PRIMARY KEY DEFAULT 1,
  application_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT single_metadata_row CHECK (id = 1)
);

INSERT INTO application_metadata (id, application_name)
VALUES (1, 'plataforma-acompanamiento-adultos-mayores')
ON CONFLICT (id) DO NOTHING;