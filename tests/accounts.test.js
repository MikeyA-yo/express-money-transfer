import request from 'supertest';
import app from '../app.js';
import { connectTestDB, clearTestDB, closeTestDB } from './setup.js';
import { jest } from '@jest/globals';

jest.setTimeout(3600000); // 60 minutes to allow MongoDB binary download on slow networks

beforeAll(async () => {
    await connectTestDB();
});

afterEach(async () => {
    await clearTestDB();
});

afterAll(async () => {
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
            if (res.statusCode !== 201) console.log("Response Body:", res.body);
            expect(res.statusCode).toEqual(201);
            expect(res.body).toHaveProperty('id');
            expect(res.body.name).toEqual('Test User');
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
            expect(res.statusCode).toEqual(409);
        });
    });

    describe('GET /api/v1/accounts', () => {
        it('should return empty list if no accounts', async () => {
            const res = await request(app).get('/api/v1/accounts');
            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual([]);
        });
    });
});
