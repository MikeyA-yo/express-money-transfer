import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import app from '../app.js';
import { connectTestDB, clearTestDB, closeTestDB } from './setup.js';
import { generateToken } from '../services/auth.js';
import { closeRedisClient } from '../util/idempotency.js';
import Account from '../models/accounts.js';
import ExternalTransfer from '../models/externalTransfer.js';

before(async () => {
    await connectTestDB();
});

afterEach(async () => {
    await clearTestDB();
});

after(async () => {
    await closeTestDB();
    await closeRedisClient();
});

describe('External Transfers & Webhook API', () => {
    const adminToken = generateToken({ id: 'test-admin-id', email: 'admin@example.com', role: 'admin' });

    async function signupUser({ name, email, password = 'password123', balance }) {
        const res = await request(app)
            .post('/api/v1/auth/signup')
            .send({ name, email, password, balance });
        assert.strictEqual(res.statusCode, 201, res.body.error || JSON.stringify(res.body));
        return res.body;
    }

    describe('GET /api/v1/transfers/external/resolve-account', () => {
        it('should return 401 if unauthenticated', async () => {
            const res = await request(app)
                .get('/api/v1/transfers/external/resolve-account')
                .query({ accountNumber: '0123456789', bankCode: '058' });
            assert.strictEqual(res.statusCode, 401);
        });

        it('should return 400 if accountNumber or bankCode is missing', async () => {
            const user = await signupUser({ name: 'Alice Test', email: 'alice.resolve@test.com', balance: 50000 });
            const res = await request(app)
                .get('/api/v1/transfers/external/resolve-account')
                .set('Authorization', `Bearer ${user.token}`)
                .query({ bankCode: '058' });
            assert.strictEqual(res.statusCode, 400);
        });
    });

    describe('POST /api/v1/transfers/external', () => {
        it('should return 401 if unauthenticated', async () => {
            const res = await request(app)
                .post('/api/v1/transfers/external')
                .send({
                    fromAccountId: 'acc1',
                    amountMinor: 50000,
                    recipientAccountNumber: '0123456789',
                    recipientBankCode: '058',
                    recipientName: 'Test Recipient'
                });
            assert.strictEqual(res.statusCode, 401);
        });

        it('should return 403 if role is admin', async () => {
            const res = await request(app)
                .post('/api/v1/transfers/external')
                .set('Authorization', `Bearer ${adminToken}`)
                .set('X-Idempotency-Key', 'idem-admin-ext')
                .send({
                    fromAccountId: 'acc1',
                    amountMinor: 50000,
                    recipientAccountNumber: '0123456789',
                    recipientBankCode: '058',
                    recipientName: 'Test Recipient'
                });
            assert.strictEqual(res.statusCode, 403);
        });

        it('should return 400 if X-Idempotency-Key header is missing', async () => {
            const user = await signupUser({ name: 'Bob Ext', email: 'bob.ext@test.com', balance: 50000 });
            const res = await request(app)
                .post('/api/v1/transfers/external')
                .set('Authorization', `Bearer ${user.token}`)
                .send({
                    fromAccountId: user.account.id,
                    amountMinor: 10000,
                    recipientAccountNumber: '0123456789',
                    recipientBankCode: '058',
                    recipientName: 'Test Recipient'
                });
            assert.strictEqual(res.statusCode, 400);
            assert.ok(
                Array.isArray(res.body.error) &&
                res.body.error.some(e => e.message?.includes('X-Idempotency-Key header is required'))
            );
        });

        it('should return 400 if legacy Idempotency-Key header is passed instead of X-Idempotency-Key', async () => {
            const user = await signupUser({ name: 'Legacy User', email: 'legacy@test.com', balance: 50000 });
            const res = await request(app)
                .post('/api/v1/transfers/external')
                .set('Authorization', `Bearer ${user.token}`)
                .set('Idempotency-Key', 'idem-legacy-only')
                .send({
                    fromAccountId: user.account.id,
                    amountMinor: 10000,
                    recipientAccountNumber: '0123456789',
                    recipientBankCode: '058',
                    recipientName: 'Test Recipient'
                });
            assert.strictEqual(res.statusCode, 400);
            assert.ok(
                Array.isArray(res.body.error) &&
                res.body.error.some(e => e.message?.includes('X-Idempotency-Key header is required'))
            );
        });

        it('should return 400 if payload validation fails (e.g. invalid bankCode)', async () => {
            const user = await signupUser({ name: 'Charlie Ext', email: 'charlie.ext@test.com', balance: 50000 });
            const res = await request(app)
                .post('/api/v1/transfers/external')
                .set('Authorization', `Bearer ${user.token}`)
                .set('X-Idempotency-Key', 'idem-charlie-ext')
                .send({
                    fromAccountId: user.account.id,
                    amountMinor: 10000,
                    recipientAccountNumber: '0123456789',
                    recipientBankCode: '1', // too short, must be 3-6 digits
                    recipientName: 'Test Recipient'
                });
            assert.strictEqual(res.statusCode, 400);
        });

        it('should return 403 if source account does not belong to authenticated user', async () => {
            const user1 = await signupUser({ name: 'User 1', email: 'u1@test.com', balance: 50000 });
            const user2 = await signupUser({ name: 'User 2', email: 'u2@test.com', balance: 50000 });

            const res = await request(app)
                .post('/api/v1/transfers/external')
                .set('Authorization', `Bearer ${user1.token}`)
                .set('X-Idempotency-Key', 'idem-unauthorized-acc')
                .send({
                    fromAccountId: user2.account.id, // User 1 trying to debit User 2's account
                    amountMinor: 10000,
                    recipientAccountNumber: '0123456789',
                    recipientBankCode: '058',
                    recipientName: 'Test Recipient'
                });
            assert.strictEqual(res.statusCode, 403);
        });

        it('should return 400 if balance is insufficient', async () => {
            const user = await signupUser({ name: 'Broke User', email: 'broke@test.com', balance: 1000 }); // $10.00
            const res = await request(app)
                .post('/api/v1/transfers/external')
                .set('Authorization', `Bearer ${user.token}`)
                .set('X-Idempotency-Key', 'idem-broke-user')
                .send({
                    fromAccountId: user.account.id,
                    amountMinor: 50000, // $500.00
                    recipientAccountNumber: '0123456789',
                    recipientBankCode: '058',
                    recipientName: 'Test Recipient'
                });
            assert.strictEqual(res.statusCode, 400);
            assert.match(res.body.error, /insufficient funds/i);
        });
    });

    describe('GET /api/v1/transfers/external', () => {
        it('should return 401 if unauthenticated', async () => {
            const res = await request(app).get('/api/v1/transfers/external');
            assert.strictEqual(res.statusCode, 401);
        });

        it('should return 200 with list of transfers for user', async () => {
            const user = await signupUser({ name: 'Viewer', email: 'viewer@test.com', balance: 50000 });
            const res = await request(app)
                .get('/api/v1/transfers/external')
                .set('Authorization', `Bearer ${user.token}`);
            assert.strictEqual(res.statusCode, 200);
            assert.ok(Array.isArray(res.body));
            assert.strictEqual(res.body.length, 0);
        });
    });

    describe('GET /api/v1/transfers/external/:id', () => {
        it('should return 404 if transfer does not exist', async () => {
            const user = await signupUser({ name: 'Searcher', email: 'searcher@test.com', balance: 50000 });
            const fakeId = '64b1f2e3d4c5b6a789012345';
            const res = await request(app)
                .get(`/api/v1/transfers/external/${fakeId}`)
                .set('Authorization', `Bearer ${user.token}`);
            assert.strictEqual(res.statusCode, 404);
        });
    });

    describe('GET /api/v1/transfers/external/:id/status', () => {
        it('should return 401 if unauthenticated', async () => {
            const fakeId = '64b1f2e3d4c5b6a789012345';
            const res = await request(app).get(`/api/v1/transfers/external/${fakeId}/status`);
            assert.strictEqual(res.statusCode, 401);
        });

        it('should return 404 if transfer does not exist', async () => {
            const user = await signupUser({ name: 'Checker', email: 'checker@test.com', balance: 50000 });
            const fakeId = '64b1f2e3d4c5b6a789012345';
            const res = await request(app)
                .get(`/api/v1/transfers/external/${fakeId}/status`)
                .set('Authorization', `Bearer ${user.token}`);
            assert.strictEqual(res.statusCode, 404);
        });
    });

    describe('POST /api/v1/webhooks/paystack', () => {
        it('should return 401 if x-paystack-signature header is missing', async () => {
            const res = await request(app)
                .post('/api/v1/webhooks/paystack')
                .send({ event: 'transfer.success' });
            assert.strictEqual(res.statusCode, 401);
        });

        it('should return 401 if x-paystack-signature is invalid', async () => {
            const res = await request(app)
                .post('/api/v1/webhooks/paystack')
                .set('x-paystack-signature', 'invalid-signature-hex')
                .send({ event: 'transfer.success' });
            assert.strictEqual(res.statusCode, 401);
        });

        it('should return 200 and process event when valid HMAC signature is provided', async () => {
            const uniqueRef = 'ext_wh_test_ref_' + Date.now() + '_' + Math.random().toString(36).slice(2);
            const payload = {
                event: 'transfer.success',
                data: {
                    reference: uniqueRef,
                    transfer_code: 'TRF_WH_TEST_01',
                    status: 'success'
                }
            };
            const rawBody = JSON.stringify(payload);
            const secretKey = process.env.PAYSTACK_TEST_SECRET_KEY || 'sk_test_mock';
            const validSignature = crypto
                .createHmac('sha512', secretKey)
                .update(rawBody)
                .digest('hex');

            const res = await request(app)
                .post('/api/v1/webhooks/paystack')
                .set('x-paystack-signature', validSignature)
                .set('Content-Type', 'application/json')
                .send(rawBody);

            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.status, 'success');
            assert.strictEqual(res.body.event, 'transfer.success');
        });
    });
});
