require('dotenv').config();

const mongoose = require('mongoose');
const { ensureFamiliarRole } = require('../migrations/ensure-familiar-role');

const MONGO_URL = process.env.MONGO_URL || 'mongodb://mongo:27017/mearn_db';

(async () => {
  try {
    await mongoose.connect(MONGO_URL);
    const updated = await ensureFamiliarRole();
    console.log(`Migración completada: ${updated} usuario(s) actualizados a "familiar".`);
  } catch (error) {
    console.error('No se pudo completar la migración de roles:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
})();
