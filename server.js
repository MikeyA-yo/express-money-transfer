import 'dotenv/config';
import app from './app.js';
import connectDB from './config/db.js';
import logger from './config/logger.js';
import { globalConfig } from './config/env.js';

const { PORT, MONGODB_URI } = globalConfig(process);
async function startServer() {
    await connectDB(MONGODB_URI);
    app.listen(PORT, () => {
        logger.info(`Server running on port ${PORT}`);
    });

    process.on('unhandledRejection', (reason, promise) => {
        logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
        // Optionally, you can exit the process or handle it as needed
    });
    
    process.on('uncaughtException', (err) => {
        logger.error('Uncaught Exception thrown:', err);
        // Optionally, you can exit the process or handle it as needed
    });

    process.on('SIGINT', () => {
        logger.info('SIGINT signal received: closing server');
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        logger.info('SIGTERM signal received: closing server');
        // await db.close(); // Ensure the database connection is closed gracefully

        process.exit(0);
    }); 
}

startServer();
