import request from 'supertest';
import app from '../../app.js';
import { connectTestDB, clearTestDB, closeTestDB } from '../setup.js';
import { jest } from '@jest/globals';

jest.setTimeout(3600000);

beforeAll(async () => {
  await connectTestDB();
});

afterEach(async () => {
  await clearTestDB();
});

afterAll(async () => {
  await closeTestDB();
});

describe('End-to-End (E2E) Workflow: Complete Money Transfer Lifecycle', () => {
  it('should execute the full user journey: onboarding, transfers, audits, balance updates, and edge cases', async () => {
    // ----------------------------------------------------
    // STEP 1: Verify Security Headers (Helmet middleware)
    // ----------------------------------------------------
    const healthCheck = await request(app).get('/api/v1/accounts');
    expect(healthCheck.headers).toHaveProperty('x-dns-prefetch-control');
    expect(healthCheck.headers).toHaveProperty('x-content-type-options', 'nosniff');

    // ----------------------------------------------------
    // STEP 2: Client A (Alice) and Client B (Bob) Onboarding
    // ----------------------------------------------------
    const createAliceRes = await request(app)
      .post('/api/v1/accounts')
      .send({
        name: 'Alice Cooper',
        email: 'alice@example.com',
        balance: 1000
      });
    expect(createAliceRes.statusCode).toEqual(201);
    expect(createAliceRes.body).toHaveProperty('id');
    expect(createAliceRes.body.name).toEqual('Alice Cooper');
    expect(createAliceRes.body.balance).toEqual(1000);
    const aliceId = createAliceRes.body.id;

    const createBobRes = await request(app)
      .post('/api/v1/accounts')
      .send({
        name: 'Bob Marley',
        email: 'bob@example.com',
        balance: 200
      });
    expect(createBobRes.statusCode).toEqual(201);
    expect(createBobRes.body.balance).toEqual(200);
    const bobId = createBobRes.body.id;

    // ----------------------------------------------------
    // STEP 3: Duplicate Registration Guard (Conflict 409)
    // ----------------------------------------------------
    const duplicateRes = await request(app)
      .post('/api/v1/accounts')
      .send({
        name: 'Alice Clone',
        email: 'alice@example.com',
        balance: 500
      });
    expect(duplicateRes.statusCode).toEqual(409);
    expect(duplicateRes.body.error).toContain('Account already exists');

    // ----------------------------------------------------
    // STEP 4: Request Validation (Zod schema rejection 400)
    // ----------------------------------------------------
    const invalidTransfer = await request(app)
      .post('/api/v1/transfers')
      .send({
        fromAccountId: aliceId,
        toAccountId: bobId,
        amount: -50 // Invalid negative amount
      });
    expect(invalidTransfer.statusCode).toEqual(400);

    // ----------------------------------------------------
    // STEP 5: Business Rule Enforcement (Insufficient Funds 400)
    // ----------------------------------------------------
    const overdrawTransfer = await request(app)
      .post('/api/v1/transfers')
      .send({
        fromAccountId: aliceId,
        toAccountId: bobId,
        amount: 5000 // Exceeds Alice's $1000 balance
      });
    expect(overdrawTransfer.statusCode).toEqual(400);
    expect(overdrawTransfer.body.error).toEqual('Insufficient funds');

    // ----------------------------------------------------
    // STEP 6: Execute Valid Transfer ($350 Alice -> Bob)
    // ----------------------------------------------------
    const transferRes = await request(app)
      .post('/api/v1/transfers')
      .send({
        fromAccountId: aliceId,
        toAccountId: bobId,
        amount: 350
      });
    expect(transferRes.statusCode).toEqual(201);
    expect(transferRes.body.status).toEqual('COMPLETED');
    expect(transferRes.body.amount).toEqual(350);
    expect(transferRes.body.from).toEqual(aliceId);
    expect(transferRes.body.to).toEqual(bobId);
    const transferId = transferRes.body.id;

    // ----------------------------------------------------
    // STEP 7: Audit & Verify Individual Transfer Record
    // ----------------------------------------------------
    const fetchTransferRes = await request(app).get(`/api/v1/transfers/${transferId}`);
    expect(fetchTransferRes.statusCode).toEqual(200);
    expect(fetchTransferRes.body.id).toEqual(transferId);
    expect(fetchTransferRes.body.status).toEqual('COMPLETED');
    expect(fetchTransferRes.body.amount).toEqual(350);

    // ----------------------------------------------------
    // STEP 8: Verify Real-Time Account Balances Post-Transfer
    // ----------------------------------------------------
    const aliceAccount = await request(app).get(`/api/v1/accounts/${aliceId}`);
    const bobAccount = await request(app).get(`/api/v1/accounts/${bobId}`);
    expect(aliceAccount.statusCode).toEqual(200);
    expect(bobAccount.statusCode).toEqual(200);
    expect(aliceAccount.body.balance).toEqual(650); // 1000 - 350
    expect(bobAccount.body.balance).toEqual(550);  // 200 + 350

    // ----------------------------------------------------
    // STEP 9: List All Transfers History
    // ----------------------------------------------------
    const transferListRes = await request(app).get('/api/v1/transfers?page=1&limit=10');
    expect(transferListRes.statusCode).toEqual(200);
    expect(Array.isArray(transferListRes.body)).toBe(true);
    expect(transferListRes.body.some((t) => t.id === transferId)).toBe(true);

    // ----------------------------------------------------
    // STEP 10: Modify Account Details (PATCH)
    // ----------------------------------------------------
    const updateRes = await request(app)
      .patch(`/api/v1/accounts/${aliceId}`)
      .send({
        name: 'Alice C. Wonderland',
        email: 'alice.wonderland@example.com',
        balance: 650
      });
    expect(updateRes.statusCode).toEqual(200);
    expect(updateRes.body.name).toEqual('Alice C. Wonderland');

    // ----------------------------------------------------
    // STEP 11: Account Deletion (DELETE)
    // ----------------------------------------------------
    const deleteRes = await request(app).delete(`/api/v1/accounts/${bobId}`);
    expect(deleteRes.statusCode).toEqual(200);

    // ----------------------------------------------------
    // STEP 12: Subsequent Transfer to Deleted Account (404)
    // ----------------------------------------------------
    const postDeletionTransfer = await request(app)
      .post('/api/v1/transfers')
      .send({
        fromAccountId: aliceId,
        toAccountId: bobId,
        amount: 50
      });
    expect(postDeletionTransfer.statusCode).toEqual(404);
    expect(postDeletionTransfer.body.error).toEqual('Account not found');
  });
});
