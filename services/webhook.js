import mongoose from 'mongoose';
import AccountModel from '../models/accounts.js';
import ExternalTransferModel from '../models/externalTransfer.js';
import { verifyWebhookSignature } from '../gateways/paystack/transfer.js';
import { globalConfig } from '../config/env.js';
import {
    UnauthorizedError,
    BadRequestError
} from '../common/domain-exceptions/domain-exceptions.js';
import {
    createRedisLockKey,
    acquireLock,
    releaseLock,
    get,
    set
} from '../util/idempotency.js';

const models = {
    Account: AccountModel,
    ExternalTransfer: ExternalTransferModel
};

async function resolveRedis(injectedRedis) {
    if (injectedRedis !== undefined) {
        return injectedRedis;
    }
    try {
        const { redisClient } = await import('../app.js');
        return await redisClient;
    } catch {
        const { getRedisClient } = await import('../util/idempotency.js');
        return await getRedisClient();
    }
}

/**
 * Handles incoming Paystack webhook events.
 * 
 * @param {object} eventPayload - Parsed webhook event JSON
 * @param {string} signature - Header value from 'x-paystack-signature'
 * @param {Buffer|string} rawBody - Raw body of the request
 * @param {object} [options={}] - Dependencies
 * @returns {Promise<object>} Processing outcome
 */
export async function handlePaystackWebhook(
    eventPayload,
    signature,
    rawBody,
    {
        Account = models.Account,
        ExternalTransfer = models.ExternalTransfer,
        secretKey,
        redis
    } = {}
) {
    const configKey = secretKey || globalConfig(process).PAYSTACK_TEST_SECRET_KEY;
    const isValid = verifyWebhookSignature(rawBody, signature, configKey);
    if (!isValid) {
        throw UnauthorizedError('Invalid webhook signature');
    }

    const { event, data } = eventPayload || {};
    if (!event || !data) {
        throw BadRequestError('Malformed webhook payload');
    }

    const reference = data.reference;
    if (!reference) {
        return { status: 'ignored', message: 'No reference associated with event' };
    }

    const client = await resolveRedis(redis);
    const eventKey = `webhook:paystack:${event}:${reference}`;
    const lockKey = createRedisLockKey('webhook', 'paystack', reference);

    // 1. Check idempotency
    const alreadyProcessed = await get(client, eventKey);
    if (alreadyProcessed) {
        return { status: 'ignored', message: 'Webhook event already processed', reference };
    }

    const locked = await acquireLock(client, lockKey, 30);
    if (!locked) {
        return { status: 'ignored', message: 'Webhook currently being processed', reference };
    }

    try {
        if (event === 'transfer.success') {
            const transfer = await ExternalTransfer.findOne({ reference });
            if (transfer && transfer.status !== 'COMPLETED') {
                transfer.status = 'COMPLETED';
                await transfer.save();
            }
        } else if (event === 'transfer.failed' || event === 'transfer.reversed') {
            const transfer = await ExternalTransfer.findOne({ reference });
            if (transfer && transfer.status !== 'FAILED' && transfer.status !== 'REVERSED') {
                const session = await mongoose.startSession();
                try {
                    await session.withTransaction(async () => {
                        // Atomically refund sender balance
                        await Account.updateOne(
                            { id: transfer.fromAccountId },
                            { $inc: { balance: BigInt(transfer.amount) } },
                            { session }
                        );

                        transfer.status = event === 'transfer.reversed' ? 'REVERSED' : 'FAILED';
                        transfer.failureReason = data.reason || data.gateway_response || 'Interbank transfer failed';
                        await transfer.save({ session });
                    });
                } finally {
                    await session.endSession();
                }
            }
        }

        // Cache event processed for 24h
        await set(client, eventKey, JSON.stringify({ processedAt: new Date().toISOString(), event }), { EX: 86400 });

        return { status: 'success', event, reference };
    } finally {
        await releaseLock(client, lockKey);
    }
}
