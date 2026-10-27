require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const activityRoutes = require('./routes/activity.routes');
const appRoutes = require('./routes/app.routes');
const authRoutes = require('./routes/auth.routes');
const linkRoutes = require('./routes/link.routes');
const olderAdultRoutes = require('./routes/olderAdult.routes');
const requireAuth = require('./middleware/auth');
const requireVerifiedEmail = require('./middleware/requireVerifiedEmail');
const errorHandler = require('./middleware/errorHandler');
const { ensureFamiliarRole } = require('./migrations/ensure-familiar-role');

const app = express();
const PORT = Number(process.env.BACKEND_INTERNAL_PORT || 3701);
const MONGO_URL = process.env.MONGO_URL || 'mongodb://mongo:27017/mearn_db';

const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (process.env.NODE_ENV === 'production' && !process.env.SMTP_HOST) {
  console.warn(
    'ADVERTENCIA: SMTP_HOST no está configurado. Los correos de confirmación no se enviarán.'
  );
}

if (
  process.env.NODE_ENV === 'production' &&
  (!process.env.APP_URL || /localhost|127\.0\.0\.1/i.test(process.env.APP_URL))
) {
  console.warn(
    'ADVERTENCIA: APP_URL apunta a localhost o no está definido. Configura el dominio público para los enlaces de confirmación.'
  );
}

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(cors({ origin: allowedOrigins.length > 0 ? allowedOrigins : true }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend funcionando' });
});

app.use('/api/auth', authRoutes);

// La app del adulto mayor canjea el código sin iniciar sesión en esta plataforma.
app.use('/api/linking', linkRoutes);
app.use('/api/app', appRoutes);

// Las rutas de funciones deben montarse con requireAuth + requireVerifiedEmail.
app.use('/api/older-adults', requireAuth, requireVerifiedEmail, olderAdultRoutes);
app.use('/api/activities', requireAuth, requireVerifiedEmail, activityRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada.' });
});

app.use(errorHandler);

mongoose
  .connect(MONGO_URL)
  .then(async () => {
    console.log('Conectado a MongoDB');

    const migratedUsers = await ensureFamiliarRole();
    if (migratedUsers > 0) {
      console.log(`Migración de roles: ${migratedUsers} usuario(s) actualizados a "familiar".`);
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Servidor backend escuchando en el puerto ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Error conectando a MongoDB:', err.message);
    process.exit(1);
  });

process.on('SIGTERM', async () => {
  await mongoose.connection.close();
  process.exit(0);
});
