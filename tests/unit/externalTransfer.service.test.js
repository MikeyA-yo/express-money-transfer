import { describe, it, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
    initiateExternalTransfer,
    verifyExternalTransferStatus,
    getExternalTransferById,
    listExternalTransfers
} from '../../services/externalTransfer.js';
import {
    BadRequestError,
    NotFoundError,
    UnauthorizedError,
    ForbiddenError,
    InsufficientFundsError,
    ConflictError,
    UnprocessableEntityError
} from '../../common/domain-exceptions/domain-exceptions.js';
import { fingerprint, closeRedisClient } from '../../util/idempotency.js';

describe('ExternalTransfer Service', () => {
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
    let mockUserModel;
    let mockExternalTransferModel;
    let mockOutboxModel;
    let mockGateway;
    let mockSession;
    let mockRedis;
    let defaultOptions;
    const actor = { id: 'usr-1', email: 'alice@test.com', role: 'user' };

    const validRecipient = {
        accountNumber: '0123456789',
        bankCode: '058',
        accountName: 'Bob Smith',
        reason: 'Consulting invoice'
    };

    beforeEach(() => {
        mockSession = {
            withTransaction: mock.fn(async (cb) => await cb()),
            endSession: mock.fn(async () => undefined)
        };

        mock.method(mongoose, 'startSession', async () => mockSession);

        mockUserModel = {
            findOne: mock.fn(async (query) => {
                if (query?.id === actor.id) {
                    return { id: actor.id, email: actor.email };
                }
                return null;
            })
        };

        mockAccountModel = {
            findOne: mock.fn((query) => {
                if (query?.userId === actor.id) {
                    return Promise.resolve({ id: 'acc-1', userId: actor.id, balance: 100000n, currency: 'NGN' });
                }
                if (query?.id === 'acc-1') {
                    return {
                        session: mock.fn(async () => ({
                            id: 'acc-1',
                            userId: actor.id,
                            balance: 100000n,
                            currency: 'NGN'
                        }))
                    };
                }
                return { session: mock.fn(async () => null) };
            }),
            updateOne: mock.fn(async () => ({ modifiedCount: 1 }))
        };

        mockExternalTransferModel = mock.fn(function (data) {
            this.id = data.id || 'ext-transfer-1';
            this.fromAccountId = data.fromAccountId;
            this.userId = data.userId;
            this.amount = data.amount;
            this.currency = data.currency || 'NGN';
            this.reference = data.reference;
            this.recipient = data.recipient;
            this.status = data.status || 'PENDING';
            this.reason = data.reason;
            this.save = mock.fn(async () => this);
            this.toObject = mock.fn(() => ({
                id: this.id,
                fromAccountId: this.fromAccountId,
                userId: this.userId,
                amount: this.amount,
                currency: this.currency,
                reference: this.reference,
                transferCode: this.transferCode,
                recipientCode: this.recipientCode,
                recipient: this.recipient,
                status: this.status,
                reason: this.reason
            }));
        });
        mockExternalTransferModel.findOne = mock.fn();
        mockExternalTransferModel.find = mock.fn();

        mockOutboxModel = mock.fn(function (data) {
            this._id = 'outbox-mock-1';
            this.id = 'outbox-mock-1';
            this.userId = data.userId;
            this.type = data.type;
            this.payload = data.payload;
            this.idempotencyKey = data.idempotencyKey;
            this.status = data.status || 'PENDING';
            this.save = mock.fn(async () => this);
        });
        mockOutboxModel.deleteOne = mock.fn(async () => ({ deletedCount: 1 }));
        mockOutboxModel.findOne = mock.fn(async () => null);

        mockGateway = {
            createTransferRecipient: mock.fn(async () => ({
                recipient_code: 'RCP_test_123',
                status: true
            })),
            initiateTransfer: mock.fn(async () => ({
                transfer_code: 'TRF_test_456',
                status: 'success'
            }))
        };

        mockRedis = {
            get: mock.fn(async () => null),
            set: mock.fn(async () => 'OK'),
            del: mock.fn(async () => 1),
            publish: mock.fn(async () => 1)
        };

        defaultOptions = {
            Account: mockAccountModel,
            User: mockUserModel,
            ExternalTransfer: mockExternalTransferModel,
            Outbox: mockOutboxModel,
            gateway: mockGateway,
            redis: mockRedis
        };
    });

    it('should throw BadRequestError if compulsory parameters are missing', async () => {
        await assert.rejects(
            initiateExternalTransfer('', 5000, validRecipient, actor, 'idem-1', defaultOptions),
            BadRequestError
        );
        await assert.rejects(
            initiateExternalTransfer('acc-1', 0, validRecipient, actor, 'idem-1', defaultOptions),
            BadRequestError
        );
        await assert.rejects(
            initiateExternalTransfer('acc-1', 5000, null, actor, 'idem-1', defaultOptions),
            BadRequestError
        );
        await assert.rejects(
            initiateExternalTransfer('acc-1', 5000, validRecipient, null, 'idem-1', defaultOptions),
            UnauthorizedError
        );
        await assert.rejects(
            initiateExternalTransfer('acc-1', 5000, validRecipient, actor, '', defaultOptions),
            BadRequestError
        );
    });

    it('should throw ForbiddenError if user does not own source account', async () => {
        await assert.rejects(
            initiateExternalTransfer('acc-someone-else', 5000, validRecipient, actor, 'idem-1', defaultOptions),
            ForbiddenError
        );
    });

    it('should throw InsufficientFundsError when balance is less than transfer amount', async () => {
        mockAccountModel.updateOne = mock.fn(async () => ({ modifiedCount: 0 }));

        await assert.rejects(
            initiateExternalTransfer('acc-1', 500000, validRecipient, actor, 'idem-1', defaultOptions),
            InsufficientFundsError
        );

        assert.strictEqual(mockSession.endSession.mock.callCount(), 1);
        assert.ok(mockRedis.del.mock.callCount() >= 1);
    });

    it('should reserve balance, call Paystack, record successful transfer, clean outbox, and publish pub/sub event', async () => {
        const result = await initiateExternalTransfer('acc-1', 20000, validRecipient, actor, 'idem-1', defaultOptions);

        // 1. Ledger reservation verified
        assert.strictEqual(mockAccountModel.updateOne.mock.callCount(), 1);
        assert.deepStrictEqual(mockAccountModel.updateOne.mock.calls[0].arguments[0], {
            id: 'acc-1',
            balance: { $gte: 20000n }
        });
        assert.deepStrictEqual(mockAccountModel.updateOne.mock.calls[0].arguments[1], {
            $inc: { balance: -20000n }
        });

        // 2. Outbox creation and deletion verified
        assert.strictEqual(mockOutboxModel.mock.callCount(), 1);
        assert.strictEqual(mockOutboxModel.deleteOne.mock.callCount(), 1);

        // 3. Paystack dispatch verified
        assert.strictEqual(mockGateway.createTransferRecipient.mock.callCount(), 1);
        assert.strictEqual(mockGateway.initiateTransfer.mock.callCount(), 1);

        // 4. Redis Pub/Sub verified
        assert.strictEqual(mockRedis.publish.mock.callCount(), 1);
        assert.strictEqual(mockRedis.publish.mock.calls[0].arguments[0], 'transfers.external');
        const pubPayload = JSON.parse(mockRedis.publish.mock.calls[0].arguments[1]);
        assert.strictEqual(pubPayload.event, 'transfer.completed');
        assert.strictEqual(pubPayload.status, 'COMPLETED');
        assert.strictEqual(pubPayload.amount, 20000);

        // 5. Response output verified
        assert.strictEqual(result.status, 'COMPLETED');
        assert.strictEqual(result.amount, 20000);
        assert.strictEqual(result.amountMajor, '200.00 USD');
        assert.strictEqual(result.amountMinor, '20000 USDMINOR');
        assert.strictEqual(result.transferCode, 'TRF_test_456');

        // 6. Redis caching verified
        const setCalls = mockRedis.set.mock.calls;
        assert.ok(setCalls.some(c => c.arguments[0].startsWith('lock:')));
        assert.ok(setCalls.some(c => !c.arguments[0].startsWith('lock:') && JSON.parse(c.arguments[1]).status === 'COMPLETED'));
        assert.ok(mockRedis.del.mock.calls.some(c => c.arguments[0].startsWith('lock:')));
    });

    it('should throw ConflictError if duplicate idempotencyKey is used in Outbox', async () => {
        mockOutboxModel = mock.fn(function () {
            this.save = mock.fn(async () => {
                const err = new Error('E11000 duplicate key error');
                err.code = 11000;
                err.keyPattern = { idempotencyKey: 1 };
                throw err;
            });
        });

        await assert.rejects(
            initiateExternalTransfer('acc-1', 20000, validRecipient, actor, 'idem-duplicate', {
                ...defaultOptions,
                Outbox: mockOutboxModel
            }),
            ConflictError
        );

        // Mutex lock should be released
        assert.ok(mockRedis.del.mock.calls.some(c => c.arguments[0].startsWith('lock:')));
    });

    it('should automatically refund reserved balance, clean outbox, and publish failure event if Paystack rejects', async () => {
        mockGateway.initiateTransfer = mock.fn(async () => {
            const err = new Error('Transfer declined by provider');
            err.statusCode = 400;
            throw err;
        });

        await assert.rejects(
            initiateExternalTransfer('acc-1', 20000, validRecipient, actor, 'idem-1', defaultOptions),
            /Transfer declined/
        );

        // Ledger debit called first, then atomic refund called
        assert.strictEqual(mockAccountModel.updateOne.mock.callCount(), 2);
        assert.deepStrictEqual(mockAccountModel.updateOne.mock.calls[1].arguments[0], { id: 'acc-1' });
        assert.deepStrictEqual(mockAccountModel.updateOne.mock.calls[1].arguments[1], { $inc: { balance: 20000n } });

        // Outbox cleaned up on failure
        assert.strictEqual(mockOutboxModel.deleteOne.mock.callCount(), 1);

        // Redis Pub/Sub published failure event
        assert.strictEqual(mockRedis.publish.mock.callCount(), 1);
        assert.strictEqual(mockRedis.publish.mock.calls[0].arguments[0], 'transfers.external');
        const pubPayload = JSON.parse(mockRedis.publish.mock.calls[0].arguments[1]);
        assert.strictEqual(pubPayload.event, 'transfer.failed');
        assert.strictEqual(pubPayload.reason, 'Transfer declined by provider');

        // Redis pending key deleted
        assert.ok(mockRedis.del.mock.callCount() >= 1);
    });

    it('should return cached response when idempotency key is reused with same payload', async () => {
        const cachedResponse = {
            id: 'ext-cached-1',
            status: 'COMPLETED',
            amount: 20000
        };
        const reqFingerprint = fingerprint({
            fromAccountId: 'acc-1',
            amountMinor: '20000',
            recipient: {
                accountNumber: validRecipient.accountNumber,
                bankCode: validRecipient.bankCode,
                accountName: validRecipient.accountName
            }
        });

        mockRedis.get = mock.fn(async () => JSON.stringify({
            status: 'COMPLETED',
            fingerprint: reqFingerprint,
            response: cachedResponse
        }));

        const result = await initiateExternalTransfer('acc-1', 20000, validRecipient, actor, 'idem-1', defaultOptions);

        assert.deepStrictEqual(result, cachedResponse);
        // Database session and Outbox should not be opened on cache hit
        assert.strictEqual(mongoose.startSession.mock.callCount(), 0);
        assert.strictEqual(mockOutboxModel.mock.callCount(), 0);
    });

    it('should throw UnprocessableEntityError when idempotency key reused with different body', async () => {
        mockRedis.get = mock.fn(async () => JSON.stringify({
            status: 'COMPLETED',
            fingerprint: 'different-fingerprint',
            response: {}
        }));

        await assert.rejects(
            initiateExternalTransfer('acc-1', 20000, validRecipient, actor, 'idem-1', defaultOptions),
            UnprocessableEntityError
        );
    });

    describe('verifyExternalTransferStatus', () => {
        it('should throw NotFoundError if transfer not found', async () => {
            mockExternalTransferModel.findOne = mock.fn(async () => null);

            await assert.rejects(
                verifyExternalTransferStatus('ext-nonexistent', actor, {
                    Account: mockAccountModel,
                    ExternalTransfer: mockExternalTransferModel,
                    gateway: mockGateway
                }),
                NotFoundError
            );
        });

        it('should throw ForbiddenError if user is not owner and not admin', async () => {
            const foreignTransfer = {
                id: 'ext-2',
                userId: 'usr-different',
                status: 'PROCESSING'
            };
            mockExternalTransferModel.findOne = mock.fn(async () => foreignTransfer);

            await assert.rejects(
                verifyExternalTransferStatus('ext-2', actor, {
                    Account: mockAccountModel,
                    ExternalTransfer: mockExternalTransferModel,
                    gateway: mockGateway
                }),
                ForbiddenError
            );
        });

        it('should return transfer immediately without gateway call if status is already COMPLETED', async () => {
            const completedTransfer = {
                id: 'ext-completed',
                userId: actor.id,
                amount: 50000n,
                status: 'COMPLETED',
                reference: 'ref-comp'
            };
            mockExternalTransferModel.findOne = mock.fn(async () => completedTransfer);
            mockGateway.verifyTransfer = mock.fn();

            const res = await verifyExternalTransferStatus('ext-completed', actor, {
                Account: mockAccountModel,
                ExternalTransfer: mockExternalTransferModel,
                gateway: mockGateway
            });

            assert.strictEqual(res.status, 'COMPLETED');
            assert.strictEqual(mockGateway.verifyTransfer.mock.callCount(), 0);
        });

        it('should verify with gateway and transition to COMPLETED on success', async () => {
            const processingTransfer = {
                id: 'ext-proc',
                userId: actor.id,
                fromAccountId: 'acc-1',
                amount: 50000n,
                status: 'PROCESSING',
                reference: 'ref-proc-1',
                save: mock.fn(async function () { return this; })
            };
            mockExternalTransferModel.findOne = mock.fn(async () => processingTransfer);
            mockGateway.verifyTransfer = mock.fn(async () => ({ status: 'success' }));

            const res = await verifyExternalTransferStatus('ext-proc', actor, {
                Account: mockAccountModel,
                ExternalTransfer: mockExternalTransferModel,
                gateway: mockGateway
            });

            assert.strictEqual(mockGateway.verifyTransfer.mock.callCount(), 1);
            assert.strictEqual(processingTransfer.status, 'COMPLETED');
            assert.strictEqual(res.status, 'COMPLETED');
        });

        it('should refund ledger account if gateway verify returns failed', async () => {
            const processingTransfer = {
                id: 'ext-fail',
                userId: actor.id,
                fromAccountId: 'acc-1',
                amount: 50000n,
                status: 'PROCESSING',
                reference: 'ref-fail-1',
                save: mock.fn(async function () { return this; })
            };
            mockExternalTransferModel.findOne = mock.fn(async () => processingTransfer);
            mockGateway.verifyTransfer = mock.fn(async () => ({
                status: 'failed',
                gateway_response: 'Account number does not match name'
            }));

            const res = await verifyExternalTransferStatus('ext-fail', actor, {
                Account: mockAccountModel,
                ExternalTransfer: mockExternalTransferModel,
                gateway: mockGateway
            });

            assert.strictEqual(mockGateway.verifyTransfer.mock.callCount(), 1);
            assert.strictEqual(mockAccountModel.updateOne.mock.callCount(), 1);
            assert.deepStrictEqual(mockAccountModel.updateOne.mock.calls[0].arguments, [
                { id: 'acc-1' },
                { $inc: { balance: 50000n } }
            ]);
            assert.strictEqual(processingTransfer.status, 'FAILED');
            assert.strictEqual(res.status, 'FAILED');
        });
    });
});

