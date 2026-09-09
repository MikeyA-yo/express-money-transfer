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
