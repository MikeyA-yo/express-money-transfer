import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import {
    resolveAccount,
    createTransferRecipient,
    initiateTransfer,
    verifyTransfer,
    verifyWebhookSignature
} from '../../gateways/paystack/transfer.js';
import {
    BadRequestError,
    ServiceLayerError
} from '../../common/domain-exceptions/domain-exceptions.js';

describe('Paystack Transfer Gateway', () => {
    describe('resolveAccount', () => {
        it('should throw BadRequestError if accountNumber or bankCode is missing', async () => {
            await assert.rejects(resolveAccount('', '058'), BadRequestError);
            await assert.rejects(resolveAccount('0123456789', ''), BadRequestError);
        });

        it('should resolve account name when valid parameters are provided', async () => {
            const mockClient = {
                verification: {
                    resolveAccount: mock.fn(async ({ account_number, bank_code }) => ({
                        status: true,
                        data: {
                            account_number,
                            account_name: 'ALICE JANE DOE',
                            bank_id: 9
                        }
                    }))
                }
            };

            const result = await resolveAccount('0123456789', '058', { client: mockClient });
            assert.strictEqual(result.account_name, 'ALICE JANE DOE');
            assert.strictEqual(mockClient.verification.resolveAccount.mock.callCount(), 1);
        });
    });

    describe('createTransferRecipient', () => {
        it('should throw BadRequestError if required parameters are missing', async () => {
            await assert.rejects(createTransferRecipient('', '0123456789', '058'), BadRequestError);
            await assert.rejects(createTransferRecipient('Alice', '', '058'), BadRequestError);
            await assert.rejects(createTransferRecipient('Alice', '0123456789', ''), BadRequestError);
        });

        it('should create transfer recipient and return recipient_code', async () => {
            const mockClient = {
                recipient: {
                    create: mock.fn(async (payload) => ({
                        status: true,
                        data: {
                            recipient_code: 'RCP_mock_123',
                            type: payload.type,
                            name: payload.name,
                            details: {
                                account_number: payload.account_number,
                                bank_code: payload.bank_code
                            }
                        }
                    }))
                }
            };

            const result = await createTransferRecipient('Alice Doe', '0123456789', '058', 'NGN', { client: mockClient });
            assert.strictEqual(result.recipient_code, 'RCP_mock_123');
            assert.strictEqual(mockClient.recipient.create.mock.callCount(), 1);
        });
    });

    describe('initiateTransfer', () => {
        it('should throw BadRequestError if amount or recipient or reference is missing', async () => {
            await assert.rejects(initiateTransfer(0, 'RCP_123', 'ref-1'), BadRequestError);
            await assert.rejects(initiateTransfer(5000, '', 'ref-1'), BadRequestError);
            await assert.rejects(initiateTransfer(5000, 'RCP_123', ''), BadRequestError);
        });

        it('should initiate transfer and return transfer details', async () => {
            const mockClient = {
                transfer: {
                    initiate: mock.fn(async (payload) => ({
                        status: true,
                        data: {
                            transfer_code: 'TRF_mock_456',
                            amount: payload.amount,
                            recipient: payload.recipient,
                            status: 'success',
                            reference: payload.reference
                        }
                    }))
                }
            };

            const result = await initiateTransfer(50000, 'RCP_123', 'ref-100', 'Bonus', { client: mockClient });
            assert.strictEqual(result.transfer_code, 'TRF_mock_456');
            assert.strictEqual(result.status, 'success');
            assert.strictEqual(mockClient.transfer.initiate.mock.callCount(), 1);
        });
    });

    describe('verifyTransfer', () => {
        it('should throw BadRequestError if reference is missing', async () => {
            await assert.rejects(verifyTransfer(''), BadRequestError);
        });

        it('should verify transfer status', async () => {
            const mockClient = {
                transfer: {
                    verify: mock.fn(async (ref) => ({
                        status: true,
                        data: { reference: ref, status: 'success', amount: 50000 }
                    }))
                }
            };

            const result = await verifyTransfer('ref-100', { client: mockClient });
            assert.strictEqual(result.status, 'success');
            assert.strictEqual(mockClient.transfer.verify.mock.callCount(), 1);
        });
    });

    describe('verifyWebhookSignature', () => {
        const secret = 'sk_test_secret_key_123';
        const rawBody = JSON.stringify({ event: 'transfer.success', data: { reference: 'ref-1' } });
        const validSignature = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');

        it('should return true when HMAC signature matches rawBody', () => {
            const isValid = verifyWebhookSignature(rawBody, validSignature, secret);
            assert.strictEqual(isValid, true);
        });

        it('should return false when HMAC signature does not match', () => {
            const isValid = verifyWebhookSignature(rawBody, 'tampered_signature', secret);
            assert.strictEqual(isValid, false);
        });

        it('should return false if rawBody or signature is missing', () => {
            assert.strictEqual(verifyWebhookSignature('', validSignature, secret), false);
            assert.strictEqual(verifyWebhookSignature(rawBody, '', secret), false);
        });
    });
});
