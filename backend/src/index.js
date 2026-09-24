try {
  require('dotenv').config();
} catch (error) {
  // En Docker las variables de entorno se inyectan desde docker-compose.yml
}
const cors = require('cors');
const express = require('express');
const { closeDatabase, initializeDatabase, query } = require('./db');
const healthRoutes = require('./routes/healthRoutes');

const app = express();
const port = Number(process.env.BACKEND_INTERNAL_PORT || 3505);

app.use(cors());
app.use(express.json());

app.use('/api', healthRoutes(query));

async function start() {
  await initializeDatabase();

  const server = app.listen(port, () => {
    console.log(`Servidor backend escuchando en puerto ${port}`);
  });

  const shutdown = async () => {
    server.close(async () => {
      await closeDatabase();
      process.exit(0);
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

start().catch((error) => {
  console.error('Error iniciando el backend:', error.message);
  process.exit(1);
});
