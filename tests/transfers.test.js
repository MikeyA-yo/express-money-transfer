import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../app.js';
import { connectTestDB, clearTestDB, closeTestDB } from './setup.js';
import { generateToken } from '../services/auth.js';

before(async () => {
    await connectTestDB();
});

afterEach(async () => {
    await clearTestDB();
});

after(async () => {
    await closeTestDB();
});

describe('Transfers API', () => {
    const adminToken = generateToken({ id: 'test-admin-id', email: 'admin@example.com', role: 'admin' });

    async function signupUser({ name, email, password = 'password123', balance }) {
        const res = await request(app)
            .post('/api/v1/auth/signup')
            .send({ name, email, password, balance });
        assert.strictEqual(res.statusCode, 201, res.body.error || JSON.stringify(res.body));
        return res.body;
    }

    async function createDestinationAccount({ name, email, balance }) {
        const res = await request(app)
            .post('/api/v1/accounts')
            .send({ name, email, balance });
        assert.strictEqual(res.statusCode, 201);
        return res.body;
    }

    it('POST / - should return 401 if unauthenticated', async () => {
        const res = await request(app)
            .post('/api/v1/transfers')
            .send({
                fromAccountId: 'acc1',
                toAccountId: 'acc2',
                amount: 100
            });
        assert.strictEqual(res.statusCode, 401);
    });

    it('POST / - should return 401 if user has insufficient permissions (e.g. admin instead of user)', async () => {
        const res = await request(app)
            .post('/api/v1/transfers')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                fromAccountId: 'acc1',
                toAccountId: 'acc2',
                amount: 100
            });
        assert.strictEqual(res.statusCode, 401);
        assert.strictEqual(res.body.error, 'Insufficient permissions');
    });

    it('POST / - should return 401 if the token does not map to a persisted user', async () => {
        const orphanToken = generateToken({
            id: 'missing-user',
            email: 'ghost@example.com',
            role: 'user',
            accountId: 'acc-ghost'
        });

        const res = await request(app)
            .post('/api/v1/transfers')
            .set('Authorization', `Bearer ${orphanToken}`)
            .send({
                fromAccountId: 'acc-ghost',
                toAccountId: 'acc-other',
                amount: 100
            });

        assert.strictEqual(res.statusCode, 401);
        assert.strictEqual(res.body.error, 'Authenticated user not found');
    });

    it('POST / - should return 403 if a user tries to debit another user account', async () => {
        const alice = await signupUser({
            name: 'Alice',
            email: 'alice@example.com',
            balance: 1000
        });
        const bob = await signupUser({
            name: 'Bob',
            email: 'bob@example.com',
            balance: 500
        });

        const res = await request(app)
            .post('/api/v1/transfers')
            .set('Authorization', `Bearer ${bob.token}`)
            .send({
                fromAccountId: alice.account.id,
                toAccountId: bob.account.id,
                amount: 100
            });

        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.body.error, 'Cannot initiate transfer from an account you do not own');

        const aliceAccount = await request(app)
            .get(`/api/v1/accounts/${alice.account.id}`)
            .set('Authorization', `Bearer ${alice.token}`);
        assert.strictEqual(aliceAccount.body.balance, 1000);
    });

    it('POST / - should return 403 even if the claimed source account does not exist', async () => {
        const alice = await signupUser({
            name: 'Alice',
            email: 'alice@example.com',
            balance: 1000
        });
        const destination = await createDestinationAccount({
            name: 'Bob',
            email: 'bob@example.com',
            balance: 500
        });

        const res = await request(app)
            .post('/api/v1/transfers')
            .set('Authorization', `Bearer ${alice.token}`)
            .send({
                fromAccountId: 'not-alice-account',
                toAccountId: destination.id,
                amount: 100
            });

        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.body.error, 'Cannot initiate transfer from an account you do not own');
    });

    it('POST / - should return 400 if transferring to the same account', async () => {
        const alice = await signupUser({
            name: 'Alice',
            email: 'alice@example.com',
            balance: 1000
        });

        const res = await request(app)
            .post('/api/v1/transfers')
            .set('Authorization', `Bearer ${alice.token}`)
            .send({
                fromAccountId: alice.account.id,
                toAccountId: alice.account.id,
                amount: 100
            });

        assert.strictEqual(res.statusCode, 400);
    });

    it('POST / - should return 404 if destination account does not exist', async () => {
        const alice = await signupUser({
            name: 'Alice',
            email: 'alice@example.com',
            balance: 1000
        });

        const res = await request(app)
            .post('/api/v1/transfers')
            .set('Authorization', `Bearer ${alice.token}`)
            .send({
                fromAccountId: alice.account.id,
                toAccountId: 'nonexistent-destination',
                amount: 100
            });

        assert.strictEqual(res.statusCode, 404);
    });

    it('POST / - should successfully transfer money from the authenticated user account', async () => {
        const alice = await signupUser({
            name: 'Alice',
            email: 'alice@example.com',
            balance: 1000
        });
        const bob = await createDestinationAccount({
            name: 'Bob',
            email: 'bob@example.com',
            balance: 500
        });

        const transferRes = await request(app)
            .post('/api/v1/transfers')
            .set('Authorization', `Bearer ${alice.token}`)
            .send({
                fromAccountId: alice.account.id,
                toAccountId: bob.id,
                amount: 200
            });

        assert.strictEqual(transferRes.statusCode, 201);
        assert.strictEqual(transferRes.body.status, 'COMPLETED');
        const transferAmount = transferRes.body.amount?.$numberDecimal ?? transferRes.body.amount;
        assert.strictEqual(Number(transferAmount), 200);
        assert.strictEqual(transferRes.body.from, alice.account.id);
        assert.strictEqual(transferRes.body.to, bob.id);

        const verifyAcc1 = await request(app)
            .get(`/api/v1/accounts/${alice.account.id}`)
            .set('Authorization', `Bearer ${alice.token}`);
        const verifyAcc2 = await request(app)
            .get(`/api/v1/accounts/${bob.id}`)
            .set('Authorization', `Bearer ${alice.token}`);

        const acc1Balance = verifyAcc1.body.balance?.$numberDecimal ?? verifyAcc1.body.balance;
        const acc2Balance = verifyAcc2.body.balance?.$numberDecimal ?? verifyAcc2.body.balance;
        assert.strictEqual(Number(acc1Balance), 800);
        assert.strictEqual(Number(acc2Balance), 700);
    });

    it('POST / - should return 400 if insufficient funds', async () => {
        const alice = await signupUser({
            name: 'Alice',
            email: 'alice@example.com',
            balance: 100
        });
        const bob = await createDestinationAccount({
            name: 'Bob',
            email: 'bob@example.com',
            balance: 500
        });

        const transferRes = await request(app)
            .post('/api/v1/transfers')
            .set('Authorization', `Bearer ${alice.token}`)
            .send({
                fromAccountId: alice.account.id,
                toAccountId: bob.id,
                amount: 200
            });

        assert.strictEqual(transferRes.statusCode, 400);
        assert.strictEqual(transferRes.body.error, 'Insufficient funds');
    });
});
