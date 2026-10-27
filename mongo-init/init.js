db = db.getSiblingDB('mearn_db');

db.createCollection('users');
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ emailVerificationTokenHash: 1 }, { sparse: true });

db.createCollection('test');
db.test.insertOne({ message: 'Mongo inicializado correctamente' });
