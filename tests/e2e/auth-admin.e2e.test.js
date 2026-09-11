import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../../app.js';
import { connectTestDB, clearTestDB, closeTestDB } from '../setup.js';
import { runSeed as runAdminSeed } from '../../models/admin.js';
import { runSeed as runUserSeed } from '../../models/user.js';

before(async () => {
  await connectTestDB();
});

afterEach(async () => {
  await clearTestDB();
});

after(async () => {
  await closeTestDB();
});

describe('Authentication & Admin E2E Tests', () => {
  it('should verify global middleware headers (X-Response-Time & X-Request-Id)', async () => {
    const res = await request(app).get('/api/v1/accounts');
    assert.ok('x-response-time' in res.headers);
    assert.match(res.headers['x-response-time'], /ms$/);
    assert.ok('x-request-id' in res.headers);
  });

  it('should issue tokens via /api/v1/auth/token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/token')
      .send({
        email: 'admin@bank.com',
        role: 'admin'
      });

    assert.strictEqual(res.statusCode, 200);
    assert.ok('token' in res.body);
    assert.strictEqual(typeof res.body.user.id, 'string');
    assert.strictEqual(res.body.user.email, 'admin@bank.com');
    assert.strictEqual(res.body.user.role, 'admin');
  });

  it('should register a new user via POST /api/v1/auth/signup, create an account with random balance, and link them', async () => {
    const signupRes = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        name: 'Sarah Connor',
        email: 'sarah@resistance.com',
        password: 'password123'
      });

    assert.strictEqual(signupRes.statusCode, 201);
    assert.ok(signupRes.body.token);
    assert.strictEqual(signupRes.body.user.name, 'Sarah Connor');
    assert.strictEqual(signupRes.body.user.email, 'sarah@resistance.com');
    assert.ok(signupRes.body.user.accountId);
    assert.strictEqual(signupRes.body.account.id, signupRes.body.user.accountId);
    assert.strictEqual(signupRes.body.account.name, 'Sarah Connor');
    assert.strictEqual(signupRes.body.account.email, 'sarah@resistance.com');
    assert.ok(typeof signupRes.body.account.balance === 'number');
    assert.ok(signupRes.body.account.balance > 0);

    // Verify token can be used immediately with GET /api/v1/auth/me
    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${signupRes.body.token}`);

    assert.strictEqual(meRes.statusCode, 200);
    assert.strictEqual(meRes.body.user.email, 'sarah@resistance.com');
    assert.strictEqual(meRes.body.user.accountId, signupRes.body.account.id);
  });

  it('should reject signup with duplicate email with 409 Conflict', async () => {
    await request(app)
      .post('/api/v1/auth/signup')
      .send({
        name: 'Duplicate Test',
        email: 'duplicate@test.com',
        password: 'password123'
      });

    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        name: 'Duplicate Test 2',
        email: 'duplicate@test.com',
        password: 'password456'
      });

    assert.strictEqual(res.statusCode, 409);
    assert.match(res.body.error, /already exists/i);
  });

  it('should authenticate admin via POST /api/v1/auth/login and return token', async () => {
    await runAdminSeed('testadmin@bank.com', 'admin', '123456');

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'testadmin@bank.com',
        password: '123456',
        role: 'admin'
      });

    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.body.token);
    assert.strictEqual(res.body.user.email, 'testadmin@bank.com');
    assert.strictEqual(res.body.user.role, 'admin');
  });

  it('should authenticate user via POST /api/v1/auth/login and access GET /api/v1/auth/me', async () => {
    await runUserSeed('Alice Walker', 'alice.walker@example.com', 'acc-alice-1', '123456');

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'alice.walker@example.com',
        password: '123456'
      });

    assert.strictEqual(loginRes.statusCode, 200);
    assert.ok(loginRes.body.token);
    assert.strictEqual(loginRes.body.user.name, 'Alice Walker');
    assert.strictEqual(loginRes.body.user.accountId, 'acc-alice-1');
    const userToken = loginRes.body.token;

    // Verify GET /api/v1/auth/me using authenticate middleware
    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${userToken}`);

    assert.strictEqual(meRes.statusCode, 200);
    assert.strictEqual(meRes.body.user.name, 'Alice Walker');
    assert.strictEqual(meRes.body.user.email, 'alice.walker@example.com');
    assert.strictEqual(meRes.body.user.accountId, 'acc-alice-1');
  });

  it('should reject login with invalid password with 401', async () => {
    await runAdminSeed('secureadmin@bank.com', 'admin', '123456');

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'secureadmin@bank.com',
        password: 'wrongpassword'
      });

    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body.error, 'Invalid email or password');
  });

  it('should block unauthenticated access to GET /api/v1/auth/me with 401', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body.error, 'Authentication required');
  });

  it('should block unauthenticated access to /api/v1/admin/stats with 401', async () => {
    const res = await request(app).get('/api/v1/admin/stats');
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body.error, 'Authentication required');
  });

  it('should block unauthorized non-admin user from /api/v1/admin/stats with 403', async () => {
    const tokenRes = await request(app)
      .post('/api/v1/auth/token')
      .send({
        email: 'user@example.com',
        role: 'user'
      });
    const userToken = tokenRes.body.token;

    const res = await request(app)
      .get('/api/v1/admin/stats')
      .set('Authorization', `Bearer ${userToken}`);

    assert.strictEqual(res.statusCode, 403);
    assert.match(res.body.error, /Insufficient permissions/);
  });

  it('should allow admin access to /api/v1/admin/stats with 200 and system statistics', async () => {
    // Seed an account
    await request(app)
      .post('/api/v1/accounts')
      .send({
        name: 'Corporate Account',
        email: 'corp@example.com',
        balance: 5000
      });

    // Obtain admin token
    const tokenRes = await request(app)
      .post('/api/v1/auth/token')
      .send({
        email: 'superadmin@bank.com',
        role: 'admin'
      });
    const adminToken = tokenRes.body.token;

    const res = await request(app)
      .get('/api/v1/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.strictEqual(res.statusCode, 200);
    assert.ok('totalAccounts' in res.body);
    assert.ok(res.body.totalAccounts >= 1);
    assert.ok('totalTransfers' in res.body);
    assert.ok('totalSystemBalance' in res.body);
    assert.ok(res.body.totalSystemBalance >= 5000);
  });
});
