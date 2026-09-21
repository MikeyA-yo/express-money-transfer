import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../../app.js';
import { connectTestDB, clearTestDB, closeTestDB } from '../setup.js';
import { generateToken } from '../../services/auth.js';
import { closeRedisClient } from '../../util/idempotency.js';

before(async () => {
  await connectTestDB();
});

afterEach(async () => {
  await clearTestDB();
});

after(async () => {
  await closeTestDB();
  await closeRedisClient();
});

describe('End-to-End (E2E) Workflow: Complete Money Transfer Lifecycle', () => {
  const adminToken = generateToken({ id: 'admin-e2e', email: 'admin@example.com', role: 'admin' });

  it('should execute the full user journey: onboarding, transfers, audits, balance updates, and edge cases', async () => {
    // ----------------------------------------------------
    // STEP 1: Verify Security Headers (Helmet middleware) & Admin Access
    // ----------------------------------------------------
    const unauthCheck = await request(app).get('/api/v1/accounts');
    assert.strictEqual(unauthCheck.statusCode, 401);

    const healthCheck = await request(app)
      .get('/api/v1/accounts')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.strictEqual(healthCheck.statusCode, 200);
    assert.ok('x-dns-prefetch-control' in healthCheck.headers);
    assert.strictEqual(healthCheck.headers['x-content-type-options'], 'nosniff');

    // ----------------------------------------------------
    // STEP 2: Client A (Alice) signs up (linked account) and Client B (Bob) onboarding
    // ----------------------------------------------------
    const createAliceRes = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        name: 'Alice Cooper',
        email: 'alice@example.com',
        password: 'password123',
        balance: 100000
      });
    assert.strictEqual(createAliceRes.statusCode, 201);
    assert.ok(createAliceRes.body.token);
    assert.ok('id' in createAliceRes.body.account);
    assert.strictEqual(createAliceRes.body.account.name, 'Alice Cooper');
    assert.strictEqual(createAliceRes.body.account.balance, '1000.00 USD');
    assert.strictEqual(createAliceRes.body.account.balanceMinor, '100000 USDMINOR');
    const aliceId = createAliceRes.body.account.id;
    const userToken = createAliceRes.body.token;

    const createBobRes = await request(app)
      .post('/api/v1/accounts')
      .send({
        name: 'Bob Marley',
        email: 'bob@example.com',
        balance: 20000,
        userId: 'usr-bob'
      });
    assert.strictEqual(createBobRes.statusCode, 201);
    assert.strictEqual(createBobRes.body.balance, '200.00 USD');
    assert.strictEqual(createBobRes.body.balanceMinor, '20000 USDMINOR');
    const bobId = createBobRes.body.id;

    // ----------------------------------------------------
    // STEP 3: Duplicate Registration Guard (Conflict 409)
    // ----------------------------------------------------
    const duplicateRes = await request(app)
      .post('/api/v1/accounts')
      .send({
        name: 'Alice Clone',
        email: 'alice@example.com',
        balance: 50000,
        userId: 'usr-alice-clone'
      });
    assert.strictEqual(duplicateRes.statusCode, 409);
    assert.match(duplicateRes.body.error, /Account already exists/);

    // ----------------------------------------------------
    // STEP 4: Request Validation (Zod schema rejection 400)
    // ----------------------------------------------------
    const invalidTransfer = await request(app)
      .post('/api/v1/transfers')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        fromAccountId: aliceId,
        toAccountId: bobId,
        amountMinor: -50 // Invalid negative amount
      });
    assert.strictEqual(invalidTransfer.statusCode, 400);

    // ----------------------------------------------------
    // STEP 5: Business Rule Enforcement (Insufficient Funds 400)
    // ----------------------------------------------------
    const overdrawTransfer = await request(app)
      .post('/api/v1/transfers')
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', 'idem-e2e-overdraw-1')
      .send({
        fromAccountId: aliceId,
        toAccountId: bobId,
        amountMinor: 500000 // Exceeds Alice's $1000.00 balance
      });
    assert.strictEqual(overdrawTransfer.statusCode, 400);
    assert.strictEqual(overdrawTransfer.body.error, 'Insufficient funds');

    // ----------------------------------------------------
    // STEP 6: Execute Valid Transfer ($350.00 Alice -> Bob)
    // ----------------------------------------------------
    const transferRes = await request(app)
      .post('/api/v1/transfers')
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', 'idem-e2e-valid-1')
      .send({
        fromAccountId: aliceId,
        toAccountId: bobId,
        amountMinor: 35000
      });
    assert.strictEqual(transferRes.statusCode, 201);
    assert.strictEqual(transferRes.body.status, 'COMPLETED');
    assert.strictEqual(transferRes.body.amount, 35000);
    assert.strictEqual(transferRes.body.amountMajor, '350.00 USD');
    assert.strictEqual(transferRes.body.amountMinor, '35000 USDMINOR');
    assert.strictEqual(transferRes.body.from, aliceId);
    assert.strictEqual(transferRes.body.to, bobId);
    const transferId = transferRes.body.id;

    // ----------------------------------------------------
    // STEP 7: Audit & Verify Individual Transfer Record
    // ----------------------------------------------------
    const fetchTransferRes = await request(app)
      .get(`/api/v1/transfers/${transferId}`)
      .set('Authorization', `Bearer ${userToken}`);
    assert.strictEqual(fetchTransferRes.statusCode, 200);
    assert.strictEqual(fetchTransferRes.body.id, transferId);
    assert.strictEqual(fetchTransferRes.body.status, 'COMPLETED');
    assert.strictEqual(fetchTransferRes.body.amount, 35000);
    assert.strictEqual(fetchTransferRes.body.amountMajor, '350.00 USD');
    assert.strictEqual(fetchTransferRes.body.amountMinor, '35000 USDMINOR');

    // ----------------------------------------------------
    // STEP 8: Verify Real-Time Account Balances Post-Transfer
    // ----------------------------------------------------
    const aliceAccount = await request(app)
      .get(`/api/v1/accounts/${aliceId}`)
      .set('Authorization', `Bearer ${userToken}`);
    const bobAccount = await request(app)
      .get(`/api/v1/accounts/${bobId}`)
      .set('Authorization', `Bearer ${userToken}`);
    assert.strictEqual(aliceAccount.statusCode, 200);
    assert.strictEqual(bobAccount.statusCode, 200);
    assert.strictEqual(aliceAccount.body.balance, '650.00 USD'); // 1000.00 - 350.00
    assert.strictEqual(aliceAccount.body.balanceMinor, '65000 USDMINOR');
    assert.strictEqual(bobAccount.body.balance, '550.00 USD');  // 200.00 + 350.00
    assert.strictEqual(bobAccount.body.balanceMinor, '55000 USDMINOR');

    // ----------------------------------------------------
    // STEP 9: List All Transfers History
    // ----------------------------------------------------
    const transferListRes = await request(app)
      .get('/api/v1/transfers?page=1&limit=10')
      .set('Authorization', `Bearer ${userToken}`);
    assert.strictEqual(transferListRes.statusCode, 200);
    assert.strictEqual(Array.isArray(transferListRes.body), true);
    assert.strictEqual(transferListRes.body.some((t) => t.id === transferId), true);

    // ----------------------------------------------------
    // STEP 10: Modify Account Details (PATCH)
    // ----------------------------------------------------
    const updateRes = await request(app)
      .patch(`/api/v1/accounts/${aliceId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name: 'Alice C. Wonderland',
        email: 'alice.wonderland@example.com',
        balance: 65000
      });
    assert.strictEqual(updateRes.statusCode, 200);
    assert.strictEqual(updateRes.body.name, 'Alice C. Wonderland');

    // ----------------------------------------------------
    // STEP 11: Account Deletion (DELETE)
    // ----------------------------------------------------
    const deleteRes = await request(app)
      .delete(`/api/v1/accounts/${bobId}`)
      .set('Authorization', `Bearer ${userToken}`);
    assert.strictEqual(deleteRes.statusCode, 200);

    // ----------------------------------------------------
    // STEP 12: Subsequent Transfer to Deleted Account (404)
    // ----------------------------------------------------
    const postDeletionTransfer = await request(app)
      .post('/api/v1/transfers')
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', 'idem-e2e-deleted-1')
      .send({
        fromAccountId: aliceId,
        toAccountId: bobId,
        amountMinor: 5000
      });
    assert.strictEqual(postDeletionTransfer.statusCode, 404);
    assert.strictEqual(postDeletionTransfer.body.error, 'Account not found');
  });
});
