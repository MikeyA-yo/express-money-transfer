import request from 'supertest';
import app from '../app.js';
import { connectTestDB, clearTestDB, closeTestDB } from './setup.js';
import { jest } from '@jest/globals';

jest.setTimeout(3600000); // 60 minutes to allow MongoDB binary download 

beforeAll(async () => {
    await connectTestDB();
});

afterEach(async () => {
    await clearTestDB();
});

afterAll(async () => {
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
            expect(res.statusCode).toEqual(404);
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

            expect(transferRes.statusCode).toEqual(201);
            expect(transferRes.body.status).toEqual('COMPLETED');
            expect(transferRes.body.amount.$numberDecimal).toEqual("200");

            // Verify balances
            const verifyAcc1 = await request(app).get(`/api/v1/accounts/${acc1Id}`);
            const verifyAcc2 = await request(app).get(`/api/v1/accounts/${acc2Id}`);
            
            expect(verifyAcc1.body.balance.$numberDecimal).toEqual("800");
            expect(verifyAcc2.body.balance.$numberDecimal).toEqual("700");
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

            expect(transferRes.statusCode).toEqual(400);
            expect(transferRes.body.error).toEqual('Insufficient funds');
        });
    });
});
