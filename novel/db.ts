import { MongoClient, type Db } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB ?? 'novel';

if (!uri) {
  throw new Error('MONGODB_URI is not set. Check your .env file.');
}

let clientPromise: Promise<MongoClient> | null = null;

export async function getDb(): Promise<Db> {
  if (!clientPromise) {
    const client = new MongoClient(uri!, {
      serverSelectionTimeoutMS: 8000,
    });
    clientPromise = client.connect().then((c) => {
      console.log(`[mongo] connected → db="${dbName}"`);
      return c;
    });
  }
  const client = await clientPromise;
  return client.db(dbName);
}
