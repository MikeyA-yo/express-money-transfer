import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../app.js';
import { connectTestDB, clearTestDB, closeTestDB } from './setup.js';

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
    describe('POST /api/v1/transfers', () => {
        it('should return 404 if accounts do not exist', async () => {
            const res = await request(app)
                .post('/api/v1/transfers')
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
            const verifyAcc1 = await request(app).get(`/api/v1/accounts/${acc1Id}`);
            const verifyAcc2 = await request(app).get(`/api/v1/accounts/${acc2Id}`);
            
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
