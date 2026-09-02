import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

let mongoServer;

export const connectTestDB = async () => {
    mongoServer = await MongoMemoryReplSet.create({ 
        replSet: { count: 1 },
        instanceOpts: [
            { launchTimeout: 60000 }
        ]
    });
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
};

export const clearTestDB = async () => {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        const collection = collections[key];
        await collection.deleteMany();
    }
};

export const closeTestDB = async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    await mongoServer.stop();
};
