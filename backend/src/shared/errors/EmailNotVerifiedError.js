'use strict';

const { ForbiddenError } = require('./ForbiddenError');

class EmailNotVerifiedError extends ForbiddenError {
  constructor(message = 'Tenés que verificar tu correo antes de ingresar.') {
    super(message);
    this.code = 'EMAIL_NOT_VERIFIED';
  }
}

module.exports = { EmailNotVerifiedError };
