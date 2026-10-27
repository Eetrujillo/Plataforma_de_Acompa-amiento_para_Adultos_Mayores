const User = require('../models/User');

/**
 * Migración idempotente: el rol interno "family" se unificó como "familiar".
 * Se ejecuta al iniciar el backend para que los registros anteriores sigan
 * siendo encontrados por los filtros actuales.
 */
async function ensureFamiliarRole() {
  const result = await User.updateMany(
    { role: 'family' },
    { $set: { role: 'familiar' } }
  );

  return result.modifiedCount || 0;
}

module.exports = { ensureFamiliarRole };
