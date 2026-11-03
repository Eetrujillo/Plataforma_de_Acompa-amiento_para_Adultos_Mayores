'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { assertMongoUrl, resolveDatabaseUrl } = require('../src/config/databaseUrl');

test('mongodb and mongodb+srv URIs are accepted', () => {
  assert.equal(assertMongoUrl('mongodb://mongo:27017/mearn_db'), 'mongodb://mongo:27017/mearn_db');
  assert.equal(
    assertMongoUrl('mongodb+srv://user:pass@cluster.example.net/mearn_db'),
    'mongodb+srv://user:pass@cluster.example.net/mearn_db'
  );
});

test('a non mongo URL fails naming the offending protocol', () => {
  assert.throws(
    () => assertMongoUrl('postgresql://older_adult_user:secret@postgres:5432/older_adult_db'),
    (error) =>
      error.message.includes('must start with mongodb://') &&
      error.message.includes('got "postgresql://"')
  );

  assert.throws(() => assertMongoUrl(''), /got "empty:\/\/"/);
  assert.throws(() => assertMongoUrl(undefined), /DATABASE_URL must start with mongodb:\/\//);
});

test('an explicit URL wins over the fallback, and the fallback wins over the default', () => {
  assert.equal(
    resolveDatabaseUrl({
      explicit: 'mongodb://explicit:27017/db',
      fallback: 'mongodb://fallback:27017/db'
    }),
    'mongodb://explicit:27017/db'
  );

  assert.equal(
    resolveDatabaseUrl({ explicit: '', fallback: 'mongodb://fallback:27017/db' }),
    'mongodb://fallback:27017/db'
  );

  assert.equal(resolveDatabaseUrl({}), 'mongodb://localhost:27017/mearn_db');
});

test('a stale non mongo value is rejected even when a valid fallback exists', () => {
  assert.throws(
    () =>
      resolveDatabaseUrl({
        explicit: 'postgresql://postgres:5432/other',
        fallback: 'mongodb://mongo:27017/mearn_db'
      }),
    /got "postgresql:\/\/"/
  );
});

test('inside a container a loopback database host is rejected with the fix', () => {
  assert.throws(
    () =>
      resolveDatabaseUrl({
        fallback: 'mongodb://localhost:27017/mearn_db?replicaSet=rs0',
        inContainer: true
      }),
    (error) =>
      error.message.includes('localhost is the backend itself') &&
      error.message.includes('mongodb://mongo:27017/mearn_db')
  );

  assert.throws(
    () => resolveDatabaseUrl({ fallback: 'mongodb://127.0.0.1:27017/mearn_db', inContainer: true }),
    /localhost is the backend itself/
  );
});

test('the compose service name is accepted inside a container, and loopback is fine outside', () => {
  assert.equal(
    resolveDatabaseUrl({ fallback: 'mongodb://mongo:27017/mearn_db', inContainer: true }),
    'mongodb://mongo:27017/mearn_db'
  );

  assert.equal(
    resolveDatabaseUrl({ fallback: 'mongodb://localhost:27017/mearn_db', inContainer: false }),
    'mongodb://localhost:27017/mearn_db'
  );
});
