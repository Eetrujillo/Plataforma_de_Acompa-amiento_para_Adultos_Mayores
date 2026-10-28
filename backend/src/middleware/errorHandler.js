module.exports = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  console.error(err);

  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors)
      .map((item) => item.message)
      .join(' ');
    return res.status(400).json({ error: message });
  }

  if (err.code === 11000) {
    return res.status(409).json({ error: 'Ya existe un registro con ese valor único.' });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({ error: 'Identificador inválido.' });
  }

  const message =
    process.env.NODE_ENV === 'production'
      ? 'Error interno del servidor.'
      : err.message || 'Error interno del servidor.';

  return res.status(err.status || 500).json({ error: message });
};
