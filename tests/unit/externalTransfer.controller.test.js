import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
    createExternalTransferHandler,
    getExternalTransferHandler,
    listExternalTransfersHandler,
    resolveAccountHandler,
    verifyExternalTransferStatusHandler
} from '../../controllers/externalTransfer.js';
import { paystackWebhookHandler } from '../../controllers/webhook.js';

describe('ExternalTransfer & Webhook Controllers', () => {
    let mockReq;
    let mockRes;

    beforeEach(() => {
        mockReq = {
            body: {},
            params: {},
            query: {},
            headers: {},
            user: { id: 'usr-456', role: 'user' }
        };
        mockRes = {
            status: mock.fn(function () { return this; }),
            json: mock.fn(function () { return this; })
        };
    });

    describe('createExternalTransferHandler', () => {
        it('should invoke initiateTransfer with request data and return 201', async () => {
            mockReq.body = {
                fromAccountId: '64b1f2e3d4c5b6a789012345',
                amountMinor: 500000,
                recipientAccountNumber: '0123456789',
                recipientBankCode: '058',
                recipientName: 'Jane Doe',
                reason: 'Supplier settlement'
            };
            mockReq.headers['x-idempotency-key'] = 'idem-external-123';

            const mockInitiate = mock.fn(async () => ({
                id: 'ext-999',
                reference: 'ext_ref_123',
                amount: 500000,
                status: 'PROCESSING'
            }));

            const handler = createExternalTransferHandler({ initiateTransfer: mockInitiate });
            await handler(mockReq, mockRes);

            assert.strictEqual(mockInitiate.mock.callCount(), 1);
            assert.deepStrictEqual(mockInitiate.mock.calls[0].arguments, [
                '64b1f2e3d4c5b6a789012345',
                500000,
                {
                    accountNumber: '0123456789',
                    bankCode: '058',
                    accountName: 'Jane Doe',
                    reason: 'Supplier settlement'
                },
                { id: 'usr-456', role: 'user' },
                'idem-external-123'
            ]);

            assert.strictEqual(mockRes.status.mock.callCount(), 1);
            assert.deepStrictEqual(mockRes.status.mock.calls[0].arguments, [201]);
            assert.strictEqual(mockRes.json.mock.callCount(), 1);
            assert.strictEqual(mockRes.json.mock.calls[0].arguments[0].id, 'ext-999');
        });
    });

    describe('getExternalTransferHandler', () => {
        it('should invoke getTransfer with param id and return 200', async () => {
            mockReq.params = { id: 'ext-123' };
            const mockGetTransfer = mock.fn(async () => ({
                id: 'ext-123',
                amount: 500000,
                status: 'COMPLETED'
            }));

            const handler = getExternalTransferHandler({ getTransfer: mockGetTransfer });
            await handler(mockReq, mockRes);

            assert.strictEqual(mockGetTransfer.mock.callCount(), 1);
            assert.deepStrictEqual(mockGetTransfer.mock.calls[0].arguments, ['ext-123']);
            assert.strictEqual(mockRes.status.mock.callCount(), 1);
            assert.deepStrictEqual(mockRes.status.mock.calls[0].arguments, [200]);
            assert.strictEqual(mockRes.json.mock.callCount(), 1);
            assert.strictEqual(mockRes.json.mock.calls[0].arguments[0].status, 'COMPLETED');
        });
    });

    describe('listExternalTransfersHandler', () => {
        it('should pass userId for regular user and return 200', async () => {
            mockReq.query = { page: 2, limit: 5 };
            mockReq.user = { id: 'usr-456', role: 'user' };

            const mockList = mock.fn(async () => ([{ id: 'ext-1' }]));

            const handler = listExternalTransfersHandler({ listTransfers: mockList });
            await handler(mockReq, mockRes);

            assert.strictEqual(mockList.mock.callCount(), 1);
            assert.deepStrictEqual(mockList.mock.calls[0].arguments, ['usr-456', 2, 5]);
            assert.strictEqual(mockRes.status.mock.callCount(), 1);
            assert.deepStrictEqual(mockRes.status.mock.calls[0].arguments, [200]);
        });

        it('should pass null userId for admin user to view all transfers', async () => {
            mockReq.query = { page: 1, limit: 10 };
            mockReq.user = { id: 'admin-1', role: 'admin' };

            const mockList = mock.fn(async () => ([]));

            const handler = listExternalTransfersHandler({ listTransfers: mockList });
            await handler(mockReq, mockRes);

            assert.strictEqual(mockList.mock.callCount(), 1);
            assert.deepStrictEqual(mockList.mock.calls[0].arguments, [null, 1, 10]);
            assert.strictEqual(mockRes.status.mock.callCount(), 1);
            assert.deepStrictEqual(mockRes.status.mock.calls[0].arguments, [200]);
        });
    });

    describe('resolveAccountHandler', () => {
        it('should invoke resolveAccount with accountNumber and bankCode and return 200', async () => {
            mockReq.query = { accountNumber: '0123456789', bankCode: '058' };
            const mockResolve = mock.fn(async () => ({
                account_number: '0123456789',
                account_name: 'JOHN DOE',
                bank_id: 9
            }));

            const handler = resolveAccountHandler({ resolveAccount: mockResolve });
            await handler(mockReq, mockRes);

            assert.strictEqual(mockResolve.mock.callCount(), 1);
            assert.deepStrictEqual(mockResolve.mock.calls[0].arguments, ['0123456789', '058']);
            assert.strictEqual(mockRes.status.mock.callCount(), 1);
            assert.deepStrictEqual(mockRes.status.mock.calls[0].arguments, [200]);
            assert.strictEqual(mockRes.json.mock.calls[0].arguments[0].account_name, 'JOHN DOE');
        });
    });

    describe('paystackWebhookHandler', () => {
        it('should invoke handleWebhook with payload, signature, and rawBody and return 200', async () => {
            mockReq.headers['x-paystack-signature'] = 'sig-abc-123';
            mockReq.rawBody = '{"event":"transfer.success"}';
            mockReq.body = { event: 'transfer.success' };

            const mockHandleWebhook = mock.fn(async () => ({
                received: true,
                event: 'transfer.success',
                reference: 'ref-001'
            }));

            const handler = paystackWebhookHandler({ handleWebhook: mockHandleWebhook });
            await handler(mockReq, mockRes);

            assert.strictEqual(mockHandleWebhook.mock.callCount(), 1);
            assert.deepStrictEqual(mockHandleWebhook.mock.calls[0].arguments, [
                { event: 'transfer.success' },
                'sig-abc-123',
                '{"event":"transfer.success"}'
            ]);
            assert.strictEqual(mockRes.status.mock.callCount(), 1);
            assert.deepStrictEqual(mockRes.status.mock.calls[0].arguments, [200]);
            assert.deepStrictEqual(mockRes.json.mock.calls[0].arguments[0], {
                status: 'ok',
                received: true,
                event: 'transfer.success',
                reference: 'ref-001'
            });
        });
    });

    describe('verifyExternalTransferStatusHandler', () => {
        it('should invoke verifyStatus with param id and req.user and return 200', async () => {
            mockReq.params = { id: 'ext-status-1' };
            const mockVerifyStatus = mock.fn(async () => ({
                id: 'ext-status-1',
                status: 'COMPLETED'
            }));

            const handler = verifyExternalTransferStatusHandler({ verifyStatus: mockVerifyStatus });
            await handler(mockReq, mockRes);

            assert.strictEqual(mockVerifyStatus.mock.callCount(), 1);
            assert.deepStrictEqual(mockVerifyStatus.mock.calls[0].arguments, ['ext-status-1', { id: 'usr-456', role: 'user' }]);
            assert.strictEqual(mockRes.status.mock.callCount(), 1);
            assert.deepStrictEqual(mockRes.status.mock.calls[0].arguments, [200]);
            assert.strictEqual(mockRes.json.mock.calls[0].arguments[0].status, 'COMPLETED');
        });
    });
});

