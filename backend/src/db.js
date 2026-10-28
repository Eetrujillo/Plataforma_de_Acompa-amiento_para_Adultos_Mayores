const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DATABASE_POOL_SIZE || 10)
});

async function query(text, params) {
  return pool.query(text, params);
}

async function initializeDatabase() {
  await query(`
    CREATE TABLE IF NOT EXISTS application_metadata (
      id INTEGER PRIMARY KEY DEFAULT 1,
      application_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT single_metadata_row CHECK (id = 1)
    )
  `);

  await query(`
    INSERT INTO application_metadata (id, application_name)
    VALUES (1, 'plataforma-acompanamiento-adultos-mayores')
    ON CONFLICT (id) DO NOTHING
  `);
}

async function closeDatabase() {
  await pool.end();
}

module.exports = { closeDatabase, initializeDatabase, query };