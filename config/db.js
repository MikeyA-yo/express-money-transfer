import mongoose from 'mongoose';
import { MONGODB_URI } from './env.js';
import logger from './logger.js';

async function connectDB() {
    try {
        if (!MONGODB_URI) {
            throw new Error('MONGODB_URI is not defined in the environment variables');
        }
        await mongoose.connect(MONGODB_URI, {
            retryWrites: true,
            w: 'majority'
        });
        logger.info('Connected to MongoDB');
    } catch (error) {
        logger.error(`Error connecting to MongoDB: ${error.message}`);
        process.exit(1);
    }
}

export default connectDB;
