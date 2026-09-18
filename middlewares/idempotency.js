import crypto from 'crypto';
import IdempotencyRecord from '../models/idempotencyRecord.js';
import logger from '../config/logger.js';
import {
    BadRequestError,
    UnauthorizedError,
    ConflictError,
    UnprocessableEntityError,
    InternalServerError
} from '../common/domain-exceptions/domain-exceptions.js';

const DEFAULT_TTL_HOURS = 24;

function fingerprint(body) {
    return crypto
        .createHash('sha256')
        .update(JSON.stringify(body || {}))
        .digest('hex');
}

/**
 * Idempotency middleware factory
 * Must be placed AFTER authentication (needs req.user.id)
 */
export const idempotency = ({ ttlHours = DEFAULT_TTL_HOURS } = {}) => async (req, res, next) => {
    const idempotencyKey = req.headers['idempotency-key']; //'x-idem... or x-Idem..'

    if (!idempotencyKey) {
        throw BadRequestError('Missing Idempotency-Key header');
    }

    const userId = req.user?.id;
    if (!userId) {
        throw UnauthorizedError('Authentication required');
    }

    const reqFingerprint = fingerprint(req.body);
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    try {
        await IdempotencyRecord.create({
            key: idempotencyKey,
            userId,
            status: 'IN_PROGRESS',
            requestFingerprint: reqFingerprint,
            expiresAt,
        });
    } catch (err) {
        if (err.code === 11000) {
            return handleExistingKey(idempotencyKey, userId, reqFingerprint, res);
        }
        throw err;
    }

    const originalJson = res.json.bind(res);
    let responseCaptured = false;

    res.json = async (body) => {
        responseCaptured = true;
        try {
            await IdempotencyRecord.updateOne(
                { key: idempotencyKey, userId },
                {
                    status: 'COMPLETED',
                    statusCode: res.statusCode,
                    responseBody: body,
                }
            );
        } catch (updateErr) {
            logger.error('Failed to persist idempotency result', {
                key: idempotencyKey, userId, error: updateErr.message,
            });
        }
        return originalJson(body);
    };

    res.on('close', async () => {
        if (!responseCaptured) {
            await markFailed(idempotencyKey, userId, { message: 'Response not completed', statusCode: 500 });
        }
    });

    next();
};

async function handleExistingKey(key, userId, reqFingerprint, res) {
    const existing = await IdempotencyRecord.findOne({ key, userId });

    if (!existing) {
        throw InternalServerError('Idempotency state inconsistency. Please retry.');
    }

    if (existing.requestFingerprint !== reqFingerprint) {
        throw UnprocessableEntityError('Idempotency key reused with different request body');
    }

    switch (existing.status) {
        case 'COMPLETED':
            logger.info('Idempotent replay', { key, userId });
            return res.status(existing.statusCode).json(existing.responseBody);

        case 'IN_PROGRESS':
            throw ConflictError('A request with this Idempotency-Key is already being processed');

        case 'FAILED':
            await IdempotencyRecord.deleteOne({ key, userId });
            throw ConflictError('The previous request with this key failed. The key has been released — please retry.');

        default:
            throw InternalServerError('Unknown idempotency record status');
    }
}

async function markFailed(key, userId, error) {
    try {
        await IdempotencyRecord.updateOne(
            { key, userId },
            {
                status: 'FAILED',
                statusCode: error.statusCode || 500,
                responseBody: { error: error.message },
            }
        );
    } catch (updateErr) {
        logger.error('Failed to mark idempotency record as FAILED', {
            key, userId, error: updateErr.message,
        });
    }
}
