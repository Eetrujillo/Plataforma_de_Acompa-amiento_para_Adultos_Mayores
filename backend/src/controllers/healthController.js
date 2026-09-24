function createHealthController(query) {
  return async function health(_req, res) {
    try {
      const result = await query('SELECT NOW() AS database_time');

      res.json({
        status: 'ok',
        database: 'postgresql',
        databaseTime: result.rows[0].database_time
      });
    } catch (error) {
      res.status(503).json({ status: 'error', database: 'unavailable' });
    }
  };
}

module.exports = createHealthController;