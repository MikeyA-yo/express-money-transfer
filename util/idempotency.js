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

/**
 * Creates the storage key for an idempotency record.
 * @param {string} type - e.g. 'transfer', 'account'
 * @param {string} userId - User identifier
 * @param {string} key - Idempotency-Key
 * @returns {string}
 */
export function createRedisKey(type, userId, key) {
    return `idempotency:${type}:${userId}:${key}`;
}

/**
 * Creates the mutex lock key for an idempotency operation.
 * @param {string} type - e.g. 'transfer', 'account'
 * @param {string} userId - User identifier
 * @param {string} key - Idempotency-Key
 * @returns {string}
 */
export function createRedisLockKey(type, userId, key) {
    return `lock:idempotency:${type}:${userId}:${key}`;
}

/**
 * Acquire a distributed lock using Redis NX with expiration.
 * @param {object} client - Redis client
 * @param {string} redisKey - Lock key
 * @param {number} ttlSeconds - Time-to-live in seconds
 * @returns {Promise<boolean>} True if lock was acquired
 */
export async function acquireLock(client, redisKey, ttlSeconds = 30) {
    if (!client) return true;
    const res = await client.set(redisKey, '1', { NX: true, EX: ttlSeconds });
    return res === 'OK' || res === true;
}

/**
 * Release an acquired lock.
 * @param {object} client - Redis client
 * @param {string} redisKey - Lock key
 * @returns {Promise<number>}
 */
export async function releaseLock(client, redisKey) {
    if (!client) return 1;
    try {
        return await client.del(redisKey);
    } catch (err) {
        logger.warn('Failed to release lock', { key: redisKey, error: err.message });
        return 0;
    }
}

/**
 * Set a key-value pair in Redis.
 * @param {object} client - Redis client
 * @param {string} redisKey - Storage key
 * @param {string} value - Stringified value
 * @param {object|number} options - Options object (e.g. { EX: 86400 }) or ttl in seconds
 * @returns {Promise<string|null>}
 */
export async function set(client, redisKey, value, options = {}) {
    if (!client) return null;
    const opts = typeof options === 'number' ? { EX: options } : options;
    return await client.set(redisKey, value, opts);
}

/**
 * Get a value from Redis by key.
 * @param {object} client - Redis client
 * @param {string} redisKey - Storage key
 * @returns {Promise<string|null>}
 */
export async function get(client, redisKey) {
    if (!client) return null;
    return await client.get(redisKey);
}

/**
 * Delete a key from Redis.
 * @param {object} client - Redis client
 * @param {string} redisKey - Storage key
 * @returns {Promise<number>}
 */
export async function del(client, redisKey) {
    if (!client) return 0;
    return await client.del(redisKey);
}