import app from './app.js';
import connectDB from './config/db.js';
import logger from './config/logger.js';
import { PORT } from './config/env.js';

async function startServer() {
    await connectDB();
    app.listen(PORT, () => {
        logger.info(`Server running on port ${PORT}`);
    });
}

startServer();
