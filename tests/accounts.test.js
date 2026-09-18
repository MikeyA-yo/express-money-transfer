import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../app.js';
import { connectTestDB, clearTestDB, closeTestDB } from './setup.js';
import { generateToken } from '../services/auth.js';
import Account from '../models/accounts.js';

before(async () => {
    await connectTestDB();
});

afterEach(async () => {
    await clearTestDB();
});

after(async () => {
    await closeTestDB();
});

describe('Accounts API', () => {
    it('POST / - should create a new account and return major/minor money formats', async () => {
        const res = await request(app)
            .post('/api/v1/accounts')
            .send({
                name: 'Test User',
                email: 'test@example.com',
                balance: 10000
            });
        assert.strictEqual(res.statusCode, 201);
        assert.ok('id' in res.body);
        assert.strictEqual(res.body.name, 'Test User');
        assert.strictEqual(res.body.balance, '100.00 USD');
        assert.strictEqual(res.body.balanceMinor, '10000 USDMINOR');
    });
    
    it('POST / - should return 409 if account already exists', async () => {
        await request(app)
            .post('/api/v1/accounts')
            .send({
                name: 'Test User',
                email: 'duplicate@example.com',
                balance: 10000
            });
            
        const res = await request(app)
            .post('/api/v1/accounts')
            .send({
                name: 'Test User',
                email: 'duplicate@example.com',
                balance: 10000
            });
        assert.strictEqual(res.statusCode, 409);
    });

    it('GET / - should return empty list if no accounts when authenticated as admin', async () => {
        const adminToken = generateToken({ id: 'adm-test', email: 'admin@bank.com', role: 'admin' });
        const res = await request(app)
            .get('/api/v1/accounts')
            .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(res.statusCode, 200);
        assert.deepStrictEqual(res.body, []);
    });

    it('GET / - should reject unauthenticated access with 401', async () => {
        const res = await request(app).get('/api/v1/accounts');
        assert.strictEqual(res.statusCode, 401);
    });

    describe('DELETE /:id (Soft Delete)', () => {
        it('should soft delete account by setting deleted: true and preserving document in database', async () => {
            // 1. Create an account
            const createRes = await request(app)
                .post('/api/v1/accounts')
                .send({
                    name: 'Soft Delete User',
                    email: 'softdelete@example.com',
                    balance: 15000
                });
            assert.strictEqual(createRes.statusCode, 201);
            const accountId = createRes.body.id;

            // 2. Soft delete the account with authenticated user
            const userToken = generateToken({ id: 'usr-delete-test', email: 'softdelete@example.com', role: 'user' });
            const deleteRes = await request(app)
                .delete(`/api/v1/accounts/${accountId}`)
                .set('Authorization', `Bearer ${userToken}`);

            assert.strictEqual(deleteRes.statusCode, 200);
            assert.deepStrictEqual(deleteRes.body, { message: 'Account deleted successfully' });

            // 3. Verify in MongoDB that document still exists and has deleted: true
            const dbAccount = await Account.findOne({ id: accountId });
            assert.ok(dbAccount, 'Account document should still exist in database');
            assert.strictEqual(dbAccount.deleted, true, 'Account should have deleted flag set to true');
        });

        it('should exclude soft-deleted accounts from GET / list', async () => {
            // 1. Create two accounts
            const acc1Res = await request(app)
                .post('/api/v1/accounts')
                .send({ name: 'Active User', email: 'active@example.com', balance: 20000 });
            const acc2Res = await request(app)
                .post('/api/v1/accounts')
                .send({ name: 'To Delete User', email: 'todelete@example.com', balance: 30000 });

            assert.strictEqual(acc1Res.statusCode, 201);
            assert.strictEqual(acc2Res.statusCode, 201);

            // 2. Soft delete the second account
            const userToken = generateToken({ id: 'usr-todelete', email: 'todelete@example.com', role: 'user' });
            const deleteRes = await request(app)
                .delete(`/api/v1/accounts/${acc2Res.body.id}`)
                .set('Authorization', `Bearer ${userToken}`);
            assert.strictEqual(deleteRes.statusCode, 200);

            // 3. Query all accounts as admin
            const adminToken = generateToken({ id: 'adm-test', email: 'admin@bank.com', role: 'admin' });
            const listRes = await request(app)
                .get('/api/v1/accounts')
                .set('Authorization', `Bearer ${adminToken}`);

            assert.strictEqual(listRes.statusCode, 200);
            assert.strictEqual(listRes.body.length, 1);
            assert.strictEqual(listRes.body[0].id, acc1Res.body.id);
            assert.strictEqual(listRes.body.some(a => a.id === acc2Res.body.id), false);
        });

        it('should return 404 when attempting to delete non-existent account', async () => {
            const userToken = generateToken({ id: 'usr-test', email: 'user@test.com', role: 'user' });
            const res = await request(app)
                .delete('/api/v1/accounts/non-existent-account-id')
                .set('Authorization', `Bearer ${userToken}`);

            assert.strictEqual(res.statusCode, 404);
        });
    });
});
