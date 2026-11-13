'use strict';

const { tokenVersionOf, sessionVersionOf } = require('../shared/session/sessionVersion');

const CAREGIVER_ROLE = 'CAREGIVER';

/**
 * Session token carried by the socket handshake.
 *
 * The canonical place is `handshake.auth`, which the socket.io client fills from
 * its `auth` option; the Authorization header is accepted as well so a native or
 * scripted client can reuse the exact same bearer it sends to the REST API.
 */
function handshakeToken(socket) {
  const fromAuth = socket.handshake.auth?.token;

  if (typeof fromAuth === 'string' && fromAuth.trim().length > 0) {
    return fromAuth.trim();
  }

  const header = socket.handshake.headers?.authorization;

  if (typeof header === 'string') {
    const [scheme, value] = header.trim().split(/\s+/);

    if (scheme && scheme.toLowerCase() === 'bearer' && value) {
      return value;
    }
  }

  return null;
}

/**
 * Socket.IO server factory.
 *
 * The live delivery channel is a delivery concern, so it lives in configuration and
 * is injected into the slices that need to broadcast (only sos_emergency today).
 *
 * Authentication is not optional: a socket is a subscription to private caregiver
 * rooms, so the verifier and the user repository must be injected by the composition
 * root. Without them the factory refuses to start instead of exposing an open channel
 * (fail closed).
 *
 * The room is derived from the verified token only. `handshake.query` is attacker
 * controlled and is ignored on purpose.
 */
function createSocketServer(httpServer, config = {}, deps = {}) {
  const { Server } = require('socket.io');
  const { verifyToken, userRepository, logger = console } = deps;

  if (typeof verifyToken !== 'function' || !userRepository) {
    throw new TypeError('createSocketServer requires verifyToken and userRepository: refusing to open an unauthenticated channel');
  }

  const io = new Server(httpServer, {
    cors: { origin: config.corsOrigin, methods: ['GET', 'POST'] }
  });

  io.use(async (socket, next) => {
    const token = handshakeToken(socket);

    if (!token) {
      return next(new Error('unauthorized'));
    }

    let claims;

    try {
      claims = verifyToken(token);
    } catch {
      return next(new Error('unauthorized'));
    }

    if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
      // Un token sin `sub` utilizable no es una sesión.
      return next(new Error('unauthorized'));
    }

    let user;

    try {
      user = await userRepository.findById(claims.sub);
    } catch (error) {
      // Falla cerrado: si la base no responde, el socket no se abre.
      logger.warn?.('[socket] auth lookup failed', error.message);
      return next(new Error('temporarily_unavailable'));
    }

    // Mismo error para usuario inexistente y sesión revocada.
    if (!user || tokenVersionOf(claims) !== sessionVersionOf(user)) {
      return next(new Error('unauthorized'));
    }

    if (user.role !== CAREGIVER_ROLE) {
      return next(new Error('forbidden'));
    }

    socket.data.caregiverId = user.id;
    return next();
  });

  io.on('connection', (socket) => {
    const { caregiverId } = socket.data;

    socket.join(`caregiver:${caregiverId}`);
    socket.emit('connected', { socketId: socket.id });
  });

  return io;
}

module.exports = { createSocketServer, handshakeToken };
