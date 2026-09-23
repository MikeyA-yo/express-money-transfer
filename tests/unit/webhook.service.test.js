import { describe, it, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { handlePaystackWebhook } from '../../services/webhook.js';
import { UnauthorizedError } from '../../common/domain-exceptions/domain-exceptions.js';
import { closeRedisClient } from '../../util/idempotency.js';

describe('Webhook Service', () => {
    after(async () => {
        try {
            const { redisClient } = await import('../../app.js');
            const client = await redisClient;
            if (client && client.isOpen) {
                await client.quit();
            }
        } catch {}
        await closeRedisClient();
    });
    let mockAccountModel;
    let mockExternalTransferModel;
    let mockSession;
    let mockRedis;
    const secretKey = 'sk_test_webhook_secret';

    beforeEach(() => {
        mockSession = {
            withTransaction: mock.fn(async (cb) => await cb()),
            endSession: mock.fn(async () => undefined)
        };

        mock.method(mongoose, 'startSession', async () => mockSession);

        mockAccountModel = {
            updateOne: mock.fn(async () => ({ modifiedCount: 1 }))
        };

        mockExternalTransferModel = {
            findOne: mock.fn(async ({ reference }) => {
                if (reference === 'ref-success-1') {
                    return {
                        id: 'ext-1',
                        fromAccountId: 'acc-1',
                        amount: 50000n,
                        reference: 'ref-success-1',
                        status: 'PROCESSING',
                        save: mock.fn(async function () { return this; })
                    };
                }
                if (reference === 'ref-failed-1') {
                    return {
                        id: 'ext-2',
                        fromAccountId: 'acc-1',
                        amount: 25000n,
                        reference: 'ref-failed-1',
                        status: 'PROCESSING',
                        save: mock.fn(async function () { return this; })
                    };
                }
                return null;
            })
        };

        mockRedis = {
            get: mock.fn(async () => null),
            set: mock.fn(async () => 'OK'),
            del: mock.fn(async () => 1)
        };
    });

    it('should throw UnauthorizedError if signature does not match raw body', async () => {
        const rawBody = JSON.stringify({ event: 'transfer.success', data: { reference: 'ref-1' } });
        const invalidSignature = 'invalid_signature_hash';

        await assert.rejects(
            handlePaystackWebhook(JSON.parse(rawBody), invalidSignature, rawBody, {
                Account: mockAccountModel,
                ExternalTransfer: mockExternalTransferModel,
                secretKey,
                redis: mockRedis
            }),
            UnauthorizedError
        );
    });

    it('should update ExternalTransfer to COMPLETED on transfer.success event', async () => {
        const payload = {
            event: 'transfer.success',
            data: {
                reference: 'ref-success-1',
                amount: 5000000,
                status: 'success'
            }
        };
        const rawBody = JSON.stringify(payload);
        const signature = crypto.createHmac('sha512', secretKey).update(rawBody).digest('hex');

        const result = await handlePaystackWebhook(payload, signature, rawBody, {
            Account: mockAccountModel,
            ExternalTransfer: mockExternalTransferModel,
            secretKey,
            redis: mockRedis
        });

        assert.strictEqual(result.status, 'success');
        assert.strictEqual(result.event, 'transfer.success');
        assert.strictEqual(result.reference, 'ref-success-1');
        assert.strictEqual(mockExternalTransferModel.findOne.mock.callCount(), 1);
    });

    it('should atomically refund sender balance on transfer.failed event', async () => {
        const payload = {
            event: 'transfer.failed',
            data: {
                reference: 'ref-failed-1',
                amount: 2500000,
                reason: 'Account deactivated'
            }
        };
        const rawBody = JSON.stringify(payload);
        const signature = crypto.createHmac('sha512', secretKey).update(rawBody).digest('hex');

        const result = await handlePaystackWebhook(payload, signature, rawBody, {
            Account: mockAccountModel,
            ExternalTransfer: mockExternalTransferModel,
            secretKey,
            redis: mockRedis
        });

        assert.strictEqual(result.status, 'success');
        assert.strictEqual(result.event, 'transfer.failed');

        // Verify balance was refunded to sender
        assert.strictEqual(mockAccountModel.updateOne.mock.callCount(), 1);
        assert.deepStrictEqual(mockAccountModel.updateOne.mock.calls[0].arguments[0], {
            id: 'acc-1'
        });
        assert.deepStrictEqual(mockAccountModel.updateOne.mock.calls[0].arguments[1], {
            $inc: { balance: 25000n }
        });
        assert.strictEqual(mockSession.endSession.mock.callCount(), 1);
    });

    it('should ignore webhook if already processed in Redis', async () => {
        const payload = {
            event: 'transfer.success',
            data: {
                reference: 'ref-success-1'
            }
        };
        const rawBody = JSON.stringify(payload);
        const signature = crypto.createHmac('sha512', secretKey).update(rawBody).digest('hex');

        mockRedis.get = mock.fn(async () => JSON.stringify({ processedAt: '2026-09-22T00:00:00.000Z' }));

        const result = await handlePaystackWebhook(payload, signature, rawBody, {
            Account: mockAccountModel,
            ExternalTransfer: mockExternalTransferModel,
            secretKey,
            redis: mockRedis
        });

        assert.strictEqual(result.status, 'ignored');
        assert.strictEqual(mockExternalTransferModel.findOne.mock.callCount(), 0);
    });
});
