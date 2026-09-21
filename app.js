import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoSanitize from 'express-mongo-sanitize';
import router from './routes/index.js';
import logger from './config/logger.js';
import { getRedisClient } from './util/idempotency.js';

const app = express();

app.use(express.json());

// Security Middlewares
app.use(helmet());

export const redisClient = getRedisClient().then((client) => {
  logger.info("Connected to Redis");
  return client;
}).catch((err) => {
  logger.error("Failed to connect to Redis:", err);
  process.exit(1);
});

// express-mongo-sanitize middleware attempts to reassign req.query, which throws an error in Express 5.
// As a workaround, we call the sanitize function directly to mutate the objects in place.
app.use((req, res, next) => {
    if (req.body) mongoSanitize.sanitize(req.body);
    if (req.query) mongoSanitize.sanitize(req.query);
    if (req.params) mongoSanitize.sanitize(req.params);
    next();
});

// Logging Middleware
const morganFormat = ':method :url :status :res[content-length] - :response-time ms';
app.use(morgan(morganFormat, {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

// Routes
app.use('/api/v1/', router);

app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    if (statusCode >= 500) {
        logger.error("EXPRESS ERROR HANDLER:", err);
    } else {
        logger.warn("DOMAIN EXCEPTION:", { message: err.message, statusCode, details: err.details });
    }
   
    res.status(statusCode).json({
        error: err.message,
        ...(err.details ? { details: err.details } : {})
    });
});

export default app;
