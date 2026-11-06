db = db.getSiblingDB('mearn_db');
db.createCollection('test');
db.test.insertOne({ message: 'Mongo inicializado correctamente' });
