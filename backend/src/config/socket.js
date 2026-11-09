'use strict';

/**
 * Socket.IO server factory.
 *
 * Live delivery is a delivery concern, so it lives in configuration and is
 * injected into the slices that need to broadcast (only sos_emergency today).
 */
function createSocketServer(httpServer, config) {
  const { Server } = require('socket.io');

  const io = new Server(httpServer, {
    cors: { origin: config.corsOrigin, methods: ['GET', 'POST'] }
  });

  io.on('connection', (socket) => {
    const { caregiverId } = socket.handshake.query;

    if (typeof caregiverId === 'string' && caregiverId.length > 0) {
      socket.join(`caregiver:${caregiverId}`);
    }

    socket.emit('connected', { socketId: socket.id });
  });

  return io;
}

module.exports = { createSocketServer };
