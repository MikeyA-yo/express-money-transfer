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
    const userToken = generateToken({ id: 'test-user-id', email: 'user@example.com', role: 'user' });
    const adminToken = generateToken({ id: 'test-admin-id', email: 'admin@example.com', role: 'admin' });

    describe('POST /api/v1/transfers', () => {
        it('should return 401 if unauthenticated', async () => {
            const res = await request(app)
                .post('/api/v1/transfers')
                .send({
                    fromAccountId: 'acc1',
                    toAccountId: 'acc2',
                    amount: 100
                });
            assert.strictEqual(res.statusCode, 401);
        });

        it('should return 401 if user has insufficient permissions (e.g. admin instead of user)', async () => {
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

        it('should return 404 if accounts do not exist', async () => {
            const res = await request(app)
                .post('/api/v1/transfers')
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                    fromAccountId: 'nonexistent1',
                    toAccountId: 'nonexistent2',
                    amount: 100
                });
            assert.strictEqual(res.statusCode, 404);
        });

        it('should successfully transfer money between two accounts', async () => {
            // Setup accounts
            const acc1Res = await request(app).post('/api/v1/accounts').send({
                name: 'Alice',
                email: 'alice@example.com',
                balance: 1000
            });
            const acc2Res = await request(app).post('/api/v1/accounts').send({
                name: 'Bob',
                email: 'bob@example.com',
                balance: 500
            });
            
            const acc1Id = acc1Res.body.id;
            const acc2Id = acc2Res.body.id;

            // Perform transfer
            const transferRes = await request(app)
                .post('/api/v1/transfers')
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                    fromAccountId: acc1Id,
                    toAccountId: acc2Id,
                    amount: 200
                });

            assert.strictEqual(transferRes.statusCode, 201);
            assert.strictEqual(transferRes.body.status, 'COMPLETED');
            const transferAmount = transferRes.body.amount?.$numberDecimal ?? transferRes.body.amount;
            assert.strictEqual(Number(transferAmount), 200);

            // Verify balances
            const verifyAcc1 = await request(app)
                .get(`/api/v1/accounts/${acc1Id}`)
                .set('Authorization', `Bearer ${userToken}`);
            const verifyAcc2 = await request(app)
                .get(`/api/v1/accounts/${acc2Id}`)
                .set('Authorization', `Bearer ${userToken}`);
            
            const acc1Balance = verifyAcc1.body.balance?.$numberDecimal ?? verifyAcc1.body.balance;
            const acc2Balance = verifyAcc2.body.balance?.$numberDecimal ?? verifyAcc2.body.balance;
            assert.strictEqual(Number(acc1Balance), 800);
            assert.strictEqual(Number(acc2Balance), 700);
        });

        it('should return 400 if insufficient funds', async () => {
            // Setup accounts
            const acc1Res = await request(app).post('/api/v1/accounts').send({
                name: 'Alice',
                email: 'alice@example.com',
                balance: 100
            });
            const acc2Res = await request(app).post('/api/v1/accounts').send({
                name: 'Bob',
                email: 'bob@example.com',
                balance: 500
            });
            
            const acc1Id = acc1Res.body.id;
            const acc2Id = acc2Res.body.id;

            // Perform transfer
            const transferRes = await request(app)
                .post('/api/v1/transfers')
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                    fromAccountId: acc1Id,
                    toAccountId: acc2Id,
                    amount: 200
                });

            assert.strictEqual(transferRes.statusCode, 400);
            assert.strictEqual(transferRes.body.error, 'Insufficient funds');
        });
    });
});
