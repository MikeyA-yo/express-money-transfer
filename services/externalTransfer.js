import mongoose from 'mongoose';
import AccountModel from '../models/accounts.js';
import UserModel from '../models/user.js';
import OutboxModel from '../models/outbox.js';
import ExternalTransferModel from '../models/externalTransfer.js';
import * as paystackGateway from '../gateways/paystack/transfer.js';
import {
    BadRequestError,
    NotFoundError,
    UnauthorizedError,
    ForbiddenError,
    InsufficientFundsError,
    ConflictError,
    UnprocessableEntityError
} from '../common/domain-exceptions/domain-exceptions.js';
import {
    toExternalTransferResponse,
    toExternalTransfersResponse
} from '../response-schema/index.js';
import logger from '../config/logger.js';
import {
    fingerprint,
    createRedisKey,
    createRedisLockKey,
    acquireLock,
    releaseLock,
    get,
    set,
    del
} from '../util/idempotency.js';
import {
    publishTransferCompleted,
    publishTransferFailed
} from '../events/pub/redis.pub.js';
import { publishTransferJob } from '../events/bullmq/queue.js';


const models = {
    Account: AccountModel,
    User: UserModel,
    ExternalTransfer: ExternalTransferModel,
    Outbox: OutboxModel,
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

async function resolveOwnedAccountId(actor, { Account = models.Account, User = models.User } = {}) {
    if (!actor || !actor.id) {
        throw UnauthorizedError('Authentication required');
    }

    const user = await User.findOne({ id: actor.id });
    if (!user) {
        throw UnauthorizedError('Authenticated user not found');
    }

    const account = await Account.findOne({ userId: actor.id, deleted: { $ne: true } });
    if (!account) {
        throw UnauthorizedError('No account found for authenticated user');
    }

    return account.id;
}

function assertOwnsSourceAccount(ownedAccountId, fromAccountId) {
    if (!ownedAccountId || ownedAccountId !== fromAccountId) {
        throw ForbiddenError('Cannot initiate transfer from an account you do not own', {
            resource: 'Account',
            id: fromAccountId
        });
    }
}

/**
 * Initiates an external transfer to a commercial bank account via Paystack.
 * 
 * @param {string} fromAccountId - Compulsory source ledger account ID
 * @param {number|bigint} amountMinor - Compulsory transfer amount in minor units
 * @param {object} recipientData - Compulsory recipient details { accountNumber, bankCode, accountName, reason }
 * @param {object} actor - Authenticated JWT user claims
 * @param {string} idempotencyKey - Unique idempotency key
 * @param {object} [options={}] - Dependency injection options
 * @returns {Promise<object>} Formatted external transfer response
 */
export async function initiateExternalTransfer(
    fromAccountId,
    amountMinor,
    recipientData,
    actor,
    idempotencyKey,
    {
        Account = models.Account,
        User = models.User,
        ExternalTransfer = models.ExternalTransfer,
        Outbox = models.Outbox,
        gateway = paystackGateway,
        redis,
        settlementDelayMs = 2000,
        publishJob = publishTransferJob
    } = {}
) {
    if (!fromAccountId) throw BadRequestError('Source account ID is required');
    if (!amountMinor || BigInt(amountMinor) <= 0n) {
        throw BadRequestError('Transfer amount must be a positive integer in minor units');
    }
    if (!recipientData?.accountNumber || !recipientData?.bankCode || !recipientData?.accountName) {
        throw BadRequestError('Recipient account number, bank code, and account name are required');
    }
    if (!actor || !actor.id) throw UnauthorizedError('Authentication required');
    if (!idempotencyKey) throw BadRequestError('Idempotency-Key is required');

    const ownedAccountId = await resolveOwnedAccountId(actor, { Account, User });
    assertOwnsSourceAccount(ownedAccountId, fromAccountId);

    const client = await resolveRedis(redis);
    const reqFingerprint = fingerprint({
        fromAccountId,
        amountMinor: amountMinor.toString(),
        recipient: {
            accountNumber: recipientData.accountNumber,
            bankCode: recipientData.bankCode,
            accountName: recipientData.accountName
        }
    });

    const redisKey = createRedisKey('external-transfer', actor.id, idempotencyKey);
    const lockKey = createRedisLockKey('external-transfer', actor.id, idempotencyKey);

    // 1. Check existing record
    const existingRaw = await get(client, redisKey);
    if (existingRaw) {
        const existing = JSON.parse(existingRaw);
        if (existing.fingerprint !== reqFingerprint) {
            throw UnprocessableEntityError('Idempotency key reused with different request body');
        }
        if (existing.status === 'COMPLETED') {
            return existing.response;
        }
        if (existing.status === 'PENDING') {
            throw ConflictError('A request with this Idempotency-Key is currently being processed. Please retry shortly.');
        }
    }

    // 2. Acquire Mutex Lock
    const locked = await acquireLock(client, lockKey, 30);
    if (!locked) {
        throw ConflictError('A request with this Idempotency-Key is currently being processed. Please retry shortly.');
    }

    // 3. Record PENDING entry in Outbox with unique idempotencyKey
    let outboxEntry = new Outbox({
        userId: actor.id,
        type: 'external-transfer',
        payload: {
            fromAccountId,
            amountMinor: amountMinor.toString(),
            recipientData
        },
        idempotencyKey,
        status: 'PENDING'
    });

    try {
        await outboxEntry.save();
    } catch (error) {
        const duplicateIdempotencyKey = error?.code === 11000 && (
            error?.keyPattern?.idempotencyKey ||
            error?.keyValue?.idempotencyKey ||
            /idempotencyKey/i.test(error?.message || '')
        );

        if (duplicateIdempotencyKey) {
            await releaseLock(client, lockKey);
            throw ConflictError('A request with this Idempotency-Key already exists');
        }
        await releaseLock(client, lockKey);
        throw error;
    }

    // 4. Mark PENDING state in Redis
    await set(
        client,
        redisKey,
        JSON.stringify({
            status: 'PENDING',
            fingerprint: reqFingerprint,
            createdAt: new Date().toISOString()
        }),
        { EX: 300 }
    );

    const reference = `ext_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    let externalTransfer;

    try {
        // ----------------------------------------------------
        // Phase 1: Atomic Ledger Reservation (Held before external payout)
        // ----------------------------------------------------
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                const fromAccount = await Account.findOne({ id: fromAccountId, deleted: { $ne: true } }).session(session);
                if (!fromAccount) {
                    throw NotFoundError('Source account not found', { resource: 'Account', id: fromAccountId });
                }

                // Atomically debit sender balance with $gte guard
                const debitRes = await Account.updateOne(
                    { id: fromAccountId, balance: { $gte: BigInt(amountMinor) } },
                    { $inc: { balance: -BigInt(amountMinor) } },
                    { session }
                );

                if (debitRes.modifiedCount === 0) {
                    throw InsufficientFundsError('Insufficient funds for external transfer', {
                        fromBalance: fromAccount.balance.toString(),
                        transferAmount: BigInt(amountMinor).toString()
                    });
                }

                externalTransfer = new ExternalTransfer({
                    fromAccountId,
                    userId: actor.id,
                    amount: BigInt(amountMinor),
                    currency: recipientData.currency || 'NGN',
                    reference,
                    recipient: {
                        accountNumber: recipientData.accountNumber,
                        bankCode: recipientData.bankCode,
                        accountName: recipientData.accountName
                    },
                    status: 'PENDING',
                    reason: recipientData.reason || ''
                });

                await externalTransfer.save({ session });
            });
        } finally {
            await session.endSession();
        }

        // ----------------------------------------------------
        // Phase 2: Dispatch to Paystack API
        // ----------------------------------------------------
        try {
            // 2a. Create / Resolve Transfer Recipient
            const recipientRes = await gateway.createTransferRecipient(
                recipientData.accountName,
                recipientData.accountNumber,
                recipientData.bankCode,
                externalTransfer.currency
            );

            const recipientCode = recipientRes.recipient_code || recipientRes.recipientCode;
            externalTransfer.recipientCode = recipientCode;

            // 2b. Initiate Transfer
            const transferRes = await gateway.initiateTransfer(
                amountMinor,
                recipientCode,
                reference,
                externalTransfer.reason
            );

            externalTransfer.transferCode = transferRes.transfer_code || transferRes.transferCode || null;
            externalTransfer.status = transferRes.status === 'success' ? 'COMPLETED' : 'PROCESSING';
            await externalTransfer.save();

            // Settle / Verify at once if not already COMPLETED and gateway verification is available
            if (externalTransfer.status !== 'COMPLETED' && gateway.verifyTransfer) {
                if (settlementDelayMs > 0) {
                    await new Promise((resolve) => setTimeout(resolve, settlementDelayMs));
                }
                try {
                    const verifyRes = await gateway.verifyTransfer(reference);
                    const verifiedStatus = verifyRes.status || verifyRes.data?.status;

                    if (verifiedStatus === 'success') {
                        externalTransfer.status = 'COMPLETED';
                        await externalTransfer.save();
                    } else if (verifiedStatus === 'failed' || verifiedStatus === 'reversed') {
                        // Atomically refund reserved balance to user's account
                        await Account.updateOne(
                            { id: fromAccountId },
                            { $inc: { balance: BigInt(amountMinor) } }
                        );
                        externalTransfer.status = verifiedStatus === 'reversed' ? 'REVERSED' : 'FAILED';
                        externalTransfer.failureReason = verifyRes.gateway_response || verifyRes.message || 'Transfer failed at bank';
                        await externalTransfer.save();
                    }
                } catch (verifyErr) {
                    logger.warn('Could not confirm transfer settlement after delay', {
                        reference,
                        error: verifyErr.message
                    });
                }
            }

            // Remove outbox entry upon successful completion
            if (outboxEntry?._id || outboxEntry?.id) {
                await Outbox.deleteOne({ _id: outboxEntry._id || outboxEntry.id });
                outboxEntry = null;
            }

            // Redis Pub/Sub: publish transfer.completed event
            await publishTransferCompleted(client, {
                transferId: externalTransfer.id,
                reference: externalTransfer.reference,
                fromAccountId: externalTransfer.fromAccountId,
                userId: actor.id,
                amount: Number(externalTransfer.amount),
                currency: externalTransfer.currency,
                status: externalTransfer.status,
                recipient: externalTransfer.recipient,
                timestamp: new Date().toISOString()
            });

            // BullMQ: enqueue transfer job for further processing (e.g., notifications, logging)
            await publishJob({
                transferId: externalTransfer.id,
                reference: externalTransfer.reference,
                fromAccountId: externalTransfer.fromAccountId,
                userId: actor.id,
                amount: Number(externalTransfer.amount),
                currency: externalTransfer.currency,
                status: externalTransfer.status,
                recipient: externalTransfer.recipient,
                timestamp: new Date().toISOString(),
                idempotencyKey
            });

        } catch (dispatchErr) {
            // Synchronous Paystack rejection: immediately issue atomic refund to ledger
            await Account.updateOne(
                { id: fromAccountId },
                { $inc: { balance: BigInt(amountMinor) } }
            );

            if (externalTransfer) {
                externalTransfer.status = 'FAILED';
                externalTransfer.failureReason = dispatchErr.message;
                await externalTransfer.save();
            }

            // Clean up outbox entry on dispatch rejection so user can retry safely
            if (outboxEntry?._id || outboxEntry?.id) {
                await Outbox.deleteOne({ _id: outboxEntry._id || outboxEntry.id });
                outboxEntry = null;
            }

            // Redis Pub/Sub: publish transfer.failed event
            await publishTransferFailed(client, {
                transferId: externalTransfer?.id,
                reference,
                fromAccountId,
                userId: actor.id,
                amount: Number(amountMinor),
                reason: dispatchErr.message,
                timestamp: new Date().toISOString()
            });

            await del(client, redisKey);
            throw dispatchErr;
        }

        const formatOutput = toExternalTransferResponse(externalTransfer);

        // Cache response in Redis for 24h
        await set(
            client,
            redisKey,
            JSON.stringify({
                status: externalTransfer.status,
                fingerprint: reqFingerprint,
                response: formatOutput,
                completedAt: new Date().toISOString()
            }),
            { EX: 86400 }
        );

        return formatOutput;
    } catch (err) {
        // Clean up outbox entry on any other failure
        if (outboxEntry?._id || outboxEntry?.id) {
            try {
                await Outbox.deleteOne({ _id: outboxEntry._id || outboxEntry.id });
            } catch {}
        }
        await del(client, redisKey);
        throw err;
    } finally {
        await releaseLock(client, lockKey);
    }
}

/**
 * Verifies and synchronizes the real-time status of an external transfer with Paystack.
 * If the transfer failed or reversed at the bank, automatically refunds the user's ledger account.
 * 
 * @param {string} id - Compulsory external transfer ID
 * @param {object} actor - Authenticated JWT user claims
 * @param {object} [options={}] - Dependency injection options
 * @returns {Promise<object>} Formatted external transfer response with updated status
 */
export async function verifyExternalTransferStatus(
    id,
    actor,
    {
        Account = models.Account,
        ExternalTransfer = models.ExternalTransfer,
        gateway = paystackGateway
    } = {}
) {
    if (!id) throw BadRequestError('Transfer ID is required');
    if (!actor || !actor.id) throw UnauthorizedError('Authentication required');

    const transfer = await ExternalTransfer.findOne({ id });
    if (!transfer) {
        throw NotFoundError('External transfer not found', { resource: 'ExternalTransfer', id });
    }

    if (actor.role !== 'admin' && actor.role !== 'superadmin' && transfer.userId !== actor.id) {
        throw ForbiddenError('Cannot access external transfer that is not yours', {
            resource: 'ExternalTransfer',
            id
        });
    }

    // Conclusive statuses do not need re-querying
    if (['COMPLETED', 'FAILED', 'REVERSED'].includes(transfer.status)) {
        return toExternalTransferResponse(transfer);
    }

    try {
        const verifyRes = await gateway.verifyTransfer(transfer.reference);
        const verifiedStatus = verifyRes.status || verifyRes.data?.status;

        if (verifiedStatus === 'success') {
            transfer.status = 'COMPLETED';
            await transfer.save();
        } else if (verifiedStatus === 'failed' || verifiedStatus === 'reversed') {
            await Account.updateOne(
                { id: transfer.fromAccountId },
                { $inc: { balance: BigInt(transfer.amount) } }
            );
            transfer.status = verifiedStatus === 'reversed' ? 'REVERSED' : 'FAILED';
            transfer.failureReason = verifyRes.gateway_response || verifyRes.message || 'Transfer failed at bank';
            await transfer.save();
        }
    } catch (err) {
        logger.warn('Failed to verify transfer status with Paystack gateway', {
            id,
            reference: transfer.reference,
            error: err.message
        });
    }

    return toExternalTransferResponse(transfer);
}

export async function getExternalTransferById(id, { ExternalTransfer = models.ExternalTransfer } = {}) {
    const transfer = await ExternalTransfer.findOne({ id });
    if (!transfer) {
        throw NotFoundError('External transfer not found', { resource: 'ExternalTransfer', id });
    }
    return toExternalTransferResponse(transfer);
}

export async function listExternalTransfers(
    userId,
    page = 1,
    limit = 10,
    { ExternalTransfer = models.ExternalTransfer } = {}
) {
    const query = userId ? { userId } : {};
    const transfers = await ExternalTransfer.find(query)
        .skip((page - 1) * limit)
        .limit(parseInt(limit));
    return toExternalTransfersResponse(transfers);
}
