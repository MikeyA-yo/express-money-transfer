import crypto from 'crypto';
import createRedisClient from '../config/cache.js';
import logger from '../config/logger.js';
import { globalConfig } from '../config/env.js';
import {
    BadRequestError,
    UnauthorizedError,
    ConflictError,
    UnprocessableEntityError,
    InternalServerError
} from '../common/domain-exceptions/domain-exceptions.js';

const DEFAULT_TTL_HOURS = 24;

let redisClient;

export async function getRedisClient() {
    if (!redisClient || !redisClient.isOpen) {
        const { REDIS_URL } = globalConfig(process);
        redisClient = await createRedisClient(REDIS_URL);
    }
    return redisClient;
}

export async function closeRedisClient() {
    if (redisClient && redisClient.isOpen) {
        await redisClient.quit();
        redisClient = null;
    }
}

export function fingerprint(body) {
    return crypto
        .createHash('sha256')
        .update(JSON.stringify(body || {}))
        .digest('hex');
}

export async function idempotency(
    key,
    userId,
    body,
    fn,
    { ttlHours = DEFAULT_TTL_HOURS, redis = null } = {}
) {
    if (!key) {
        throw BadRequestError('Missing Idempotency-Key');
    }

    if (!userId) {
        throw UnauthorizedError('Authentication required');
    }

    if (typeof fn !== 'function') {
        throw BadRequestError('Function to execute is required');
    }

    const client = redis || (await getRedisClient());
    if (!client) {
        throw InternalServerError('Redis client is not available');
    }

    const reqFingerprint = fingerprint(body);
    const redisKey = `idempotency:${userId}:${key}`;
    const ttlSeconds = ttlHours * 60 * 60;

    const initialRecord = {
        key,
        userId,
        status: 'IN_PROGRESS',
        requestFingerprint: reqFingerprint,
        createdAt: new Date().toISOString()
    };

    const acquired = await client.set(redisKey, JSON.stringify(initialRecord), {
        NX: true,
        EX: ttlSeconds
    });

    if (!acquired) {
        return handleExistingKey(client, redisKey, key, userId, reqFingerprint);
    }

    try {
        const result = await fn();

        const completedRecord = {
            key,
            userId,
            status: 'COMPLETED',
            requestFingerprint: reqFingerprint,
            responseBody: result,
            updatedAt: new Date().toISOString()
        };

        await client.set(redisKey, JSON.stringify(completedRecord), { EX: ttlSeconds });

        return result;
    } catch (err) {
        await markFailed(client, redisKey, key, userId, err, ttlSeconds);
        throw err;
    }
}

export async function handleExistingKey(client, redisKey, key, userId, reqFingerprint) {
    const existingRaw = await client.get(redisKey);

    if (!existingRaw) {
        throw InternalServerError('Idempotency state inconsistency. Please retry.');
    }

    const existing = JSON.parse(existingRaw);

    if (existing.requestFingerprint !== reqFingerprint) {
        throw UnprocessableEntityError('Idempotency key reused with different request body');
    }

    switch (existing.status) {
        case 'COMPLETED':
            logger.info('Idempotent replay', { key, userId });
            return existing.responseBody;

        case 'IN_PROGRESS':
            throw ConflictError('A request with this Idempotency-Key is already being processed');

        case 'FAILED':
            await client.del(redisKey);
            throw ConflictError('The previous request with this key failed. The key has been released — please retry.');

        default:
            throw InternalServerError('Unknown idempotency record status');
    }
}

export async function markFailed(client, redisKey, key, userId, error, ttlSeconds = 300) {
    try {
        const failedRecord = {
            key,
            userId,
            status: 'FAILED',
            error: {
                message: error.message,
                statusCode: error.statusCode || 500
            },
            updatedAt: new Date().toISOString()
        };

        await client.set(redisKey, JSON.stringify(failedRecord), {
            EX: Math.min(ttlSeconds, 300)
        });
    } catch (err) {
        logger.error('Failed to mark idempotency record as FAILED', {
            key,
            userId,
            error: err.message
        });
    }
}