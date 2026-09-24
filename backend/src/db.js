const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DATABASE_POOL_SIZE || 10)
});

async function query(text, params) {
  return pool.query(text, params);
}

async function initializeDatabase() {
  const maxRetries = 3;
  const delayMs = 500;

  const runWithRetry = async (fn, context) => {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
      try {
        await fn();
        return;
      } catch (err) {
        lastError = err;
        console.error(`Error en ${context} (intento ${i + 1}/${maxRetries}):`, err);
        if (i < maxRetries - 1) {
          await new Promise(res => setTimeout(res, delayMs * (i + 1)));
        }
      }
    }
    throw new Error(`Falló ${context} después de ${maxRetries} intentos`, { cause: lastError });
  };

  //   await runWithRetry(async () => {
  //     await query(`
  //       CREATE TABLE IF NOT EXISTS application_metadata (
  //         id INTEGER PRIMARY KEY DEFAULT 1,
  //         application_name TEXT NOT NULL,
  //         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  //         CONSTRAINT single_metadata_row CHECK (id = 1)
  //       )
  //     `);
  //   }, 'CREATE TABLE application_metadata');

  //   await runWithRetry(async () => {
  //     await query(`
  //       INSERT INTO application_metadata (id, application_name)
  //       VALUES (1, 'plataforma-acompanamiento-adultos-mayores')
  //       ON CONFLICT (id) DO NOTHING
  //     `);
  //   }, 'INSERT application_metadata');
}

async function closeDatabase() {
  await pool.end();
}

module.exports = { closeDatabase, initializeDatabase, query };