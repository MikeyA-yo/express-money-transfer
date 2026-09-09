import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../../app.js';
import { connectTestDB, clearTestDB, closeTestDB } from '../setup.js';

before(async () => {
  await connectTestDB();
});

afterEach(async () => {
  await clearTestDB();
});

after(async () => {
  await closeTestDB();
});

describe('End-to-End (E2E) Workflow: Complete Money Transfer Lifecycle', () => {
  it('should execute the full user journey: onboarding, transfers, audits, balance updates, and edge cases', async () => {
    // ----------------------------------------------------
    // STEP 1: Verify Security Headers (Helmet middleware)
    // ----------------------------------------------------
    const healthCheck = await request(app).get('/api/v1/accounts');
    assert.ok('x-dns-prefetch-control' in healthCheck.headers);
    assert.strictEqual(healthCheck.headers['x-content-type-options'], 'nosniff');

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
    assert.strictEqual(createAliceRes.statusCode, 201);
    assert.ok('id' in createAliceRes.body);
    assert.strictEqual(createAliceRes.body.name, 'Alice Cooper');
    assert.strictEqual(createAliceRes.body.balance, 1000);
    const aliceId = createAliceRes.body.id;

    const createBobRes = await request(app)
      .post('/api/v1/accounts')
      .send({
        name: 'Bob Marley',
        email: 'bob@example.com',
        balance: 200
      });
    assert.strictEqual(createBobRes.statusCode, 201);
    assert.strictEqual(createBobRes.body.balance, 200);
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
    assert.strictEqual(duplicateRes.statusCode, 409);
    assert.match(duplicateRes.body.error, /Account already exists/);

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
    assert.strictEqual(invalidTransfer.statusCode, 400);

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
    assert.strictEqual(overdrawTransfer.statusCode, 400);
    assert.strictEqual(overdrawTransfer.body.error, 'Insufficient funds');

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
    assert.strictEqual(transferRes.statusCode, 201);
    assert.strictEqual(transferRes.body.status, 'COMPLETED');
    assert.strictEqual(transferRes.body.amount, 350);
    assert.strictEqual(transferRes.body.from, aliceId);
    assert.strictEqual(transferRes.body.to, bobId);
    const transferId = transferRes.body.id;

    // ----------------------------------------------------
    // STEP 7: Audit & Verify Individual Transfer Record
    // ----------------------------------------------------
    const fetchTransferRes = await request(app).get(`/api/v1/transfers/${transferId}`);
    assert.strictEqual(fetchTransferRes.statusCode, 200);
    assert.strictEqual(fetchTransferRes.body.id, transferId);
    assert.strictEqual(fetchTransferRes.body.status, 'COMPLETED');
    assert.strictEqual(fetchTransferRes.body.amount, 350);

    // ----------------------------------------------------
    // STEP 8: Verify Real-Time Account Balances Post-Transfer
    // ----------------------------------------------------
    const aliceAccount = await request(app).get(`/api/v1/accounts/${aliceId}`);
    const bobAccount = await request(app).get(`/api/v1/accounts/${bobId}`);
    assert.strictEqual(aliceAccount.statusCode, 200);
    assert.strictEqual(bobAccount.statusCode, 200);
    assert.strictEqual(aliceAccount.body.balance, 650); // 1000 - 350
    assert.strictEqual(bobAccount.body.balance, 550);  // 200 + 350

    // ----------------------------------------------------
    // STEP 9: List All Transfers History
    // ----------------------------------------------------
    const transferListRes = await request(app).get('/api/v1/transfers?page=1&limit=10');
    assert.strictEqual(transferListRes.statusCode, 200);
    assert.strictEqual(Array.isArray(transferListRes.body), true);
    assert.strictEqual(transferListRes.body.some((t) => t.id === transferId), true);

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
    assert.strictEqual(updateRes.statusCode, 200);
    assert.strictEqual(updateRes.body.name, 'Alice C. Wonderland');

    // ----------------------------------------------------
    // STEP 11: Account Deletion (DELETE)
    // ----------------------------------------------------
    const deleteRes = await request(app).delete(`/api/v1/accounts/${bobId}`);
    assert.strictEqual(deleteRes.statusCode, 200);

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
    assert.strictEqual(postDeletionTransfer.statusCode, 404);
    assert.strictEqual(postDeletionTransfer.body.error, 'Account not found');
  });
});
