import mongoose from 'mongoose';

/** Conexión a MongoDB 7 (replica set rs0) vía Mongoose. URL desde MONGO_URL. */
export async function connectDatabase(mongoUrl: string): Promise<typeof mongoose> {
  return mongoose.connect(mongoUrl);
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
