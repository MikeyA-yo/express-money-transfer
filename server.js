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
}

startServer();
