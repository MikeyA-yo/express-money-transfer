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

describe('Accounts API', () => {
    describe('POST /api/v1/accounts', () => {
        it('should create a new account', async () => {
            const res = await request(app)
                .post('/api/v1/accounts')
                .send({
                    name: 'Test User',
                    email: 'test@example.com',
                    balance: 100
                });
            assert.strictEqual(res.statusCode, 201);
            assert.ok('id' in res.body);
            assert.strictEqual(res.body.name, 'Test User');
        });
        
        it('should return 409 if account already exists', async () => {
            await request(app)
                .post('/api/v1/accounts')
                .send({
                    name: 'Test User',
                    email: 'duplicate@example.com',
                    balance: 100
                });
                
            const res = await request(app)
                .post('/api/v1/accounts')
                .send({
                    name: 'Test User',
                    email: 'duplicate@example.com',
                    balance: 100
                });
            assert.strictEqual(res.statusCode, 409);
        });
    });

    describe('GET /api/v1/accounts', () => {
        it('should return empty list if no accounts', async () => {
            const res = await request(app).get('/api/v1/accounts');
            assert.strictEqual(res.statusCode, 200);
            assert.deepStrictEqual(res.body, []);
        });
    });
});
