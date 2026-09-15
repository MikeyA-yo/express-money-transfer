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
});
