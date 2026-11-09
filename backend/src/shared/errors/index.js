'use strict';

const { AppError } = require('./AppError');
const { ValidationError } = require('./ValidationError');
const { UnauthorizedError } = require('./UnauthorizedError');
const { ForbiddenError } = require('./ForbiddenError');
const { EmailNotVerifiedError } = require('./EmailNotVerifiedError');
const { NotFoundError } = require('./NotFoundError');
const { ConflictError } = require('./ConflictError');
const { EmailAlreadyRegisteredError } = require('./EmailAlreadyRegisteredError');
const { EmailNotRegisteredError } = require('./EmailNotRegisteredError');
const { GoogleNotConfiguredError } = require('./GoogleNotConfiguredError');
const { TooManyRequestsError } = require('./TooManyRequestsError');
const { AccountLockedError } = require('./AccountLockedError');
const { InvalidPinError } = require('./InvalidPinError');
const { InvalidFullNameError } = require('./InvalidFullNameError');
const { InvalidTimeZoneError } = require('./InvalidTimeZoneError');
const { SeniorNotFoundError } = require('./SeniorNotFoundError');

module.exports = {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  EmailNotVerifiedError,
  NotFoundError,
  ConflictError,
  EmailAlreadyRegisteredError,
  EmailNotRegisteredError,
  GoogleNotConfiguredError,
  TooManyRequestsError,
  AccountLockedError,
  InvalidPinError,
  InvalidFullNameError,
  InvalidTimeZoneError,
  SeniorNotFoundError
};
