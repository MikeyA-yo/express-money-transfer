import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoSanitize from 'express-mongo-sanitize';
import { StatusCodes } from 'http-status-codes';
import router from './routes/index.js';
import logger from './config/logger.js';
import { getRedisClient } from './util/idempotency.js';
import { isTransientError } from './common/domain-exceptions/domain-exceptions.js';

const app = express();

app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

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

function sanitizeDetails(details) {
    if (!details) return null;
    if (Array.isArray(details)) return details;
    if (typeof details !== 'object') return null;

    if (details.meta || details.rawBody || details.code || details.type === 'api_error' || details.type === 'validation_error') {
        return null;
    }

    const safeKeys = ['resource', 'id', 'field', 'reason', 'fromBalance', 'transferAmount', 'balance'];
    const sanitized = {};
    for (const key of Object.keys(details)) {
        if (safeKeys.includes(key)) {
            sanitized[key] = details[key];
        }
    }
    return Object.keys(sanitized).length > 0 ? sanitized : null;
}

app.use((err, req, res, next) => {
    let statusCode = err.statusCode || 500;
    let message = err.message;

    if (statusCode >= 500 || isTransientError(err)) {
        logger.error("EXPRESS ERROR HANDLER:", err);
    } else {
        logger.warn("DOMAIN EXCEPTION:", { message: err.message, statusCode, details: err.details });
    }

    // Format transient errors with a clean, friendly retry message
    if (isTransientError(err)) {
        statusCode = err.statusCode && [429, 502, 503, 504].includes(err.statusCode)
            ? err.statusCode
            : StatusCodes.SERVICE_UNAVAILABLE;
        message = 'Server is currently busy. Please try again in a moment.';
        return res.status(statusCode).json({ error: message });
    }

    // Sanitize non-operational 500 errors to prevent system internals from leaking
    if (statusCode >= 500 && !err.isOperational) {
        message = 'An unexpected error occurred. Please try again later.';
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: message });
    }

    const sanitizedDetails = sanitizeDetails(err.details);

    return res.status(statusCode).json({
        error: message,
        ...(sanitizedDetails ? { details: sanitizedDetails } : {})
    });
});

export default app;
